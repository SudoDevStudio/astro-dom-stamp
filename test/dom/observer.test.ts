// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createStamper, type Stamper } from '../../src/browser/stamper.js';
import { resolveOptions } from '../../src/core/options.js';
import { server } from './helpers.js';

let running: Stamper | null = null;

function start(options: Partial<Parameters<typeof resolveOptions>[0]> = {}): void {
  const resolved = resolveOptions({ read: ['id', 'uid', 'sku'], devWarnings: false, ...options });
  running = createStamper({
    attributes: resolved.attributes,
    stripAfterStamp: resolved.stripAfterStamp,
    devWarnings: resolved.devWarnings,
  });
  running.start();
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

afterEach(() => {
  running?.stop();
  running = null;
  document.body.innerHTML = '';
});

describe('watching the page', () => {
  it('stamps what is already there on the first pass', async () => {
    const p = server({ id: 'p1', title: 'Shoe' });
    document.body.innerHTML = `<h1>${p.title}</h1>`;
    start();
    await settle();
    expect(document.querySelector('[data-stamp-id="p1"]')).not.toBeNull();
  });

  it('stamps nodes added later, as a client:only island or a browser fetch would', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    start();
    await settle();

    const p = server({ id: 'p2', title: 'Boot', blurb: 'Warm' });
    document.querySelector('#root')!.innerHTML =
      `<article><h1>${p.title}</h1><p>${p.blurb}</p></article>`;
    await settle();
    expect(document.querySelector('[data-stamp-id="p2"]')?.tagName).toBe('ARTICLE');
  });

  it('re-stamps after a re-render replaces the text node', async () => {
    const p = server({ id: 'p1', title: 'Shoe' });
    document.body.innerHTML = `<h1>${p.title}</h1>`;
    start();
    await settle();

    const heading = document.querySelector('h1')!;
    heading.removeAttribute('data-stamp-id');
    heading.textContent = p.title;
    await settle();
    expect(heading.getAttribute('data-stamp-id')).toBe('p1');
  });

  it('does not loop when stripping markers triggers its own mutations', async () => {
    const p = server({ id: 'p1', title: 'Shoe' });
    document.body.innerHTML = `<h1>${p.title}</h1>`;
    start({ stripAfterStamp: true });
    await settle();
    await settle();
    expect(document.querySelector('h1')!.textContent).toBe('Shoe');
    expect(document.querySelector('[data-stamp-id="p1"]')).not.toBeNull();
  });

  it('stops watching after stop()', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    start();
    await settle();
    running!.stop();

    const p = server({ id: 'p3', title: 'Clog' });
    document.querySelector('#root')!.innerHTML = `<h1>${p.title}</h1>`;
    await settle();
    expect(document.querySelector('[data-stamp-id="p3"]')).toBeNull();
  });
});

describe('dev warnings', () => {
  it('names the attribute a marker leaked into', async () => {
    const warnings: unknown[][] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(args);
    try {
      const p = server({ id: 'p1', title: 'Shoe', variant: 'red' });
      document.body.innerHTML = `<h1 class="${p.variant}">${p.title}</h1>`;
      start({ devWarnings: true });
      await settle();
    } finally {
      console.warn = original;
    }
    expect(warnings.some((args) => String(args[0]).includes('"class" attribute'))).toBe(true);
    expect(warnings.some((args) => String(args[0]).includes('skipFields'))).toBe(true);
  });
});

describe('charset', () => {
  it('warns when the page is not decoded as UTF-8', async () => {
    const warnings: string[] = [];
    const original = console.warn;
    const describe_ = Object.getOwnPropertyDescriptor(Document.prototype, 'characterSet');
    Object.defineProperty(document, 'characterSet', { value: 'windows-1252', configurable: true });
    console.warn = (...args: unknown[]) => warnings.push(String(args[0]));
    try {
      start({ devWarnings: true });
      await settle();
    } finally {
      console.warn = original;
      if (describe_) Object.defineProperty(document, 'characterSet', describe_);
    }
    expect(warnings.some((w) => w.includes('not UTF-8'))).toBe(true);
  });
});

describe('islands that have not hydrated', () => {
  it('leaves a server-rendered island alone while it still carries ssr', async () => {
    const p = server({ id: 'p1', title: 'Shoe' });
    document.body.innerHTML = `<astro-island ssr><h1>${p.title}</h1></astro-island>`;
    start();
    await settle();
    expect(document.querySelector('[data-stamp-id]')).toBeNull();
  });

  it('stamps it once the attribute goes, as hydration finishes', async () => {
    const p = server({ id: 'p1', title: 'Shoe' });
    document.body.innerHTML = `<astro-island ssr><h1>${p.title}</h1></astro-island>`;
    start();
    await settle();

    document.querySelector('astro-island')!.removeAttribute('ssr');
    await settle();
    expect(document.querySelector('[data-stamp-id="p1"]')).not.toBeNull();
  });

  it('still stamps content outside the island', async () => {
    const inside = server({ id: 'p1', title: 'Shoe' });
    const outside = server({ id: 'p2', title: 'Boot' });
    document.body.innerHTML =
      `<astro-island ssr><h1>${inside.title}</h1></astro-island><h2>${outside.title}</h2>`;
    start();
    await settle();
    expect(document.querySelector('[data-stamp-id="p2"]')).not.toBeNull();
    expect(document.querySelector('[data-stamp-id="p1"]')).toBeNull();
  });
});
