// The judging journey in a real browser, demo mode only (no Supabase, Google or Gemini, so nothing outside
// can make it flaky): check in a mood, open the balance, apply a suggestion, open the planner.
//   npm run build && npm run test:browser
// Serves dist/ itself (vite preview on 127.0.0.1:4173) and stops it when done; CI runs the same command.
// The clock is frozen on a Wednesday morning: the suggestions depend on the day (src/plan.js TODAY,
// src/balance.js). Software rendering is slow, so it waits on exposed state, never on pixels.
import { chromium, expect as baseExpect } from '@playwright/test';
import { preview } from 'vite';
import { mkdirSync } from 'node:fs';

const PORT = 4173, APP = `http://127.0.0.1:${PORT}/?skiplogin&quiet&pr=1`;
const OUT = process.env.OUT ?? 'test-results/smoke';
const NOW = new Date('2026-10-14T10:00:00');   // a Wednesday, 10:00
const READY_MS = 240_000;
const allowed = url => /\/favicon\.(ico|png|svg)$/.test(new URL(url, APP).pathname);
const expect = baseExpect.configure({ timeout: 90_000 });
mkdirSync(OUT, { recursive: true });

const results = [];
async function step(name, fn) {
  const t = Date.now();
  try { await fn(); results.push({ name, ok: true }); console.log(`✔ ${name} (${((Date.now() - t) / 1000).toFixed(1)} s)`); }
  catch (e) { results.push({ name, ok: false }); console.log(`✖ ${name} — ${e.message.split('\n').filter(Boolean).slice(0, 8).join(' | ')}`); throw e; }
}

const server = await preview({ preview: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn' });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(90_000);   // actions as patient as the assertions: the page is slow, not stuck
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('requestfailed', r => { if (!allowed(r.url())) errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`); });
page.on('console', m => { if (m.type() === 'error' && !allowed(m.location().url || APP)) errors.push(`console: ${m.text()} ${m.location().url}`); });
const notice = page.locator('#notice');
const week = () => page.evaluate(() => window.islandLife.life.week());

try {
  await page.clock.setFixedTime(NOW);

  await step('the demo island loads', async () => {
    const ready = () => page.waitForFunction(() => window.islandLife?.getState?.().ready, null, { timeout: READY_MS });
    await page.goto(APP, { timeout: 180_000 });
    // one controlled retry: software rendering in CI is sometimes slow to compile the first time
    try { await ready(); }
    catch { console.log('… not ready yet, reloading once'); await page.reload({ timeout: 180_000 }); await ready(); }
  });

  await step('mood: a stressed check-in opens a bloom', async () => {
    // your flower asks only while you walk your own island (src/life.js atHome): go home first. The island's
    // label is drawn in 3D, so this goes through the page's own API, as tools/perf.mjs does.
    await page.evaluate(() => window.islandLife.visit('sakura'));
    await page.waitForFunction(() => { const s = window.islandLife.getState(); return s.mode === 'walk' && s.player.surface?.id === 'sakura'; });
    // talk to her (src/flower.js): T toggles, and she may also open on her own when you arrive by her
    const ask = page.locator('#flower-ask');
    await expect(async () => {
      if (await ask.isHidden()) await page.keyboard.press('t');
      await expect(ask).toBeVisible({ timeout: 10_000 });
    }).toPass({ timeout: 90_000 });
    // her bubble follows her face every frame (flower.js place()), so it never holds still for a click while
    // the camera settles: answer from the keyboard, which goes to the same button
    await page.locator('#moods .mood', { hasText: 'Stressed' }).press('Enter');
    await expect(notice).toHaveText('A stressed bloom opens beside your flower.');
    await expect(ask).toBeHidden();
  });

  await step('balance: the sheet opens with three suggestions', async () => {
    await page.click('#balance-toggle');
    await expect(page.locator('#balance-sheet')).toBeVisible();
    await expect(page.locator('#bal-suggest > li')).toHaveCount(3);
  });

  // the same suggestions as the windmill card (life.js ideas): "<what>, <when>", and Apply puts exactly that on the plan
  await step('suggestion: Apply adds what it says to the week', async () => {
    const before = await week();
    const item = page.locator('#bal-suggest > li').filter({ hasNotText: /^Move / }).filter({ hasText: /, (today|tomorrow|\w{3}) at \d\d:\d\d/ }).first();
    const title = (await item.locator('strong').textContent()).split(', ')[0];
    await item.locator('.bal-apply').click();
    await expect(item.locator('.bal-apply')).toHaveText('Done ✓');
    await expect(item.locator('.bal-apply')).toBeDisabled();
    await expect(notice).toContainText(`${title} is on your plan`);
    const after = await week();
    expect(after.length, 'blocks in the week').toBe(before.length + 1);
    expect(after.filter(b => b.title === title).length, `"${title}" in the week`).toBe(before.filter(b => b.title === title).length + 1);
  });

  await step('planner: the sheet opens', async () => {
    await page.click('#balance-sheet .sheet-close');
    await expect(page.locator('#balance-sheet')).toBeHidden();
    await page.click('#planner-toggle');
    await expect(page.locator('#planner-sheet')).toBeVisible();
  });
} catch {
  // already reported by step(); the screenshot and teardown below still run
} finally {
  await page.screenshot({ path: `${OUT}/journey.png`, timeout: 180_000 }).catch(e => console.log(`(no screenshot: ${e.message.split('\n')[0]})`));
  results.push({ name: 'no errors', ok: errors.length === 0 });
  console.log(`${errors.length ? '✖' : '✔'} no errors${errors.length ? ` — ${errors.length}:\n  ${errors.slice(0, 10).join('\n  ')}` : ''}`);
  await browser.close();
  await server.close();
}

const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed. Screenshot: ${OUT}/journey.png`);
process.exitCode = failed ? 1 : 0;
