import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { settings } from '../../db/schema.js';

export type Settings = typeof settings.$inferSelect;

export async function getSettings(): Promise<Settings> {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  if (row) return row;
  const [created] = await db.insert(settings).values({ id: 1 }).onConflictDoNothing().returning();
  if (created) return created;
  const [again] = await db.select().from(settings).where(eq(settings.id, 1));
  return again;
}

export const paystackConfigured = () => Boolean(process.env.PAYSTACK_SECRET_KEY);
export const mapsConfigured = () => Boolean(process.env.GOOGLE_MAPS_API_KEY);
export const momoAvailable = (s: Settings) => s.momoEnabled && paystackConfigured();
