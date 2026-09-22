// @ts-expect-error jsdom ships no type declarations and this is a bench script.
import { JSDOM } from 'jsdom';
import { createStamper } from '../dist/browser/stamper.js';
import { encode } from '../dist/core/encode.js';
import { resolveOptions } from '../dist/core/options.js';
import { makeProducts } from './fixture.ts';
import { renderPage } from './page.ts';
import { measure, report } from './measure.ts';

const resolved = resolveOptions({ read: ['id', 'uid', 'sku'] });
const settings = { read: resolved.read, skipFields: resolved.skipFields };

// jsdom is slower than a real engine, so these are an upper bound.
const SIZES = [50, 200];

const rows = [];
for (const count of SIZES) {
  const html = renderPage(encode(makeProducts(count), settings), true);
  const dom = new JSDOM(html);
  const { window } = dom;

  const globals = ['document', 'Node', 'NodeFilter', 'MutationObserver', 'Element'] as const;
  for (const key of globals) (globalThis as Record<string, unknown>)[key] = window[key];

  const stamper = createStamper({
    attributes: resolved.attributes,
    stripAfterStamp: false,
    devWarnings: false,
  });

  const elements = window.document.querySelectorAll('*').length;
  const entities = count + count * 3;
  rows.push(
    measure(
      `${count} products — ${elements} elements, ${entities} entities`,
      () => {
        window.document.querySelectorAll('[data-id]').forEach((el: Element) => {
          el.removeAttribute('data-id');
          el.removeAttribute('data-sku');
          el.removeAttribute('data-uid');
        });
        stamper.scan();
      },
      20,
    ),
  );

  const stamped = window.document.querySelectorAll('[data-id]').length;
  console.log(`  ${count} products: ${stamped} of ${entities} entities stamped`);
  dom.window.close();
}

report('Browser, first full scan (jsdom)', rows);
