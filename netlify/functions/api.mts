import type { Config } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import { and, desc, eq, gte, inArray, ne, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { driverDocuments, drivers, profiles, rides, settings } from '../../db/schema.js';
import {
  ACTIVE_STATUSES,
  CITIES,
  VEHICLES,
  driverShare,
  isGhanaPhone,
  isVehicleType,
  priceFor,
} from '../../shared/pricing.js';
import { requireAdmin, requireUser, type AuthUser } from '../lib/auth.js';
import { OFFER_SECONDS, dispatchRide, releaseOffer, sweep } from '../lib/dispatch.js';
import { HttpError, fail, isUniqueViolation, num, readJson, str } from '../lib/http.js';
import { autocomplete, inGhana, placeDetails, reverseGeocode, route } from '../lib/maps.js';
import { startCheckout, validSignature, verifyAndSettle } from '../lib/paystack.js';
import { getSettings, mapsConfigured, momoAvailable, paystackConfigured } from '../lib/settings.js';

type Ride = typeof rides.$inferSelect;
type Driver = typeof drivers.$inferSelect;
type Handler = (req: Request, params: string[]) => Promise<Response>;

const DOC_KINDS = ['licence', 'identity', 'insurance', 'roadworthiness'] as const;
const DOC_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const MAX_DOC_BYTES = 5 * 1024 * 1024;
const documentsStore = () => getStore('driver-documents');

const ok = (data: unknown, status = 200) => Response.json(data, { status });

// ---------- shared helpers ----------

function point(v: any, field: string) {
  const p = {
    address: str(v?.address, `${field} address`, 2, 300),
    lat: num(v?.lat, `${field} location`, -90, 90),
    lng: num(v?.lng, `${field} location`, -180, 180),
  };
  if (!inGhana(p)) fail(400, `The ${field} must be inside Ghana.`);
  return p;
}

async function findRide(id: string) {
  const rideId = num(id, 'ride', 1);
  const [ride] = await db.select().from(rides).where(eq(rides.id, rideId));
  return ride || fail(404, 'Ride not found.');
}

async function myDriver(user: AuthUser) {
  const [d] = await db.select().from(drivers).where(eq(drivers.userId, user.id));
  return d || null;
}

async function myProfile(user: AuthUser) {
  const [p] = await db.select().from(profiles).where(eq(profiles.userId, user.id));
  return p || null;
}

function driverPublic(d: Driver | undefined, ride: Ride) {
  if (!d) return null;
  const live = ['accepted', 'arrived', 'in_progress'].includes(ride.status);
  return {
    name: d.name,
    phone: live ? d.phone : null,
    vehicleType: d.vehicleType,
    vehicleModel: d.vehicleModel,
    vehicleColor: d.vehicleColor,
    plate: d.plate,
    lat: live ? d.lat : null,
    lng: live ? d.lng : null,
    locationAt: live ? d.locationAt : null,
  };
}

/** A ride as the rider sees it, with the assigned driver's details once they accept. */
async function riderView(ride: Ride) {
  let driver = null;
  if (ride.driverId && ride.status !== 'offered') {
    const [d] = await db.select().from(drivers).where(eq(drivers.userId, ride.driverId));
    driver = driverPublic(d, ride);
  }
  const { declinedDriverIds: _d, paystackUrl: _u, riderId: _r, driverId: _i, ...rest } = ride;
  return { ...rest, driver };
}

/** A ride as the driver sees it. Rider phone is shared only after the driver accepts. */
function driverView(ride: Ride) {
  const accepted = !['searching', 'offered'].includes(ride.status);
  return {
    id: ride.id,
    status: ride.status,
    riderName: ride.riderName,
    riderPhone: accepted ? ride.riderPhone : null,
    pickupAddress: ride.pickupAddress,
    pickupLat: ride.pickupLat,
    pickupLng: ride.pickupLng,
    dropoffAddress: ride.dropoffAddress,
    dropoffLat: ride.dropoffLat,
    dropoffLng: ride.dropoffLng,
    vehicleType: ride.vehicleType,
    distanceKm: ride.distanceKm,
    durationMin: ride.durationMin,
    fare: ride.fare,
    driverEarnings: ride.driverEarnings ?? driverShare(ride.fare, ride.commissionPercent),
    paymentMethod: ride.paymentMethod,
    paymentStatus: ride.paymentStatus,
    offeredAt: ride.offeredAt,
    offerExpiresAt: ride.offeredAt ? new Date(ride.offeredAt.getTime() + OFFER_SECONDS * 1000) : null,
    acceptedAt: ride.acceptedAt,
    completedAt: ride.completedAt,
    cancelReason: ride.cancelReason,
    createdAt: ride.createdAt,
  };
}

async function latestDocuments(driverId: string) {
  const docs = await db
    .select()
    .from(driverDocuments)
    .where(eq(driverDocuments.driverId, driverId))
    .orderBy(desc(driverDocuments.uploadedAt));
  const latest: Record<string, (typeof docs)[number]> = {};
  for (const d of docs) if (!latest[d.kind]) latest[d.kind] = d;
  return DOC_KINDS.map(kind => {
    const d = latest[kind];
    return d ? { kind, id: d.id, filename: d.filename, size: d.size, uploadedAt: d.uploadedAt } : { kind, id: null };
  });
}

const publicSettings = async () => {
  const s = await getSettings();
  return {
    vehicles: VEHICLES,
    cities: CITIES,
    documentKinds: DOC_KINDS,
    acceptingRides: s.acceptingRides,
    momoAvailable: momoAvailable(s),
    mapsProvider: mapsConfigured() ? 'google' : 'openstreetmap',
    offerSeconds: OFFER_SECONDS,
  };
};

// ---------- account ----------

const getConfig: Handler = async () => ok(await publicSettings());

const getMe: Handler = async () => {
  const user = await requireUser();
  await sweep().catch(e => console.error('sweep failed', e));
  const [profile, driver] = await Promise.all([myProfile(user), myDriver(user)]);
  const [activeRide] = await db
    .select()
    .from(rides)
    .where(and(eq(rides.riderId, user.id), inArray(rides.status, ACTIVE_STATUSES)));
  return ok({
    user: { id: user.id, email: user.email, name: user.name, isAdmin: user.isAdmin },
    profile,
    driver: driver && { ...driver, documents: await latestDocuments(user.id) },
    activeRideId: activeRide?.id ?? null,
  });
};

const putProfile: Handler = async req => {
  const user = await requireUser();
  const body = await readJson(req);
  const name = str(body.name, 'name', 2, 80);
  const phone = str(body.phone, 'phone number', 9, 20).replace(/[\s-]/g, '');
  if (!isGhanaPhone(phone)) fail(400, 'Enter a Ghana phone number, e.g. 024 123 4567.');
  const [profile] = await db
    .insert(profiles)
    .values({ userId: user.id, email: user.email, name, phone })
    .onConflictDoUpdate({ target: profiles.userId, set: { name, phone, email: user.email, updatedAt: new Date() } })
    .returning();
  return ok({ profile });
};

// ---------- places & pricing ----------

const postSearch: Handler = async req => {
  await requireUser();
  const body = await readJson(req);
  const input = str(body.input, 'search', 2, 120);
  const token = typeof body.sessionToken === 'string' ? body.sessionToken.slice(0, 100) : '';
  const near =
    Number.isFinite(body.near?.lat) && Number.isFinite(body.near?.lng) ? { lat: body.near.lat, lng: body.near.lng } : undefined;
  return ok({ results: await autocomplete(input, token, near) });
};

const postPlace: Handler = async req => {
  await requireUser();
  const body = await readJson(req);
  const placeId = str(body.placeId, 'place', 1, 300);
  return ok({ place: await placeDetails(placeId, String(body.sessionToken || '').slice(0, 100)) });
};

const postReverse: Handler = async req => {
  await requireUser();
  const body = await readJson(req);
  const p = { lat: num(body.lat, 'location', -90, 90), lng: num(body.lng, 'location', -180, 180) };
  return ok({ address: await reverseGeocode(p), inGhana: inGhana(p) });
};

async function quoteFor(pickup: { lat: number; lng: number }, dropoff: { lat: number; lng: number }) {
  const [r, s] = await Promise.all([route(pickup, dropoff), getSettings()]);
  if (r.km < 0.3) fail(400, 'Pickup and drop-off are too close together.');
  if (r.km > 400) fail(400, 'That trip is too long. DropIn serves trips within and between nearby towns.');
  return {
    route: r,
    settings: s,
    prices: VEHICLES.map(v => ({ vehicleType: v.id, fare: priceFor(r.km, r.minutes, v.id, s) })),
  };
}

const postQuote: Handler = async req => {
  await requireUser();
  const body = await readJson(req);
  const q = await quoteFor(point(body.pickup, 'pickup'), point(body.dropoff, 'drop-off'));
  return ok({ route: q.route, prices: q.prices });
};

// ---------- rider ----------

const postRide: Handler = async req => {
  const user = await requireUser();
  const body = await readJson(req);
  const profile = (await myProfile(user)) || fail(400, 'Add your name and phone number before booking.');
  const s = await getSettings();
  if (!s.acceptingRides) fail(503, 'DropIn is not taking ride requests right now. Please try again later.');
  const pickup = point(body.pickup, 'pickup');
  const dropoff = point(body.dropoff, 'drop-off');
  if (!isVehicleType(body.vehicleType)) fail(400, 'Choose a ride type.');
  const paymentMethod = body.paymentMethod === 'momo' ? 'momo' : 'cash';
  if (paymentMethod === 'momo' && !momoAvailable(s)) fail(400, 'Mobile money is not available right now. Choose cash.');
  const q = await quoteFor(pickup, dropoff);
  const fare = q.prices.find(p => p.vehicleType === body.vehicleType)!.fare;

  let ride: Ride;
  try {
    [ride] = await db
      .insert(rides)
      .values({
        riderId: user.id,
        riderName: profile.name,
        riderPhone: profile.phone,
        riderEmail: user.email,
        pickupAddress: pickup.address,
        pickupLat: pickup.lat,
        pickupLng: pickup.lng,
        dropoffAddress: dropoff.address,
        dropoffLat: dropoff.lat,
        dropoffLng: dropoff.lng,
        vehicleType: body.vehicleType,
        distanceKm: q.route.km,
        durationMin: q.route.minutes,
        fare,
        commissionPercent: q.settings.commission,
        paymentMethod,
      })
      .returning();
  } catch (e) {
    if (isUniqueViolation(e)) fail(409, 'You already have a ride in progress.');
    throw e;
  }
  const offered = await dispatchRide(ride, s.searchRadiusKm);
  return ok({ ride: await riderView(offered || ride) }, 201);
};

const getRides: Handler = async () => {
  const user = await requireUser();
  const list = await db.select().from(rides).where(eq(rides.riderId, user.id)).orderBy(desc(rides.createdAt)).limit(30);
  return ok({ rides: await Promise.all(list.map(riderView)) });
};

async function ownRide(user: AuthUser, id: string) {
  const ride = await findRide(id);
  if (ride.riderId !== user.id) fail(404, 'Ride not found.');
  return ride;
}

const getRide: Handler = async (_req, [id]) => {
  const user = await requireUser();
  await sweep().catch(e => console.error('sweep failed', e));
  return ok({ ride: await riderView(await ownRide(user, id)) });
};

const cancelRide: Handler = async (req, [id]) => {
  const user = await requireUser();
  const ride = await ownRide(user, id);
  const body = await readJson(req);
  if (!['searching', 'offered', 'accepted', 'arrived'].includes(ride.status))
    fail(400, 'This ride can no longer be cancelled.');
  const [updated] = await db
    .update(rides)
    .set({
      status: 'cancelled',
      cancelledAt: new Date(),
      cancelledBy: 'rider',
      cancelReason: typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 200) : 'Cancelled by rider',
    })
    .where(and(eq(rides.id, ride.id), inArray(rides.status, ['searching', 'offered', 'accepted', 'arrived'])))
    .returning();
  if (!updated) fail(409, 'The ride changed. Please refresh.');
  return ok({ ride: await riderView(updated) });
};

