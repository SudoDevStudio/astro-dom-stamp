import { findMarkers, hasMarker, stripMarkers } from '../core/marker.js';
import { parseStamp, stampKey } from '../core/payload.js';
import type { Stamp } from '../core/types.js';
import { compileUrlPatterns, matchesUrl } from '../core/urls.js';
import { resolvePlacements, type Occurrence } from './placement.js';

export interface StamperConfig {
  attributes: Record<string, string>;
  /** Attribute naming which field an element renders, e.g. `data-stamp-field`. */
  fieldAttribute: string;
  stripAfterStamp: boolean;
  devWarnings: boolean;
  /** Path patterns where the stamper does nothing at all. */
  excludeUrls?: string[];
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
  const excluded = compileUrlPatterns(config.excludeUrls ?? []);
  const warnedKeys = new Set<string>();
  let observer: MutationObserver | null = null;
  let scheduled = 0;
  let applying = false;

  function scan(): void {
    const body = document.body;
    if (!body || isExcluded()) return;

    const occurrences: Occurrence[] = [];
    const markedText: Text[] = [];
    const markedAlt: Element[] = [];

    const walker = document.createTreeWalker(body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as Element;
          if (SKIP_TAGS.has(element.tagName)) return NodeFilter.FILTER_REJECT;
          // An island still carrying `ssr` has not hydrated. Stamping its
          // server-rendered DOM now makes React report a hydration mismatch,
          // so leave it; the observer comes back when `ssr` is removed.
          if (element.tagName === 'ASTRO-ISLAND' && element.hasAttribute('ssr')) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
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
      writeFields(occurrences, config, warnedKeys);
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

  function isExcluded(): boolean {
    return excluded.length > 0 && matchesUrl(location.pathname, excluded);
  }

  function start(): void {
    if (observer) return;
    // Re-checked on every scan too: a view transition changes the path without
    // reloading, so an excluded page can be navigated into and back out of.
    if (isExcluded() && !hasViewTransitions()) return;
    if (config.devWarnings) warnAboutCharset(warnedKeys);
    observer = new MutationObserver((records) => {
      if (applying) return;
      for (const record of records) {
        if (
          record.type === 'characterData' ||
          record.type === 'attributes' ||
          record.addedNodes.length > 0
        ) {
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
      observer!.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        // Hydration can leave the DOM untouched; losing `ssr` is the signal.
        attributeFilter: ['ssr'],
      });
      schedule();
    };
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
    into.push({ element, stamp, key: stampKey(stamp) });
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

/**
 * The entity attributes go on the element wrapping all of its text; this puts
 * the field on the element rendering that one value, and repeats the entity
 * there so one element is enough to build an edit call from.
 */
function writeFields(
  occurrences: Occurrence[],
  config: StamperConfig,
  warnedKeys: Set<string>,
): void {
  const claimed = new Map<Element, string>();
  for (const occurrence of occurrences) {
    const field = occurrence.stamp.field;
    if (field === undefined) continue;

    // Same rule as an entity target: neither is a sensible editing surface.
    const tag = occurrence.element.tagName;
    if (tag === 'BODY' || tag === 'HTML') continue;

    const owner = claimed.get(occurrence.element);
    const claim = `${occurrence.key}|${field}`;
    if (owner !== undefined) {
      if (owner !== claim && config.devWarnings) {
        warnOnce(warnedKeys, `field:${owner}:${claim}`, () =>
          console.warn(
            `${LOG_PREFIX} two fields render into the same element; keeping the first.`,
            { element: occurrence.element, kept: owner, dropped: claim },
          ),
        );
      }
      continue;
    }
    claimed.set(occurrence.element, claim);

    if (!occurrence.element.hasAttribute(config.fieldAttribute)) {
      occurrence.element.setAttribute(config.fieldAttribute, field);
    }
    writeAttributes(occurrence.element, occurrence.stamp, config);
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

/**
 * A page served without a declared UTF-8 charset is decoded as windows-1252,
 * which turns every marker into mojibake before any of this code runs. Nothing
 * here can recover from it, so say so plainly.
 */
function warnAboutCharset(warnedKeys: Set<string>): void {
  if (document.characterSet === 'UTF-8') return;
  warnOnce(warnedKeys, 'charset', () =>
    console.warn(
      `${LOG_PREFIX} this page is being decoded as ${document.characterSet}, not UTF-8, so every marker is corrupted. ` +
        'Add <meta charset="utf-8"> to the document head, or send a charset in the Content-Type header.',
    ),
  );
}

function warnOnce(seen: Set<string>, key: string, emit: () => void): void {
  if (seen.has(key)) return;
  seen.add(key);
  emit();
}

function hasViewTransitions(): boolean {
  return document.querySelector('[name="astro-view-transitions-enabled"]') !== null;
}

function requestIdle(run: () => void): number {
  const idle = (globalThis as { requestIdleCallback?: (cb: () => void, o?: object) => number })
    .requestIdleCallback;
  return idle ? idle(run, { timeout: 200 }) : (setTimeout(run, 0) as unknown as number);
}
