/**
 * The build is covered by check.mjs. This covers `astro dev`, which serves
 * modules one at a time through a different pipeline, and is the mode a
 * developer actually works in.
 *
 * Run from the repo root:  node examples/shop/check-dev.mjs
 */
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const here = new URL('.', import.meta.url).pathname;
// A port each: `astro dev` spawns a child, and a killed run can leave it
// holding the socket, which would silently serve the next run's requests.
const EDIT_PORT = 4420;
const PLAIN_PORT = 4421;
let ORIGIN = '';
const PREFIX = '﻿﻿﻿﻿';

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push(pass);
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
};
const markers = (text) => text.split(PREFIX).length - 1;

async function withDevServer(edit, run) {
  const port = edit ? EDIT_PORT : PLAIN_PORT;
  ORIGIN = `http://127.0.0.1:${port}`;
  // Astro 7 keeps a dev-server lock file, and killing a previous run can leave
  // it behind, so this run must not be blocked by one.
  const server = spawn(
    'npx',
    ['astro', 'dev', '--port', String(port), '--host', '127.0.0.1', '--ignore-lock'],
    {
      detached: true,
    cwd: here,
      env: { ...process.env, ASTRO_DOM_STAMP_EDIT: edit ? 'true' : '' },
      stdio: 'pipe',
    },
  );
  const logs = [];
  server.stdout.on('data', (d) => logs.push(String(d)));
  server.stderr.on('data', (d) => logs.push(String(d)));
  try {
    let up = false;
    for (let i = 0; i < 120 && !up; i++) {
      await new Promise((r) => setTimeout(r, 250));
      try {
        up = (await fetch(ORIGIN + '/')).ok;
      } catch {}
    }
    if (!up) throw new Error(`dev server did not start:\n${logs.join('')}`);
    return await run(logs);
  } finally {
    try {
      process.kill(-server.pid, 'SIGKILL');
    } catch {
      server.kill('SIGKILL');
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function stampedOn(path) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const messages = [];
  page.on('console', (m) => messages.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => messages.push(`pageerror: ${e.message}`));
  await page.goto(ORIGIN + path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const found = await page.evaluate(() =>
    [...document.querySelectorAll('[data-stamp-id]')].map((el) => el.getAttribute('data-stamp-id')),
  );
  await browser.close();
  return { found, messages };
}

await withDevServer(true, async () => {
  const home = await (await fetch(ORIGIN + '/')).text();
  const admin = await (await fetch(ORIGIN + '/admin/')).text();
  check('dev server marks the catalogue', markers(home) > 0, `${markers(home)} markers`);
  check('dev server honours excludeUrls', markers(admin) === 0, `${markers(admin)} markers`);

  const shop = await stampedOn('/');
  check('dev server stamps the catalogue', shop.found.length > 0, `${shop.found.length} elements`);
  check(
    'dev server stamps both renderings of a product',
    shop.found.filter((id) => id === 'p0').length >= 2,
    `${shop.found.filter((id) => id === 'p0').length} for p0`,
  );
  check(
    'no framework or stamper complaint in dev',
    shop.messages.filter((m) => /error|hydrat|astro-dom-stamp/i.test(m)).length === 0,
    shop.messages.filter((m) => /error|hydrat|astro-dom-stamp/i.test(m)).slice(0, 2).join(' | '),
  );

  const adminPage = await stampedOn('/admin/');
  check('dev server stamps nothing on an excluded path', adminPage.found.length === 0);
});

await withDevServer(false, async () => {
  const home = await (await fetch(ORIGIN + '/')).text();
  check('dev server without edit mode marks nothing', markers(home) === 0);
  const shop = await stampedOn('/');
  check('dev server without edit mode stamps nothing', shop.found.length === 0);
});

process.exit(checks.every(Boolean) ? 0 : 1);
