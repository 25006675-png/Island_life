// Re-renders public/assets/gardener_0..7.png from Blomy's model (tools/blomy-sprites.html).
// Needs the dev server: npx vite --port 5179, then node tools/blomy-sprites.mjs [base-url]
import { chromium } from '@playwright/test';
const BASE = process.argv[2] ?? 'http://127.0.0.1:5179/', OUT = process.env.OUT ?? 'public/assets';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 197, height: 300 } });
page.on('pageerror', e => console.error(e.message));
await page.goto(new URL('tools/blomy-sprites.html', BASE).href, { timeout: 180000 });
await page.waitForFunction(() => window.ready, null, { timeout: 120000 });
for (let i = 0; i < 8; i++) {
  await page.evaluate(n => window.renderFrame(n), i);
  await page.locator('canvas').screenshot({ path: `${OUT}/gardener_${i}.png`, omitBackground: true, timeout: 120000 });
  console.log(`gardener_${i}.png`);
}
await browser.close();
