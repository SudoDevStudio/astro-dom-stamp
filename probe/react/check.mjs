import { execFileSync, spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { chromium } from 'playwright';

const here = new URL('.', import.meta.url).pathname;
const PORT = 4403;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const PREFIX = '﻿﻿﻿﻿';

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push(pass);
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
};

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
    for (let i = 0; i < 60; i++) {
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

async function visit() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const messages = [];
  page.on('console', (m) => messages.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => messages.push(`pageerror: ${e.message}`));
  await page.goto(ORIGIN + '/', { waitUntil: 'networkidle' });
  // The stamper's first pass is scheduled on idle after `load`.
  await page.waitForTimeout(700);
  const stamped = await page.evaluate(() =>
    [...document.querySelectorAll('[data-id]')].map((el) => ({
      cls: el.getAttribute('class'),
      tag: el.tagName,
      id: el.getAttribute('data-id'),
      sku: el.getAttribute('data-sku'),
    })),
  );
  const liveCards = await page.evaluate(() => document.querySelectorAll('.live-card').length);
  const html = await page.content();
  await browser.close();
  return { stamped, messages, liveCards, html };
}

build(true);
const edit = await withServer(visit);

const byClass = (name) => edit.stamped.filter((s) => s.cls === name);

check('server-rendered list is stamped', byClass('server-card').length === 2,
  byClass('server-card').map((s) => s.id).join(' '));
check('client:load island is stamped after hydration', byClass('hydrated-card').length === 2,
  byClass('hydrated-card').map((s) => s.id).join(' '));
check('client:only island is rendered', edit.liveCards === 2, `${edit.liveCards} cards`);
check('client:only island is stamped after its own fetch', byClass('live-card').length === 2,
  byClass('live-card').map((s) => s.id).join(' '));
check('every read key present is written', edit.stamped.every((s) => s.sku !== null));

const hydrationNoise = edit.messages.filter((m) =>
  /hydrat|did not match|mismatch|Warning|error|pageerror/i.test(m),
);
check('React reports no hydration problem', hydrationNoise.length === 0,
  hydrationNoise.slice(0, 3).join(' | '));

const stamperWarnings = edit.messages.filter((m) => m.includes('astro-dom-stamp'));
check('the stamper reports no collisions or unsafe attributes', stamperWarnings.length === 0,
  stamperWarnings.slice(0, 2).join(' | '));

check('browser-fetched data carried markers to the client', edit.html.includes(PREFIX));

build(false);
const prod = await withServer(visit);
check('production page stamps nothing', prod.stamped.length === 0);
check('production page has no markers', !prod.html.includes(PREFIX));
check('production islands still work', prod.liveCards === 2, `${prod.liveCards} cards`);
check('production page has no script errors', prod.messages.filter((m) => /error/i.test(m)).length === 0);

process.exit(checks.every(Boolean) ? 0 : 1);
