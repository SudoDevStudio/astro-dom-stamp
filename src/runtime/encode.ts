import { encode, encodeResult, type EncodeSettings } from '../core/encode.js';
import { resolveOptions, type AstroDomStampOptions } from '../core/options.js';
import { compileUrlPatterns, matchesUrl } from '../core/urls.js';
import { currentScope } from './scope.js';

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
  const excluded = compileUrlPatterns(resolved.excludeUrls);

  // On the server the path comes from the middleware's request scope, because a
  // helper that fetches has no idea which page asked for it. In the browser the
  // page's own path is right there.
  const skip =
    excluded.length === 0
      ? () => false
      : () =>
          typeof location === 'undefined'
            ? currentScope()?.skip === true
            : matchesUrl(location.pathname, excluded);

  return {
    __encode: (value) =>
      skip()
        ? value
        : isThenable(value)
          ? (value.then((settled) => encode(settled, settings)) as typeof value)
          : encode(value, settings),
    __encodeResult: (value) =>
      skip()
        ? value
        : isThenable(value)
          ? (value.then((settled) => encodeResult(settled, settings)) as typeof value)
          : encodeResult(value, settings),
  };
}

export { encode, encodeResult } from '../core/encode.js';
export { clean, cleanString, decodeStamps } from '../core/clean.js';
export { setScopeProvider, currentScope } from './scope.js';
export type { RequestScope } from './scope.js';
export type { EncodeSettings } from '../core/encode.js';
