import { findMarkers, hasMarker, stripMarkers } from './marker.js';
import { parseStamp } from './payload.js';
import type { Stamp } from './types.js';

/**
 * Strips our markers out of a value, deeply. Use it before anything that
 * inspects a string rather than displays it: `===` comparisons, `slice`,
 * `.length`, object lookups, building a URL, or parsing a date.
 *
 * Another CMS's stega is left alone — this removes our markers only.
 */
export function clean<T>(value: T): T {
  return cleanValue(value, new WeakMap()) as T;
}

/** The single-string form, for hot paths where you know the shape. */
export function cleanString(value: string): string {
  return hasMarker(value) ? stripMarkers(value) : value;
}

/** Every stamp carried by a string, in order. */
export function decodeStamps(value: string): Stamp[] {
  const stamps: Stamp[] = [];
  for (const marker of findMarkers(value)) {
    const stamp = parseStamp(marker.payload);
    if (stamp !== null) stamps.push(stamp);
  }
  return stamps;
}

function cleanValue(value: unknown, seen: WeakMap<object, unknown>): unknown {
  if (typeof value === 'string') return cleanString(value);
  if (value === null || typeof value !== 'object') return value;

  const cached = seen.get(value);
  if (cached !== undefined) return cached;

  if (Array.isArray(value)) {
    const out = new Array<unknown>(value.length);
    seen.set(value, out);
    for (let i = 0; i < value.length; i++) out[i] = cleanValue(value[i], seen);
    return out;
  }

  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;

  const out: Record<string, unknown> = {};
  seen.set(value, out);
  for (const key in value as Record<string, unknown>) {
    out[key] = cleanValue((value as Record<string, unknown>)[key], seen);
  }
  return out;
}