const rateRide: Handler = async (req, [id]) => {
  const user = await requireUser();
  const ride = await ownRide(user, id);
  if (ride.status !== 'completed') fail(400, 'You can rate a trip once it is complete.');
  const rating = num((await readJson(req)).rating, 'rating', 1, 5);
  const [updated] = await db
    .update(rides)
    .set({ riderRating: Math.round(rating) })
    .where(eq(rides.id, ride.id))
    .returning();
  return ok({ ride: await riderView(updated) });
};

const payRide: Handler = async (req, [id]) => {
  const user = await requireUser();
  const ride = await ownRide(user, id);
  if (ride.paymentMethod !== 'momo') fail(400, 'This trip is paid in cash.');
  if (!momoAvailable(await getSettings())) fail(503, 'Mobile money is not available right now. Please pay the driver in cash.');
  const origin = new URL(req.url).origin;
  return ok(await startCheckout(ride, origin));
};

const verifyPayment: Handler = async (_req, [id]) => {
  const user = await requireUser();
  const ride = await ownRide(user, id);
  if (!ride.paystackReference || !paystackConfigured()) return ok({ ride: await riderView(ride) });
  const settled = await verifyAndSettle(ride.paystackReference);
  return ok({ ride: await riderView(settled || ride) });
};

// ---------- driver ----------

