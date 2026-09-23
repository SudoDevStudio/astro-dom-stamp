import { execFileSync, spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { createStamper } from '@sudodevstudio/astro-dom-stamp/browser';
import { decodeStamps, resolveOptions } from '@sudodevstudio/astro-dom-stamp/core';

const here = new URL('.', import.meta.url).pathname;
const PORT = 4399;
const READ = ['id', 'uid', 'sku'];

function build(edit) {
  rmSync(new URL('./dist', import.meta.url), { recursive: true, force: true });
  execFileSync('npx', ['astro', 'build'], {
    cwd: here,
    stdio: 'pipe',
    env: { ...process.env, ASTRO_DOM_STAMP_EDIT: edit ? 'true' : '' },
  });
}

async function serveAndFetch() {
  const server = spawn('node', ['dist/server/entry.mjs'], {
    cwd: here,
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(PORT) },
    stdio: 'pipe',
  });
  try {
    for (let attempt = 0; attempt < 50; attempt++) {
      await new Promise((r) => setTimeout(r, 100));
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/`);
        if (res.ok) return await res.text();
      } catch {}
    }
    throw new Error('server did not start');
  } finally {
    server.kill('SIGKILL');
  }
}

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push(pass);
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
};

const PREFIX = '﻿﻿﻿﻿';

build(true);
const editHtml = await serveAndFetch();
const markerCount = editHtml.split(PREFIX).length - 1;
check('edit HTML carries markers', markerCount > 0, `${markerCount} markers`);

const stamps = decodeStamps(editHtml);
check(
  'markers decode to the fetched ids',
  stamps.some((s) => s.fields.id === 'p1' && s.fields.sku === 'AB-1'),
  JSON.stringify(stamps[0] ?? null),
);
check('list items carry their index', stamps.some((s) => s.list && s.list.index === 1));

const dom = new JSDOM(editHtml);
for (const key of ['document', 'Node', 'NodeFilter', 'MutationObserver', 'Element']) {
  globalThis[key] = dom.window[key];
}
// Built from resolveOptions, so the probe always uses the real attribute names.
createStamper({
  attributes: resolveOptions({ read: READ }).attributes,
  stripAfterStamp: false,
  devWarnings: false,
}).scan();

const cards = [...dom.window.document.querySelectorAll('[data-stamp-id]')];
check('stamper puts attributes on the .map element', cards.length === 2 && cards.every((c) => c.tagName === 'LI'),
  cards.map((c) => `${c.tagName}#${c.getAttribute('data-stamp-id')}`).join(' '));
check('stamper carries every read key present', cards[0]?.getAttribute('data-stamp-sku') === 'AB-1');
dom.window.close();

build(false);
const prodHtml = await serveAndFetch();
check('production HTML has no markers', !prodHtml.includes(PREFIX));
check('production HTML renders the same text', prodHtml.includes('Soft Shoe') && prodHtml.includes('Rugged Boot'));

// The only thing edit mode adds to the page itself is the stamper script tag.
const withoutScripts = (html) => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
const stripAll = (html) => html.replace(/[\u200B-\u200D\uFEFF]/gu, '');

check(
  'edit HTML is byte-identical to production once markers and the script go',
  withoutScripts(stripAll(editHtml)) === withoutScripts(prodHtml),
);
check('production page has no injected script', withoutScripts(prodHtml) === prodHtml);

process.exit(checks.every(Boolean) ? 0 : 1);
