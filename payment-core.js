'use strict';
const crypto = require('node:crypto');
function validSignature(raw, signature, secret) {
    if (!Buffer.isBuffer(raw) || typeof signature !== 'string' || !/^[a-f0-9]{128}$/.test(signature)) return false;
    const expected = crypto.createHmac('sha512', secret).update(raw).digest();
    return crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
function verifiedPayment(data, payment, reference) {
    if (!data || data.status !== 'success' || data.reference !== reference || data.currency !== 'GHS' || data.amount !== payment.amountPesewas) throw new Error('Payment is pending or does not match this fare');
    return true;
}
module.exports = { validSignature, verifiedPayment };
