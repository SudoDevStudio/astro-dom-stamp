import { FIELD_KEY, LIST_KEY } from './payload.js';

export interface AstroDomStampOptions {
  /**
   * Keys that become attributes: `id` -> `data-stamp-id`. Required.
   * camelCase is kebab-cased, so `productId` -> `data-stamp-product-id`.
   * Every listed key an object carries gets its own attribute.
   */
  read: string[];
  /**
   * Prefix for the attributes written. Namespaced by default because plain
   * `data-id` is common in real markup, and an attribute already in the markup
   * is never overwritten — so a collision means that element silently never
   * gets stamped.
   */
  attributePrefix?: string;
  /**
   * `true` only for the edit build. When `false` the integration registers
   * nothing at all: no transform, no encoder in the bundle, no browser script.
   */
  enabled?: boolean;
  /** Extra call expressions to treat as data sources, e.g. `client.query`. */
  sources?: string[];
  /** Keys never encoded, on top of the defaults. */
  skipFields?: string[];
  include?: string[];
  exclude?: string[];
  /**
   * Paths where nothing should happen: no markers in the response, no scanning
   * in the browser. `*` matches any characters, e.g. `['/admin/*', '/checkout/*']`.
   */
  excludeUrls?: string[];
  /** Remove markers from the text once the attribute is on the element. */
  stripAfterStamp?: boolean;
  /** Warn in the browser console about collisions and unsafe marker locations. */
  devWarnings?: boolean;
}

export const DEFAULT_SKIP_FIELDS = [
  'class',
  'classname',
  'color',
  'email',
  'hex',
  'href',
  'icon',
  'path',
  'slug',
  'url',
] as const;

export const DEFAULT_INCLUDE = ['src/**/*.{astro,ts,js,mjs,tsx,jsx,vue,svelte}'] as const;
export const DEFAULT_EXCLUDE = ['**/node_modules/**'] as const;

export const DEFAULT_ATTRIBUTE_PREFIX = 'data-stamp-';

export interface ResolvedOptions {
  read: string[];
  attributePrefix: string;
  attributes: Record<string, string>;
  enabled: boolean;
  sources: string[];
  skipFields: Set<string>;
  include: string[];
  exclude: string[];
  excludeUrls: string[];
  stripAfterStamp: boolean;
  devWarnings: boolean;
}

export function resolveOptions(options: AstroDomStampOptions): ResolvedOptions {
  const read = options.read;
  if (!Array.isArray(read) || read.length === 0) {
    throw new Error('[astro-dom-stamp] `read` is required and must list at least one key.');
  }
  for (const key of read) {
    if (typeof key !== 'string' || key.length === 0) {
      throw new Error('[astro-dom-stamp] every entry of `read` must be a non-empty string.');
    }
    if (key === LIST_KEY || key === FIELD_KEY) {
      throw new Error(
        `[astro-dom-stamp] "${key}" is reserved by the marker payload and cannot be a \`read\` key.`,
      );
    }
  }

  const skipFields = new Set<string>(DEFAULT_SKIP_FIELDS);
  for (const key of options.skipFields ?? []) skipFields.add(key.toLowerCase());
  // Read-key values end up in URLs and comparisons, never in prose.
  for (const key of read) skipFields.add(key.toLowerCase());

  const attributePrefix = options.attributePrefix ?? DEFAULT_ATTRIBUTE_PREFIX;
  if (!/^data-[a-z0-9-]*$/.test(attributePrefix) || attributePrefix.endsWith('--')) {
    throw new Error(
      `[astro-dom-stamp] \`attributePrefix\` must start with "data-" and hold only lowercase letters, digits and hyphens; got "${attributePrefix}".`,
    );
  }

  const attributes: Record<string, string> = {};
  for (const key of read) attributes[key] = `${attributePrefix}${kebabCase(key)}`;

  return {
    read: [...read],
    attributePrefix,
    attributes,
    enabled: options.enabled ?? false,
    sources: [...(options.sources ?? [])],
    skipFields,
    include: (options.include ?? [...DEFAULT_INCLUDE]).map(anchorGlob),
    exclude: (options.exclude ?? [...DEFAULT_EXCLUDE]).map(anchorGlob),
    excludeUrls: [...(options.excludeUrls ?? [])],
    stripAfterStamp: options.stripAfterStamp ?? false,
    devWarnings: options.devWarnings ?? true,
  };
}

export function kebabCase(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .toLowerCase();
}

// Vite passes absolute ids, so a project-relative glob like `src/**/*.ts` would
// never match. Anchoring it lets the documented form work as written.
function anchorGlob(glob: string): string {
  if (glob.startsWith('**/') || glob.startsWith('/') || /^[A-Za-z]:/.test(glob)) return glob;
  return `**/${glob.replace(/^\.\//, '')}`;
}
