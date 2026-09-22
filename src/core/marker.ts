import { PREFIX, PREFIX_LENGTH, bytesToChars, charsToBytes } from './alphabet.js';

// Layout: PREFIX (4 chars) + length header (2 bytes, 8 chars) + payload.
// The explicit length is what lets a foreign stega marker sit directly after
// ours without either decoder consuming the other; no terminator byte would
// work, since any byte we chose could also appear inside a UTF-8 payload.

const HEADER_BYTES = 2;
const HEADER_LENGTH = HEADER_BYTES * 4;
const HEADER_BIAS = 0x40;

export const MAX_PAYLOAD_BYTES = (1 << 12) - 1;

const VERSION_TAG = /^v\d+\|/;

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export interface FoundMarker {
  start: number;
  end: number;
  payload: string;
}

/** Returns `''` when the payload is too large for the length header. */
export function encodeMarker(payload: string): string {
  const bytes = encoder.encode(payload);
  if (bytes.length > MAX_PAYLOAD_BYTES) return '';
  const header = new Uint8Array([
    HEADER_BIAS + ((bytes.length >> 6) & 0x3f),
    HEADER_BIAS + (bytes.length & 0x3f),
  ]);
  return PREFIX + bytesToChars(header) + bytesToChars(bytes);
}

export function hasMarker(text: string): boolean {
  return text.includes(PREFIX);
}

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

/** Removes our markers only; another CMS's stega is left in place. */
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
