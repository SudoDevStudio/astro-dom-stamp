// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { describeElement, entityBlocks, fieldOf, server, stamp, stamped } from './helpers.js';

describe('single object', () => {
  it('takes the smallest element wrapping all of its text', () => {
    const p = server({ id: 'p1', title: 'Shoe', blurb: 'Soft' });
    stamp(`<main><div class="product"><h1>${p.title}</h1><p>${p.blurb}</p></div></main>`);
    expect(describeElement(stamped('p1'))).toBe('div.product');
  });

  it('takes the text element itself when only one string is rendered', () => {
    const p = server({ id: 'p1', title: 'Shoe', blurb: 'Soft' });
    stamp(`<main><div class="product"><h1>${p.title}</h1></div></main>`);
    expect(describeElement(stamped('p1'))).toBe('h1');
  });

  it('writes one attribute per read key the object carried', () => {
    const p = server({ id: 'p1', sku: 'AB-1', title: 'Shoe' });
    stamp(`<h1>${p.title}</h1>`);
    const element = stamped('p1')!;
    expect(element.getAttribute('data-stamp-id')).toBe('p1');
    expect(element.getAttribute('data-stamp-sku')).toBe('AB-1');
    // `uid` was asked for but this object has none, so no empty attribute.
    expect(element.hasAttribute('data-stamp-uid')).toBe(false);
  });

  it('honours a custom prefix', () => {
    const p = server({ id: 'p1', sku: 'AB-1', title: 'Shoe' });
    stamp(`<h1>${p.title}</h1>`, { attributePrefix: 'data-' });
    const element = document.querySelector('[data-id="p1"]')!;
    expect(element.getAttribute('data-sku')).toBe('AB-1');
  });
});

describe('list items', () => {
  const products = () =>
    server([
      { id: 'p1', title: 'Shoe', blurb: 'Soft' },
      { id: 'p2', title: 'Boot', blurb: 'Warm' },
    ]);

  it('stops at the .map element rather than the text element', () => {
    const [a, b] = products();
    stamp(
      `<ul>
        <li class="card"><h3>${a!.title}</h3><p>${a!.blurb}</p></li>
        <li class="card"><h3>${b!.title}</h3><p>${b!.blurb}</p></li>
      </ul>`,
    );
    expect(describeElement(stamped('p1'))).toBe('li.card');
    expect(describeElement(stamped('p2'))).toBe('li.card');
    expect(stamped('p1')).not.toBe(stamped('p2'));
  });

  it('climbs past wrappers that hold only that item', () => {
    const [a, b] = products();
    stamp(
      `<div class="grid">
        <article class="card"><div class="info"><h3>${a!.title}</h3><p>${a!.blurb}</p></div></article>
        <article class="card"><div class="info"><h3>${b!.title}</h3><p>${b!.blurb}</p></div></article>
      </div>`,
    );
    expect(describeElement(stamped('p1'))).toBe('article.card');
  });

  it('stops at the card in a row grid, not the row', () => {
    const [a, b] = products();
    stamp(
      `<div class="grid"><div class="row">
        <article class="card"><h3>${a!.title}</h3></article>
        <article class="card"><h3>${b!.title}</h3></article>
      </div></div>`,
    );
    expect(describeElement(stamped('p1'))).toBe('article.card');
  });

  it('falls back to the single-object rule when only one item is rendered', () => {
    const [a] = products();
    stamp(`<ul><li><h3>${a!.title}</h3></li></ul>`);
    expect(describeElement(stamped('p1'))).toBe('h3');
  });

  it('keeps two lists apart even when their markup is interleaved', () => {
    const left = server([{ id: 'l1', t: 'A' }, { id: 'l2', t: 'B' }]);
    const right = server([{ id: 'r1', t: 'C' }, { id: 'r2', t: 'D' }]);
    stamp(
      `<div class="page">
        <ul class="left"><li>${left[0]!.t}</li><li>${left[1]!.t}</li></ul>
        <ul class="right"><li>${right[0]!.t}</li><li>${right[1]!.t}</li></ul>
      </div>`,
    );
    for (const id of ['l1', 'l2', 'r1', 'r2']) {
      expect(describeElement(stamped(id))).toBe('li');
    }
  });
});

