import { isAlphabetChar } from './alphabet.js';
import { findLastMarker, markerBuilder } from './marker.js';
import { parseStamp, serializeEntity } from './payload.js';
import { isOpaqueParent, shouldSkipKey, shouldSkipValue } from './skip.js';
import type { Stamp } from './types.js';

export interface EncodeSettings {
  read: string[];
  skipFields: ReadonlySet<string>;
}

const MAX_DEPTH = 64;

// One counter for the whole process. List references only have to be unique
// within a rendered document, and a monotonic counter guarantees that without
// tracking request scope.
let listRefCounter = 0;
function nextListRef(): string {
  return (listRefCounter++).toString(36);
}

// Identity-based, so it only catches a result handed to encode() twice. A
// result that crossed the wire and was parsed again is a different graph, which
// is why each string is also checked for the marker it is about to receive.
const encodedInPlace = new WeakSet<object>();
const copies = new WeakMap<object, unknown>();

interface ListSlot {
  box: { ref: string | null };
  index: number;
}

interface WalkState {
  read: string[];
  skip: ReadonlySet<string>;
  copy: boolean;
  seen: WeakSet<object>;
}

/** For a fresh `res.json()` result: encoded in place, nothing cloned. */
export function encode<T>(value: T, settings: EncodeSettings): T {
  if (!isWalkable(value)) return value;
  if (encodedInPlace.has(value as object)) return value;
  encodedInPlace.add(value as object);
  const state: WalkState = {
    read: settings.read,
    skip: settings.skipFields,
    copy: false,
    seen: new WeakSet(),
  };
  return walk(value, state, null, undefined, false, 0, '') as T;
}

/**
 * For a shared or frozen result. The copy is memoised on the input so a
 * component re-rendering with the same cache object keeps a stable reference.
 */
export function encodeResult<T>(value: T, settings: EncodeSettings): T {
  if (!isWalkable(value)) return value;
  const cached = copies.get(value as object);
  if (cached !== undefined) return cached as T;
  const state: WalkState = {
    read: settings.read,
    skip: settings.skipFields,
    copy: true,
    seen: new WeakSet(),
  };
  const result = walk(value, state, null, undefined, false, 0, '') as T;
  copies.set(value as object, result);
  return result;
}

function isWalkable(value: unknown): boolean {
  return Array.isArray(value) || isPlainObject(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function walk(
  value: unknown,
  state: WalkState,
  owner: OwnerMarker | null,
  slot: ListSlot | undefined,
  opaque: boolean,
  depth: number,
  prefix: string,
): unknown {
  if (Array.isArray(value)) return walkArray(value, state, owner, opaque, depth, prefix);
  if (isPlainObject(value)) return walkObject(value, state, owner, slot, opaque, depth, prefix);
  return value;
}

interface OwnerMarker {
  stamp: Stamp;
  build: (field: string) => string;
}

/** `title`, or `details.color` when the value sits below its owner. */
function joinPath(prefix: string, key: string | number): string {
  return prefix === '' ? String(key) : `${prefix}.${key}`;
}

function walkObject(
  node: Record<string, unknown>,
  state: WalkState,
  owner: OwnerMarker | null,
  slot: ListSlot | undefined,
  opaque: boolean,
  depth: number,
  prefix: string,
): unknown {
  if (depth > MAX_DEPTH) return node;
  if (state.copy) {
    const existing = copies.get(node);
    if (existing !== undefined) return existing;
  } else {
    if (state.seen.has(node)) return node;
    state.seen.add(node);
  }

  const fields = readFields(node, state.read);
  let current = owner;
  if (fields !== null) {
    const stamp: Stamp = { fields };
    if (slot) stamp.list = { ref: (slot.box.ref ??= nextListRef()), index: slot.index };
    current = { stamp, build: markerBuilder(serializeEntity(stamp)) };
  }
  // A new owner restarts the path; otherwise values keep the incoming one.
  const base = fields !== null ? '' : prefix;

  const target = state.copy ? ({} as Record<string, unknown>) : node;
  if (state.copy) copies.set(node, target);

  let frozen: boolean | undefined;

  for (const key in node) {
    const value = node[key];
    if (typeof value === 'string') {
      let next = value;
      if (current !== null && !opaque && !shouldSkipKey(key, state.skip) && !shouldSkipValue(value)) {
        if (!alreadyOwned(value, current)) next = value + current.build(joinPath(base, key));
      }
      if (next !== value && !state.copy) {
        frozen ??= Object.isFrozen(node);
        if (frozen) continue;
      }
      if (state.copy || next !== value) target[key] = next;
      continue;
    }

    if (value !== null && typeof value === 'object') {
      const childOpaque = opaque || isOpaqueParent(key);
      const walked = walk(value, state, current, undefined, childOpaque, depth + 1, joinPath(base, key));
      if (state.copy) target[key] = walked;
      continue;
    }

    if (state.copy) target[key] = value;
  }

  return target;
}

function walkArray(
  node: unknown[],
  state: WalkState,
  owner: OwnerMarker | null,
  opaque: boolean,
  depth: number,
  prefix: string,
): unknown {
  if (depth > MAX_DEPTH) return node;
  if (state.copy) {
    const existing = copies.get(node);
    if (existing !== undefined) return existing;
  } else {
    if (state.seen.has(node)) return node;
    state.seen.add(node);
  }

  const target = state.copy ? new Array<unknown>(node.length) : node;
  if (state.copy) copies.set(node, target);

  const box: { ref: string | null } = { ref: null };
  let frozen: boolean | undefined;

  for (let i = 0; i < node.length; i++) {
    const value = node[i];

    if (typeof value === 'string') {
      let next = value;
      if (owner !== null && !opaque && !shouldSkipValue(value)) {
        if (!alreadyOwned(value, owner)) next = value + owner.build(joinPath(prefix, i));
      }
      if (next !== value && !state.copy) {
        frozen ??= Object.isFrozen(node);
        if (frozen) continue;
      }
      if (state.copy || next !== value) target[i] = next;
      continue;
    }

    if (value !== null && typeof value === 'object') {
      const walked = walk(value, state, owner, { box, index: i }, opaque, depth + 1, joinPath(prefix, i));
      if (state.copy) target[i] = walked;
      continue;
    }

    if (state.copy) target[i] = value;
  }

  return target;
}

/**
 * A response that was encoded on the server, sent over the wire and parsed
 * again is a fresh object graph, so the identity guard cannot see it. Compare
 * the trailing marker's fields instead — not the whole marker, because the list
 * reference is allocated per encode run and would differ every time.
 *
 * The last character of a marker is always from our alphabet, so an unmarked
 * string costs one lookup.
 */
function alreadyOwned(value: string, owner: OwnerMarker): boolean {
  if (!isAlphabetChar(value.charCodeAt(value.length - 1))) return false;

  const last = findLastMarker(value);
  if (last === undefined) return false;
  const stamp = parseStamp(last.payload);
  if (stamp === null) return false;

  const fields = owner.stamp.fields;
  for (const key in fields) {
    if (stamp.fields[key] !== fields[key]) return false;
  }
  for (const key in stamp.fields) {
    if (fields[key] === undefined) return false;
  }
  return true;
}

function readFields(node: Record<string, unknown>, read: string[]): Record<string, string> | null {
  let fields: Record<string, string> | null = null;
  for (let i = 0; i < read.length; i++) {
    const key = read[i]!;
    const value = node[key];
    if (typeof value === 'string') {
      if (value.length === 0) continue;
      (fields ??= {})[key] = value;
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      (fields ??= {})[key] = String(value);
    }
  }
  return fields;
}
