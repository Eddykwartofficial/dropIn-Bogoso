'use strict';
const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { getStorage } = require('firebase-admin/storage');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const db = getFirestore();
const options = { enforceAppCheck:process.env.FUNCTIONS_EMULATOR !== 'true' };
function signed(req) {
    if (!req.auth) throw new HttpsError('unauthenticated','Please sign in');
    return req.auth.uid;
}
function tokenId(token) {
    if (typeof token !== 'string' || token.length < 20 || token.length > 4096) throw new HttpsError('invalid-argument','Invalid token');
    return require('node:crypto').createHash('sha256').update(token).digest('hex');
}
exports.registerPushToken = onCall(options,async req => {
    const uid = signed(req), token = req.data?.token;
    await db.doc('pushTokens/'+tokenId(token)).set({ uid,token,updatedAt:Timestamp.now() });
    return { ok:true };
});
exports.unregisterPushToken = onCall(options,async req => {
    const uid = signed(req), ref = db.doc('pushTokens/'+tokenId(req.data?.token));
    await db.runTransaction(async tx => { if ((await tx.get(ref)).data()?.uid === uid) tx.delete(ref); });
    return { ok:true };
});
async function notify(uid,rideId,title,body) {
    const tokens = await db.collection('pushTokens').where('uid','==',uid).limit(20).get();
    if (tokens.empty) return;
    const result = await getMessaging().sendEachForMulticast({
        tokens:tokens.docs.map(d=>d.data().token),notification:{ title,body },data:{ rideId },
        android:{ priority:'high',ttl:120000 },apns:{ payload:{ aps:{ sound:'default' } } },
    });
    await Promise.all(result.responses.map((r,i) => ['messaging/registration-token-not-registered','messaging/invalid-registration-token'].includes(r.error?.code) ? tokens.docs[i].ref.delete() : Promise.resolve()));
    if (result.responses.some(r => r.error && !['messaging/registration-token-not-registered','messaging/invalid-registration-token'].includes(r.error.code))) throw new Error('Transient push delivery failure');
}
exports.notifyRideUpdate = onDocumentUpdated({ document:'rides/{rideId}',retry:true },async event => {
    const r = event.data.after.data(), before = event.data.before.data();
    if (r.status === before.status && r.driverId === before.driverId) return;
    const jobs = [notify(r.passengerId,event.params.rideId,'DropIn ride update','Your ride is '+r.status.replaceAll('_',' ')+'. Open DropIn for details.')];
    if (r.status === 'offered' && r.driverId) jobs.push(notify(r.driverId,event.params.rideId,'New DropIn request','A nearby passenger is waiting. Open DropIn to accept.'));
    if (r.status === 'cancelled' && before.driverId) jobs.push(notify(before.driverId,event.params.rideId,'Ride cancelled','This ride has been cancelled.'));
    await Promise.all(jobs);
});
exports.attachDriverDocument = onCall(options,async req => {
    const uid = signed(req), kind = req.data?.kind, path = req.data?.path;
    if (!['licence','insurance','roadworthiness','identity'].includes(kind) || typeof path !== 'string' || !path.startsWith('driver-documents/'+uid+'/'+kind+'/') || path.includes('..')) throw new HttpsError('invalid-argument','Invalid document');
    const file = getStorage().bucket().file(path), [exists] = await file.exists();
    if (!exists) throw new HttpsError('not-found','Upload the document first');
    const [meta] = await file.getMetadata();
    if (Number(meta.size) > 5*1024*1024 || !['image/jpeg','image/png','application/pdf'].includes(meta.contentType)) throw new HttpsError('invalid-argument','Choose a JPEG, PNG or PDF under 5 MB');
    await db.runTransaction(async tx => {
        const ref = db.doc('drivers/'+uid), d = (await tx.get(ref)).data();
        if (!d || d.approved || d.activeRideId) throw new HttpsError('failed-precondition','Documents can only change while awaiting approval');
        tx.update(ref,{ ['documents.'+kind]:path,documentsUpdatedAt:Timestamp.now() });
    });
    return { ok:true };
});
exports.getOperatorCapabilities = onCall(options,async req => {
    signed(req); const s = (await db.doc('config/operations').get()).data();
    return { liveEnabled:s?.liveEnabled === true,momoEnabled:s?.momoEnabled === true };
});
exports.confirmCashCollected = onCall(options,async req => {
    const uid = signed(req), ref = db.doc('rides/'+String(req.data?.rideId));
    await db.runTransaction(async tx => {
        const r = (await tx.get(ref)).data();
        if (!r || r.driverId !== uid || r.status !== 'completed' || r.payment !== 'cash') throw new HttpsError('permission-denied','Only the assigned driver can confirm cash for a completed trip');
        const ledgerRef = db.doc('ledger/'+ref.id), ledger = await tx.get(ledgerRef);
        tx.update(ref,{ paymentStatus:'cash_collected',cashConfirmedAt:Timestamp.now(),cashConfirmedBy:uid });
        tx.set(ledgerRef,{ ...(ledger.exists ? {} : { rideId:ref.id,driverId:uid,passengerId:r.passengerId,...require('./core').settlement(r),createdAt:Timestamp.now() }),method:'cash',paymentStatus:'cash_collected' },{ merge:true });
    });
    return { ok:true };
});
