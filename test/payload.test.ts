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

  it('kebab-cases attribute names under the namespaced prefix', () => {
    expect(resolveOptions({ read: ['id', 'productId', 'sku_code'] }).attributes).toEqual({
      id: 'data-stamp-id',
      productId: 'data-stamp-product-id',
      sku_code: 'data-stamp-sku-code',
    });
  });

  it('takes a custom prefix', () => {
    expect(resolveOptions({ read: ['id'], attributePrefix: 'data-' }).attributes).toEqual({
      id: 'data-id',
    });
  });

  it.each(['stamp-', 'x-stamp-', 'data-STAMP-', 'data-my stamp-', ''])(
    'refuses the prefix %j',
    (attributePrefix) => {
      expect(() => resolveOptions({ read: ['id'], attributePrefix })).toThrow(/attributePrefix/);
    },
  );

  it('adds the read keys to skipFields, so ids never carry markers', () => {
    expect(resolveOptions({ read: ['uid'] }).skipFields.has('uid')).toBe(true);
  });

  it('defaults to disabled', () => {
    expect(resolveOptions({ read: ['id'] }).enabled).toBe(false);
  });
});

describe('field ordinal', () => {
  it('writes the field path last', () => {
    expect(serializeStamp({ fields: { id: '5' }, field: 'title' })).toBe('v1|id=5|f=title');
  });

  it('round trips a nested path with a list reference', () => {
    const stamp = { fields: { id: '5' }, list: { ref: 'a7', index: 2 }, field: 'details.color' };
    expect(parseStamp(serializeStamp(stamp))).toEqual(stamp);
  });

  it('round trips a path holding structural characters', () => {
    const stamp = { fields: { id: '5' }, field: 'a|b=c' };
    expect(parseStamp(serializeStamp(stamp))).toEqual(stamp);
  });

  it('keeps the entity key free of the field, so fields group together', () => {
    const a = { fields: { id: '5' }, field: 'title' };
    const b = { fields: { id: '5' }, field: 'blurb' };
    expect(stampKey(a)).toBe(stampKey(b));
    expect(serializeStamp(a)).not.toBe(serializeStamp(b));
  });

  it('separates different entities', () => {
    expect(stampKey({ fields: { id: '5' }, field: 'title' })).not.toBe(
      stampKey({ fields: { id: '6' }, field: 'title' }),
    );
  });

  it('reads a marker that carries no field', () => {
    expect(parseStamp('v1|id=5')).toEqual({ fields: { id: '5' } });
  });

  it('refuses the reserved field key as a read key', () => {
    expect(() => resolveOptions({ read: ['f'] })).toThrow(/reserved/);
  });
});