async function requireApprovedDriver(user: AuthUser) {
  const d = (await myDriver(user)) || fail(403, 'Apply to drive first.');
  if (d.status !== 'approved') fail(403, 'Your driver account is not approved yet.');
  return d;
}

const applyDriver: Handler = async req => {
  const user = await requireUser();
  const body = await readJson(req);
  const existing = await myDriver(user);
  if (existing?.status === 'approved') fail(400, 'You are already approved. Contact DropIn to change your vehicle details.');
  const phone = str(body.phone, 'phone number', 9, 20).replace(/[\s-]/g, '');
  if (!isGhanaPhone(phone)) fail(400, 'Enter a Ghana phone number, e.g. 024 123 4567.');
  if (!isVehicleType(body.vehicleType)) fail(400, 'Choose a vehicle class.');
  const city = str(body.city, 'city', 2, 60);
  if (!CITIES.includes(city)) fail(400, 'Choose a city DropIn serves.');
  const values = {
    name: str(body.name, 'name', 2, 80),
    phone,
    email: user.email,
    city,
    vehicleType: body.vehicleType as string,
    vehicleModel: str(body.vehicleModel, 'vehicle make and model', 2, 80),
    vehicleColor: str(body.vehicleColor, 'vehicle colour', 2, 30),
    plate: str(body.plate, 'number plate', 4, 15).toUpperCase(),
    licenceNumber: str(body.licenceNumber, 'licence number', 4, 30).toUpperCase(),
  };
  const [driver] = await db
    .insert(drivers)
    .values({ userId: user.id, ...values })
    .onConflictDoUpdate({ target: drivers.userId, set: { ...values, status: 'pending', reviewNote: null } })
    .returning();
  return ok({ driver: { ...driver, documents: await latestDocuments(user.id) } });
};

