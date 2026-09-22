import { createStamper, type StamperConfig } from '../../src/browser/stamper.js';
import { encode } from '../../src/core/encode.js';
import { resolveOptions, type AstroDomStampOptions } from '../../src/core/options.js';

const READ = ['id', 'uid', 'sku'];

/** Encodes data the way the server would, for interpolation into markup. */
export function server<T>(data: T, read: string[] = READ): T {
  const resolved = resolveOptions({ read });
  return encode(data, { read: resolved.read, skipFields: resolved.skipFields });
}

/** Renders markup and runs one full scan, as the browser script would. */
export function stamp(html: string, options: Partial<AstroDomStampOptions> = {}): void {
  document.body.innerHTML = html;
  const resolved = resolveOptions({ read: READ, devWarnings: false, ...options });
  const config: StamperConfig = {
    attributes: resolved.attributes,
    stripAfterStamp: resolved.stripAfterStamp,
    devWarnings: resolved.devWarnings,
  };
  createStamper(config).scan();
}

/** The element carrying `data-id="<value>"`, for readable assertions. */
export function stamped(value: string): Element | null {
  return document.querySelector(`[data-id="${value}"]`);
}

export function describeElement(element: Element | null): string {
  if (!element) return 'none';
  const cls = element.getAttribute('class');
  return cls ? `${element.tagName.toLowerCase()}.${cls.split(/\s+/)[0]}` : element.tagName.toLowerCase();
}
