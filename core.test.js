'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../core');
const settings = { basePesewas:800,perKmPesewas:350,perMinutePesewas:0,minimumPesewas:1500,commissionPercent:15 };
test('fare is quoted in integer pesewas and respects minimum and category',()=>{
    assert.equal(core.quote(1,5,'standard',settings).farePesewas,1500);
    assert.equal(core.quote(10,30,'standard',settings).farePesewas,4300);
    assert.equal(core.quote(10,30,'comfort',settings).farePesewas,5805);
    assert.throws(()=>core.quote(0,5,'standard',settings));
    assert.throws(()=>core.quote(5,10,'unknown',settings));
});
test('nearest dispatch rejects busy, stale, unapproved and wrong category drivers',()=>{
    const pickup=core.point('accra-mall'),now=1000000;
    const base={ approved:true,online:true,city:'Accra',type:'standard',lat:pickup.lat,lng:pickup.lng,locationUpdatedAt:now };
    const drivers=[{...base,id:'busy',activeRideId:'ride'},{...base,id:'stale',locationUpdatedAt:now-120001},{...base,id:'unapproved',approved:false},{...base,id:'comfort',type:'comfort'},{...base,id:'farther',lat:5.65},{...base,id:'nearest',lat:5.623}];
    assert.deepEqual(core.candidates(drivers,pickup,'standard',now).map(d=>d.id),['nearest','farther']);
});
test('only the assigned driver advances a ride and ordered transitions are enforced',()=>{
    let ride={ status:'offered',driverId:'driver-a',passengerId:'passenger-a' };
    assert.throws(()=>core.transition(ride,'accepted','driver-b'));
    assert.throws(()=>core.transition(ride,'completed','driver-a'));
    for(const status of ['accepted','arrived','in_progress','completed']) ride=core.transition(ride,status,'driver-a');
    assert.equal(ride.status,'completed');
    assert.throws(()=>core.transition(ride,'cancelled','passenger-a'));
});
test('passenger cancellation is allowed before the trip but denied during it',()=>{
    const ride={ status:'accepted',driverId:'driver-a',passengerId:'passenger-a' };
    assert.equal(core.transition(ride,'cancelled','passenger-a').status,'cancelled');
    assert.throws(()=>core.transition(ride,'cancelled','stranger'));
    assert.throws(()=>core.transition({...ride,status:'in_progress'},'cancelled','passenger-a'));
});
test('settlement conserves every pesewa even when commission rounds',()=>{
    const result=core.settlement({farePesewas:4335,commissionPercent:15});
    assert.equal(result.commissionPesewas,650);
    assert.equal(result.driverNetPesewas,3685);
    assert.equal(result.driverNetPesewas+result.commissionPesewas,result.grossPesewas);
});
