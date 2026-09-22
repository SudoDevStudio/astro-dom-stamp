import { PREFIX, PREFIX_LENGTH, bytesToChars, charsToBytes } from './alphabet.js';

/**
 * Wire format of one marker, appended to the end of a string:
 *
 *   PREFIX          4 characters   four U+FEFF
 *   length header   8 characters   2 bytes, each 0x40 + 6 bits, big-endian
 *   payload         4*len chars    UTF-8 of the payload text
 *
 * The explicit length is what lets a foreign marker sit directly after ours
 * without either decoder eating the other: we read exactly `len` bytes and stop.
 * A terminator byte could not do that, because any terminator we picked could
 * also appear inside a UTF-8 payload or inside the run that follows.
 *
 * The header bytes are biased into 0x40..0x7F so a marker is a run of printable
 * bytes end to end, which keeps hex dumps readable while debugging.
 */

const HEADER_BYTES = 2;
const HEADER_LENGTH = HEADER_BYTES * 4;
const HEADER_BIAS = 0x40;

/** Largest payload we can describe in the 12-bit length header. */
export const MAX_PAYLOAD_BYTES = (1 << 12) - 1;

/** Payloads must open with a version tag; this rejects false prefix hits. */
const VERSION_TAG = /^v\d+\|/;

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export interface FoundMarker {
  /** Index of the first character of PREFIX. */
  start: number;
  /** Index one past the last character of the marker. */
  end: number;
  payload: string;
}

/**
 * Returns the marker characters for `payload`, or `''` if the payload is too
 * large to describe. Callers treat `''` as "skip this string".
 */
export function encodeMarker(payload: string): string {
  const bytes = encoder.encode(payload);
  if (bytes.length > MAX_PAYLOAD_BYTES) return '';
  const header = new Uint8Array([
    HEADER_BIAS + ((bytes.length >> 6) & 0x3f),
    HEADER_BIAS + (bytes.length & 0x3f),
  ]);
  return PREFIX + bytesToChars(header) + bytesToChars(bytes);
}

/** Cheap test used to skip the vast majority of strings and text nodes. */
export function hasMarker(text: string): boolean {
  return text.includes(PREFIX);
}

/**
 * Every marker of ours in `text`, left to right. Runs that look like a prefix
 * but fail to decode — a neighbouring CMS's stega, or a prefix that straddles
 * the end of one — are stepped over rather than aborting the scan.
 */
export function findMarkers(text: string): FoundMarker[] {
  if (!hasMarker(text)) return [];
  const found: FoundMarker[] = [];
  let from = 0;
  while (from < text.length) {
    const start = text.indexOf(PREFIX, from);
    if (start === -1) break;
    const marker = readMarkerAt(text, start);
    if (marker === null) {
      from = start + 1;
      continue;
    }
    found.push(marker);
    from = marker.end;
  }
  return found;
}

/** The last marker in `text`, or `undefined`. */
export function findLastMarker(text: string): FoundMarker | undefined {
  const all = findMarkers(text);
  return all[all.length - 1];
}

function readMarkerAt(text: string, start: number): FoundMarker | null {
  const headerAt = start + PREFIX_LENGTH;
  const header = charsToBytes(text, headerAt, HEADER_BYTES);
  if (header === null) return null;
  const hi = header[0]! - HEADER_BIAS;
  const lo = header[1]! - HEADER_BIAS;
  if (hi < 0 || hi > 0x3f || lo < 0 || lo > 0x3f) return null;

  const length = (hi << 6) | lo;
  const payloadAt = headerAt + HEADER_LENGTH;
  const bytes = charsToBytes(text, payloadAt, length);
  if (bytes === null) return null;

  let payload: string;
  try {
    payload = decoder.decode(bytes);
  } catch {
    return null;
  }
  if (!VERSION_TAG.test(payload)) return null;

  return { start, end: payloadAt + length * 4, payload };
}

/**
 * Removes our markers and leaves everything else — including another CMS's
 * stega — exactly where it was.
 */
export function stripMarkers(text: string): string {
  const markers = findMarkers(text);
  if (markers.length === 0) return text;
  let out = '';
  let at = 0;
  for (const marker of markers) {
    out += text.slice(at, marker.start);
    at = marker.end;
  }
  return out + text.slice(at);
}