const uploadDocument: Handler = async (req, [kind]) => {
  const user = await requireUser();
  const driver = (await myDriver(user)) || fail(400, 'Submit your driver details first.');
  if (!(DOC_KINDS as readonly string[]).includes(kind)) fail(400, 'Unknown document type.');
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, 'Choose a file to upload.');
  }
  const file = form.get('file');
  if (!(file instanceof File) || !file.size) fail(400, 'Choose a file to upload.');
  const f = file as File;
  if (!DOC_TYPES.includes(f.type)) fail(400, 'Upload a JPEG, PNG or PDF file.');
  if (f.size > MAX_DOC_BYTES) fail(400, 'Files must be 5 MB or smaller.');
  const blobKey = `${user.id}/${kind}-${Date.now()}`;
  await documentsStore().set(blobKey, await f.arrayBuffer(), { metadata: { contentType: f.type } });
  await db.insert(driverDocuments).values({
    driverId: user.id,
    kind,
    blobKey,
    filename: f.name.slice(0, 120) || kind,
    contentType: f.type,
    size: f.size,
  });
  // Re-uploading after a rejection sends the application back to the review queue.
  if (driver.status === 'rejected')
    await db.update(drivers).set({ status: 'pending', reviewNote: null }).where(eq(drivers.userId, user.id));
  return ok({ documents: await latestDocuments(user.id) });
};

