import type { ListRef, Stamp } from './types.js';

const VERSION = 'v1';

/** Payload key holding the list reference. Not usable as a `read` key. */
export const LIST_KEY = 'L';

/** Payload key holding the field ordinal. Not usable as a `read` key. */
export const FIELD_KEY = 'f';

function escape(value: string): string {
  let out = '';
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]!;
    if (ch === '\\' || ch === '|' || ch === '=') out += '\\';
    out += ch;
  }
  return out;
}

/** Everything identifying the entity. The field ordinal is deliberately not here. */
export function serializeEntity(stamp: Stamp): string {
  let out = VERSION;
  for (const key in stamp.fields) {
    out += `|${escape(key)}=${escape(stamp.fields[key]!)}`;
  }
  if (stamp.list) {
    out += `|${LIST_KEY}=${escape(stamp.list.ref)}:${stamp.list.index}`;
  }
  return out;
}

export function fieldSuffix(field: number): string {
  return `|${FIELD_KEY}=${field.toString(36)}`;
}

export function serializeStamp(stamp: Stamp): string {
  const entity = serializeEntity(stamp);
  return stamp.field === undefined ? entity : entity + fieldSuffix(stamp.field);
}

export function parseStamp(payload: string): Stamp | null {
  const parts = splitRaw(payload, '|');
  if (parts.length === 0 || !/^v\d+$/.test(parts[0]!)) return null;

  const fields: Record<string, string> = {};
  let list: ListRef | undefined;
  let field: number | undefined;

  for (let i = 1; i < parts.length; i++) {
    const pair = splitRaw(parts[i]!, '=', 2);
    if (pair.length !== 2) return null;
    const key = unescape(pair[0]!);
    const value = unescape(pair[1]!);
    if (key === LIST_KEY) {
      const at = value.lastIndexOf(':');
      if (at === -1) return null;
      const index = Number(value.slice(at + 1));
      if (!Number.isInteger(index) || index < 0) return null;
      list = { ref: value.slice(0, at), index };
    } else if (key === FIELD_KEY) {
      const parsed = Number.parseInt(value, 36);
      if (!Number.isInteger(parsed) || parsed < 0) return null;
      field = parsed;
    } else {
      fields[key] = value;
    }
  }

  if (Object.keys(fields).length === 0) return null;
  const stamp: Stamp = { fields };
  if (list) stamp.list = list;
  if (field !== undefined) stamp.field = field;
  return stamp;
}

// Splits without unescaping: unescaping has to happen once, after the last
// split, or the `=` pass would unescape what the `|` pass already did.
function splitRaw(text: string, separator: string, limit = Infinity): string[] {
  const parts: string[] = [];
  let current = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '\\' && i + 1 < text.length) {
      current += ch + text[++i];
      continue;
    }
    if (ch === separator && parts.length + 1 < limit) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
}

function unescape(text: string): string {
  if (!text.includes('\\')) return text;
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '\\' && i + 1 < text.length) out += text[++i];
    else out += ch;
  }
  return out;
}

/** Groups occurrences: every marker of one entity shares this, whatever field it came from. */
export function stampKey(stamp: Stamp): string {
  return serializeEntity(stamp);
}
