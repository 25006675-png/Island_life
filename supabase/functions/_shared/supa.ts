// Shared plumbing for the Edge Functions: the service client, who is calling,
// CORS for the browser, and the cron secret.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// the address browsers and Google use to reach our functions (differs from
// SUPABASE_URL when running locally inside Docker)
export const PUBLIC_FUNCTIONS = Deno.env.get('PUBLIC_FUNCTIONS_URL') ?? `${SUPABASE_URL}/functions/v1`;

export const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// the signed-in student behind a request, or null
export async function caller(req: Request): Promise<string | null> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error ? null : data.user?.id ?? null;
}

export const fromCron = (req: Request) => {
  const secret = Deno.env.get('CRON_SECRET');
  return !!secret && req.headers.get('x-cron-secret') === secret;
};

// The apps allowed to receive a student back after Google: production and local dev.
export function allowedReturn(url: string | null): string {
  const origins = (Deno.env.get('APP_ORIGINS') ?? 'https://island-life-r21r.vercel.app').split(',').map(s => s.trim());
  try {
    const u = new URL(url ?? '');
    if (origins.includes(u.origin)) return u.toString();
  } catch { /* fall through */ }
  return origins[0];
}

// Small signed tokens (HMAC-SHA256) for the OAuth state round trip.
const enc = new TextEncoder();
const b64url = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
async function hmacKey() {
  return crypto.subtle.importKey('raw', enc.encode(Deno.env.get('STATE_SECRET') ?? ''), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
export async function sign(payload: Record<string, unknown>): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify({ ...payload, exp: Date.now() + 15 * 60_000 })));
  return `${body}.${b64url(await crypto.subtle.sign('HMAC', await hmacKey(), enc.encode(body)))}`;
}
export async function verify<T>(token: string | null): Promise<T | null> {
  const [body, sig] = (token ?? '').split('.');
  if (!body || !sig) return null;
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(), fromB64url(sig), enc.encode(body));
  if (!ok) return null;
  const data = JSON.parse(new TextDecoder().decode(fromB64url(body)));
  return data.exp > Date.now() ? data as T : null;
}