describe('nested entities', () => {
  it('gives the product its article and each variant its own item', () => {
    const products = server([
      {
        id: 'p1',
        title: 'Shoe',
        variants: [
          { id: 'v1', label: 'Red' },
          { id: 'v2', label: 'Blue' },
        ],
      },
      { id: 'p2', title: 'Boot', variants: [{ id: 'v3', label: 'Black' }] },
    ]);
    stamp(
      `<div class="grid">
        <article class="card">
          <div class="info"><h3>${products[0]!.title}</h3></div>
          <ul class="variants">
            <li class="variant"><span>${products[0]!.variants[0]!.label}</span></li>
            <li class="variant"><span>${products[0]!.variants[1]!.label}</span></li>
          </ul>
        </article>
        <article class="card"><div class="info"><h3>${products[1]!.title}</h3></div></article>
      </div>`,
    );
    expect(describeElement(stamped('p1'))).toBe('article.card');
    expect(describeElement(stamped('v1'))).toBe('li.variant');
    expect(describeElement(stamped('v2'))).toBe('li.variant');
    expect(stamped('v1')).not.toBe(stamped('v2'));
  });
});

describe('conflicts', () => {
  it('keeps the first entity when two land on one element', () => {
    const a = server({ id: 'a1', title: 'One' });
    const b = server({ id: 'b1', title: 'Two' });
    stamp(`<p>${a.title} ${b.title}</p>`);
    const p = document.querySelector('p')!;
    expect(p.getAttribute('data-stamp-id')).toBe('a1');
    expect(stamped('b1')).toBeNull();
  });

  it('never overwrites an attribute already in the markup', () => {
    const p = server({ id: 'p1', title: 'Shoe' });
    stamp(`<h1 data-stamp-id="hand-written">${p.title}</h1>`);
    expect(document.querySelector('h1')!.getAttribute('data-stamp-id')).toBe('hand-written');
  });

  it('never targets body or html', () => {
    const a = server({ id: 'a1', t: 'One' });
    const b = server({ id: 'b1', t: 'Two' });
    stamp(`${a.t}<div>${b.t}</div>`);
    expect(document.body.hasAttribute('data-stamp-id')).toBe(false);
  });
});

describe('scanning', () => {
  it('reads markers out of alt text', () => {
    const p = server({ id: 'p1', alt: 'A red shoe' });
    stamp(`<figure><img src="/a.png" alt="${p.alt}"></figure>`);
    expect(describeElement(stamped('p1'))).toBe('img');
  });

  it('ignores script, style and textarea content', () => {
    const p = server({ id: 'p1', title: 'Shoe' });
    stamp(`<script>const x = "${p.title}";</script><textarea>${p.title}</textarea>`);
    expect(stamped('p1')).toBeNull();
  });

  it('removes markers after stamping when asked', () => {
    const p = server({ id: 'p1', title: 'Shoe' });
    stamp(`<h1>${p.title}</h1>`, { stripAfterStamp: true });
    expect(document.querySelector('h1')!.textContent).toBe('Shoe');
    expect(stamped('p1')).not.toBeNull();
  });

  it('leaves markers in place by default', () => {
    const p = server({ id: 'p1', title: 'Shoe' });
    stamp(`<h1>${p.title}</h1>`);
    expect(document.querySelector('h1')!.textContent).not.toBe('Shoe');
    expect(document.querySelector('h1')!.textContent!.replace(/[​-‍﻿]/gu, '')).toBe('Shoe');
  });
});

