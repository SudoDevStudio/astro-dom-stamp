import type { Stamp } from '../core/types.js';

export interface Occurrence {
  element: Element;
  stamp: Stamp;
  key: string;
}

export interface Placement {
  target: Element;
  stamp: Stamp;
  key: string;
}

interface Group {
  key: string;
  stamp: Stamp;
  elements: Element[];
}

const MIXED = -1;

export function resolvePlacements(occurrences: Occurrence[]): Placement[] {
  const groups = new Map<string, Group>();
  for (const occurrence of occurrences) {
    const existing = groups.get(occurrence.key);
    if (existing) existing.elements.push(occurrence.element);
    else
      groups.set(occurrence.key, {
        key: occurrence.key,
        stamp: occurrence.stamp,
        elements: [occurrence.element],
      });
  }

  const renderedIndices = new Map<string, Set<number>>();
  for (const group of groups.values()) {
    const list = group.stamp.list;
    if (!list) continue;
    let indices = renderedIndices.get(list.ref);
    if (!indices) renderedIndices.set(list.ref, (indices = new Set()));
    indices.add(list.index);
  }

  const ownership = new Map<string, Map<Element, number>>();
  for (const [ref, indices] of renderedIndices) {
    // With one item rendered there is no container to find, so it falls back
    // to the single-object rule.
    if (indices.size < 2) continue;
    ownership.set(ref, buildOwnership(ref, groups));
  }

  const placements: Placement[] = [];
  for (const group of groups.values()) {
    const anchor = lowestCommonAncestor(group.elements);
    if (!anchor) continue;
    const list = group.stamp.list;
    const owners = list ? ownership.get(list.ref) : undefined;
    const target = owners ? climbToItemRoot(anchor, owners, list!.index) : anchor;
    if (!isStampable(target)) continue;
    placements.push({ target, stamp: group.stamp, key: group.key });
  }
  return placements;
}

/**
 * Marks every ancestor with the list index beneath it, or MIXED once two
 * indices meet. Both early breaks are safe because every climb runs to the
 * root: reaching a node already marked with this index means the rest of the
 * chain was marked by an earlier climb, and reaching MIXED means everything
 * above it is MIXED too.
 */
function buildOwnership(ref: string, groups: Map<string, Group>): Map<Element, number> {
  const owners = new Map<Element, number>();
  for (const group of groups.values()) {
    const list = group.stamp.list;
    if (!list || list.ref !== ref) continue;
    for (const element of group.elements) {
      let node: Element | null = element;
      while (node) {
        const seen = owners.get(node);
        if (seen === undefined) {
          owners.set(node, list.index);
          node = node.parentElement;
          continue;
        }
        if (seen === list.index || seen === MIXED) break;
        while (node && owners.get(node) !== MIXED) {
          owners.set(node, MIXED);
          node = node.parentElement;
        }
        break;
      }
    }
  }
  return owners;
}

function climbToItemRoot(anchor: Element, owners: Map<Element, number>, index: number): Element {
  let target = anchor;
  for (;;) {
    const parent = target.parentElement;
    if (!parent || !isStampable(parent)) return target;
    if (owners.get(parent) !== index) return target;
    target = parent;
  }
}

export function lowestCommonAncestor(elements: Element[]): Element | null {
  let result: Element | null = elements[0] ?? null;
  for (let i = 1; i < elements.length && result; i++) {
    result = ancestorOfPair(result, elements[i]!);
  }
  return result;
}

function ancestorOfPair(a: Element, b: Element): Element | null {
  if (a === b || a.contains(b)) return a;
  if (b.contains(a)) return b;
  let node = a.parentElement;
  while (node && !node.contains(b)) node = node.parentElement;
  return node;
}

function isStampable(element: Element): boolean {
  const tag = element.tagName;
  return tag !== 'BODY' && tag !== 'HTML';
}
