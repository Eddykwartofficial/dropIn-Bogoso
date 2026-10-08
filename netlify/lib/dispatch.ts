import { and, eq, gt, gte, inArray, isNotNull, lt, lte, ne, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { drivers, rides } from '../../db/schema.js';
import { haversineKm } from '../../shared/pricing.js';
import { isUniqueViolation } from './http.js';
import { getSettings } from './settings.js';

export const OFFER_SECONDS = 40;
export const SEARCH_MINUTES = 6;
export const LOCATION_FRESH_MINUTES = 3;
const DRIVER_STALE_MINUTES = 10;

type Ride = typeof rides.$inferSelect;

const ago = (ms: number) => new Date(Date.now() - ms);
const BUSY = ['offered', 'accepted', 'arrived', 'in_progress'];

export async function dispatchRide(ride: Ride, radiusKm?: number) {
  const radius = radiusKm ?? (await getSettings()).searchRadiusKm;
  const dLat = radius / 111;
  const dLng = radius / (111 * Math.cos((ride.pickupLat * Math.PI) / 180));
  const busy = db
    .select({ id: rides.driverId })
    .from(rides)
    .where(and(isNotNull(rides.driverId), inArray(rides.status, BUSY)));
  const candidates = await db
    .select()
    .from(drivers)
    .where(
      and(
        eq(drivers.status, 'approved'),
        eq(drivers.online, true),
        eq(drivers.vehicleType, ride.vehicleType),
        ne(drivers.userId, ride.riderId),
        gt(drivers.locationAt, ago(LOCATION_FRESH_MINUTES * 60_000)),
        gte(drivers.lat, ride.pickupLat - dLat),
        lte(drivers.lat, ride.pickupLat + dLat),
        gte(drivers.lng, ride.pickupLng - dLng),
        lte(drivers.lng, ride.pickupLng + dLng),
        sql`${drivers.userId} not in (${busy})`
      )
    );
  const pickup = { lat: ride.pickupLat, lng: ride.pickupLng };
  const ranked = candidates
    .filter(d => !ride.declinedDriverIds.includes(d.userId))
    .map(d => ({ d, km: haversineKm(pickup, { lat: d.lat!, lng: d.lng! }) }))
    .filter(x => x.km <= radius)
    .sort((a, b) => a.km - b.km);

  for (const { d } of ranked) {
    try {
      const [updated] = await db
        .update(rides)
        .set({ driverId: d.userId, status: 'offered', offeredAt: new Date() })
        .where(and(eq(rides.id, ride.id), eq(rides.status, 'searching')))
        .returning();
      return updated || null;
    } catch (e) {
      // Another ride grabbed this driver at the same moment; try the next one.
      if (!isUniqueViolation(e)) throw e;
    }
  }
  return null;
}

export async function releaseOffer(ride: Ride, reason: 'declined' | 'expired') {
  if (!ride.driverId) return;
  await db
    .update(rides)
    .set({
      status: 'searching',
      driverId: null,
      offeredAt: null,
      declinedDriverIds: sql`${rides.declinedDriverIds} || ${JSON.stringify([ride.driverId])}::jsonb`,
    })
    .where(and(eq(rides.id, ride.id), eq(rides.status, 'offered'), eq(rides.driverId, ride.driverId)));
  if (reason === 'expired') {
    // A driver who ignores offers is probably not at their phone.
    await db.update(drivers).set({ online: false }).where(eq(drivers.userId, ride.driverId));
  }
}

let lastSweep = 0;

/** Expires unanswered offers, cancels rides nobody could take, and re-dispatches waiting rides. */
export async function sweep(force = false) {
  if (!force && Date.now() - lastSweep < 3000) return;
  lastSweep = Date.now();

  await db
    .update(drivers)
    .set({ online: false })
    .where(and(eq(drivers.online, true), lt(drivers.locationAt, ago(DRIVER_STALE_MINUTES * 60_000))));

  const expired = await db
    .select()
    .from(rides)
    .where(and(eq(rides.status, 'offered'), lt(rides.offeredAt, ago(OFFER_SECONDS * 1000))));
  for (const ride of expired) await releaseOffer(ride, 'expired');

  await db
    .update(rides)
    .set({
      status: 'cancelled',
      cancelledAt: new Date(),
      cancelledBy: 'system',
      cancelReason: 'No driver was available nearby. Please try again.',
    })
    .where(and(eq(rides.status, 'searching'), lt(rides.createdAt, ago(SEARCH_MINUTES * 60_000))));

  const waiting = await db.select().from(rides).where(eq(rides.status, 'searching'));
  if (!waiting.length) return;
  const { searchRadiusKm } = await getSettings();
  for (const ride of waiting) await dispatchRide(ride, searchRadiusKm);
}
