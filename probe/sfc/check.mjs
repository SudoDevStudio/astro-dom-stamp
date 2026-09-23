import { execFileSync, spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { chromium } from 'playwright';

const here = new URL('.', import.meta.url).pathname;
const PORT = 4408;
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
  await page.waitForTimeout(900);
  const stamped = await page.evaluate(() =>
    [...document.querySelectorAll('[data-stamp-id]')].map((el) => ({
      cls: el.getAttribute('class'),
      tag: el.tagName,
      id: el.getAttribute('data-stamp-id'),
      sku: el.getAttribute('data-stamp-sku'),
    })),
  );
  const rendered = await page.evaluate(() =>
    Object.fromEntries(
      ['vue-card', 'vuefeed-card', 'svelte-card', 'sveltefeed-card'].map((c) => [
        c,
        document.querySelectorAll('.' + c).length,
      ]),
    ),
  );
  const html = await page.content();
  await browser.close();
  return { stamped, messages, rendered, html };
}

build(true);
const edit = await withServer(visit);
const byClass = (name) => edit.stamped.filter((s) => s.cls === name);

for (const [label, cls] of [
  ['Vue client:load', 'vue-card'],
  ['Vue client:only, fetched in the browser', 'vuefeed-card'],
  ['Svelte client:load', 'svelte-card'],
  ['Svelte client:only, fetched in the browser', 'sveltefeed-card'],
]) {
  check(`${label} renders`, edit.rendered[cls] === 2, `${edit.rendered[cls]} cards`);
  check(`${label} is stamped`, byClass(cls).length === 2, byClass(cls).map((s) => s.id).join(' '));
}

check('every read key present is written', edit.stamped.every((s) => s.sku !== null));

const noise = edit.messages.filter((m) => /hydrat|mismatch|Warning|error|pageerror/i.test(m));
check('no hydration problem from Vue or Svelte', noise.length === 0, noise.slice(0, 3).join(' | '));
check(
  'the stamper reports no collisions or unsafe attributes',
  edit.messages.filter((m) => m.includes('astro-dom-stamp')).length === 0,
);

build(false);
const prod = await withServer(visit);
check('production stamps nothing', prod.stamped.length === 0);
check('production has no markers', !prod.html.includes(PREFIX));
check(
  'production islands still work',
  Object.values(prod.rendered).every((n) => n === 2),
  JSON.stringify(prod.rendered),
);

process.exit(checks.every(Boolean) ? 0 : 1);