const driverState: Handler = async () => {
  const user = await requireUser();
  await sweep().catch(e => console.error('sweep failed', e));
  const driver = (await myDriver(user)) || fail(404, 'No driver account.');
  const [current] = await db
    .select()
    .from(rides)
    .where(and(eq(rides.driverId, user.id), inArray(rides.status, ['offered', 'accepted', 'arrived', 'in_progress'])));
  // Completed cash trips stay on screen until the driver confirms collection.
  const [awaitingCash] = current
    ? []
    : await db
        .select()
        .from(rides)
        .where(
          and(
            eq(rides.driverId, user.id),
            eq(rides.status, 'completed'),
            eq(rides.paymentMethod, 'cash'),
            eq(rides.paymentStatus, 'unpaid'),
            gte(rides.completedAt, new Date(Date.now() - 6 * 3600_000))
          )
        )
        .orderBy(desc(rides.completedAt))
        .limit(1);
  const job = current || awaitingCash;
  return ok({
    driver: { ...driver, documents: await latestDocuments(user.id) },
    job: job ? driverView(job) : null,
    serverTime: new Date(),
  });
};

const setOnline: Handler = async req => {
  const user = await requireUser();
  const driver = await requireApprovedDriver(user);
  const body = await readJson(req);
  if (body.online) {
    const lat = num(body.lat, 'location', -90, 90);
    const lng = num(body.lng, 'location', -180, 180);
    await db.update(drivers).set({ online: true, lat, lng, locationAt: new Date() }).where(eq(drivers.userId, driver.userId));
    // Pick up any rider who is already waiting nearby.
    await sweep(true).catch(e => console.error('sweep failed', e));
  } else {
    await db.update(drivers).set({ online: false }).where(eq(drivers.userId, driver.userId));
  }
  return driverState(req, []);
};

const postLocation: Handler = async req => {
  const user = await requireUser();
  const body = await readJson(req);
  const lat = num(body.lat, 'location', -90, 90);
  const lng = num(body.lng, 'location', -180, 180);
  await db.update(drivers).set({ lat, lng, locationAt: new Date() }).where(eq(drivers.userId, user.id));
  return ok({ ok: true });
};

async function myJob(user: AuthUser, id: string) {
  const ride = await findRide(id);
  if (ride.driverId !== user.id) fail(404, 'This trip is not assigned to you.');
  return ride;
}

/** Moves a trip from one status to the next, only if it is still in the expected state. */
async function advance(ride: Ride, from: string[], set: Partial<Ride>) {
  const [updated] = await db
    .update(rides)
    .set(set)
    .where(and(eq(rides.id, ride.id), eq(rides.driverId, ride.driverId!), inArray(rides.status, from)))
    .returning();
  if (!updated) fail(409, 'This trip changed. Please refresh.');
  return ok({ job: driverView(updated) });
}

