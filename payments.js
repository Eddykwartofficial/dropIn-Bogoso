'use strict';
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { validSignature, verifiedPayment } = require('./payment-core');
const core = require('./core');
const secret = defineSecret('PAYSTACK_SECRET_KEY');
const db = getFirestore();
const options = { secrets:[secret], enforceAppCheck:process.env.FUNCTIONS_EMULATOR !== 'true' };
async function api(path, body) {
    const response = await fetch('https://api.paystack.co'+path, {
        method:body ? 'POST' : 'GET',
        headers:{ Authorization:'Bearer '+secret.value(), 'Content-Type':'application/json' },
        ...(body ? { body:JSON.stringify(body) } : {}),
        signal:AbortSignal.timeout(15000),
    });
    const result = await response.json();
    if (!response.ok || !result.status) throw new HttpsError('unavailable','Payment provider unavailable. Please retry.');
    return result.data;
}
async function confirm(reference) {
    if (!/^dropin_[a-zA-Z0-9]+$/.test(reference)) throw new HttpsError('invalid-argument','Invalid payment reference');
    const ref = db.doc('payments/'+reference), snap = await ref.get();
    if (!snap.exists) throw new HttpsError('not-found','Payment not found');
    const verified = await api('/transaction/verify/'+reference);
    try { verifiedPayment(verified, snap.data(), reference); }
    catch { throw new HttpsError('failed-precondition','Payment has not been confirmed for this fare. Retry after authorising MoMo.'); }
    await db.runTransaction(async tx => {
        const payment = (await tx.get(ref)).data();
        const rideRef = db.doc('rides/'+payment.rideId), ride = (await tx.get(rideRef)).data();
        const ledgerRef = db.doc('ledger/'+payment.rideId), ledger = await tx.get(ledgerRef);
        if (payment.status === 'paid') return;
        if (!ride || ride.payment !== 'momo' || ride.status !== 'completed' || ride.farePesewas !== payment.amountPesewas) throw new HttpsError('failed-precondition','Ride is not eligible for this payment');
        tx.update(ref,{ status:'paid',providerTransactionId:String(verified.id),paidAt:Timestamp.now() });
        tx.update(rideRef,{ paymentStatus:'paid',paidAt:Timestamp.now() });
        // Create the ledger too if its asynchronous completion trigger has not yet run.
        tx.set(ledgerRef,{ ...(ledger.exists ? {} : { rideId:payment.rideId,driverId:ride.driverId,passengerId:ride.passengerId,...core.settlement(ride),createdAt:Timestamp.now() }),method:'momo',paymentStatus:'paid' },{ merge:true });
    });
    return { status:'paid' };
}
exports.initializePayment = onCall(options,async req => {
    if (!req.auth) throw new HttpsError('unauthenticated','Please sign in');
    const settings = (await db.doc('config/operations').get()).data();
    if (settings?.momoEnabled !== true) throw new HttpsError('failed-precondition','MoMo is not enabled by the operator');
    const email = req.data?.email;
    if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpsError('invalid-argument','Enter a receipt email');
    const rideRef = db.doc('rides/'+String(req.data.rideId));
    const reference = await db.runTransaction(async tx => {
        const ride = (await tx.get(rideRef)).data();
        if (!ride || ride.passengerId !== req.auth.uid || ride.status !== 'completed' || ride.payment !== 'momo' || ride.paymentStatus === 'paid') throw new HttpsError('permission-denied','Only your unpaid completed MoMo ride can be paid');
        // One reference per ride prevents two concurrent checkout attempts collecting twice.
        const reference = ride.paymentReference || 'dropin_'+db.collection('payments').doc().id;
        const paymentRef = db.doc('payments/'+reference);
        const previous = await tx.get(paymentRef);
        if (!previous.exists) tx.create(paymentRef,{ rideId:rideRef.id,passengerId:req.auth.uid,amountPesewas:ride.farePesewas,status:'pending',createdAt:Timestamp.now() });
        tx.update(rideRef,{ paymentReference:reference });
        return reference;
    });
    const paymentRef = db.doc('payments/'+reference), payment = (await paymentRef.get()).data();
    if (payment.status === 'paid') return { status:'paid' };
    if (payment.checkoutUrl) return { reference,url:payment.checkoutUrl };
    const data = await api('/transaction/initialize',{ email,amount:payment.amountPesewas,currency:'GHS',reference,channels:['mobile_money'],metadata:{ rideId:payment.rideId } });
    if (!/^https:\/\/checkout\.paystack\.com\//.test(data.authorization_url || '')) throw new HttpsError('unavailable','Invalid checkout response');
    await paymentRef.update({ checkoutUrl:data.authorization_url });
    return { reference,url:data.authorization_url };
});
exports.verifyPayment = onCall(options,async req => {
    if (!req.auth) throw new HttpsError('unauthenticated','Please sign in');
    const reference = String(req.data?.reference || '');
    if (!/^dropin_[a-zA-Z0-9]+$/.test(reference)) throw new HttpsError('invalid-argument','Invalid reference');
    const payment = (await db.doc('payments/'+reference).get()).data();
    if (!payment || payment.passengerId !== req.auth.uid) throw new HttpsError('permission-denied','Not your payment');
    return confirm(reference);
});
exports.paystackWebhook = onRequest({ secrets:[secret] },async (req,res) => {
    if (req.method !== 'POST') return res.sendStatus(405);
    if (!validSignature(req.rawBody,req.get('x-paystack-signature'),secret.value())) return res.sendStatus(401);
    if (req.body?.event !== 'charge.success') return res.sendStatus(200);
    try { await confirm(String(req.body.data?.reference || '')); return res.sendStatus(200); }
    catch(e) {
        // Retry transient failures; unrelated merchant transactions can be acknowledged.
        if (e.code === 'not-found' || e.code === 'invalid-argument') return res.sendStatus(200);
        console.error('Payment confirmation failed',e.code || 'internal');
        return res.sendStatus(503);
    }
});
