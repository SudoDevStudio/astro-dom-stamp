/**
 * `@vercel/stega`'s encoder, reimplemented from its published source so the
 * coexistence tests do not need the package itself as a dependency.
 *
 * Alphabet: 0 -> U+200B, 1 -> U+200C, 2 -> U+200D, 3 -> U+FEFF.
 * Prefix: four U+200B. Payload: JSON, UTF-8, two bits per character.
 */
const DIGITS = ['​', '‌', '‍', '﻿'] as const;
export const VERCEL_PREFIX = DIGITS[0].repeat(4);

export function vercelStegaEncode(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let out = '';
  for (const b of bytes) {
    out += DIGITS[(b >> 6) & 3]! + DIGITS[(b >> 4) & 3]! + DIGITS[(b >> 2) & 3]! + DIGITS[b & 3]!;
  }
  return VERCEL_PREFIX + out;
}

/** Their regex is a character class over the alphabet, so it spans ours too. */
export const VERCEL_REGEX = /[​‌‍⁠⁡⁢⁣﻿]{4,}/gu;
