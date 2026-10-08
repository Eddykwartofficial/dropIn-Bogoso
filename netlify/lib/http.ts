export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const fail = (status: number, message: string): never => {
  throw new HttpError(status, message);
};

export async function readJson(req: Request): Promise<any> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

export function str(v: unknown, field: string, min = 1, max = 200) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (s.length < min || s.length > max) fail(400, `Enter a valid ${field}.`);
  return s;
}

export function num(v: unknown, field: string, min = -Infinity, max = Infinity) {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n < min || n > max) fail(400, `Enter a valid ${field}.`);
  return n;
}

export function isUniqueViolation(e: any) {
  return e?.code === '23505' || e?.cause?.code === '23505';
}
