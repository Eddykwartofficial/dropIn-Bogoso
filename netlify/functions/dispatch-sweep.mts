import type { Config } from '@netlify/functions';
import { sweep } from '../lib/dispatch.js';

// Keeps dispatch moving when nobody has the app open: expires offers, re-offers rides and cancels stale requests.
export default async () => {
  await sweep(true);
};

export const config: Config = { schedule: '* * * * *' };
