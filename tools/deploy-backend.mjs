// Deploys the backend to the Supabase project named in .env:
//   node tools/deploy-backend.mjs            everything
//   node tools/deploy-backend.mjs db         only some steps: db, secrets, functions, vault, auth
//
// Reads keys from .env (never committed) and passes them through environment
// variables, so nothing secret appears on a command line or in this file.
import { readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const env = Object.fromEntries(readFileSync('.env', 'utf8').split(/\r?\n/)
  .filter(l => l.includes('=') && !l.startsWith('#')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
const need = ['supabase_project_id', 'supabase_access_token', 'supabase_db_password', 'client_id', 'client_secret',
  'gemini_api_key', 'cron_secret', 'state_secret', 'vapid_keys'];
const missing = need.filter(k => !env[k]);
if (missing.length) { console.error('Missing in .env:', missing.join(', ')); process.exit(1); }

const REF = env.supabase_project_id, URL = `https://${REF}.supabase.co`;
const APP = 'https://island-life-r21r.vercel.app';
const LOCAL = ['http://127.0.0.1:5173', 'http://127.0.0.1:5179'];
const steps = process.argv.slice(2).length ? process.argv.slice(2) : ['db', 'secrets', 'functions', 'vault', 'auth'];
const cliEnv = { ...process.env, SUPABASE_ACCESS_TOKEN: env.supabase_access_token, SUPABASE_DB_PASSWORD: env.supabase_db_password };

function cli(...args) {
  console.log(`\n$ supabase ${args.join(' ')}`);
  const r = spawnSync('npx', ['--yes', 'supabase@latest', ...args], { stdio: 'inherit', env: cliEnv, shell: true });
  if (r.status !== 0) { console.error(`supabase ${args[0]} failed`); process.exit(r.status ?? 1); }
}
async function management(method, path, body) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}${path}`, {
    method, headers: { Authorization: `Bearer ${env.supabase_access_token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}
const sql = query => management('POST', '/database/query', { query });
const quote = s => `'${String(s).replace(/'/g, "''")}'`;

// Migrations go through the Management API's SQL endpoint (the token needs
// only Database read-write, not API key access), and are recorded in
// Supabase's own migration history so `supabase db push` agrees later.
if (steps.includes('db')) {
  await sql(`create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);`);
  const applied = new Set((await sql('select version from supabase_migrations.schema_migrations')).map(r => r.version));
  const files = readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort();
  for (const f of files) {
    const [version, ...rest] = f.replace(/\.sql$/, '').split('_');
    if (applied.has(version)) { console.log(`db: ${f} already applied`); continue; }
    const body = readFileSync(join('supabase/migrations', f), 'utf8');
    await sql(`begin;\n${body}\n;insert into supabase_migrations.schema_migrations (version, name, statements)
      values (${quote(version)}, ${quote(rest.join('_'))}, array[${quote(body)}]);\ncommit;`);
    console.log(`db: applied ${f}`);
  }
}

if (steps.includes('secrets')) {
  const file = join(tmpdir(), `island-secrets-${process.pid}.env`);
  const secrets = {
    GOOGLE_CLIENT_ID: env.client_id, GOOGLE_CLIENT_SECRET: env.client_secret, GEMINI_API_KEY: env.gemini_api_key,
    CRON_SECRET: env.cron_secret, STATE_SECRET: env.state_secret, VAPID_KEYS: env.vapid_keys,
    VAPID_SUBJECT: 'mailto:ashchujohn@gmail.com', APP_ORIGINS: [APP, ...LOCAL].join(','),
  };
  writeFileSync(file, Object.entries(secrets).map(([k, v]) => `${k}=${k === 'VAPID_KEYS' ? `'${v}'` : v}`).join('\n'));
  try { cli('secrets', 'set', '--project-ref', REF, '--env-file', JSON.stringify(file)); } finally { rmSync(file, { force: true }); }
}

if (steps.includes('functions')) cli('functions', 'deploy', '--project-ref', REF, '--use-api');

if (steps.includes('vault')) {
  // pg_cron reaches our functions with these (supabase/migrations/..._cron.sql)
  for (const [name, value] of [['project_url', URL], ['cron_secret', env.cron_secret]]) {
    await sql(`do $$ declare sid uuid; begin
      select id into sid from vault.secrets where name = ${quote(name)};
      if sid is null then perform vault.create_secret(${quote(value)}, ${quote(name)});
      else perform vault.update_secret(sid, ${quote(value)}); end if; end $$;`);
  }
  console.log('\nvault: project_url and cron_secret set');
}

if (steps.includes('auth')) {
  await management('PATCH', '/config/auth', {
    site_url: APP,
    uri_allow_list: [APP, `${APP}/**`, ...LOCAL, ...LOCAL.map(o => `${o}/**`)].join(','),
    external_google_enabled: true,
    external_google_client_id: env.client_id,
    external_google_secret: env.client_secret,
    // pilot: no confirmation email, so the built-in mailer's hourly limit never blocks a sign-up
    mailer_autoconfirm: true,
  });
  console.log('\nauth: site URL, redirect URLs and Google sign-in set');
}
console.log('\nDone.');