const driverAction: Handler = async (_req, [id, action]) => {
  const user = await requireUser();
  await requireApprovedDriver(user);
  const ride = await myJob(user, id);
  switch (action) {
    case 'accept':
      if (ride.status === 'offered' && ride.offeredAt && Date.now() - ride.offeredAt.getTime() > OFFER_SECONDS * 1000)
        fail(409, 'This offer has expired.');
      return advance(ride, ['offered'], { status: 'accepted', acceptedAt: new Date() });
    case 'decline': {
      if (ride.status !== 'offered') fail(409, 'This offer is no longer open.');
      await releaseOffer(ride, 'declined');
      const [fresh] = await db.select().from(rides).where(eq(rides.id, ride.id));
      if (fresh?.status === 'searching') await dispatchRide(fresh);
      return ok({ job: null });
    }
    case 'arrive':
      return advance(ride, ['accepted'], { status: 'arrived', arrivedAt: new Date() });
    case 'start':
      return advance(ride, ['arrived'], { status: 'in_progress', startedAt: new Date() });
    case 'complete':
      return advance(ride, ['in_progress'], {
        status: 'completed',
        completedAt: new Date(),
        driverEarnings: driverShare(ride.fare, ride.commissionPercent),
      });
    case 'cash': {
      if (ride.status !== 'completed' || ride.paymentMethod !== 'cash') fail(400, 'Only completed cash trips can be marked as collected.');
      const [updated] = await db
        .update(rides)
        .set({ paymentStatus: 'cash_collected', paidAt: new Date() })
        .where(and(eq(rides.id, ride.id), eq(rides.paymentStatus, 'unpaid')))
        .returning();
      return ok({ job: driverView(updated || ride) });
    }
    case 'release': {
      // The driver can no longer make the pickup; send the rider back to the queue.
      const [updated] = await db
        .update(rides)
        .set({
          status: 'searching',
          driverId: null,
          offeredAt: null,
          acceptedAt: null,
          arrivedAt: null,
          declinedDriverIds: sql`${rides.declinedDriverIds} || ${JSON.stringify([user.id])}::jsonb`,
        })
        .where(and(eq(rides.id, ride.id), eq(rides.driverId, user.id), inArray(rides.status, ['accepted', 'arrived'])))
        .returning();
      if (!updated) fail(409, 'This trip can no longer be handed back.');
      await dispatchRide(updated);
      return ok({ job: null });
    }
  }
  return fail(404, 'Unknown action.');
};

const driverTrips: Handler = async () => {
  const user = await requireUser();
  const list = await db
    .select()
    .from(rides)
    .where(and(eq(rides.driverId, user.id), eq(rides.status, 'completed')))
    .orderBy(desc(rides.completedAt))
    .limit(50);
  return ok({ trips: list.map(driverView) });
};

// ---------- operator ----------

