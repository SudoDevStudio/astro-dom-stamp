import { brotliCompressSync, gzipSync } from 'node:zlib';
import { encode } from '../dist/core/encode.js';
import { hasMarker } from '../dist/core/marker.js';
import { resolveOptions } from '../dist/core/options.js';
import { makeProducts } from './fixture.ts';
import { renderPage } from './page.ts';
import { bytes } from './measure.ts';

const resolved = resolveOptions({ read: ['id', 'uid', 'sku'] });
const settings = { read: resolved.read, skipFields: resolved.skipFields };

/** A listing page, not a whole API response: what a visitor actually downloads. */
const PAGE_PRODUCTS = 50;

function compare(label: string, withBody: boolean): void {
  const plain = makeProducts(PAGE_PRODUCTS);
  const marked = encode(makeProducts(PAGE_PRODUCTS), settings);
  const before = renderPage(plain, withBody);
  const after = renderPage(marked, withBody);

  const markers = (after.match(/﻿﻿﻿﻿/gu) ?? []).length;
  console.log(`\n${label} — ${markers} markers in the HTML`);

  for (const [name, a, b] of [
    ['raw (UTF-8)', Buffer.byteLength(before), Buffer.byteLength(after)],
    ['gzip', gzipSync(before).length, gzipSync(after).length],
    ['brotli', brotliCompressSync(before).length, brotliCompressSync(after).length],
  ] as const) {
    console.log(
      `  ${name.padEnd(12)} ${bytes(a).padStart(9)} -> ${bytes(b).padStart(9)}` +
        `   +${bytes(b - a).padStart(9)}   +${((b / a - 1) * 100).toFixed(0)}%`,
    );
  }
  console.log(`  ${'per marker'.padEnd(12)} ${'raw'.padStart(9)} ` +
    `${Math.round((Buffer.byteLength(after) - Buffer.byteLength(before)) / markers)} B` +
    `   gzip ${((gzipSync(after).length - gzipSync(before).length) / markers).toFixed(1)} B`);
}

const sample = encode(makeProducts(1), settings);
const title = sample[0]!.title;
console.log(
  `Payload for one product: ${JSON.stringify(
    findPayload(title),
  )}\nMarker: ${title.length - 'soft warm light'.length} characters, ` +
    `${Buffer.byteLength(title) - Buffer.byteLength('soft warm light')} bytes of UTF-8.`,
);

compare('Card grid (short text, markers dominate)', false);
compare('With body prose (a realistic article page)', true);

function findPayload(text: string): string {
  return text.replace(/[^​-‍﻿]/gu, '').length + ' zero-width characters';
}
