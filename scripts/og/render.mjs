// Renders public/og.png (link previews) and the PNG icons from public/favicon.svg.
// Needs Playwright with Chromium, which isn't a project dependency:
//   PLAYWRIGHT=/path/to/playwright/index.mjs node scripts/og/render.mjs
// (or with `playwright` installed anywhere Node can resolve it).
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

const here = fileURLToPath(new URL('.', import.meta.url));
const pub = fileURLToPath(new URL('../../public/', import.meta.url));
const { chromium } = await import(process.env.PLAYWRIGHT ? pathToFileURL(process.env.PLAYWRIGHT).href : 'playwright');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(pathToFileURL(here + 'og.html').href);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: pub + 'og.png' });

const svg = readFileSync(pub + 'favicon.svg', 'utf8');
for (const [name, size] of [['apple-touch-icon.png', 180], ['favicon-32.png', 32]]) {
  const p = await browser.newPage({ viewport: { width: size, height: size } });
  // iOS rounds the corners itself, so the touch icon is full-bleed
  const art = name.startsWith('apple') ? svg.replace(/rx="[^"]*"/, 'rx="0"') : svg;
  await p.setContent(`<style>*{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${art}`);
  await p.screenshot({ path: pub + name, omitBackground: true });
}
await browser.close();
console.log('wrote public/og.png, public/apple-touch-icon.png, public/favicon-32.png');
