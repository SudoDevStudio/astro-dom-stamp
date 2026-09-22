/**
 * Zero-width alphabet for the marker, base-4, one byte per four characters.
 *
 * We deliberately do NOT reuse Sanity/Vercel's digit order.
 *
 * `@vercel/stega` (what Sanity's stega client builds on) maps
 * `0 -> U+200B, 1 -> U+200C, 2 -> U+200D, 3 -> U+FEFF` and prefixes a payload
 * with four U+200B. Its detection regex is a character class over that same
 * alphabet, so any run of these characters — ours included — is captured by it.
 * We cannot escape that without an alphabet of different characters, and the
 * only invisible characters left outside their set are either bidi controls or
 * combining marks, both of which are riskier next to real text than this is.
 *
 * What we can do is make an accidental collision rare in both directions:
 *
 * - Our prefix is four U+FEFF. Theirs is four U+200B. Neither string appears in
 *   the other by construction, so `indexOf(PREFIX)` never lands on their
 *   marker's start and vice versa.
 * - Their prefix, in our digit order, is `3333` — four consecutive 2-bit groups
 *   of `11`. For UTF-8 payload bytes that needs 0xFF (never valid UTF-8), or a
 *   byte ending in `111111` followed by a lead byte. Rare, and our decoder
 *   validates a version tag before trusting a hit anyway.
 *
 * U+FEFF leads the prefix on purpose. It is Joining_Type=Transparent and
 * non-breaking, so it is the safest character to sit directly against the last
 * visible glyph of a string — it cannot change cursive joining or conjunct
 * formation the way U+200C (Non_Joining) and U+200D (Join_Causing) can in
 * Gurmukhi, Devanagari or Arabic. Those two only ever appear deeper inside the
 * run, surrounded by other invisible characters.
 */

/** digit value (0-3) -> character */
export const DIGITS = ['﻿', '‌', '‍', '​'] as const;

/** Four U+FEFF. Distinct from `@vercel/stega`'s four U+200B. */
export const PREFIX = DIGITS[0].repeat(4);

export const PREFIX_LENGTH = PREFIX.length;

/** Characters that may legally appear in one of our markers. */
export const ALPHABET = DIGITS.join('');

/** char code -> digit value, or `undefined` for anything else. */
const VALUES: Record<number, number> = {
  0xfeff: 0,
  0x200c: 1,
  0x200d: 2,
  0x200b: 3,
};

/** byte -> its four characters. Built once, then it is a plain array lookup. */
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

/**
 * Read `count` bytes starting at `start`. Returns `null` if the run is too
 * short or contains a character outside the alphabet — i.e. this was not our
 * marker after all.
 */
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
  return VALUES[code] !== undefined;
}
