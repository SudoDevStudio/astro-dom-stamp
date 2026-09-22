import { encodeMarker } from './marker.js';
import { serializeStamp } from './payload.js';
import { isOpaqueParent, shouldSkipKey, shouldSkipValue } from './skip.js';
import type { Stamp } from './types.js';

export interface EncodeSettings {
  read: string[];
  skipFields: ReadonlySet<string>;
}

/**
 * Deepest structure we will descend into. Cycles are caught separately; this
 * only guards the stack against pathologically nested API responses.
 */
const MAX_DEPTH = 64;

/**
 * List references only have to be unique inside one rendered document, but a
 * single SSR process renders many. One monotonic counter for the whole process
 * is the cheapest way to guarantee that without tracking request scope.
 */
let listRefCounter = 0;
function nextListRef(): string {
  return (listRefCounter++).toString(36);
}

/** Objects already encoded in place, so a cached `res.json()` is not marked twice. */
const encodedInPlace = new WeakSet<object>();

/** Input -> output for copy mode, so one input always yields one output. */
const copies = new WeakMap<object, unknown>();

/** Array slot an object sits in. The ref is allocated only if an item owns strings. */
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

/**
 * Encodes a fresh `res.json()` result in place. Cheapest path: nothing is
 * cloned, and the object graph is walked once.
 */
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
  return walk(value, state, null, undefined, false, 0) as T;
}

/**
 * Encodes a result that may be shared or frozen — a GraphQL cache entry, a hook
 * result — by copying it. The copy is memoised on the input, so a component
 * that re-renders with the same cache object keeps the same encoded object and
 * React sees a stable reference.
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
  const result = walk(value, state, null, undefined, false, 0) as T;
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
): unknown {
  if (Array.isArray(value)) return walkArray(value, state, owner, opaque, depth);
  if (isPlainObject(value)) return walkObject(value, state, owner, slot, opaque, depth);
  return value;
}

/** An owner's serialized marker, built once and appended to every string it owns. */
interface OwnerMarker {
  stamp: Stamp;
  marker: string;
}

function walkObject(
  node: Record<string, unknown>,
  state: WalkState,
  owner: OwnerMarker | null,
  slot: ListSlot | undefined,
  opaque: boolean,
  depth: number,
): unknown {
  if (depth > MAX_DEPTH) return node;
  if (state.copy) {
    const existing = copies.get(node);
    if (existing !== undefined) return existing;
  } else {
    if (state.seen.has(node)) return node;
    state.seen.add(node);
  }

  // A nested object with its own id owns its strings; otherwise the strings
  // still belong to the nearest ancestor that had one.
  const fields = readFields(node, state.read);
  let current = owner;
  if (fields !== null) {
    const stamp: Stamp = { fields };
    if (slot) stamp.list = { ref: (slot.box.ref ??= nextListRef()), index: slot.index };
    current = { stamp, marker: encodeMarker(serializeStamp(stamp)) };
  }

  const target = state.copy ? ({} as Record<string, unknown>) : node;
  if (state.copy) copies.set(node, target);

  let frozen: boolean | undefined;

  for (const key in node) {
    const value = node[key];
    if (typeof value === 'string') {
      let next = value;
      if (current !== null && current.marker !== '' && !opaque && !shouldSkipKey(key, state.skip) && !shouldSkipValue(value)) {
        next = value + current.marker;
      }
      if (next !== value && !state.copy) {
        // A frozen result cannot be marked in place; `encodeResult` copies.
        frozen ??= Object.isFrozen(node);
        if (frozen) continue;
      }
      if (state.copy || next !== value) target[key] = next;
      continue;
    }

    if (value !== null && typeof value === 'object') {
      const childOpaque = opaque || isOpaqueParent(key);
      const walked = walk(value, state, current, undefined, childOpaque, depth + 1);
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

  // Allocated on the first item that turns out to own strings, so arrays of
  // plain values never burn a reference.
  const box: { ref: string | null } = { ref: null };
  let frozen: boolean | undefined;

  for (let i = 0; i < node.length; i++) {
    const value = node[i];

    if (typeof value === 'string') {
      // An array of strings belongs to whoever owns the array's key.
      let next = value;
      if (owner !== null && owner.marker !== '' && !opaque && !shouldSkipValue(value)) {
        next = value + owner.marker;
      }
      if (next !== value && !state.copy) {
        frozen ??= Object.isFrozen(node);
        if (frozen) continue;
      }
      if (state.copy || next !== value) target[i] = next;
      continue;
    }

    if (value !== null && typeof value === 'object') {
      const walked = walk(value, state, owner, { box, index: i }, opaque, depth + 1);
      if (state.copy) target[i] = walked;
      continue;
    }

    if (state.copy) target[i] = value;
  }

  return target;
}

/**
 * The read-key values this object carries, or `null` if it carries none — in
 * which case it is not an owner and its strings belong further up.
 */
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
