import { describe, expect, it } from 'vitest';
import { clean, cleanString, decodeStamps } from '../src/core/clean.js';
import { encode } from '../src/core/encode.js';
import { encodeMarker } from '../src/core/marker.js';
import { defaultSettings } from './settings.js';
import { vercelStegaEncode } from './vercel-stega.js';

describe('clean', () => {
  it('restores a whole encoded result', () => {
    const source = { id: '5', title: 'Shoe', tags: ['Warm'], nested: { id: '6', label: 'Red' } };
    const cleaned = clean(encode(structuredClone(source), defaultSettings));
    expect(cleaned).toEqual(source);
  });

  it('makes comparisons work again', () => {
    const data = encode({ id: '5', status: 'sold' }, defaultSettings);
    expect(data.status === 'sold').toBe(false);
    expect(cleanString(data.status) === 'sold').toBe(true);
  });

  it('restores length and slice', () => {
    const data = encode({ id: '5', title: 'Shoe' }, defaultSettings);
    expect(cleanString(data.title)).toHaveLength(4);
    expect(cleanString(data.title).slice(0, 2)).toBe('Sh');
  });

  it('leaves another CMS stega untouched', () => {
    const theirs = vercelStegaEncode({ origin: 'sanity.io' });
    const text = 'Shoe' + encodeMarker('v1|id=5') + theirs;
    expect(cleanString(text)).toBe('Shoe' + theirs);
  });

  it('passes non-plain values through', () => {
    const date = new Date(0);
    expect(clean({ when: date }).when).toBe(date);
  });

  it('survives a cycle', () => {
    const input: Record<string, unknown> = { id: '5', title: 'Shoe' };
    input.self = input;
    encode(input, defaultSettings);
    const cleaned = clean(input) as Record<string, unknown>;
    expect(cleaned.title).toBe('Shoe');
    expect(cleaned.self).toBe(cleaned);
  });
});

describe('decodeStamps', () => {
  it('returns every stamp a string carries, in order', () => {
    const text = 'a' + encodeMarker('v1|id=1') + 'b' + encodeMarker('v1|id=2|L=z:3');
    expect(decodeStamps(text)).toEqual([
      { fields: { id: '1' } },
      { fields: { id: '2' }, list: { ref: 'z', index: 3 } },
    ]);
  });

  it('returns nothing for plain text', () => {
    expect(decodeStamps('Shoe')).toEqual([]);
  });
});
