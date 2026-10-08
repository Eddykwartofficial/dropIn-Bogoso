import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, applyCommand, fareFor } from '../shared/domain.ts';
const booking = { action:'book',pickup:'accra-mall',dropoff:'osu',type:'standard',payment:'cash' };
test('booking chooses a matching driver and blocks a second active trip',()=>{
    const state=applyCommand(initialState(),booking);
    assert.equal(state.rides[0].driverId,'kwame');
    assert.equal(state.rides[0].status,'offered');
    assert.throws(()=>applyCommand(state,booking),/current ride/);
    assert.equal(initialState().rides.length,0);
});
test('ordered trip progression records earnings and allows a single rating',()=>{
    let state=applyCommand(initialState(),booking);
    const id=state.rides[0].id;
    assert.throws(()=>applyCommand(state,{action:'ride',id,driverId:'kwame',status:'completed'}));
    assert.throws(()=>applyCommand(state,{action:'ride',id,driverId:'ama',status:'accepted'}));
    for(const status of ['accepted','arrived','in_progress','completed'])state=applyCommand(state,{action:'ride',id,driverId:'kwame',status});
    assert.equal(state.rides[0].driverEarnings,36.85);
    state=applyCommand(state,{action:'rate',id,rating:5});
    assert.equal(state.rides[0].rating,5);
    assert.throws(()=>applyCommand(state,{action:'rate',id,rating:4}));
});
test('no online matching driver yields searching and redispatch retains fare',()=>{
    let state=applyCommand(initialState(),{action:'availability',id:'kwame',online:false});
    state=applyCommand(state,booking);
    assert.equal(state.rides[0].status,'searching');
    const fare=state.rides[0].fare;
    state=applyCommand(state,{action:'settings',settings:{...state.settings,base:30}});
    state=applyCommand(state,{action:'availability',id:'kwame',online:true});
    state=applyCommand(state,{action:'dispatch',id:state.rides[0].id});
    assert.equal(state.rides[0].fare,fare);
    assert.equal(state.rides[0].status,'offered');
});
test('invalid routes, payments and settings cannot mutate the demo',()=>{
    assert.throws(()=>fareFor('osu','osu','standard',initialState().settings));
    assert.throws(()=>fareFor('osu','kejetia','standard',initialState().settings));
    assert.throws(()=>applyCommand(initialState(),{...booking,payment:'momo'}));
    assert.throws(()=>applyCommand(initialState(),{action:'settings',settings:{base:8,perKm:-1,minimum:15,commission:15}}));
});
test('approval creates an offline driver once and rejection does not create one',()=>{
    let state=applyCommand(initialState(),{action:'apply',name:'Demo Driver',vehicle:'Toyota Corolla',city:'Tamale'});
    state=applyCommand(state,{action:'approve',id:'APP-1',approve:true});
    assert.equal(state.drivers.at(-1).online,false);
    assert.equal(state.drivers.at(-1).city,'Tamale');
    assert.throws(()=>applyCommand(state,{action:'approve',id:'APP-1',approve:true}));
    state=applyCommand(state,{action:'apply',name:'Reject Driver',vehicle:'Kia',city:'Accra'});
    state=applyCommand(state,{action:'approve',id:'APP-2',approve:false});
    assert.equal(state.drivers.length,7);
});