describe('one entity rendered more than once', () => {
  it('stamps each rendering separately instead of giving up at body', () => {
    const p = server({ id: 'p1', title: 'Shoe', blurb: 'Soft' });
    stamp(
      `<section class="hero"><h1>${p.title}</h1><p>${p.blurb}</p></section>` +
        `<aside class="rail"><h3>${p.title}</h3><p>${p.blurb}</p></aside>`,
    );
    expect(entityBlocks('p1').map(describeElement)).toEqual(['section.hero', 'aside.rail']);
  });

  it('still stamps a list rendered twice on one page', () => {
    const products = server([
      { id: 'p1', title: 'Shoe', blurb: 'Soft' },
      { id: 'p2', title: 'Boot', blurb: 'Warm' },
    ]);
    const list = (cls: string) =>
      `<ul class="${cls}">` +
      products
        .map((p) => `<li class="${cls}-card"><h3>${p.title}</h3><p>${p.blurb}</p></li>`)
        .join('') +
      '</ul>';
    stamp(list('server') + list('island'));
    expect(entityBlocks('p1').map(describeElement)).toEqual([
      'li.server-card',
      'li.island-card',
    ]);
    expect(entityBlocks('p1')).toHaveLength(2);
    expect(entityBlocks('p2')).toHaveLength(2);
  });

  it('leaves a single rendering with a nested entity alone', () => {
    const products = server([
      { id: 'p1', title: 'Shoe', blurb: 'Soft', variants: [{ id: 'v1', label: 'Red' }] },
      { id: 'p2', title: 'Boot', blurb: 'Warm', variants: [{ id: 'v2', label: 'Blue' }] },
    ]);
    stamp(
      `<div class="grid">` +
        products
          .map(
            (p) =>
              `<article class="card"><h3>${p.title}</h3><p>${p.blurb}</p>` +
              `<ul><li class="v">${p.variants[0]!.label}</li></ul></article>`,
          )
          .join('') +
        `</div>`,
    );
    expect(describeElement(stamped('p1'))).toBe('article.card');
    expect(describeElement(stamped('v1'))).toBe('li.v');
  });
});

describe('repeated renderings inside one container', () => {
  it('splits two renderings that share a small ancestor', () => {
    const p = server({ id: 'p1', title: 'Shoe', blurb: 'Soft' });
    stamp(
      `<main>` +
        `<section class="a"><h1>${p.title}</h1><p>${p.blurb}</p></section>` +
        `<section class="b"><h1>${p.title}</h1><p>${p.blurb}</p></section>` +
        `</main>`,
    );
    expect(entityBlocks('p1').map(describeElement)).toEqual([
      'section.a',
      'section.b',
    ]);
    expect(document.querySelector('main')!.hasAttribute('data-stamp-id')).toBe(false);
  });

  it('keeps a single rendering whole when a nested entity shares its ancestor', () => {
    const products = server([
      { id: 'p1', title: 'Shoe', blurb: 'Soft', variants: [{ id: 'v1', label: 'Red' }] },
      { id: 'p2', title: 'Boot', blurb: 'Warm', variants: [{ id: 'v2', label: 'Blue' }] },
    ]);
    stamp(
      `<div class="grid">` +
        products
          .map(
            (p) =>
              `<article class="card"><h3>${p.title}</h3><p>${p.blurb}</p>` +
              `<ul><li class="v">${p.variants[0]!.label}</li></ul></article>`,
          )
          .join('') +
        `</div>`,
    );
    expect(describeElement(stamped('p1'))).toBe('article.card');
    expect(entityBlocks('p1')).toHaveLength(1);
  });

  it('handles a rendering that shows only some of the fields', () => {
    const p = server({ id: 'p1', title: 'Shoe', blurb: 'Soft' });
    stamp(
      `<main>` +
        `<section class="full"><h1>${p.title}</h1><p>${p.blurb}</p></section>` +
        `<section class="teaser"><h2>${p.title}</h2></section>` +
        `</main>`,
    );
    expect(entityBlocks('p1').map(describeElement)).toEqual([
      'section.full',
      'h2',
    ]);
  });

  it('splits three renderings of a list item', () => {
    const products = server([
      { id: 'p1', title: 'Shoe', blurb: 'Soft' },
      { id: 'p2', title: 'Boot', blurb: 'Warm' },
    ]);
    const list = (cls: string) =>
      `<ul class="${cls}">` +
      products.map((p) => `<li class="${cls}-card"><h3>${p.title}</h3><p>${p.blurb}</p></li>`).join('') +
      `</ul>`;
    stamp(`<main>${list('a')}${list('b')}${list('c')}</main>`);
    expect(entityBlocks('p1').map(describeElement)).toEqual([
      'li.a-card',
      'li.b-card',
      'li.c-card',
    ]);
  });
});
