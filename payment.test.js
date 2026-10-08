'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { validSignature, verifiedPayment } = require('../payment-core');
const core = require('../core');
test('webhook rejects forged, malformed and modified raw bodies', () => {
    const raw = Buffer.from('{"event":"charge.success"}'), secret = 'test-only-key';
    const signature = crypto.createHmac('sha512',secret).update(raw).digest('hex');
    assert.equal(validSignature(raw,signature,secret),true);
    assert.equal(validSignature(Buffer.from('{}'),signature,secret),false);
    assert.equal(validSignature(raw,'bad',secret),false);
    assert.equal(validSignature(raw,signature,'other-key'),false);
    assert.equal(validSignature(raw,undefined,secret),false);
});
test('payment accepts only confirmed reference, amount and Ghana currency', () => {
    const payment = { amountPesewas:4300 }, data = { status:'success',reference:'dropin_abc',currency:'GHS',amount:4300 };
    assert.equal(verifiedPayment(data,payment,'dropin_abc'),true);
    for (const change of [{ status:'pending' },{ reference:'another-ride' },{ currency:'NGN' },{ amount:4299 },{ amount:'4300' }]) assert.throws(() => verifiedPayment({...data,...change},payment,'dropin_abc'));
});
test('dispatch excludes missing and future freshness timestamps', () => {
    const p = core.point('accra-mall'), now = Date.now();
    const d = { approved:true,online:true,city:p.city,type:'standard',lat:p.lat,lng:p.lng };
    assert.equal(core.candidates([d,{...d,locationUpdatedAt:now+1},{...d,locationUpdatedAt:NaN}],p,'standard',now).length,0);
});
