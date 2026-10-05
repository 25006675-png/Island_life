// Privacy proof against the LOCAL Supabase (npx supabase start): three
// students, two sharing a sky and one outside it, each trying to read what
// they should and shouldn't. Run: npm run test:rls
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const PUBLISHABLE = process.env.SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
const SECRET = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SECRET_KEY;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL, SECRET, opts);
const run = Date.now().toString(36);

async function student(name) {
  const email = `${name}.${run}@test.island`, password = 'island-test-pw';
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
  if (error) throw error;
  const db = createClient(URL, PUBLISHABLE, opts);
  const { error: e2 } = await db.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  return { id: data.user.id, db, name };
}
const ok = ({ data, error }) => { if (error) throw error; return data; };
const today = new Date().toISOString().slice(0, 10);

let A, B, C, sky;
test('setup: Aisha starts a sky, Ben joins it, Chen starts his own', async () => {
  [A, B, C] = await Promise.all([student('Aisha'), student('Ben'), student('Chen')]);
  sky = ok(await A.db.rpc('create_sky', { tz: 'Asia/Kuala_Lumpur' }));
  const joined = ok(await B.db.rpc('join_sky', { code: sky.invite_code.toLowerCase() }));
  assert.equal(joined.id, sky.id);
  ok(await C.db.rpc('create_sky', { tz: 'UTC' }));
  const members = ok(await B.db.from('sky_members').select('user_id,slot').order('slot'));
  assert.deepEqual(members.map(m => m.slot), [1, 2]);
  assert.equal(ok(await C.db.from('sky_members').select('user_id')).length, 1, 'Chen only sees his own sky');
});

test('profiles: names are visible inside the sky only', async () => {
  const seen = ok(await B.db.from('profiles').select('id,name'));
  assert.deepEqual(new Set(seen.map(p => p.name)), new Set(['Aisha', 'Ben']));
  assert.equal(ok(await C.db.from('profiles').select('id').eq('id', A.id)).length, 0);
});

test('blocks: friends get visibility applied, outsiders get nothing', async () => {
  ok(await A.db.from('blocks').insert([
    { date: today, start_min: 480, mins: 60, cat: 'study', title: 'Calculus revision', vis: 'open' },
    { date: today, start_min: 600, mins: 90, cat: 'work', title: 'Secret interview', vis: 'silhouette' },
    { date: today, start_min: 720, mins: 30, cat: 'rest', title: 'Therapy', vis: 'hidden' },
  ]));
  assert.equal(ok(await B.db.from('blocks').select('id').eq('owner', A.id)).length, 0, 'raw table is owner-only');
  const seen = ok(await B.db.rpc('sky_blocks', { from_date: today, to_date: today }));
  assert.equal(seen.length, 2, 'hidden block never leaves the database');
  assert.equal(seen.find(b => b.cat === 'study').title, 'Calculus revision');
  assert.equal(seen.find(b => b.cat === 'work').title, null, 'silhouette hides the title');
  assert.ok(!seen.some(b => b.cat === 'rest'));
  assert.equal(ok(await C.db.rpc('sky_blocks', { from_date: today, to_date: today })).length, 0);
  const { error } = await B.db.from('blocks').insert({ owner: A.id, date: today, start_min: 0, mins: 30, cat: 'study', title: 'x' });
  assert.ok(error, 'cannot write into someone else\'s plan');
});

test('drain answers stay with their owner', async () => {
  ok(await A.db.from('drain_answers').insert({ occurred_on: today, start_min: 480, mins: 60, cat: 'study', answer: 'draining' }));
  assert.equal(ok(await A.db.from('drain_answers').select('id')).length, 1);
  assert.equal(ok(await B.db.from('drain_answers').select('id')).length, 0);
});

test('lanterns and island status: the sky sees them, outsiders do not', async () => {
  ok(await A.db.from('checkins').insert({ local_date: today, minute: 1200, mood: 'tired' }));
  ok(await A.db.from('island_status').upsert({ user_id: A.id, sink: .7, strain: .4 }));
  assert.equal(ok(await B.db.from('checkins').select('mood').eq('owner', A.id))[0].mood, 'tired');
  assert.equal(ok(await C.db.from('checkins').select('id').eq('owner', A.id)).length, 0);
  assert.equal(ok(await B.db.from('island_status').select('sink').eq('user_id', A.id))[0].sink, .7);
  assert.equal(ok(await C.db.from('island_status').select('sink').eq('user_id', A.id)).length, 0);
  const { data } = await B.db.from('island_status').update({ sink: 0 }).eq('user_id', A.id).select();
  assert.equal(data?.length ?? 0, 0, 'cannot change a friend\'s island');
});

