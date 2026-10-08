import { and, eq, isNull, ne } from 'drizzle-orm';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { db } from '../../db/index.js';
import { paymentEvents, rides } from '../../db/schema.js';
import { fail } from './http.js';

type Ride = typeof rides.$inferSelect;
const secret = () => process.env.PAYSTACK_SECRET_KEY || '';
const pesewas = (fare: number) => Math.round(fare * 100);

async function paystack(path: string, init?: RequestInit) {
  const res = await fetch(`https://api.paystack.co${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${secret()}`, 'Content-Type': 'application/json' },
  });
  const data: any = await res.json().catch(() => ({}));
  return { ok: res.ok && data.status === true, data };
}

export function validSignature(rawBody: string, signature: string | null) {
  if (!secret() || !signature) return false;
  const expected = createHmac('sha512', secret()).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Confirms a transaction with Paystack and marks the ride paid only if reference, amount and currency match. */
export async function verifyAndSettle(reference: string) {
  const [ride] = await db.select().from(rides).where(eq(rides.paystackReference, reference));
  if (!ride) return null;
  if (ride.paymentStatus === 'paid') return ride;
  const { ok, data } = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`);
  const tx = data?.data;
  await db.insert(paymentEvents).values({
    rideId: ride.id,
    reference,
    event: 'verify',
    amountPesewas: tx?.amount ?? null,
    currency: tx?.currency ?? null,
    providerStatus: tx?.status ?? (ok ? 'unknown' : 'error'),
  });
  if (
    !ok ||
    tx?.status !== 'success' ||
    tx?.reference !== reference ||
    tx?.currency !== 'GHS' ||
    tx?.amount !== pesewas(ride.fare)
  )
    return ride;
  const [paid] = await db
    .update(rides)
    .set({ paymentStatus: 'paid', paidAt: new Date() })
    .where(and(eq(rides.id, ride.id), ne(rides.paymentStatus, 'paid')))
    .returning();
  return paid || (await db.select().from(rides).where(eq(rides.id, ride.id)))[0];
}

/** Returns a Paystack checkout URL for a completed MoMo ride. Each ride has exactly one payment reference. */
export async function startCheckout(ride: Ride, origin: string) {
  if (!secret()) fail(503, 'Mobile money is not configured yet. Please pay the driver in cash.');
  if (ride.status !== 'completed') fail(400, 'You can pay once the trip is complete.');
  if (ride.paymentStatus === 'paid' || ride.paymentStatus === 'cash_collected') fail(400, 'This trip is already paid.');

  let reference = ride.paystackReference;
  if (!reference) {
    const candidate = `DROPIN-${ride.id}-${Date.now().toString(36)}`;
    const [claimed] = await db
      .update(rides)
      .set({ paystackReference: candidate, paymentStatus: 'pending' })
      .where(and(eq(rides.id, ride.id), isNull(rides.paystackReference)))
      .returning();
    reference = claimed?.paystackReference || (await db.select().from(rides).where(eq(rides.id, ride.id)))[0].paystackReference!;
  } else {
    const settled = await verifyAndSettle(reference);
    if (settled?.paymentStatus === 'paid') return { paid: true as const };
    if (ride.paystackUrl) return { url: ride.paystackUrl };
  }

  const { ok, data } = await paystack('/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify({
      email: ride.riderEmail,
      amount: pesewas(ride.fare),
      currency: 'GHS',
      reference,
      channels: ['mobile_money'],
      callback_url: `${origin}/?paid=${ride.id}`,
      metadata: { ride_id: ride.id },
    }),
  });
  if (!ok || !data?.data?.authorization_url)
    fail(502, data?.message || 'Could not start mobile money checkout. Please try again or pay cash.');
  await db.update(rides).set({ paystackUrl: data.data.authorization_url }).where(eq(rides.id, ride.id));
  return { url: data.data.authorization_url as string };
}
