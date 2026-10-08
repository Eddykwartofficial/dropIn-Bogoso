import { router, json, error, db, requireAuth } from '@appdeploy/sdk';
import { PLACES, fareFor, initialState, applyCommand } from '../shared/domain';

async function session(body: any) {
  if (
    !body ||
    !/^[a-f0-9]{64}$/.test(body.token || '') ||
    typeof body.id !== 'string'
  )
    return null;
  const [record] = await db.get('demo_sessions', [body.id]);
  if (!record || record.token !== body.token) return null;
  return record;
}

export const handler = router({
  'GET /api/_healthcheck': [async () => json({ message: 'Success' })],
  'POST /api/sessions': [
    async ({ body }) => {
      const input = body as any;
      if (!/^[a-f0-9]{64}$/.test(input?.token || ''))
        return error('Invalid demo session', 400);
      const [id] = await db.add('demo_sessions', [
        { token: input.token, state: initialState(), createdAt: Date.now() },
      ]);
      if (!id) return error('Could not start demo', 503);
      return json({ id, state: initialState(), places: PLACES });
    },
  ],
  'POST /api/state': [
    async ({ body }) => {
      const record = await session(body);
      if (!record) return error('Demo session expired. Start a new demo.', 403);
      return json({ state: record.state, places: PLACES });
    },
  ],
  'POST /api/command': [
    async ({ body }) => {
      const input = body as any;
      const record = await session(input);
      if (!record) return error('Demo session expired. Start a new demo.', 403);
      try {
        const state = applyCommand(record.state, input.command);
        const [ok] = await db.update('demo_sessions', [
          { id: input.id, record: { ...record, state } },
        ]);
        if (!ok) return error('Could not save changes', 503);
        return json({ state, places: PLACES });
      } catch (e) {
        return error(e instanceof Error ? e.message : 'Invalid request', 400);
      }
    },
  ],
  'GET /api/live': [
    requireAuth(),
    async () =>
      error(
        'Live dispatch is disabled until production services and driver verification are configured.',
        503
      ),
  ],
});

export { fareFor };
