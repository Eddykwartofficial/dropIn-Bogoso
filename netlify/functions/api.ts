import type { Config } from '@netlify/functions';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { demoSessions } from '../../db/schema.js';
import { PLACES, initialState, applyCommand } from '../../shared/domain.js';

const TOKEN = /^[a-f0-9]{64}$/;
const error = (message: string, status: number) =>
  Response.json({ error: message }, { status });

async function session(body: any) {
  if (!body || !TOKEN.test(body.token || '')) return null;
  const id = Number(body.id);
  if (!Number.isInteger(id)) return null;
  const [record] = await db
    .select()
    .from(demoSessions)
    .where(eq(demoSessions.id, id));
  if (!record || record.token !== body.token) return null;
  return record;
}

export default async (req: Request) => {
  const path = new URL(req.url).pathname;

  if (req.method === 'GET' && path === '/api/_healthcheck')
    return Response.json({ message: 'Success' });

  if (req.method === 'GET' && path === '/api/live')
    return error(
      'Live dispatch is disabled until production services and driver verification are configured.',
      503
    );

  if (req.method !== 'POST') return error('Not found', 404);
  const body: any = await req.json().catch(() => null);

  if (path === '/api/sessions') {
    if (!TOKEN.test(body?.token || ''))
      return error('Invalid demo session', 400);
    const state = initialState();
    const [row] = await db
      .insert(demoSessions)
      .values({ token: body.token, state })
      .returning({ id: demoSessions.id });
    if (!row) return error('Could not start demo', 503);
    return Response.json({ id: String(row.id), state, places: PLACES });
  }

  if (path === '/api/state') {
    const record = await session(body);
    if (!record) return error('Demo session expired. Start a new demo.', 403);
    return Response.json({ state: record.state, places: PLACES });
  }

  if (path === '/api/command') {
    const record = await session(body);
    if (!record) return error('Demo session expired. Start a new demo.', 403);
    try {
      const state = applyCommand(record.state, body.command);
      await db
        .update(demoSessions)
        .set({ state })
        .where(eq(demoSessions.id, record.id));
      return Response.json({ state, places: PLACES });
    } catch (e) {
      return error(e instanceof Error ? e.message : 'Invalid request', 400);
    }
  }

  return error('Not found', 404);
};

export const config: Config = {
  path: '/api/*',
};
