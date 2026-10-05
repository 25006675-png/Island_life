// End-to-end check in a real browser against the LOCAL stack:
//   npx supabase start; npx supabase functions serve --env-file supabase/functions/.env
//   npx vite --port 5179 --mode localstack
//   node tools/smoke-live.mjs
// Walks the demo, then two new students: sign up, start a sky, plan, check
// in, answer "How draining was that?", and join by invite code.
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { mkdirSync } from 'node:fs';

const APP = process.env.APP ?? 'http://127.0.0.1:5179/';
const OUT = process.env.OUT ?? 'test-results/smoke';
mkdirSync(OUT, { recursive: true });
const admin = createClient('http://127.0.0.1:54321', process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`); };
const ready = page => page.waitForFunction(() => window.islandLife?.getState?.().ready, null, { timeout: 240_000 });

async function open(label) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.errors = errors; page.label = label;
  return page;
}

// ---- the demo ---------------------------------------------------------------
{
  const page = await open('demo');
  await page.goto(APP);
  await page.getByRole('button', { name: 'Try the demo island' }).click();
  await ready(page);
  const s = await page.evaluate(() => window.islandLife.getState());
  check('demo: five member islands and the gathering island', s.islands.length === 6, s.islands.map(i => i.id).join(','));
  const alts = s.islands.filter(i => i.id !== 'community').map(i => `${i.id} ${i.altitude.toFixed(1)}`).join(', ');
  check('demo: altitude comes from each island\'s reading', s.islands.every(i => Number.isFinite(i.altitude)), alts);
  const nudge = await page.evaluate(() => window.islandLife.life.nudge());
  check('demo: the gardener has a view', true, JSON.stringify(nudge));
  await page.evaluate(() => window.islandLife.life.openBalance());
  await page.waitForTimeout(4000);
  const learned = await page.locator('#bal-learned li').allTextContents();
  check('demo: the balance shows what Aisha\'s island learned', learned.some(t => /Study feels heavier/.test(t)), learned.join(' | '));
  await page.screenshot({ path: `${OUT}/demo-balance.png`, timeout: 180_000 });
  await page.evaluate(() => window.islandLife.life.openPlanner('week'));
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/demo-week.png`, timeout: 180_000 });
  check('demo: no errors', page.errors.length === 0, page.errors.slice(0, 3).join(' | '));
  await page.context().close();
}

// ---- a new student: sign up, start a sky -----------------------------------------
const run = Date.now().toString(36);
async function signUp(page, name) {
  await page.goto(APP);
  await page.getByRole('button', { name: /Make your island/ }).click();
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Email').fill(`${name.toLowerCase()}.${run}@test.island`);
  await page.getByLabel('Password').fill('island-test-pw');
  await page.getByRole('button', { name: 'Create your island' }).click();
  await page.getByRole('button', { name: 'Start a new sky' }).waitFor({ timeout: 20_000 });
}
const userId = async email => (await admin.from('profiles').select('id').eq('name', email).limit(1)).data?.[0]?.id;

const a = await open('Aisha');
await signUp(a, 'Aisha');
check('sign up: a new student is offered a sky', true);
await a.getByRole('button', { name: 'Start a new sky' }).click();
await ready(a);
const sa = await a.evaluate(() => window.islandLife.getState());
check('sky: one island of your own plus the gathering island', sa.islands.length === 2, sa.islands.map(i => i.id).join(','));
const aid = await userId('Aisha');

// plan something through the planner
await a.click('#planner-toggle');
await a.click('#cal-add');
await a.fill('#ed-title', 'Calculus revision');
await a.click('#editor-form button[type=submit]');
await a.waitForTimeout(2500);
const blocks = (await admin.from('blocks').select('title,cat,date').eq('owner', aid)).data ?? [];
check('planner: a new block is saved to the database', blocks.some(b => b.title === 'Calculus revision'), JSON.stringify(blocks));
await a.keyboard.press('Escape');

// check in
await a.evaluate(() => window.islandLife.life.checkIn('tired'));
await a.waitForTimeout(2500);
const lantern = (await admin.from('checkins').select('mood').eq('owner', aid)).data ?? [];
check('check-in: the lantern is saved', lantern.some(c => c.mood === 'tired'));
const status = (await admin.from('island_status').select('sink,strain').eq('user_id', aid)).data?.[0];
check('status: the island publishes what friends may see', !!status, JSON.stringify(status));

// a block that just ended, then the phone prompt's link
const now = new Date(), minute = now.getHours() * 60 + now.getMinutes();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const { data: ended } = await admin.from('blocks').insert({ owner: aid, date: today, start_min: Math.max(0, minute - 70), mins: 60,
  cat: 'study', title: 'Problem set', vis: 'open' }).select('id').single();
await a.goto(`${APP}?ask=drain&block=${ended.id}&date=${today}`);
await a.getByRole('button', { name: 'Enter your island' }).click({ timeout: 20_000 });
await ready(a);
await a.locator('#ask-dialog[open]').waitFor({ timeout: 60_000 });
check('prompt link: the island asks about that block', (await a.textContent('#ask-title')).includes('Problem set'));
await a.click('#ask-dialog [data-answer="draining"]');
await a.waitForTimeout(2500);
const answers = (await admin.from('drain_answers').select('cat,answer').eq('owner', aid)).data ?? [];
check('answer: saved, and the gardener replies', answers.some(x => x.answer === 'draining'), await a.textContent('#notice'));
await a.screenshot({ path: `${OUT}/live-home.png`, timeout: 180_000 });

// ---- a friend joins with the invite code -------------------------------------------
const code = (await admin.from('skies').select('invite_code').eq('created_by', aid).single()).data.invite_code;
const b = await open('Ben');
await signUp(b, 'Ben');
await b.getByLabel('Invite code from a friend').fill(code);
await b.getByRole('button', { name: 'Join their sky' }).click();
await ready(b);
const sb = await b.evaluate(() => window.islandLife.getState());
check('invite: Ben joins Aisha\'s sky and sees her island', sb.islands.length === 3, sb.islands.map(i => i.id).join(','));
const friendBlocks = await b.evaluate(() => window.islandLife.life.week('sakura'));
check('privacy: Ben sees Aisha\'s open blocks only, never titles of silhouettes', friendBlocks.every(x => x.title === '' || ['Calculus revision', 'Problem set'].includes(x.title) === true),
  JSON.stringify(friendBlocks.map(x => x.title)));
await b.screenshot({ path: `${OUT}/live-friend.png`, timeout: 180_000 });

for (const p of [a, b]) check(`${p.label}: no errors`, p.errors.length === 0, p.errors.slice(0, 3).join(' | '));
await browser.close();
const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
