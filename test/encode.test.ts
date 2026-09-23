import { afterEach, describe, expect, it } from 'vitest';
import { decodeStamps } from '../src/core/clean.js';
import { encode, encodeResult } from '../src/core/encode.js';
import { createEncoder } from '../src/runtime/encode.js';
import { setScopeProvider } from '../src/runtime/scope.js';
import { hasMarker } from '../src/core/marker.js';
import type { Stamp } from '../src/core/types.js';
import { defaultSettings, settingsFor } from './settings.js';

function stampOf(value: string): Stamp | undefined {
  return decodeStamps(value)[0];
}

describe('ownership', () => {
  it('gives strings to the nearest object carrying a read key', () => {
    const data = encode({ id: '5', title: 'Shoe', blurb: 'Soft' }, defaultSettings);
    expect(stampOf(data.title)?.fields).toEqual({ id: '5' });
    expect(stampOf(data.blurb)?.fields).toEqual({ id: '5' });
  });

  it('writes only the read keys the object actually has', () => {
    const data = encode({ id: '5', sku: 'AB-1', title: 'Shoe' }, defaultSettings);
    expect(stampOf(data.title)?.fields).toEqual({ id: '5', sku: 'AB-1' });
  });

  it('stringifies numeric ids', () => {
    const data = encode({ id: 5, title: 'Shoe' }, defaultSettings);
    expect(stampOf(data.title)?.fields).toEqual({ id: '5' });
  });

  it('leaves strings unmarked when no ancestor owns them', () => {
    const data = encode({ title: 'Shoe', nested: { blurb: 'Soft' } }, defaultSettings);
    expect(hasMarker(data.title)).toBe(false);
    expect(hasMarker(data.nested.blurb)).toBe(false);
  });

  it('lets a nested object with its own id own its strings', () => {
    const data = encode(
      { id: 'p1', title: 'Shoe', variant: { id: 'v1', label: 'Red' } },
      defaultSettings,
    );
    expect(stampOf(data.title)?.fields).toEqual({ id: 'p1' });
    expect(stampOf(data.variant.label)?.fields).toEqual({ id: 'v1' });
  });

  it('keeps an array of strings with the owner of its key', () => {
    const data = encode({ id: '5', tags: ['Warm', 'Winter'] }, defaultSettings);
    expect(stampOf(data.tags[0]!)?.fields).toEqual({ id: '5' });
    expect(stampOf(data.tags[0]!)?.list).toBeUndefined();
  });
});

describe('list references', () => {
  it('gives items of one array the same reference and their own index', () => {
    const data = encode(
      [
        { id: 'a', title: 'One' },
        { id: 'b', title: 'Two' },
      ],
      defaultSettings,
    );
    const first = stampOf(data[0]!.title)!;
    const second = stampOf(data[1]!.title)!;
    expect(first.list?.ref).toBe(second.list?.ref);
    expect(first.list?.index).toBe(0);
    expect(second.list?.index).toBe(1);
  });

  it('gives separate arrays separate references', () => {
    const data = encode(
      { a: [{ id: '1', t: 'x' }, { id: '2', t: 'y' }], b: [{ id: '3', t: 'z' }, { id: '4', t: 'w' }] },
      defaultSettings,
    );
    expect(stampOf(data.a[0]!.t)!.list!.ref).not.toBe(stampOf(data.b[0]!.t)!.list!.ref);
  });

  it('gives nested arrays their own reference', () => {
    const data = encode(
      [{ id: 'p', title: 'Shoe', variants: [{ id: 'v1', label: 'Red' }, { id: 'v2', label: 'Blue' }] }],
      defaultSettings,
    );
    const product = stampOf(data[0]!.title)!;
    const variant = stampOf(data[0]!.variants[0]!.label)!;
    expect(variant.list!.ref).not.toBe(product.list!.ref);
    expect(variant.list!.index).toBe(0);
  });

  it('burns no reference on an array without owners', () => {
    const data = encode({ id: '5', notes: [{ text: 'a' }, { text: 'b' }] }, defaultSettings);
    expect(stampOf(data.notes[0]!.text)!.list).toBeUndefined();
  });
});

