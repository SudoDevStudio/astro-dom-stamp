import { encode, encodeResult, type EncodeSettings } from '../core/encode.js';
import { resolveOptions, type AstroDomStampOptions } from '../core/options.js';

export interface Encoder {
  /** For a fresh `res.json()` result: encoded in place, nothing cloned. */
  __encode<T>(value: T): T;
  /** For a shared or frozen result — a GraphQL cache entry, a hook result. */
  __encodeResult<T>(value: T): T;
}

/**
 * Builds the pair of functions the edit build injects at every fetch point.
 * Settings are resolved once, so the hot path only reads a plain object.
 */
export function createEncoder(options: AstroDomStampOptions): Encoder {
  const resolved = resolveOptions(options);
  const settings: EncodeSettings = { read: resolved.read, skipFields: resolved.skipFields };
  return {
    __encode: (value) => encode(value, settings),
    __encodeResult: (value) => encodeResult(value, settings),
  };
}

export { encode, encodeResult } from '../core/encode.js';
export { clean, cleanString, decodeStamps } from '../core/clean.js';
export type { EncodeSettings } from '../core/encode.js';
