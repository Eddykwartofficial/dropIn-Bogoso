type ApiError = Error & { response?: { status: number; data: any } };

async function post(path: string, body: unknown) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: ApiError = new Error(
      data?.error || data?.message || `Request failed (${res.status})`
    );
    err.response = { status: res.status, data };
    throw err;
  }
  return { data };
}

export const api = { post };
