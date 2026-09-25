// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { describeElement, entityBlocks, fieldOf, server, stamp, stamped } from './helpers.js';

describe('field attributes', () => {
  it('names the field on the element rendering it', () => {
    const p = server({ id: 'p1', title: 'Shoe', blurb: 'Soft' });
    stamp(`<article><h1>${p.title}</h1><p>${p.blurb}</p></article>`);
    expect(fieldOf(document.querySelector('h1'))).toBe('title');
    expect(fieldOf(document.querySelector('p'))).toBe('blurb');
  });

  it('repeats the entity on the field element, so one element is enough', () => {
    const p = server({ id: 'p1', sku: 'AB-1', title: 'Shoe', blurb: 'Soft' });
    stamp(`<article><h1>${p.title}</h1><p>${p.blurb}</p></article>`);
    const heading = document.querySelector('h1')!;
    expect(heading.getAttribute('data-stamp-id')).toBe('p1');
    expect(heading.getAttribute('data-stamp-sku')).toBe('AB-1');
    expect(heading.getAttribute('data-stamp-field')).toBe('title');
  });

  it('keeps the entity block separate from its fields', () => {
    const p = server({ id: 'p1', title: 'Shoe', blurb: 'Soft' });
    stamp(`<article class="card"><h1>${p.title}</h1><p>${p.blurb}</p></article>`);
    expect(describeElement(stamped('p1'))).toBe('article.card');
    expect(stamped('p1')!.hasAttribute('data-stamp-field')).toBe(false);
  });

  it('writes a nested path', () => {
    const p = server({ id: 'p1', details: { fabric: 'Suede' } });
    stamp(`<article><span>${p.details.fabric}</span></article>`);
    expect(fieldOf(document.querySelector('span'))).toBe('details.fabric');
  });

  it('indexes an array of strings', () => {
    const p = server({ id: 'p1', tags: ['Warm', 'Winter'] });
    stamp(`<ul><li>${p.tags[0]}</li><li>${p.tags[1]}</li></ul>`);
    expect([...document.querySelectorAll('li')].map(fieldOf)).toEqual(['tags.0', 'tags.1']);
  });

  it('names a nested entity\'s own field, not a path through its parent', () => {
    const p = server({ id: 'p1', title: 'Shoe', variant: { id: 'v1', label: 'Red' } });
    stamp(`<article><h1>${p.title}</h1><span>${p.variant.label}</span></article>`);
    const span = document.querySelector('span')!;
    expect(span.getAttribute('data-stamp-field')).toBe('label');
    expect(span.getAttribute('data-stamp-id')).toBe('v1');
  });

  it('reads a field out of alt text', () => {
    const p = server({ id: 'p1', coverAlt: 'A red shoe' });
    stamp(`<img src="/a.png" alt="${p.coverAlt}">`);
    expect(fieldOf(document.querySelector('img'))).toBe('coverAlt');
  });

  it('keeps the first when two fields share an element', () => {
    const p = server({ id: 'p1', title: 'Shoe', blurb: 'Soft' });
    stamp(`<p>${p.title} — ${p.blurb}</p>`);
    expect(fieldOf(document.querySelector('p'))).toBe('title');
  });

  it('never writes one on body or html', () => {
    const p = server({ id: 'p1', title: 'Shoe' });
    stamp(p.title);
    expect(document.body.hasAttribute('data-stamp-field')).toBe(false);
    expect(document.body.hasAttribute('data-stamp-id')).toBe(false);
  });

  it('never overwrites one already in the markup', () => {
    const p = server({ id: 'p1', title: 'Shoe' });
    stamp(`<h1 data-stamp-field="hand-written">${p.title}</h1>`);
    expect(fieldOf(document.querySelector('h1'))).toBe('hand-written');
  });

  it('honours a custom prefix', () => {
    const p = server({ id: 'p1', title: 'Shoe' });
    stamp(`<h1>${p.title}</h1>`, { attributePrefix: 'data-' });
    expect(document.querySelector('h1')!.getAttribute('data-field')).toBe('title');
  });
});

describe('an object type, for an editor that needs the collection', () => {
  it('turns a conventional _type key into a clean attribute', () => {
    const p = server({ _type: 'product', id: 'p1', title: 'Shoe' }, ['_type', 'id']);
    stamp(`<article><h1>${p.title}</h1></article>`, { read: ['_type', 'id'] });
    const heading = document.querySelector('h1')!;
    expect(heading.getAttribute('data-stamp-type')).toBe('product');
    expect(heading.getAttribute('data-stamp-id')).toBe('p1');
    expect(heading.getAttribute('data-stamp-field')).toBe('title');
  });
});

describe('without deepStamps', () => {
  it('writes no field attribute at all', () => {
    const p = server({ id: 'p1', title: 'Shoe', blurb: 'Soft' }, ['id', 'uid', 'sku'], false);
    stamp(`<article class="card"><h1>${p.title}</h1><p>${p.blurb}</p></article>`, {
      deepStamps: false,
    });
    expect(document.querySelector('[data-stamp-field]')).toBeNull();
    expect(document.querySelector('h1')!.hasAttribute('data-stamp-id')).toBe(false);
  });

  it('still stamps the entity block', () => {
    const p = server({ id: 'p1', title: 'Shoe', blurb: 'Soft' }, ['id', 'uid', 'sku'], false);
    stamp(`<article class="card"><h1>${p.title}</h1><p>${p.blurb}</p></article>`, {
      deepStamps: false,
    });
    expect(describeElement(stamped('p1'))).toBe('article.card');
  });

  it('still tells two renderings of one entity apart', () => {
    const p = server({ id: 'p1', title: 'Shoe', blurb: 'Soft' }, ['id', 'uid', 'sku'], false);
    stamp(
      `<main><section class="a"><h1>${p.title}</h1><p>${p.blurb}</p></section>` +
        `<section class="b"><h1>${p.title}</h1><p>${p.blurb}</p></section></main>`,
      { deepStamps: false },
    );
    expect(entityBlocks('p1').map(describeElement)).toEqual(['section.a', 'section.b']);
  });
});