describe('skip rules', () => {
  const data = encode(
    {
      id: '5',
      title: 'Shoe',
      url: 'https://example.com/shoe',
      link: 'https://example.com',
      mail: 'mailto:a@b.com',
      publishedAt: '2026-09-22T10:00:00Z',
      _internal: 'hidden',
      authorId: 'a1',
      contentType: 'product',
      className: 'card',
      imageUrl: '/img.png',
      bgColor: 'red',
      blank: '   ',
      seo: { title: 'Shoe | Shop' },
      meta: { description: 'Soft' },
    },
    defaultSettings,
  );

  it.each([
    ['a read key value', 'id'],
    ['an absolute url', 'url'],
    ['a bare url value', 'link'],
    ['a mailto value', 'mail'],
    ['a date', 'publishedAt'],
    ['an underscore key', '_internal'],
    ['an Id suffix', 'authorId'],
    ['a key containing type', 'contentType'],
    ['className', 'className'],
    ['a Url suffix', 'imageUrl'],
    ['a Color suffix', 'bgColor'],
    ['a blank string', 'blank'],
  ])('skips %s', (_label, key) => {
    expect(hasMarker((data as unknown as Record<string, string>)[key]!)).toBe(false);
  });

  it('skips everything under seo and meta', () => {
    expect(hasMarker(data.seo.title)).toBe(false);
    expect(hasMarker(data.meta.description)).toBe(false);
  });

  it('still marks ordinary prose', () => {
    expect(hasMarker(data.title)).toBe(true);
  });

  it('honours extra skipFields', () => {
    const custom = encode({ id: '5', title: 'Shoe', variant: 'Red' }, settingsFor(['id'], ['variant']));
    expect(hasMarker(custom.variant)).toBe(false);
    expect(hasMarker(custom.title)).toBe(true);
  });
});

describe('mutation policy', () => {
  it('encodes a fresh result in place', () => {
    const input = { id: '5', title: 'Shoe' };
    expect(encode(input, defaultSettings)).toBe(input);
    expect(input.title).not.toBe('Shoe');
  });

  it('does not mark the same object twice', () => {
    const input = { id: '5', title: 'Shoe' };
    encode(input, defaultSettings);
    const once = input.title;
    encode(input, defaultSettings);
    expect(input.title).toBe(once);
  });

  it('copies a shared result and returns the same copy each time', () => {
    const input = Object.freeze({ id: '5', title: 'Shoe' });
    const first = encodeResult(input, defaultSettings);
    expect(first).not.toBe(input);
    expect(input.title).toBe('Shoe');
    expect(hasMarker(first.title)).toBe(true);
    expect(encodeResult(input, defaultSettings)).toBe(first);
  });

  it('copies nested structure rather than sharing it', () => {
    const input = { id: '5', nested: { id: '6', title: 'Shoe' }, list: [1, 2] };
    const copy = encodeResult(input, defaultSettings);
    expect(copy.nested).not.toBe(input.nested);
    expect(copy.list).toEqual([1, 2]);
  });

  it('leaves a frozen nested object alone instead of throwing', () => {
    const input = { id: '5', nested: Object.freeze({ title: 'Shoe' }) };
    expect(() => encode(input, defaultSettings)).not.toThrow();
    expect(input.nested.title).toBe('Shoe');
  });

  it('survives a cycle', () => {
    const input: Record<string, unknown> = { id: '5', title: 'Shoe' };
    input.self = input;
    expect(() => encode(input, defaultSettings)).not.toThrow();
    expect(hasMarker(input.title as string)).toBe(true);
  });

  it('survives a cycle in copy mode', () => {
    const input: Record<string, unknown> = { id: '5', title: 'Shoe' };
    input.self = input;
    const copy = encodeResult(input, defaultSettings) as Record<string, unknown>;
    expect(copy.self).toBe(copy);
  });

  it('ignores class instances', () => {
    class Box {
      title = 'Shoe';
    }
    const input = { id: '5', box: new Box() };
    encode(input, defaultSettings);
    expect(input.box.title).toBe('Shoe');
  });
});

describe('createEncoder', () => {
  const encoder = createEncoder({ read: ['id', 'uid', 'sku'] });

  it('encodes a plain value', () => {
    expect(hasMarker(encoder.__encode({ id: '5', title: 'Shoe' }).title)).toBe(true);
  });

  it('encodes through a promise, as the transform hands it', async () => {
    const data = await encoder.__encode(Promise.resolve({ id: '5', title: 'Shoe' }));
    expect(hasMarker(data.title)).toBe(true);
  });

  it('encodes a shared result through a promise', async () => {
    const input = Object.freeze({ id: '5', title: 'Shoe' });
    const data = await encoder.__encodeResult(Promise.resolve(input));
    expect(hasMarker(data.title)).toBe(true);
    expect(input.title).toBe('Shoe');
  });

  it('passes a non-object through untouched', () => {
    expect(encoder.__encode(null)).toBeNull();
    expect(encoder.__encode('plain')).toBe('plain');
  });
});

