// Frame cost in the sky view and on foot, at a pinned pixel ratio (?pr=1), for before/after comparisons.
// Software rendering (swiftshader) is slow in absolute terms but scales with GPU work, so compare runs, not
// numbers against a real device. Needs the dev server: node tools/perf.mjs [base-url] [width] [height]
import { chromium } from '@playwright/test';
const BASE = process.argv[2] ?? 'http://127.0.0.1:5179/', W = +(process.argv[3] ?? 1280), H = +(process.argv[4] ?? 760);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', e => console.error(e.message));
await page.goto(new URL('?skiplogin&quiet&pr=1', BASE).href, { timeout: 180000 });
await page.waitForFunction(() => window.islandLife?.getState?.().ready, null, { timeout: 240000 });
// median frame interval over n frames, measured inside the page
const sample = n => page.evaluate(n => new Promise(done => {
  const t = []; let last = 0;
  const step = now => { if (last) t.push(now - last); last = now; if (t.length < n) requestAnimationFrame(step); else { t.sort((a, b) => a - b); done(t[t.length >> 1]); } };
  requestAnimationFrame(step);
}), n);
const report = async label => {
  const ms = await sample(40), { perf } = await page.evaluate(() => window.islandLife.getState());
  console.log(`${label.padEnd(8)} ${ms.toFixed(0).padStart(5)} ms/frame   ${String(perf.calls).padStart(5)} draws   ${(perf.triangles / 1e6).toFixed(2)}M triangles`);
};
await page.waitForTimeout(20000); await report('sky');
await page.evaluate(() => window.islandLife.visit('sakura'));
await page.waitForTimeout(30000); await report('on foot');
await browser.close();
