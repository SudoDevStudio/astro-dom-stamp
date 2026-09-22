import { findMarkers, hasMarker, stripMarkers } from './marker.js';
import { parseStamp } from './payload.js';
import type { Stamp } from './types.js';

/**
 * Strips our markers deeply. Use before anything that inspects a string rather
 * than displays it: comparisons, `slice`, `.length`, URLs, date parsing.
 */
export function clean<T>(value: T): T {
  return cleanValue(value, new WeakMap()) as T;
}

export function cleanString(value: string): string {
  return hasMarker(value) ? stripMarkers(value) : value;
}

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
