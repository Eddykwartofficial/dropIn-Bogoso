import { sql } from 'drizzle-orm';
import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  doublePrecision,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const settings = pgTable('settings', {
  id: integer().primaryKey().default(1),
  base: doublePrecision().notNull().default(8),
  perKm: doublePrecision('per_km').notNull().default(3.5),
  perMinute: doublePrecision('per_minute').notNull().default(0.3),
  minimum: doublePrecision().notNull().default(15),
  commission: doublePrecision().notNull().default(15),
  searchRadiusKm: doublePrecision('search_radius_km').notNull().default(8),
  momoEnabled: boolean('momo_enabled').notNull().default(false),
  acceptingRides: boolean('accepting_rides').notNull().default(true),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const profiles = pgTable('profiles', {
  userId: text('user_id').primaryKey(),
  email: text().notNull(),
  name: text().notNull(),
  phone: text().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const drivers = pgTable(
  'drivers',
  {
    userId: text('user_id').primaryKey(),
    name: text().notNull(),
    phone: text().notNull(),
    email: text().notNull(),
    city: text().notNull(),
    vehicleType: text('vehicle_type').notNull(),
    vehicleModel: text('vehicle_model').notNull(),
    vehicleColor: text('vehicle_color').notNull(),
    plate: text().notNull(),
    licenceNumber: text('licence_number').notNull(),
    status: text().notNull().default('pending'),
    reviewNote: text('review_note'),
    online: boolean().notNull().default(false),
    lat: doublePrecision(),
    lng: doublePrecision(),
    locationAt: timestamp('location_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    reviewedAt: timestamp('reviewed_at'),
  },
  t => [index('drivers_dispatch_idx').on(t.status, t.online, t.vehicleType)]
);

export const driverDocuments = pgTable(
  'driver_documents',
  {
    id: serial().primaryKey(),
    driverId: text('driver_id').notNull(),
    kind: text().notNull(),
    blobKey: text('blob_key').notNull(),
    filename: text().notNull(),
    contentType: text('content_type').notNull(),
    size: integer().notNull(),
    uploadedAt: timestamp('uploaded_at').defaultNow().notNull(),
  },
  t => [index('driver_documents_driver_idx').on(t.driverId)]
);

const ACTIVE = sql`status in ('searching','offered','accepted','arrived','in_progress')`;

export const rides = pgTable(
  'rides',
  {
    id: serial().primaryKey(),
    riderId: text('rider_id').notNull(),
    riderName: text('rider_name').notNull(),
    riderPhone: text('rider_phone').notNull(),
    riderEmail: text('rider_email').notNull(),
    pickupAddress: text('pickup_address').notNull(),
    pickupLat: doublePrecision('pickup_lat').notNull(),
    pickupLng: doublePrecision('pickup_lng').notNull(),
    dropoffAddress: text('dropoff_address').notNull(),
    dropoffLat: doublePrecision('dropoff_lat').notNull(),
    dropoffLng: doublePrecision('dropoff_lng').notNull(),
    vehicleType: text('vehicle_type').notNull(),
    distanceKm: doublePrecision('distance_km').notNull(),
    durationMin: integer('duration_min').notNull(),
    fare: doublePrecision().notNull(),
    commissionPercent: doublePrecision('commission_percent').notNull(),
    driverEarnings: doublePrecision('driver_earnings'),
    paymentMethod: text('payment_method').notNull(),
    paymentStatus: text('payment_status').notNull().default('unpaid'),
    paystackReference: text('paystack_reference').unique(),
    paystackUrl: text('paystack_url'),
    paidAt: timestamp('paid_at'),
    status: text().notNull().default('searching'),
    driverId: text('driver_id'),
    declinedDriverIds: jsonb('declined_driver_ids').$type<string[]>().notNull().default([]),
    offeredAt: timestamp('offered_at'),
    acceptedAt: timestamp('accepted_at'),
    arrivedAt: timestamp('arrived_at'),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    cancelledAt: timestamp('cancelled_at'),
    cancelledBy: text('cancelled_by'),
    cancelReason: text('cancel_reason'),
    riderRating: integer('rider_rating'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  t => [
    uniqueIndex('rides_one_active_per_rider').on(t.riderId).where(ACTIVE),
    uniqueIndex('rides_one_active_per_driver')
      .on(t.driverId)
      .where(sql`driver_id is not null and status in ('offered','accepted','arrived','in_progress')`),
    index('rides_status_idx').on(t.status),
    index('rides_driver_idx').on(t.driverId),
    index('rides_rider_idx').on(t.riderId),
  ]
);

export const paymentEvents = pgTable('payment_events', {
  id: serial().primaryKey(),
  rideId: integer('ride_id').notNull(),
  reference: text().notNull(),
  event: text().notNull(),
  amountPesewas: integer('amount_pesewas'),
  currency: text(),
  providerStatus: text('provider_status'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