describe('data encoded twice', () => {
  it('does not stack markers when a marked response is fetched again', () => {
    const onServer = encode([{ id: 'p1', sku: 'AB-1', title: 'Shoe' }], defaultSettings);
    const overTheWire = JSON.parse(JSON.stringify(onServer)) as typeof onServer;
    const inBrowser = encode(overTheWire, defaultSettings);
    expect(decodeStamps(inBrowser[0]!.title)).toHaveLength(1);
    expect(inBrowser[0]!.title).toBe(onServer[0]!.title);
  });

  it('still marks a string that carries a different entity marker', () => {
    const a = encode({ id: 'a1', title: 'One' }, defaultSettings);
    const combined = encode({ id: 'b1', title: a.title }, defaultSettings);
    expect(decodeStamps(combined.title)).toHaveLength(2);
  });
});

describe('field ordinals', () => {
  it('numbers each owner\'s strings from zero', () => {
    const data = encode({ id: '5', title: 'Shoe', blurb: 'Soft' }, defaultSettings);
    expect(stampOf(data.title)?.field).toBe(0);
    expect(stampOf(data.blurb)?.field).toBe(1);
  });

  it('restarts numbering for a nested owner', () => {
    const data = encode(
      { id: 'p', title: 'Shoe', variant: { id: 'v', label: 'Red', note: 'New' } },
      defaultSettings,
    );
    expect(stampOf(data.title)?.field).toBe(0);
    expect(stampOf(data.variant.label)?.field).toBe(0);
    expect(stampOf(data.variant.note)?.field).toBe(1);
  });

  it('numbers items of a string array', () => {
    const data = encode({ id: '5', tags: ['Warm', 'Winter'] }, defaultSettings);
    expect(stampOf(data.tags[0]!)?.field).toBe(0);
    expect(stampOf(data.tags[1]!)?.field).toBe(1);
  });

  it('gives two items of one list the same ordinals', () => {
    const data = encode(
      [
        { id: 'a', title: 'One', blurb: 'x' },
        { id: 'b', title: 'Two', blurb: 'y' },
      ],
      defaultSettings,
    );
    expect(stampOf(data[0]!.title)?.field).toBe(stampOf(data[1]!.title)?.field);
    expect(stampOf(data[0]!.blurb)?.field).toBe(1);
  });

  it('keeps ordinals stable when a response is encoded twice', () => {
    const onServer = encode({ id: '5', title: 'Shoe', blurb: 'Soft' }, defaultSettings);
    const overTheWire = JSON.parse(JSON.stringify(onServer)) as typeof onServer;
    const inBrowser = encode(overTheWire, defaultSettings);
    expect(inBrowser.title).toBe(onServer.title);
    expect(inBrowser.blurb).toBe(onServer.blurb);
  });
});

describe('excludeUrls on the server', () => {
  const encoder = createEncoder({ read: ['id'], excludeUrls: ['/admin/*'] });

  afterEach(() => setScopeProvider(null));

  it('encodes when the request is not excluded', () => {
    setScopeProvider(() => ({ skip: false }));
    expect(hasMarker(encoder.__encode({ id: '5', title: 'Shoe' }).title)).toBe(true);
  });

  it('leaves the data alone when the request is excluded', () => {
    setScopeProvider(() => ({ skip: true }));
    const input = { id: '5', title: 'Shoe' };
    expect(encoder.__encode(input)).toBe(input);
    expect(input.title).toBe('Shoe');
  });

  it('leaves a promised result alone too', async () => {
    setScopeProvider(() => ({ skip: true }));
    const data = await encoder.__encodeResult(Promise.resolve({ id: '5', title: 'Shoe' }));
    expect(hasMarker(data.title)).toBe(false);
  });

  it('encodes when no scope was installed at all', () => {
    expect(hasMarker(encoder.__encode({ id: '5', title: 'Shoe' }).title)).toBe(true);
  });

  it('never consults a scope when nothing is excluded', () => {
    setScopeProvider(() => ({ skip: true }));
    const plain = createEncoder({ read: ['id'] });
    expect(hasMarker(plain.__encode({ id: '5', title: 'Shoe' }).title)).toBe(true);
  });
});
