// @vercel/stega's encoder, reimplemented from its published source so the
// coexistence tests need no dependency on the package.
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

export const VERCEL_REGEX = /[​‌‍⁠⁡⁢⁣﻿]{4,}/gu;
