/**
 * Which strings never get a marker.
 *
 * A marker inside a string that is later compared, parsed, sliced, or used as a
 * URL is the main way edit mode can break a page that production renders fine.
 * These categories match Sanity's stega defaults, which exist for the same
 * reason.
 */

/** Everything below one of these keys is treated as machine-read. */
const OPAQUE_PARENTS = new Set(['meta', 'metadata', 'opengraph', 'seo']);

/** Schemes the kickoff calls out. A marker in any of these breaks the link. */
const URL_SCHEME = /^(?:https?|mailto|tel):/i;

/** Shape of an ISO-ish date, borrowed from `@vercel/stega`'s date heuristic. */
const DATE_SHAPE = /\d+(?:[-:/]\d+){2}(?:T\d+(?:[-:/]\d+){1,2}(\.\d+)?Z?)?/;

export function isOpaqueParent(key: string): boolean {
  return OPAQUE_PARENTS.has(key.toLowerCase());
}

export function shouldSkipKey(key: string, skipFields: ReadonlySet<string>): boolean {
  // Conventionally internal: `_id`, `_type`, `_updatedAt`, `__typename`.
  if (key.charCodeAt(0) === 0x5f /* _ */) return true;
  // Foreign keys: `authorId`, `categoryId`.
  if (key.length > 2 && key.endsWith('Id')) return true;

  const lower = key.toLowerCase();
  if (lower.includes('type')) return true;
  if (skipFields.has(lower)) return true;
  // `imageUrl`, `bgColor`, `icon_name` — judge the last word, not the whole key.
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

function looksLikeDate(value: string): boolean {
  // Bare numbers are quantities, not dates, even though `Date.parse` takes them.
  if (!Number.isNaN(Number(value))) return false;
  // Prose that has letters but no date shape is prose.
  if (/[a-z]/i.test(value) && !DATE_SHAPE.test(value)) return false;
  return !Number.isNaN(Date.parse(value));
}
