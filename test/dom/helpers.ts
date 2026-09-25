import { createStamper, type StamperConfig } from '../../src/browser/stamper.js';
import { encode } from '../../src/core/encode.js';
import { resolveOptions, type AstroDomStampOptions } from '../../src/core/options.js';

const READ = ['id', 'uid', 'sku'];

export function server<T>(data: T, read: string[] = READ): T {
  const resolved = resolveOptions({ read });
  return encode(data, { read: resolved.read, skipFields: resolved.skipFields });
}

export function stamp(html: string, options: Partial<AstroDomStampOptions> = {}): void {
  document.body.innerHTML = html;
  const resolved = resolveOptions({ read: READ, devWarnings: false, ...options });
  const config: StamperConfig = {
    attributes: resolved.attributes,
    fieldAttribute: resolved.fieldAttribute,
    stripAfterStamp: resolved.stripAfterStamp,
    devWarnings: resolved.devWarnings,
  };
  createStamper(config).scan();
}

/**
 * The outermost element per rendering. Field elements repeat the entity id, so
 * a plain query would also return every `<h1>` and `<p>` beneath the block.
 */
export function entityBlocks(value: string): Element[] {
  const all = [...document.querySelectorAll(`[data-stamp-id="${value}"]`)];
  return all.filter((el) => !all.some((other) => other !== el && other.contains(el)));
}

export function stamped(value: string): Element | null {
  return entityBlocks(value)[0] ?? null;
}

export function fieldOf(element: Element | null): string | null {
  return element?.getAttribute('data-stamp-field') ?? null;
}

export function describeElement(element: Element | null): string {
  if (!element) return 'none';
  const cls = element.getAttribute('class');
  return cls ? `${element.tagName.toLowerCase()}.${cls.split(/\s+/)[0]}` : element.tagName.toLowerCase();
}
