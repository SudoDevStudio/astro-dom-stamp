// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createStamper, type Stamper } from '../../src/browser/stamper.js';
import { resolveOptions } from '../../src/core/options.js';
import { server } from './helpers.js';

let running: Stamper | null = null;
const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

function run(path: string, excludeUrls: string[], { immediate = false } = {}) {
  history.replaceState({}, '', path);
  const resolved = resolveOptions({ read: ['id', 'uid', 'sku'], devWarnings: false, excludeUrls });
  running = createStamper({
    attributes: resolved.attributes,
    stripAfterStamp: resolved.stripAfterStamp,
    devWarnings: resolved.devWarnings,
    excludeUrls: resolved.excludeUrls,
  });
  if (immediate) running.scan();
  else running.start();
}

afterEach(() => {
  running?.stop();
  running = null;
  document.body.innerHTML = '';
  history.replaceState({}, '', '/');
});

describe('the stamper on an excluded path', () => {
  it('stamps nothing', async () => {
    const p = server({ id: 'p1', title: 'Shoe' });
    document.body.innerHTML = `<h1>${p.title}</h1>`;
    run('/admin/settings', ['/admin/*']);
    await settle();
    expect(document.querySelector('[data-stamp-id]')).toBeNull();
  });

  it('stamps nothing even on a direct scan', () => {
    const p = server({ id: 'p1', title: 'Shoe' });
    document.body.innerHTML = `<h1>${p.title}</h1>`;
    run('/admin', ['/admin/*'], { immediate: true });
    expect(document.querySelector('[data-stamp-id]')).toBeNull();
  });

  it('leaves the markers in the text rather than half-processing it', () => {
    const p = server({ id: 'p1', title: 'Shoe' });
    document.body.innerHTML = `<h1>${p.title}</h1>`;
    run('/admin/x', ['/admin/*'], { immediate: true });
    expect(document.querySelector('h1')!.textContent).toBe(p.title);
  });

  it('does not watch for later nodes either', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    run('/admin/x', ['/admin/*']);
    await settle();
    const p = server({ id: 'p2', title: 'Boot' });
    document.querySelector('#root')!.innerHTML = `<h1>${p.title}</h1>`;
    await settle();
    expect(document.querySelector('[data-stamp-id]')).toBeNull();
  });
});

describe('the stamper on a path that is not excluded', () => {
  it('works as usual', async () => {
    const p = server({ id: 'p1', title: 'Shoe' });
    document.body.innerHTML = `<h1>${p.title}</h1>`;
    run('/shop/shoes', ['/admin/*']);
    await settle();
    expect(document.querySelector('[data-stamp-id="p1"]')).not.toBeNull();
  });

  it('is unaffected when no path is excluded', async () => {
    const p = server({ id: 'p1', title: 'Shoe' });
    document.body.innerHTML = `<h1>${p.title}</h1>`;
    run('/admin/settings', []);
    await settle();
    expect(document.querySelector('[data-stamp-id="p1"]')).not.toBeNull();
  });
});
