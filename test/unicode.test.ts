import { describe, expect, it } from 'vitest';
import { PREFIX } from '../src/core/alphabet.js';
import { encodeMarker, findMarkers, stripMarkers } from '../src/core/marker.js';
import { encode } from '../src/core/encode.js';
import { deepSettings, defaultSettings } from './settings.js';

/**
 * The risk the kickoff calls out: zero-width characters sitting against the
 * last visible glyph can change cursive joining or conjunct formation, and can
 * be pulled into that glyph's grapheme cluster.
 *
 * UAX #29 is what decides the second one. U+200C is Grapheme_Cluster_Break
 * =Extend and U+200D is =ZWJ, so either of them would attach to the character
 * before it. U+FEFF is =Control, which breaks on both sides. That is the whole
 * reason the prefix leads with U+FEFF, and these tests hold that property down.
 */

const SAMPLES: Array<[label: string, text: string]> = [
  ['Gurmukhi', 'ਪੰਜਾਬੀ ਵਿੱਚ ਲਿਖਿਆ'],
  ['Gurmukhi ending in a subjoined form', 'ਪ੍ਰਸ਼ਨ ਸ੍'],
  ['Devanagari conjunct', 'क्षत्रिय'],
  ['Arabic', 'مرحبا بالعالم'],
  ['emoji ZWJ sequence', 'family 👨‍👩‍👧‍👦'],
  ['emoji with modifiers', 'nice 👍🏽 ❤️'],
  ['combining marks', 'école'],
];

const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
const graphemes = (text: string): string[] => [...segmenter.segment(text)].map((s) => s.segment);

describe.each(SAMPLES)('%s', (_label, text) => {
  const marked = text + encodeMarker('v1|id=5|sku=AB-1');

  it('round trips without loss', () => {
    expect(stripMarkers(marked)).toBe(text);
  });

  it('leaves the visible text segmented exactly as before', () => {
    const before = graphemes(text);
    const after = graphemes(marked);
    expect(after.slice(0, before.length)).toEqual(before);
  });

  it('puts a Grapheme_Cluster_Break=Control character against the last glyph', () => {
    expect(marked[text.length]).toBe('﻿');
    expect(marked.slice(text.length, text.length + 4)).toBe(PREFIX);
  });

  it('never places a joiner next to visible text', () => {
    expect(marked.slice(text.length, text.length + 4)).not.toMatch(/[‌‍]/);
  });

  it('decodes back to the payload', () => {
    expect(findMarkers(marked)[0]?.payload).toBe('v1|id=5|sku=AB-1');
  });
});

describe('non-ASCII data', () => {
  it('encodes Gurmukhi content and Gurmukhi ids together', () => {
    const data = encode({ id: 'ਜੁੱਤੀ-5', title: 'ਨਰਮ ਜੁੱਤੀ', blurb: 'ਬਹੁਤ ਆਰਾਮਦਾਇਕ' }, deepSettings);
    expect(stripMarkers(data.title)).toBe('ਨਰਮ ਜੁੱਤੀ');
    expect(findMarkers(data.title)[0]?.payload).toBe('v1|id=ਜੁੱਤੀ-5|f=title');
  });

  it('keeps an emoji id intact', () => {
    const data = encode({ id: '👟-1', title: 'Shoe' }, deepSettings);
    expect(findMarkers(data.title)[0]?.payload).toBe('v1|id=👟-1|f=title');
  });

  it('does not split a surrogate pair at the join', () => {
    const data = encode({ id: '1', title: 'Shoe 👟' }, defaultSettings);
    expect(stripMarkers(data.title)).toBe('Shoe 👟');
    expect([...stripMarkers(data.title)].at(-1)).toBe('👟');
  });
});
