'use strict';
const crypto = require('node:crypto');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret,defineString } = require('firebase-functions/params');
const { getFirestore,Timestamp } = require('firebase-admin/firestore');
const token = defineSecret('WHATSAPP_ACCESS_TOKEN');
const appSecret = defineSecret('META_APP_SECRET');
const verifyToken = defineSecret('WHATSAPP_VERIFY_TOKEN');
const phoneId = defineString('WHATSAPP_PHONE_NUMBER_ID');
const graphVersion = defineString('META_GRAPH_VERSION');
const bookingUrl = defineString('BOOKING_URL');
function signatureValid(raw, signature, secret) {
    if (!/^sha256=[a-f0-9]{64}$/.test(signature || '')) return false;
    const expected = 'sha256=' + crypto.createHmac('sha256',secret).update(raw).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(signature));
}
exports.signatureValid = signatureValid;
exports.whatsappWebhook = onRequest({ secrets:[token,appSecret,verifyToken],maxInstances:5 },async (req,res) => {
    if (req.method === 'GET') {
        if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === verifyToken.value()) return res.status(200).send(req.query['hub.challenge']);
        return res.sendStatus(403);
    }
    if (req.method !== 'POST') return res.sendStatus(405);
    if (!signatureValid(req.rawBody,req.get('x-hub-signature-256'),appSecret.value())) return res.sendStatus(401);
    const db = getFirestore();
    try {
        for (const entry of req.body.entry || []) for (const change of entry.changes || []) for (const message of change.value?.messages || []) {
            if (!message.id || !message.from) continue;
            const ref = db.doc('whatsappMessages/'+crypto.createHash('sha256').update(message.id).digest('hex'));
            // Lease de-duplication allows recovery on provider failures.
            const claim = await db.runTransaction(async tx => {
                const snap = await tx.get(ref), prior = snap.data();
                if (prior?.sent || (prior?.leaseUntil || 0) > Date.now()) return false;
                tx.set(ref,{ sent:false,leaseUntil:Date.now()+30000,expiresAt:Timestamp.fromMillis(Date.now()+86400000*7) });
                return true;
            });
            if (!claim) continue;
            if (!/^v\d+\.\d+$/.test(graphVersion.value()) || !/^https:\/\//.test(bookingUrl.value())) throw new Error('Configure a supported Graph API version and HTTPS booking URL');
            const text = 'Akwaaba to DropIn Ghana! Book through our passenger app: '+bookingUrl.value()+'\nThis WhatsApp assistant provides a booking handoff. It does not dispatch a ride or process payment. For an emergency, contact local emergency services.';
            const result = await fetch('https://graph.facebook.com/'+graphVersion.value()+'/'+phoneId.value()+'/messages',{
                method:'POST',headers:{ Authorization:'Bearer '+token.value(),'Content-Type':'application/json' },
                body:JSON.stringify({ messaging_product:'whatsapp',to:message.from,type:'text',text:{ body:text } }),
                signal:AbortSignal.timeout(10000),
            });
            if (!result.ok) { await ref.update({ leaseUntil:0 }); throw new Error('WhatsApp reply failed with HTTP '+result.status); }
            await ref.update({ sent:true,leaseUntil:0 });
        }
        return res.sendStatus(200);
    } catch(e) {
        console.error('WhatsApp delivery error',e.message);
        return res.sendStatus(503);
    }
});
