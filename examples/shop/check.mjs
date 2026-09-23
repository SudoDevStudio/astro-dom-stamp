/**
 * Verifies the example end to end: markers where they belong, nothing at all on
 * an excluded path, and a production build that is untouched.
 *
 * Run from the repo root:  node examples/shop/check.mjs
 */
import { execFileSync, spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { chromium } from 'playwright';

const here = new URL('.', import.meta.url).pathname;
const PORT = 4410;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const PREFIX = '﻿﻿﻿﻿';

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push(pass);
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
};

const markers = (text) => text.split(PREFIX).length - 1;

function build(edit) {
  rmSync(new URL('./dist', import.meta.url), { recursive: true, force: true });
  execFileSync('npx', ['astro', 'build'], {
    cwd: here,
    stdio: 'pipe',
    env: { ...process.env, ASTRO_DOM_STAMP_EDIT: edit ? 'true' : '' },
  });
}

async function withServer(run) {
  const server = spawn('node', ['dist/server/entry.mjs'], {
    cwd: here,
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(PORT) },
    stdio: 'pipe',
  });
  try {
    for (let i = 0; i < 80; i++) {
      await new Promise((r) => setTimeout(r, 100));
      try {
        if ((await fetch(ORIGIN + '/')).ok) break;
      } catch {}
    }
    return await run();
  } finally {
    server.kill('SIGKILL');
  }
}

const get = async (path) => (await fetch(ORIGIN + path)).text();

async function stampedOn(path) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const messages = [];
  page.on('console', (m) => messages.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => messages.push(`pageerror: ${e.message}`));
  await page.goto(ORIGIN + path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  const found = await page.evaluate(() =>
    [...document.querySelectorAll('[data-stamp-id]')].map((el) => el.getAttribute('data-stamp-id')),
  );
  await browser.close();
  return { found, messages };
}

build(true);
await withServer(async () => {
  const home = await get('/');
  const detail = await get('/product/p0');
  const api = await get('/api/products.json');
  const admin = await get('/admin/');

  check('the catalogue carries markers', markers(home) > 0, `${markers(home)} markers`);
  check('the detail page carries markers', markers(detail) > 0, `${markers(detail)} markers`);
  // The endpoint builds its data locally, so nothing passes through fetch and
  // there is nothing for the transform to wrap. LiveSearch marks it in the
  // browser instead, from its own `.json()` call.
  check('the API is raw, as it never fetches', markers(api) === 0, `${markers(api)} markers`);

  // The admin page calls the same helper as the catalogue; only the request
  // scope differs, so this is what proves the middleware works.
  check('an excluded path carries none', markers(admin) === 0, `${markers(admin)} markers`);
  check('the excluded path still renders', admin.includes('products have a variant'));

  const shop = await stampedOn('/');
  check('the catalogue is stamped', shop.found.length > 0, `${shop.found.length} elements`);
  check('server and island renderings are stamped separately',
    shop.found.filter((id) => id === 'p0').length >= 2,
    `${shop.found.filter((id) => id === 'p0').length} elements for p0`);
  check('no framework or stamper complaint',
    shop.messages.filter((m) => /error|warn|hydrat/i.test(m)).length === 0,
    shop.messages.slice(0, 2).join(' | '));

  const product = await stampedOn('/product/p0');
  check('the detail page stamps the product and its variants', product.found.length > 1,
    product.found.join(' '));

  const adminPage = await stampedOn('/admin/');
  check('an excluded path stamps nothing', adminPage.found.length === 0);
});

build(false);
await withServer(async () => {
  const home = await get('/');
  check('production carries no markers', markers(home) === 0);
  check('production still renders the catalogue', home.includes('Catalogue'));
  const shop = await stampedOn('/');
  check('production stamps nothing', shop.found.length === 0);
});

process.exit(checks.every(Boolean) ? 0 : 1);
