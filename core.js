'use strict';
const PLACES = require('./places.json');
const TYPES = { standard: 1, comfort: 1.35, xl: 1.7 };
const TERMINAL = new Set(['completed', 'cancelled']);
function point(id) {
    const p = PLACES.find(p => p.id === id);
    if (!p) throw new Error('Unknown service location');
    return p;
}
function distance(a, b) {
    const rad = Math.PI / 180;
    const h = Math.sin((b.lat-a.lat)*rad/2)**2 + Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin((b.lng-a.lng)*rad/2)**2;
    return 12742 * Math.atan2(Math.sqrt(h), Math.sqrt(1-h));
}
function quote(km, minutes, type, settings) {
    if (!TYPES[type] || !Number.isFinite(km) || km <= 0 || km > 100 || !Number.isFinite(minutes) || minutes <= 0) throw new Error('Invalid route');
    return { km, minutes, farePesewas: Math.max(settings.minimumPesewas, Math.round((settings.basePesewas + km*settings.perKmPesewas + minutes*settings.perMinutePesewas)*TYPES[type])), commissionPercent: settings.commissionPercent };
}
function candidates(drivers, pickup, type, now = Date.now()) {
    return drivers.filter(d => d.approved && d.online && !d.activeRideId && d.type === type && d.city === pickup.city && Number.isFinite(d.lat) && Number.isFinite(d.lng) && Number.isFinite(d.locationUpdatedAt) && d.locationUpdatedAt <= now && now-d.locationUpdatedAt < 120000 && distance(d,pickup) <= 20).sort((a,b) => distance(a,pickup)-distance(b,pickup));
}
function transition(ride, next, uid, isAdmin = false) {
    const owner = ride.passengerId === uid, driver = ride.driverId === uid;
    if (next === 'cancelled') {
        if (!owner && !driver && !isAdmin) throw new Error('Not your ride');
        if (!['searching','offered','accepted','arrived'].includes(ride.status)) throw new Error('Ride cannot be cancelled');
    } else {
        const allowed = { offered:'accepted', accepted:'arrived', arrived:'in_progress', in_progress:'completed' };
        if (!driver || allowed[ride.status] !== next) throw new Error('Invalid ride transition');
    }
    return { ...ride, status:next };
}
function settlement(ride) {
    const commissionPesewas = Math.round(ride.farePesewas * ride.commissionPercent / 100);
    return { grossPesewas:ride.farePesewas, commissionPesewas, driverNetPesewas:ride.farePesewas-commissionPesewas };
}
module.exports = { PLACES,TYPES,TERMINAL,point,distance,quote,candidates,transition,settlement };
