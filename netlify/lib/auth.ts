import { getUser } from '@netlify/identity';
import { fail } from './http.js';

export type AuthUser = { id: string; email: string; name: string; isAdmin: boolean };

function adminEmails() {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function currentUser(): Promise<AuthUser | null> {
  const user = await getUser();
  if (!user || !user.email) return null;
  const email = user.email.toLowerCase();
  const isAdmin = (user.roles || []).includes('admin') || adminEmails().includes(email);
  return {
    id: user.id,
    email,
    name: user.name || String(user.userMetadata?.full_name || '') || email,
    isAdmin,
  };
}

export async function requireUser() {
  return (await currentUser()) || fail(401, 'Please sign in to continue.');
}

export async function requireAdmin() {
  const user = await requireUser();
  if (!user.isAdmin) fail(403, 'Only DropIn operators can do this.');
  return user;
}
