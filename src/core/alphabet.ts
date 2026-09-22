export const DIGITS = ['﻿', '‌', '‍', '​'] as const;

// Digit order is the reverse of @vercel/stega's, and the prefix is U+FEFF where
// theirs is U+200B, so neither prefix can occur inside the other's marker.
// U+FEFF also leads because UAX #29 gives it Grapheme_Cluster_Break=Control,
// while U+200C is =Extend and U+200D is =ZWJ — either of those sitting against
// the last visible glyph would be pulled into its grapheme cluster.
export const PREFIX = DIGITS[0].repeat(4);

export const PREFIX_LENGTH = PREFIX.length;
export const ALPHABET = DIGITS.join('');

const VALUES: Record<number, number> = {
  0xfeff: 0,
  0x200c: 1,
  0x200d: 2,
  0x200b: 3,
};

const BYTE_TO_CHARS: string[] = /* @__PURE__ */ (() => {
  const table = new Array<string>(256);
  for (let b = 0; b < 256; b++) {
    table[b] =
      DIGITS[(b >> 6) & 3]! +
      DIGITS[(b >> 4) & 3]! +
      DIGITS[(b >> 2) & 3]! +
      DIGITS[b & 3]!;
  }
  return table;
})();

export function bytesToChars(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += BYTE_TO_CHARS[bytes[i]!];
  return out;
}

export function charsToBytes(text: string, start: number, count: number): Uint8Array | null {
  const end = start + count * 4;
  if (end > text.length) return null;
  const bytes = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    const at = start + i * 4;
    const a = VALUES[text.charCodeAt(at)];
    const b = VALUES[text.charCodeAt(at + 1)];
    const c = VALUES[text.charCodeAt(at + 2)];
    const d = VALUES[text.charCodeAt(at + 3)];
    if (a === undefined || b === undefined || c === undefined || d === undefined) return null;
    bytes[i] = (a << 6) | (b << 4) | (c << 2) | d;
  }
  return bytes;
}

export function isAlphabetChar(code: number): boolean {
  return code === 0xfeff || (code >= 0x200b && code <= 0x200d);
}
