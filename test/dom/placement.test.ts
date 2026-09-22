// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { describeElement, server, stamp, stamped } from './helpers.js';

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
    expect(element.getAttribute('data-sku')).toBe('AB-1');
    expect(element.hasAttribute('data-uid')).toBe(false);
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
    expect(p.getAttribute('data-id')).toBe('a1');
    expect(stamped('b1')).toBeNull();
  });

  it('never overwrites an attribute already in the markup', () => {
    const p = server({ id: 'p1', title: 'Shoe' });
    stamp(`<h1 data-id="hand-written">${p.title}</h1>`);
    expect(document.querySelector('h1')!.getAttribute('data-id')).toBe('hand-written');
  });

  it('never targets body or html', () => {
    const a = server({ id: 'a1', t: 'One' });
    const b = server({ id: 'b1', t: 'Two' });
    stamp(`${a.t}<div>${b.t}</div>`);
    expect(document.body.hasAttribute('data-id')).toBe(false);
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