const adminOverview: Handler = async () => {
  await requireAdmin();
  await sweep().catch(e => console.error('sweep failed', e));
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const [allDrivers, recent, [today], s] = await Promise.all([
    db.select().from(drivers).orderBy(desc(drivers.createdAt)),
    db.select().from(rides).orderBy(desc(rides.createdAt)).limit(60),
    db
      .select({
        completed: sql<number>`count(*) filter (where ${rides.status} = 'completed')`.mapWith(Number),
        cancelled: sql<number>`count(*) filter (where ${rides.status} = 'cancelled')`.mapWith(Number),
        gross: sql<number>`coalesce(sum(${rides.fare}) filter (where ${rides.status} = 'completed'), 0)`.mapWith(Number),
        commission: sql<number>`coalesce(sum(${rides.fare} - ${rides.driverEarnings}) filter (where ${rides.status} = 'completed'), 0)`.mapWith(Number),
      })
      .from(rides)
      .where(gte(rides.createdAt, since)),
    getSettings(),
  ]);
  const docs = await db.select().from(driverDocuments).orderBy(desc(driverDocuments.uploadedAt));
  const docsBy: Record<string, Record<string, (typeof docs)[number]>> = {};
  for (const d of docs) {
    docsBy[d.driverId] ??= {};
    docsBy[d.driverId][d.kind] ??= d;
  }
  const active = recent.filter(r => (ACTIVE_STATUSES as string[]).includes(r.status)).length;
  return ok({
    stats: {
      ...today,
      active,
      driversOnline: allDrivers.filter(d => d.online).length,
      driversPending: allDrivers.filter(d => d.status === 'pending').length,
    },
    drivers: allDrivers.map(d => ({
      ...d,
      documents: DOC_KINDS.map(kind => {
        const doc = docsBy[d.userId]?.[kind];
        return doc ? { kind, id: doc.id, filename: doc.filename, uploadedAt: doc.uploadedAt } : { kind, id: null };
      }),
    })),
    rides: recent.map(({ declinedDriverIds: _d, paystackUrl: _u, ...r }) => ({
      ...r,
      driverName: allDrivers.find(d => d.userId === r.driverId)?.name ?? null,
    })),
    settings: s,
    integrations: { paystack: paystackConfigured(), maps: mapsConfigured() },
  });
};

const reviewDriver: Handler = async (req, [driverId]) => {
  await requireAdmin();
  const body = await readJson(req);
  const status = body.status;
  if (!['approved', 'rejected', 'suspended', 'pending'].includes(status)) fail(400, 'Choose a review decision.');
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) || null : null;
  if (status === 'approved') {
    const docs = await latestDocuments(driverId);
    if (docs.some(d => !d.id)) fail(400, 'All four documents must be uploaded before approval.');
  }
  const [updated] = await db
    .update(drivers)
    .set({ status, reviewNote: note, reviewedAt: new Date(), ...(status !== 'approved' && { online: false }) })
    .where(eq(drivers.userId, driverId))
    .returning();
  if (!updated) fail(404, 'Driver not found.');
  return ok({ driver: updated });
};

