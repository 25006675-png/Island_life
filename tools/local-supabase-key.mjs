// The local Supabase stack's secret key, for the tests and the smoke run against it (npx supabase start).
// Taken from SUPABASE_SECRET_KEY if set, otherwise asked of the running stack, so no key is ever written into
// the repo (GitHub's push protection refuses commits that contain one).
import { execSync } from 'node:child_process';

export function localSecretKey() {
  if (process.env.SUPABASE_SECRET_KEY) return process.env.SUPABASE_SECRET_KEY;
  try {
    const env = execSync('npx supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const key = env.match(/^(?:SECRET_KEY|SERVICE_ROLE_KEY)="?([^"\r\n]+)/m)?.[1];
    if (key) return key;
  } catch {}
  throw new Error('No Supabase secret key: start the local stack (npx supabase start), or set SUPABASE_SECRET_KEY.');
}
