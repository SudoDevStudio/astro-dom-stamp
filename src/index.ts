import type { AstroIntegration } from 'astro';
import { resolveOptions, type AstroDomStampOptions, type ResolvedOptions } from './core/options.js';
import { createStats, reportCoverage, usesSfcRenderer } from './transform/stats.js';

export type { AstroDomStampOptions, ResolvedOptions } from './core/options.js';
export type { ListRef, Stamp } from './core/types.js';

// `clean` and friends deliberately do NOT live here. This module is the
// integration, and it reaches the build-time transform and its Rust parser; a
// client component importing from it would drag all of that into the browser
// bundle. Runtime helpers are at `@sudodevstudio/astro-dom-stamp/core`.

const NAME = 'astro-dom-stamp';
const VIRTUAL_RUNTIME = 'virtual:astro-dom-stamp/runtime';
const RESOLVED_RUNTIME = '\0' + VIRTUAL_RUNTIME;
const VIRTUAL_MIDDLEWARE = 'virtual:astro-dom-stamp/middleware';
const RESOLVED_MIDDLEWARE = '\0' + VIRTUAL_MIDDLEWARE;

/**
 * With `enabled: false` this registers nothing, so a production build is
 * byte-identical to one without the integration installed.
 */
export default function astroDomStamp(options: AstroDomStampOptions): AstroIntegration {
  // Validated even when disabled, so a typo fails the production build too.
  const resolved = resolveOptions(options);

  if (!resolved.enabled) {
    return { name: NAME, hooks: {} };
  }

  // Shared across the several Vite builds one `astro build` runs.
  const stats = createStats(resolved.sources);

  return {
    name: NAME,
    hooks: {
      // Async so the transform, and the Rust parser it pulls in, is loaded only
      // when a build actually runs. Importing it from this module's top level
      // would drag `oxc-parser` into any client bundle that imports `clean`.
      'astro:config:setup': async ({ config, updateConfig, injectScript, addMiddleware, logger }) => {
        const { createTransformPlugins } = await import('./transform/plugin.js');
        const withSfc = usesSfcRenderer(config.integrations);
        logger.info(
          `edit mode on: markers and the browser stamper are in this build${withSfc ? ', including .vue and .svelte' : ''}.`,
        );
        updateConfig({
          vite: {
            plugins: [
              ...createTransformPlugins(resolved, stats, withSfc),
              runtimeModulePlugin(options, resolved),
            ],
          },
        });
        injectScript('page', stamperEntry(resolved));
        // Only the server needs this: it is what tells a shared fetch helper
        // which page is being rendered.
        if (resolved.excludeUrls.length > 0) {
          addMiddleware({ entrypoint: VIRTUAL_MIDDLEWARE, order: 'pre' });
        }
      },
      'astro:build:done': ({ logger }) => reportCoverage(stats, logger),
    },
  };
}

function runtimeModulePlugin(options: AstroDomStampOptions, resolved: ResolvedOptions) {
  const settings = JSON.stringify({
    read: resolved.read,
    skipFields: [...resolved.skipFields],
    excludeUrls: resolved.excludeUrls,
    deepStamps: resolved.deepStamps,
  });
  return {
    name: 'astro-dom-stamp:runtime',
    enforce: 'pre' as const,
    resolveId(id: string) {
      if (id === VIRTUAL_RUNTIME) return RESOLVED_RUNTIME;
      if (id === VIRTUAL_MIDDLEWARE) return RESOLVED_MIDDLEWARE;
      return null;
    },
    load(id: string) {
      if (id === RESOLVED_MIDDLEWARE) return middlewareModule(resolved);
      if (id !== RESOLVED_RUNTIME) return null;
      // Goes through createEncoder, not the raw encode functions, because the
      // transform hands these a promise as often as a value.
      return [
        `import { createEncoder } from '@sudodevstudio/astro-dom-stamp/runtime';`,
        `const encoder = createEncoder(${settings});`,
        `export const __encode = encoder.__encode;`,
        `export const __encodeResult = encoder.__encodeResult;`,
      ].join('\n');
    },
  };
}

/**
 * Runs in the Node server only, so `node:async_hooks` is safe here — it never
 * reaches a client bundle.
 */
function middlewareModule(resolved: ResolvedOptions): string {
  const patterns = JSON.stringify(resolved.excludeUrls);
  return [
    `import { AsyncLocalStorage } from 'node:async_hooks';`,
    `import { setScopeProvider } from '@sudodevstudio/astro-dom-stamp/runtime';`,
    `import { compileUrlPatterns, matchesUrl } from '@sudodevstudio/astro-dom-stamp/core';`,
    `const patterns = compileUrlPatterns(${patterns});`,
    `const storage = new AsyncLocalStorage();`,
    `setScopeProvider(() => storage.getStore());`,
    `export const onRequest = (context, next) =>`,
    `  storage.run({ skip: matchesUrl(context.url.pathname, patterns) }, next);`,
  ].join('\n');
}

function stamperEntry(resolved: ResolvedOptions): string {
  const config = JSON.stringify({
    attributes: resolved.attributes,
    ...(resolved.deepStamps ? { fieldAttribute: resolved.fieldAttribute } : {}),
    stripAfterStamp: resolved.stripAfterStamp,
    devWarnings: resolved.devWarnings,
    excludeUrls: resolved.excludeUrls,
  });
  return [
    `import { createStamper } from '@sudodevstudio/astro-dom-stamp/browser';`,
    `createStamper(${config}).start();`,
  ].join('\n');
}
