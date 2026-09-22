import { describe, expect, it } from 'vitest';
import { LIST_KEY, parseStamp, serializeStamp, stampKey } from '../src/core/payload.js';
import { resolveOptions } from '../src/core/options.js';

describe('payload', () => {
  it('writes only the keys present', () => {
    expect(serializeStamp({ fields: { id: '5' } })).toBe('v1|id=5');
  });

  it('writes the list reference last', () => {
    expect(serializeStamp({ fields: { id: '5', sku: 'AB-1' }, list: { ref: 'a7', index: 2 } })).toBe(
      'v1|id=5|sku=AB-1|L=a7:2',
    );
  });

  it.each([
    ['a pipe', 'a|b'],
    ['an equals', 'a=b'],
    ['a backslash', 'a\\b'],
    ['all three', 'a|b=c\\d'],
    ['a colon', 'a:b'],
    ['Gurmukhi', 'ਜੁੱਤੀ'],
  ])('round trips %s in a value', (_label, value) => {
    const stamp = { fields: { id: value } };
    expect(parseStamp(serializeStamp(stamp))).toEqual(stamp);
  });

  it('round trips a list reference containing a colon', () => {
    const stamp = { fields: { id: '5' }, list: { ref: 'a:7', index: 12 } };
    expect(parseStamp(serializeStamp(stamp))).toEqual(stamp);
  });

  it.each(['', 'v1', 'id=5', 'x1|id=5', 'v1|id', 'v1|L=a7:2'])('rejects %j', (payload) => {
    expect(parseStamp(payload)).toBeNull();
  });

  it('gives equal stamps equal keys', () => {
    const a = { fields: { id: '5' }, list: { ref: 'z', index: 1 } };
    expect(stampKey(a)).toBe(stampKey(structuredClone(a)));
  });
});

describe('options', () => {
  it('requires at least one read key', () => {
    expect(() => resolveOptions({ read: [] })).toThrow(/`read` is required/);
  });

  it('refuses the reserved list key', () => {
    expect(() => resolveOptions({ read: [LIST_KEY] })).toThrow(/reserved/);
  });

  it('kebab-cases attribute names', () => {
    expect(resolveOptions({ read: ['id', 'productId', 'sku_code'] }).attributes).toEqual({
      id: 'data-id',
      productId: 'data-product-id',
      sku_code: 'data-sku-code',
    });
  });

  it('adds the read keys to skipFields, so ids never carry markers', () => {
    expect(resolveOptions({ read: ['uid'] }).skipFields.has('uid')).toBe(true);
  });

  it('defaults to disabled', () => {
    expect(resolveOptions({ read: ['id'] }).enabled).toBe(false);
  });
});
