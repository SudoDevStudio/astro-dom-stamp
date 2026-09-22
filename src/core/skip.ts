const OPAQUE_PARENTS = new Set(['meta', 'metadata', 'opengraph', 'seo']);

const URL_SCHEME = /^(?:https?|mailto|tel):/i;

const DATE_SHAPE = /\d+(?:[-:/]\d+){2}(?:T\d+(?:[-:/]\d+){1,2}(\.\d+)?Z?)?/;

export function isOpaqueParent(key: string): boolean {
  return OPAQUE_PARENTS.has(key.toLowerCase());
}

export function shouldSkipKey(key: string, skipFields: ReadonlySet<string>): boolean {
  if (key.charCodeAt(0) === 0x5f) return true;
  if (key.length > 2 && key.endsWith('Id')) return true;

  const lower = key.toLowerCase();
  if (lower.includes('type')) return true;
  if (skipFields.has(lower)) return true;
  return skipFields.has(lastSegment(lower, key));
}

function lastSegment(lower: string, key: string): string {
  const boundary = Math.max(key.lastIndexOf('_'), lastUpperIndex(key));
  return boundary > 0 ? lower.slice(boundary + (key[boundary] === '_' ? 1 : 0)) : lower;
}

function lastUpperIndex(key: string): number {
  for (let i = key.length - 1; i > 0; i--) {
    const code = key.charCodeAt(i);
    if (code >= 0x41 && code <= 0x5a) return i;
  }
  return -1;
}

export function shouldSkipValue(value: string): boolean {
  if (value.length === 0 || value.trim().length === 0) return true;
  if (URL_SCHEME.test(value) || value.startsWith('//')) return true;
  return looksLikeDate(value);
}

// Adapted from @vercel/stega: bare numbers are quantities rather than dates,
// and text with letters but no date shape is prose, even though Date.parse
// accepts plenty of both.
function looksLikeDate(value: string): boolean {
  if (!Number.isNaN(Number(value))) return false;
  if (/[a-z]/i.test(value) && !DATE_SHAPE.test(value)) return false;
  return !Number.isNaN(Date.parse(value));
}