test('notes: only within the sky; words only for sender and recipient', async () => {
  ok(await B.db.from('notes').insert({ to_id: A.id, text: 'Proud of you. Rest a little.' }));
  const { error } = await C.db.from('notes').insert({ to_id: A.id, text: 'hello stranger' });
  assert.ok(error, 'an outsider cannot leave a note');
  assert.equal(ok(await A.db.from('notes').select('text'))[0].text, 'Proud of you. Rest a little.');
  assert.equal(ok(await C.db.from('notes').select('id')).length, 0);
  const gate = ok(await A.db.rpc('gate_notes'));
  assert.equal(gate.length, 1);
  assert.ok(!('text' in gate[0]), 'the gate shows who, never what');
  ok(await A.db.from('notes').update({ read_at: new Date().toISOString() }).eq('to_id', A.id));
  assert.equal(ok(await A.db.rpc('gate_notes'))[0].is_read, true);
});

test('task board belongs to the sky', async () => {
  const tasks = ok(await B.db.from('tasks').select('id,title'));
  assert.equal(tasks.length, 2, 'a new sky starts with two suggestions');
  ok(await B.db.from('task_members').insert({ task_id: tasks[0].id }));
  ok(await B.db.from('task_members').update({ done_at: new Date().toISOString() }).eq('task_id', tasks[0].id).eq('user_id', B.id));
  assert.equal(ok(await A.db.from('task_members').select('user_id,done_at'))[0].user_id, B.id);
  const { error } = await C.db.from('task_members').insert({ task_id: tasks[0].id });
  assert.ok(error, 'an outsider cannot join');
});

test('golden window: decided by the server, once per person', async () => {
  ok(await admin.from('golden_windows').insert({ sky_id: sky.id, local_date: today, opens_at: new Date(Date.now() - 30e3).toISOString() }));
  const first = ok(await A.db.from('moments').insert({ local_date: today, minute: 600, photo_path: `${sky.id}/${A.id}/a.jpg`, golden: false }).select().single());
  const second = ok(await A.db.from('moments').insert({ local_date: today, minute: 601, photo_path: `${sky.id}/${A.id}/b.jpg`, golden: true }).select().single());
  assert.equal(first.golden, true);
  assert.equal(second.golden, false, 'a second photo in the window is an everyday one, whatever the app claims');
  assert.equal(ok(await B.db.from('moments').select('id')).length, 2);
  assert.equal(ok(await C.db.from('moments').select('id')).length, 0);
});

test('photos: the sky can look, only the owner can hang', async () => {
  const jpg = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' });
  ok(await A.db.storage.from('moments').upload(`${sky.id}/${A.id}/test.jpg`, jpg));
  assert.ok((await B.db.storage.from('moments').download(`${sky.id}/${A.id}/test.jpg`)).data, 'a friend can see it');
  assert.ok((await C.db.storage.from('moments').download(`${sky.id}/${A.id}/test.jpg`)).error, 'an outsider cannot');
  assert.ok((await B.db.storage.from('moments').upload(`${sky.id}/${A.id}/fake.jpg`, jpg)).error, 'nobody hangs photos as someone else');
});

test('the server-only parts are unreachable', async () => {
  const anon = createClient(URL, PUBLISHABLE, opts);
  assert.ok((await anon.rpc('sky_blocks', { from_date: today, to_date: today })).error, 'signed-out callers are refused');
  assert.ok((await A.db.schema('private').from('google_tokens').select('*')).error, 'refresh tokens are not exposed');
  const { error } = await A.db.from('calendar_connections').insert({ user_id: A.id, write_enabled: true });
  assert.ok(error, 'calendar links are only written by the server');
});

test('a sky holds five islands', async () => {
  const more = await Promise.all(['Dee', 'Eli', 'Fay', 'Gus'].map(student));
  for (const s of more.slice(0, 3)) ok(await s.db.rpc('join_sky', { code: sky.invite_code }));
  const { error } = await more[3].db.rpc('join_sky', { code: sky.invite_code });
  assert.match(error.message, /full/);
  assert.deepEqual(ok(await A.db.from('sky_members').select('slot').order('slot')).map(m => m.slot), [1, 2, 3, 4, 5]);
});
