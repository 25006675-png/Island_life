// Edge Functions against the LOCAL stack (npx supabase start, then
// npx supabase functions serve --env-file supabase/functions/.env).
// Run: npm run test:functions
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { localSecretKey } from '../tools/local-supabase-key.mjs';

const URL = 'http://127.0.0.1:54321', FN = `${URL}/functions/v1`;
const PUBLISHABLE = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH', SECRET = localSecretKey();
const env = Object.fromEntries(readFileSync('supabase/functions/.env', 'utf8').split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL, SECRET, opts);

let db, token, uid;
test('setup: a signed-in student', async () => {
  const email = `fn.${Date.now()}@test.island`, password = 'island-test-pw';
  const { data } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  uid = data.user.id;
  db = createClient(URL, PUBLISHABLE, opts);
  token = (await db.auth.signInWithPassword({ email, password })).data.session.access_token;
});

const call = (path, body, headers = {}) => fetch(`${FN}/${path}`, { method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body ?? {}) });

test('gardener: refuses strangers, words an offer, keeps support exact', async () => {
  assert.equal((await call('gardener', { mode: 'rest', fallback: 'x' })).status, 401);
  const fallback = 'Today wasn\'t a busy day, so it might not be your schedule. How about a slow evening?';
  const r = await (await call('gardener', { mode: 'rest', facts: { offer: 'a slow evening', why: 'light week, heavy sky' }, fallback },
    { Authorization: `Bearer ${token}` })).json();
  assert.ok(r.line.length > 8 && r.line.length < 200, r.line);
  console.log('    gemini says:', r.line);
  const s = await (await call('gardener', { mode: 'support', fallback: 'A careful sentence.' }, { Authorization: `Bearer ${token}` })).json();
  assert.equal(s.line, 'A careful sentence.');
});

test('gardener: an idea of its own uses only the free times it was offered', async () => {
  const auth = { Authorization: `Bearer ${token}` };
  const summary = { mode: 'schedule', week: { sky: 'Drizzle', island: 'Sinking low', lateNights: 3, hours: { study: 19, work: 8 },
      days: [{ day: 'Thu', looks: 'Very heavy for you', hours: { study: 6, work: 4 } }] },
    slots: [{ day: 'Wed (today)', time: '20:30' }, { day: 'Thu', time: '21:30' }], canWait: [{ kind: 'errands', day: 'Thu', hours: 1.5 }], friends: ['Ben'] };
  const r = await (await call('gardener', summary, auth)).json();
  console.log('    gemini idea:', JSON.stringify(r.idea));   // null when Gemini is unavailable: the app uses its own ideas
  assert.ok('idea' in r);
  if (r.idea?.type === 'add') assert.ok(r.idea.slot >= 0 && r.idea.slot < 2 && ['rest', 'exercise', 'social', 'other'].includes(r.idea.cat));
  if (r.idea?.type === 'move') assert.equal(r.idea.move, 0);
  assert.equal((await (await call('gardener', { ...summary, mode: 'support' }, auth)).json()).idea, null, 'support is never an AI idea');
});

test('google-calendar: start gives a consent URL with the right scopes and a signed state', async () => {
  const r = await (await call('google-calendar/start', { return_to: 'http://127.0.0.1:5173/', write: true }, { Authorization: `Bearer ${token}` })).json();
  const u = new globalThis.URL(r.url);
  assert.equal(u.origin + u.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(u.searchParams.get('redirect_uri'), `${FN}/google-calendar/callback`);
  assert.match(u.searchParams.get('scope'), /calendar\.readonly/);
  assert.match(u.searchParams.get('scope'), /calendar\.app\.created/);
  assert.equal(u.searchParams.get('access_type'), 'offline');
  // a forged state is refused
  const bad = await fetch(`${FN}/google-calendar/callback?code=x&state=${encodeURIComponent('e30.AAAA')}`, { redirect: 'manual' });
  assert.equal(bad.status, 400);
  // a real state with no code (the student said no) goes back to the app
  const no = await fetch(`${FN}/google-calendar/callback?state=${encodeURIComponent(u.searchParams.get('state'))}&error=access_denied`, { redirect: 'manual' });
  assert.equal(no.status, 302);
  assert.equal(no.headers.get('location'), 'http://127.0.0.1:5173/?calendar=cancelled');
});

test('google-calendar: sync without a connection says so; cron route needs the secret', async () => {
  const r = await (await call('google-calendar/sync', {}, { Authorization: `Bearer ${token}` })).json();
  assert.equal(r.connected, false);
  assert.equal((await call('google-calendar/sync-all')).status, 403);
  assert.equal((await call('google-calendar/sync-all', {}, { 'x-cron-secret': env.CRON_SECRET })).status, 200);
});

test('prompts: one evening "How are you?", never twice, never about single activities', async () => {
  assert.equal((await call('prompts')).status, 403);
  const tz = 'Asia/Kuala_Lumpur';
  await admin.from('profiles').update({ timezone: tz }).eq('id', uid);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map(x => [x.type, x.value]));
  const today = `${p.year}-${p.month}-${p.day}`, now = +p.hour * 60 + +p.minute;
  await db.from('push_subscriptions').insert({ endpoint: `https://push.invalid/${uid}`, p256dh: 'BKx', auth: 'x' });
  // a block that just ended no longer gets a notification of its own
  if (now >= 8 * 60 + 40 && now < 22 * 60) await db.from('blocks').insert({ date: today, start_min: now - 35, mins: 30, cat: 'study', title: 'Problem set' });
  const r = await (await call('prompts', {}, { 'x-cron-secret': env.CRON_SECRET })).json();
  const mine = r.results[uid];
  const expected = now < 8 * 60 || now >= 22 * 60 ? 'quiet hours' : now >= 20 * 60 ? 'asked mood' : 'nothing to ask';
  assert.equal(mine, expected);
  if (mine === 'asked mood') {
    const again = await (await call('prompts', {}, { 'x-cron-secret': env.CRON_SECRET })).json();
    assert.equal(again.results[uid], 'nothing to ask', 'the evening question is asked once a day');
  }
  const { data } = await db.from('prompts').select('kind');
  assert.ok(data.every(x => x.kind === 'mood'));
});

test('prompts/golden: a window that has just opened rings once', async () => {
  assert.equal((await call('prompts/golden')).status, 403);
  const sky = (await db.rpc('create_sky', { tz: 'Asia/Kuala_Lumpur' })).data;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date());
  await admin.from('golden_windows').upsert({ sky_id: sky.id, local_date: today, opens_at: new Date(Date.now() - 20e3).toISOString(), rung_at: null });
  const first = await (await call('prompts/golden', {}, { 'x-cron-secret': env.CRON_SECRET })).json();
  assert.ok(sky.id in first.rung, 'the open window is claimed');
  const again = await (await call('prompts/golden', {}, { 'x-cron-secret': env.CRON_SECRET })).json();
  assert.ok(!(sky.id in again.rung), 'and rings only once');
  const { data: w } = await admin.from('golden_windows').select('rung_at').eq('sky_id', sky.id).single();
  assert.ok(w.rung_at);
});
