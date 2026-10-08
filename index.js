'use strict';
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getMessaging } = require('firebase-admin/messaging');
const { getStorage } = require('firebase-admin/storage');
const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const { setGlobalOptions } = require('firebase-functions/v2');
initializeApp();
setGlobalOptions({ region:'europe-west1', maxInstances:10 });
const db = getFirestore();
const core = require('./core');
const routesKey = defineSecret('GOOGLE_ROUTES_KEY');
const callable = { enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true' };
const defaults = { basePesewas:800, perKmPesewas:350, perMinutePesewas:0, minimumPesewas:1500, commissionPercent:15 };
function signed(req) {
    if (!req.auth) throw new HttpsError('unauthenticated','Please sign in');
    return req.auth.uid;
}
function admin(req) {
    signed(req);
    if (req.auth.token.admin !== true) throw new HttpsError('permission-denied','Administrator access required');
}
async function settings() {
    const snap = await db.doc('config/operations').get();
    return { ...defaults,...snap.data() };
}
async function liveSettings() {
    const s = await settings();
    if (s.liveEnabled !== true) throw new HttpsError('failed-precondition','Live rides are not enabled by the operator');
    return s;
}
async function roadQuote(pickupId,dropoffId,type) {
    const a = core.point(pickupId), b = core.point(dropoffId);
    if (a.city !== b.city || a.id === b.id) throw new HttpsError('invalid-argument','Choose two different places in the same city');
    const key = routesKey.value();
    if (!key) throw new HttpsError('failed-precondition','Routing provider is not configured');
    const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes',{
        method:'POST',
        headers:{ 'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':'routes.distanceMeters,routes.duration' },
        body:JSON.stringify({ origin:{ location:{ latLng:{ latitude:a.lat,longitude:a.lng } } },destination:{ location:{ latLng:{ latitude:b.lat,longitude:b.lng } } },travelMode:'DRIVE' }),
        signal:AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new HttpsError('unavailable','Could not calculate a road route. Please retry.');
    const data = await response.json(), route = data.routes?.[0];
    if (!route) throw new HttpsError('not-found','No driving route available');
    const s = await liveSettings();
    return { ...core.quote(route.distanceMeters/1000, Math.ceil(parseFloat(route.duration)/60),type,s),pickup:a,dropoff:b };
}
exports.getQuote = onCall({ ...callable,secrets:[routesKey] },async req => {
    signed(req);
    try { return await roadQuote(req.data.pickup,req.data.dropoff,req.data.type); }
    catch(e) { if (e instanceof HttpsError) throw e; throw new HttpsError('invalid-argument',e.message); }
});
exports.requestRide = onCall({ ...callable,secrets:[routesKey] },async req => {
    const uid = signed(req), d = req.data || {};
    if (!['cash','momo'].includes(d.payment)) throw new HttpsError('invalid-argument','Choose cash or MoMo');
    const operations = await liveSettings();
    if (d.payment === 'momo' && operations.momoEnabled !== true) throw new HttpsError('failed-precondition','MoMo is not enabled');
    if (!/^[a-zA-Z0-9_-]{16,80}$/.test(d.requestId || '')) throw new HttpsError('invalid-argument','Valid request ID required');
    const requestRef = db.doc('requests/'+uid+'_'+d.requestId), passengerRef = db.doc('passengers/'+uid), rideRef = db.collection('rides').doc();
    const existing = await requestRef.get();
    if (existing.exists) return { rideId:existing.data().rideId };
    const q = await roadQuote(d.pickup,d.dropoff,d.type);
    const rideId = await db.runTransaction(async tx => {
        const [key,passenger] = await Promise.all([tx.get(requestRef),tx.get(passengerRef)]);
        if (key.exists) return key.data().rideId;
        if (passenger.data()?.activeRideId) throw new HttpsError('already-exists','You already have an active ride');
        const now = Timestamp.now();
        tx.create(rideRef,{ passengerId:uid,driverId:null,driverName:null,vehicle:null,status:'searching',pickup:q.pickup,dropoff:q.dropoff,type:d.type,payment:d.payment,farePesewas:q.farePesewas,km:q.km,minutes:q.minutes,commissionPercent:q.commissionPercent,createdAt:now,updatedAt:now });
        tx.set(passengerRef,{ activeRideId:rideRef.id },{ merge:true });
        tx.create(requestRef,{ rideId:rideRef.id,createdAt:now });
        return rideRef.id;
    });
    try { await assignNearest(rideId,uid); } catch(e) { console.warn('Dispatch deferred',e.message); }
    return { rideId };
});
async function assignNearest(rideId,uid,isAdmin = false) {
    const rideRef = db.doc('rides/'+rideId), snap = await rideRef.get();
    if (!snap.exists) throw new HttpsError('not-found','Ride not found');
    const ride = snap.data();
    if (ride.passengerId !== uid && !isAdmin) throw new HttpsError('permission-denied','Not your ride');
    if (ride.status !== 'searching') return { status:ride.status };
    const list = await db.collection('drivers').where('approved','==',true).where('online','==',true).where('city','==',ride.pickup.city).where('type','==',ride.type).limit(50).get();
    const choices = core.candidates(list.docs.map(d => ({ ...d.data(),id:d.id })),ride.pickup,ride.type).filter(d => !(ride.declinedDriverIds || []).includes(d.id));
    for (const choice of choices) {
        const assigned = await db.runTransaction(async tx => {
            const driverRef = db.doc('drivers/'+choice.id);
            const [r,d] = await Promise.all([tx.get(rideRef),tx.get(driverRef)]);
            const current = r.data(), driver = d.data();
            if (!current || current.status !== 'searching') return false;
            if (!driver || !core.candidates([{ ...driver,id:choice.id }],current.pickup,current.type).length) return false;
            tx.update(driverRef,{ activeRideId:rideId });
            tx.update(rideRef,{ driverId:choice.id,driverName:driver.name,vehicle:driver.vehicle,plate:driver.plate,status:'offered',updatedAt:Timestamp.now() });
            return true;
        });
        if (assigned) return { driverId:choice.id,status:'offered' };
    }
    return { status:'searching',message:'No matching driver is currently available' };
}
exports.findNearestDriver = onCall(callable,async req => {
    const uid = signed(req); await liveSettings();
    return assignNearest(String(req.data.rideId),uid,req.auth.token.admin === true);
});
exports.updateRideStatus = onCall(callable,async req => {
    const uid = signed(req), ref = db.doc('rides/'+String(req.data.rideId));
    return db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new HttpsError('not-found','Ride not found');
        const r = snap.data();
        try { core.transition(r,req.data.status,uid,req.auth.token.admin === true); }
        catch(e) { throw new HttpsError('permission-denied',e.message); }
        const done = core.TERMINAL.has(req.data.status), now = Timestamp.now();
        const driverRef = r.driverId ? db.doc('drivers/'+r.driverId) : null;
        const passengerRef = db.doc('passengers/'+r.passengerId);
        const driverSnap = done && driverRef ? await tx.get(driverRef) : null;
        const passengerSnap = done ? await tx.get(passengerRef) : null;
        tx.update(ref,{ status:req.data.status,updatedAt:now,...(req.data.status==='completed'?{ completedAt:now,paymentStatus:r.payment === 'momo' ? 'payment_due' : 'cash_due' }:{}) });
        if (done && driverSnap?.data()?.activeRideId === ref.id) tx.update(driverRef,{ activeRideId:FieldValue.delete() });
        if (done && passengerSnap?.data()?.activeRideId === ref.id) tx.update(passengerRef,{ activeRideId:FieldValue.delete() });
        return { status:req.data.status };
    });
});
exports.rateRide = onCall(callable,async req => {
    const uid = signed(req), rating = req.data.rating;
    if (![1,2,3,4,5].includes(rating)) throw new HttpsError('invalid-argument','Select 1 to 5 stars');
    const ref = db.doc('rides/'+String(req.data.rideId));
    await db.runTransaction(async tx => {
        const snap = await tx.get(ref), r = snap.data();
        if (!r || r.passengerId !== uid || r.status !== 'completed' || r.rating) throw new HttpsError('permission-denied','Only an unrated completed ride may be rated');
        tx.update(ref,{ rating });
    });
    return { ok:true };
});
exports.registerDriver = onCall(callable,async req => {
    const uid = signed(req), d = req.data || {};
    if (typeof d.name !== 'string' || d.name.trim().length < 2 || d.name.length > 60 || typeof d.vehicle !== 'string' || d.vehicle.trim().length < 2 || d.vehicle.length > 80 || typeof d.plate !== 'string' || d.plate.length < 3 || d.plate.length > 20 || !core.PLACES.some(p=>p.city===d.city) || !core.TYPES[d.type]) throw new HttpsError('invalid-argument','Complete valid driver and vehicle details');
    const ref = db.doc('drivers/'+uid);
    await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (snap.exists) throw new HttpsError('already-exists','Driver application already exists');
        tx.create(ref,{ name:d.name.trim(),vehicle:d.vehicle.trim(),plate:d.plate.trim(),city:d.city,type:d.type,approved:false,online:false,createdAt:Timestamp.now() });
    });
    return { ok:true };
});
exports.setAvailability = onCall(callable,async req => {
    const uid = signed(req), ref = db.doc('drivers/'+uid), online = req.data.online === true;
    if (online) await liveSettings();
    await db.runTransaction(async tx => {
        const snap = await tx.get(ref), d = snap.data();
        if (!d || !d.approved) throw new HttpsError('permission-denied','Driver approval required');
        if (d.activeRideId) throw new HttpsError('failed-precondition','Complete the current ride first');
        if (online && (!d.locationUpdatedAt || Date.now()-d.locationUpdatedAt > 120000)) throw new HttpsError('failed-precondition','Send a fresh location before going online');
        tx.update(ref,{ online,updatedAt:Timestamp.now() });
    });
    return { ok:true };
});
exports.updateDriverLocation = onCall(callable,async req => {
    const uid = signed(req), { lat,lng } = req.data || {};
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 4 || lat > 12 || lng < -4 || lng > 2) throw new HttpsError('invalid-argument','A valid location in Ghana is required');
    const ref = db.doc('drivers/'+uid), snap = await ref.get();
    if (!snap.exists || !snap.data().approved) throw new HttpsError('permission-denied','Driver approval required');
    await ref.update({ lat,lng,locationUpdatedAt:Date.now() });
    return { ok:true };
});
exports.approveDriver = onCall(callable,async req => {
    admin(req);
    const ref = db.doc('drivers/'+String(req.data.driverId)), approved = req.data.approved === true;
    await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new HttpsError('not-found','Driver not found');
        if (approved) {
            const required = ['licence','insurance','roadworthiness','identity'];
            if (!required.every(k => snap.data().documents?.[k])) throw new HttpsError('failed-precondition','All required driver documents must be uploaded first');
        }
        if (snap.data().activeRideId) throw new HttpsError('failed-precondition','Cannot change approval during an active trip');
        tx.update(ref,{ approved,online:false,reviewedBy:req.auth.uid,reviewedAt:Timestamp.now() });
    });
    return { ok:true };
});
exports.setFareSettings = onCall(callable,async req => {
    admin(req); const d = req.data || {};
    const keys = Object.keys(defaults);
    if (!keys.every(k=>Number.isInteger(d[k])) || d.basePesewas<0 || d.basePesewas>10000 || d.perKmPesewas<=0 || d.perKmPesewas>5000 || d.perMinutePesewas<0 || d.perMinutePesewas>5000 || d.minimumPesewas<100 || d.minimumPesewas>50000 || d.commissionPercent<0 || d.commissionPercent>40) throw new HttpsError('invalid-argument','Invalid pricing settings');
    await db.doc('config/operations').set(Object.fromEntries(keys.map(k=>[k,d[k]])),{ merge:true });
    return { ok:true };
});
exports.onRideCompleted = onDocumentUpdated({ document:'rides/{rideId}',retry:true },async event => {
    const r = event.data.after.data();
    if (r.status !== 'completed' || event.data.before.data().status === 'completed') return;
    const ledger = db.doc('ledger/'+event.params.rideId);
    await db.runTransaction(async tx => {
        if ((await tx.get(ledger)).exists) return;
        tx.create(ledger,{ rideId:event.params.rideId,driverId:r.driverId,passengerId:r.passengerId,...core.settlement(r),method:r.payment,paymentStatus:r.payment === 'momo' ? 'payment_due' : 'cash_due',createdAt:Timestamp.now() });
    });
});
exports.expireOffers = onSchedule('every 1 minutes',async () => {
    const cutoff = Timestamp.fromMillis(Date.now()-60000);
    const docs = await db.collection('rides').where('status','in',['searching','offered']).where('updatedAt','<',cutoff).limit(100).get();
    const live = (await settings()).liveEnabled === true;
    for (const doc of docs.docs) {
        const retry = await db.runTransaction(async tx => {
            const r = (await tx.get(doc.ref)).data();
            if (!r || !['searching','offered'].includes(r.status) || r.updatedAt.toMillis() >= cutoff.toMillis()) return null;
            const driverRef = r.driverId ? db.doc('drivers/'+r.driverId) : null;
            const d = driverRef ? await tx.get(driverRef) : null;
            const passengerRef = db.doc('passengers/'+r.passengerId), p = await tx.get(passengerRef);
            const expired = !live || Date.now()-r.createdAt.toMillis() >= 5*60000;
            tx.update(doc.ref,{ status:expired ? 'cancelled' : 'searching',driverId:null,driverName:null,vehicle:null,plate:null,
                ...(r.driverId ? { declinedDriverIds:FieldValue.arrayUnion(r.driverId) } : {}),
                ...(expired ? { cancelReason:'dispatch_timeout' } : {}),updatedAt:Timestamp.now() });
            if (d?.data()?.activeRideId === doc.id) tx.update(driverRef,{ activeRideId:FieldValue.delete() });
            if (expired && p.data()?.activeRideId === doc.id) tx.update(passengerRef,{ activeRideId:FieldValue.delete() });
            return expired ? null : r.passengerId;
        });
        if (retry) await assignNearest(doc.id,retry);
    }
});
exports.whatsappWebhook = require('./whatsapp').whatsappWebhook;

exports.declineRide = onCall(callable,async req => {
    const uid = signed(req), ref = db.doc('rides/'+String(req.data?.rideId));
    const passengerId = await db.runTransaction(async tx => {
        const r = (await tx.get(ref)).data();
        if (!r || r.driverId !== uid || r.status !== 'offered') throw new HttpsError('permission-denied','Only your pending offer can be declined');
        const driverRef = db.doc('drivers/'+uid), d = await tx.get(driverRef);
        tx.update(ref,{ status:'searching',driverId:null,driverName:null,vehicle:null,plate:null,declinedDriverIds:FieldValue.arrayUnion(uid),updatedAt:Timestamp.now() });
        if (d.data()?.activeRideId === ref.id) tx.update(driverRef,{ activeRideId:FieldValue.delete() });
        return r.passengerId;
    });
    if ((await settings()).liveEnabled !== true) return { status:'searching' };
    return assignNearest(ref.id,passengerId);
});
Object.assign(exports, require('./mobile'), require('./payments'));
