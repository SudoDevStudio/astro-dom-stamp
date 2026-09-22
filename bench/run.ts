import { clean } from '../dist/core/clean.js';
import { encode, encodeResult } from '../dist/core/encode.js';
import { encodeMarker } from '../dist/core/marker.js';
import { resolveOptions } from '../dist/core/options.js';
import { REFERENCE_PRODUCT_COUNT, countNodes, countStrings, makeProducts } from './fixture.ts';
import { measure, report } from './measure.ts';

const resolved = resolveOptions({ read: ['id', 'uid', 'sku'] });
const settings = { read: resolved.read, skipFields: resolved.skipFields };

const source = makeProducts(REFERENCE_PRODUCT_COUNT);
console.log(
  `Response: ${REFERENCE_PRODUCT_COUNT} products, ` +
    `${countNodes(source)} objects and arrays, ${countStrings(source)} strings.`,
);

// `encode` marks an object only once, so each run needs a fresh graph. The
// clone is timed on its own so it can be subtracted.
const pool = Array.from({ length: 40 }, () => makeProducts(REFERENCE_PRODUCT_COUNT));
let cursor = 0;
report('Server, one response', [
  measure('structuredClone only (baseline)', () => {
    structuredClone(source);
  }),
  measure('clone + encode in place', () => {
    encode(structuredClone(source), settings);
  }),
  measure('encodeResult (copies, no clone needed)', () => {
    // Memoised on the input, so each run needs an input it has not seen.
    encodeResult(pool[cursor++ % pool.length]!, settings);
  }),
]);

const encoded = encode(structuredClone(source), settings);
report('Recovering plain strings', [
  measure('clean() over the whole response', () => {
    clean(encoded);
  }),
]);

report('Marker encoding alone', [
  measure(
    '100k markers',
    () => {
      for (let i = 0; i < 100_000; i++) encodeMarker(`v1|id=p${i}|sku=SKU-${i}|L=a7:${i}`);
    },
    10,
  ),
]);
