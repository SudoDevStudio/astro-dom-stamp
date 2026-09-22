import { encode, encodeResult, type EncodeSettings } from '../core/encode.js';
import { resolveOptions, type AstroDomStampOptions } from '../core/options.js';

export interface Encoder {
  __encode<T>(value: T): T;
  __encodeResult<T>(value: T): T;
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as PromiseLike<unknown>).then === 'function'
  );
}

/**
 * Both helpers accept a promise as well as a value, which is what lets the
 * transform wrap any call site without inspecting its parent: `res.json()`,
 * `await res.json()` and `res.json().then(...)` all go through the same edit.
 */
export function createEncoder(options: AstroDomStampOptions): Encoder {
  const resolved = resolveOptions(options);
  const settings: EncodeSettings = { read: resolved.read, skipFields: resolved.skipFields };
  return {
    __encode: (value) =>
      isThenable(value)
        ? (value.then((resolved) => encode(resolved, settings)) as typeof value)
        : encode(value, settings),
    __encodeResult: (value) =>
      isThenable(value)
        ? (value.then((resolved) => encodeResult(resolved, settings)) as typeof value)
        : encodeResult(value, settings),
  };
}

export { encode, encodeResult } from '../core/encode.js';
export { clean, cleanString, decodeStamps } from '../core/clean.js';
export type { EncodeSettings } from '../core/encode.js';