const getDocument: Handler = async (_req, [docId]) => {
  await requireAdmin();
  const [doc] = await db.select().from(driverDocuments).where(eq(driverDocuments.id, num(docId, 'document', 1)));
  if (!doc) fail(404, 'Document not found.');
  const data = await documentsStore().get(doc.blobKey, { type: 'arrayBuffer' });
  if (!data) fail(404, 'Document file is missing.');
  return new Response(data, {
    headers: {
      'Content-Type': doc.contentType,
      'Content-Disposition': `inline; filename="${doc.filename.replace(/[^\w.\- ]/g, '_')}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};

const putSettings: Handler = async req => {
  await requireAdmin();
  const b = await readJson(req);
  await getSettings();
  const [updated] = await db
    .update(settings)
    .set({
      base: num(b.base, 'base fare', 0, 1000),
      perKm: num(b.perKm, 'price per km', 0, 100),
      perMinute: num(b.perMinute, 'price per minute', 0, 100),
      minimum: num(b.minimum, 'minimum fare', 0, 1000),
      commission: num(b.commission, 'commission', 0, 60),
      searchRadiusKm: num(b.searchRadiusKm, 'search radius', 1, 50),
      momoEnabled: Boolean(b.momoEnabled),
      acceptingRides: Boolean(b.acceptingRides),
      updatedAt: new Date(),
    })
    .where(eq(settings.id, 1))
    .returning();
  return ok({ settings: updated });
};

const adminCancel: Handler = async (_req, [id]) => {
  await requireAdmin();
  const ride = await findRide(id);
  const [updated] = await db
    .update(rides)
    .set({ status: 'cancelled', cancelledAt: new Date(), cancelledBy: 'operator', cancelReason: 'Cancelled by DropIn support' })
    .where(and(eq(rides.id, ride.id), inArray(rides.status, ACTIVE_STATUSES)))
    .returning();
  if (!updated) fail(400, 'Only active rides can be cancelled.');
  return ok({ ok: true });
};

const adminMarkPaid: Handler = async (_req, [id]) => {
  await requireAdmin();
  const ride = await findRide(id);
  if (ride.status !== 'completed') fail(400, 'Only completed trips can be settled.');
  await db
    .update(rides)
    .set({ paymentStatus: ride.paymentMethod === 'cash' ? 'cash_collected' : 'paid', paidAt: new Date() })
    .where(and(eq(rides.id, ride.id), ne(rides.paymentStatus, 'paid'), ne(rides.paymentStatus, 'cash_collected')));
  return ok({ ok: true });
};

// ---------- payments webhook ----------

const paystackWebhook: Handler = async req => {
  const raw = await req.text();
  if (!validSignature(raw, req.headers.get('x-paystack-signature'))) return new Response('Invalid signature', { status: 401 });
  let event: any;
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response('Bad payload', { status: 400 });
  }
  if (event?.event === 'charge.success' && typeof event.data?.reference === 'string')
    await verifyAndSettle(event.data.reference);
  return new Response('ok');
};

// ---------- router ----------

const routes: [string, RegExp, Handler][] = [
  ['GET', /^\/config$/, getConfig],
  ['GET', /^\/me$/, getMe],
  ['PUT', /^\/profile$/, putProfile],
  ['POST', /^\/places\/search$/, postSearch],
  ['POST', /^\/places\/details$/, postPlace],
  ['POST', /^\/places\/reverse$/, postReverse],
  ['POST', /^\/quote$/, postQuote],
  ['GET', /^\/rides$/, getRides],
  ['POST', /^\/rides$/, postRide],
  ['GET', /^\/rides\/(\d+)$/, getRide],
  ['POST', /^\/rides\/(\d+)\/cancel$/, cancelRide],
  ['POST', /^\/rides\/(\d+)\/rate$/, rateRide],
  ['POST', /^\/rides\/(\d+)\/pay$/, payRide],
  ['POST', /^\/rides\/(\d+)\/verify-payment$/, verifyPayment],
  ['GET', /^\/driver$/, driverState],
  ['POST', /^\/driver\/apply$/, applyDriver],
  ['POST', /^\/driver\/documents\/(\w+)$/, uploadDocument],
  ['POST', /^\/driver\/online$/, setOnline],
  ['POST', /^\/driver\/location$/, postLocation],
  ['GET', /^\/driver\/trips$/, driverTrips],
  ['POST', /^\/driver\/jobs\/(\d+)\/(accept|decline|arrive|start|complete|cash|release)$/, driverAction],
  ['GET', /^\/admin\/overview$/, adminOverview],
  ['POST', /^\/admin\/drivers\/([^/]+)\/review$/, reviewDriver],
  ['GET', /^\/admin\/documents\/(\d+)$/, getDocument],
  ['PUT', /^\/admin\/settings$/, putSettings],
  ['POST', /^\/admin\/rides\/(\d+)\/cancel$/, adminCancel],
  ['POST', /^\/admin\/rides\/(\d+)\/settle$/, adminMarkPaid],
  ['POST', /^\/paystack\/webhook$/, paystackWebhook],
];

export default async (req: Request) => {
  const path = new URL(req.url).pathname.replace(/^\/api/, '').replace(/\/$/, '') || '/';
  let pathMatched = false;
  for (const [method, pattern, handler] of routes) {
    const m = path.match(pattern);
    if (!m) continue;
    pathMatched = true;
    if (method !== req.method) continue;
    try {
      return await handler(req, m.slice(1).map(decodeURIComponent));
    } catch (e) {
      if (e instanceof HttpError) return ok({ error: e.message }, e.status);
      console.error(`${req.method} ${path} failed`, e);
      return ok({ error: 'Something went wrong. Please try again.' }, 500);
    }
  }
  return pathMatched ? ok({ error: 'Method not allowed' }, 405) : ok({ error: 'Not found' }, 404);
};

export const config: Config = { path: '/api/*' };
