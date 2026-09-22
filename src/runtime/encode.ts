import { encode, encodeResult, type EncodeSettings } from '../core/encode.js';
import { resolveOptions, type AstroDomStampOptions } from '../core/options.js';

export interface Encoder {
  __encode<T>(value: T): T;
  __encodeResult<T>(value: T): T;
}

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
