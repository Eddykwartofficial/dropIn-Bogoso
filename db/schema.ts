import { pgTable, serial, text, jsonb, timestamp } from 'drizzle-orm/pg-core';

export const demoSessions = pgTable('demo_sessions', {
  id: serial().primaryKey(),
  token: text().notNull(),
  state: jsonb().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
