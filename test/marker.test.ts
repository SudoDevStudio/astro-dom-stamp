import { describe, expect, it } from 'vitest';
import { PREFIX } from '../src/core/alphabet.js';
import {
  MAX_PAYLOAD_BYTES,
  encodeMarker,
  findMarkers,
  hasMarker,
  stripMarkers,
} from '../src/core/marker.js';
import { VERCEL_PREFIX, vercelStegaEncode } from './vercel-stega.js';

describe('marker codec', () => {
  it('round trips a payload', () => {
    const marker = encodeMarker('v1|id=5|sku=AB-1|L=a7:2');
    const [found] = findMarkers('Shoe' + marker);
    expect(found?.payload).toBe('v1|id=5|sku=AB-1|L=a7:2');
    expect(found?.start).toBe(4);
  });

  it('adds no visible characters', () => {
    const text = 'Shoe' + encodeMarker('v1|id=5');
    expect(text.replace(/[​-‍﻿]/gu, '')).toBe('Shoe');
  });

  it('costs four characters per payload byte plus a twelve character header', () => {
    const payload = 'v1|id=5|sku=AB-1|L=a7:2';
    const bytes = new TextEncoder().encode(payload).length;
    expect(encodeMarker(payload)).toHaveLength(12 + bytes * 4);
  });

  it('reads several markers from one string', () => {
    const text = 'a' + encodeMarker('v1|id=1') + 'b' + encodeMarker('v1|id=2');
    expect(findMarkers(text).map((m) => m.payload)).toEqual(['v1|id=1', 'v1|id=2']);
  });

  it('strips its own markers and leaves the text intact', () => {
    const text = 'a' + encodeMarker('v1|id=1') + 'b' + encodeMarker('v1|id=2');
    expect(stripMarkers(text)).toBe('ab');
  });

  it('refuses a payload larger than the length header can describe', () => {
    expect(encodeMarker('v1|id=' + 'x'.repeat(MAX_PAYLOAD_BYTES))).toBe('');
  });

  it('rejects a prefix that is not followed by a valid payload', () => {
    expect(findMarkers('Shoe' + PREFIX)).toEqual([]);
    expect(findMarkers('Shoe' + PREFIX + PREFIX)).toEqual([]);
  });

  it('rejects a payload without a version tag', () => {
    expect(findMarkers('Shoe' + encodeMarker('id=5'))).toEqual([]);
  });

  it('carries non-ASCII payload values', () => {
    const payload = 'v1|id=ਪੰਜਾਬੀ-5';
    expect(findMarkers('x' + encodeMarker(payload))[0]?.payload).toBe(payload);
  });
});

describe('coexistence with another CMS stega', () => {
  const ours = encodeMarker('v1|id=5|sku=AB-1');
  const theirs = vercelStegaEncode({ origin: 'sanity.io', href: '/studio' });

  it('uses a prefix neither marker contains', () => {
    expect(PREFIX).not.toBe(VERCEL_PREFIX);
    expect(ours.includes(VERCEL_PREFIX)).toBe(false);
    expect(theirs.includes(PREFIX)).toBe(false);
  });

  it('decodes ours when theirs follows', () => {
    const found = findMarkers('Shoe' + ours + theirs);
    expect(found).toHaveLength(1);
    expect(found[0]?.payload).toBe('v1|id=5|sku=AB-1');
    expect(found[0]?.end).toBe(4 + ours.length);
  });

  it('decodes ours when theirs comes first', () => {
    const found = findMarkers('Shoe' + theirs + ours);
    expect(found.map((m) => m.payload)).toEqual(['v1|id=5|sku=AB-1']);
  });

  it('leaves theirs in place when stripping ours', () => {
    expect(stripMarkers('Shoe' + ours + theirs)).toBe('Shoe' + theirs);
    expect(stripMarkers('Shoe' + theirs + ours)).toBe('Shoe' + theirs);
  });

  it('does not see a marker in theirs alone', () => {
    expect(hasMarker(theirs)).toBe(false);
    expect(findMarkers('Shoe' + theirs)).toEqual([]);
  });
});
