import { findMarkers, hasMarker, stripMarkers } from '../core/marker.js';
import { parseStamp } from '../core/payload.js';
import type { Stamp } from '../core/types.js';
import { resolvePlacements, type Occurrence } from './placement.js';

export interface StamperConfig {
  attributes: Record<string, string>;
  stripAfterStamp: boolean;
  devWarnings: boolean;
}

export interface Stamper {
  scan(): void;
  start(): void;
  stop(): void;
}

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'NOSCRIPT', 'TITLE', 'HEAD', 'TEMPLATE']);

const UNSAFE_ATTRIBUTES = ['class', 'id', 'href', 'src', 'style'];

const LOG_PREFIX = '[astro-dom-stamp]';

export function createStamper(config: StamperConfig): Stamper {
  const warnedKeys = new Set<string>();
  let observer: MutationObserver | null = null;
  let scheduled = 0;
  let applying = false;

  function scan(): void {
    const body = document.body;
    if (!body) return;

    const occurrences: Occurrence[] = [];
    const markedText: Text[] = [];
    const markedAlt: Element[] = [];

    const walker = document.createTreeWalker(body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          return SKIP_TAGS.has((node as Element).tagName)
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node as Text;
        const data = text.data;
        if (!hasMarker(data)) continue;
        const parent = text.parentElement;
        if (!parent) continue;
        if (collect(data, parent, occurrences)) markedText.push(text);
        continue;
      }

      const element = node as Element;
      const alt = element.getAttribute('alt');
      if (alt !== null && hasMarker(alt)) {
        if (collect(alt, element, occurrences)) markedAlt.push(element);
      }
      if (config.devWarnings) auditAttributes(element, warnedKeys);
    }

    if (occurrences.length === 0) return;

    applying = true;
    try {
      apply(resolvePlacements(occurrences), config, warnedKeys);
      if (config.stripAfterStamp) {
        for (const text of markedText) text.data = stripMarkers(text.data);
        for (const element of markedAlt) {
          element.setAttribute('alt', stripMarkers(element.getAttribute('alt')!));
        }
      }
    } finally {
      observer?.takeRecords();
      applying = false;
    }
  }

  function schedule(): void {
    if (scheduled) return;
    scheduled = requestIdle(() => {
      scheduled = 0;
      scan();
    });
  }

  function start(): void {
    if (observer) return;
    observer = new MutationObserver((records) => {
      if (applying) return;
      for (const record of records) {
        if (record.type === 'characterData' || record.addedNodes.length > 0) {
          schedule();
          return;
        }
      }
    });
    const begin = () => {
      if (!document.body) {
        requestAnimationFrame(begin);
        return;
      }
      observer!.observe(document.body, { childList: true, subtree: true, characterData: true });
      schedule();
    };
    // Islands finish hydrating before `load`; scanning earlier would put
    // attributes on nodes React is about to reconcile.
    if (document.readyState === 'complete') begin();
    else window.addEventListener('load', begin, { once: true });
    document.addEventListener('astro:page-load', schedule);
  }

  function stop(): void {
    observer?.disconnect();
    observer = null;
    document.removeEventListener('astro:page-load', schedule);
  }

  return { scan, start, stop };
}

function collect(text: string, element: Element, into: Occurrence[]): boolean {
  let found = false;
  for (const marker of findMarkers(text)) {
    const stamp = parseStamp(marker.payload);
    if (!stamp) continue;
    into.push({ element, stamp, key: marker.payload });
    found = true;
  }
  return found;
}

function apply(
  placements: ReturnType<typeof resolvePlacements>,
  config: StamperConfig,
  warnedKeys: Set<string>,
): void {
  const claimed = new Map<Element, string>();
  for (const placement of placements) {
    const owner = claimed.get(placement.target);
    if (owner !== undefined && owner !== placement.key) {
      if (config.devWarnings) {
        warnOnce(warnedKeys, `collision:${owner}:${placement.key}`, () =>
          console.warn(
            `${LOG_PREFIX} two entities resolved to the same element; keeping the first.`,
            { element: placement.target, kept: owner, dropped: placement.key },
          ),
        );
      }
      continue;
    }
    claimed.set(placement.target, placement.key);
    writeAttributes(placement.target, placement.stamp, config);
  }
}

function writeAttributes(element: Element, stamp: Stamp, config: StamperConfig): void {
  for (const key in stamp.fields) {
    const attribute = config.attributes[key];
    if (!attribute) continue;
    if (element.hasAttribute(attribute)) continue;
    element.setAttribute(attribute, stamp.fields[key]!);
  }
}

function auditAttributes(element: Element, warnedKeys: Set<string>): void {
  for (const name of UNSAFE_ATTRIBUTES) {
    const value = element.getAttribute(name);
    if (value !== null && hasMarker(value)) reportUnsafe(element, name, warnedKeys);
  }
  for (const attribute of element.attributes) {
    if (attribute.name.startsWith('data-') && hasMarker(attribute.value)) {
      reportUnsafe(element, attribute.name, warnedKeys);
    }
  }
}

function reportUnsafe(element: Element, name: string, warnedKeys: Set<string>): void {
  warnOnce(warnedKeys, `unsafe:${element.tagName}:${name}`, () =>
    console.warn(
      `${LOG_PREFIX} a marker reached the "${name}" attribute. The CMS field behind it is used as data, not prose — add its key to \`skipFields\`.`,
      element,
    ),
  );
}

function warnOnce(seen: Set<string>, key: string, emit: () => void): void {
  if (seen.has(key)) return;
  seen.add(key);
  emit();
}

function requestIdle(run: () => void): number {
  const idle = (globalThis as { requestIdleCallback?: (cb: () => void, o?: object) => number })
    .requestIdleCallback;
  return idle ? idle(run, { timeout: 200 }) : (setTimeout(run, 0) as unknown as number);
}
