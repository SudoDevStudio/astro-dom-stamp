import type { AstroIntegration } from 'astro';
import { resolveOptions, type AstroDomStampOptions, type ResolvedOptions } from './core/options.js';
import { createTransformPlugin } from './transform/plugin.js';

export type { AstroDomStampOptions, ResolvedOptions } from './core/options.js';
export type { ListRef, Stamp } from './core/types.js';
export { clean, cleanString, decodeStamps } from './core/clean.js';

const NAME = 'astro-dom-stamp';
const VIRTUAL_RUNTIME = 'virtual:astro-dom-stamp/runtime';
const RESOLVED_RUNTIME = '\0' + VIRTUAL_RUNTIME;

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

  return {
    name: NAME,
    hooks: {
      'astro:config:setup': ({ updateConfig, injectScript, logger }) => {
        logger.info('edit mode on: markers and the browser stamper are in this build.');
        updateConfig({
          vite: {
            plugins: [createTransformPlugin(resolved), runtimeModulePlugin(options, resolved)],
          },
        });
        injectScript('page', stamperEntry(resolved));
      },
    },
  };
}

function runtimeModulePlugin(options: AstroDomStampOptions, resolved: ResolvedOptions) {
  const settings = JSON.stringify({ read: resolved.read, skipFields: [...resolved.skipFields] });
  return {
    name: 'astro-dom-stamp:runtime',
    enforce: 'pre' as const,
    resolveId(id: string) {
      return id === VIRTUAL_RUNTIME ? RESOLVED_RUNTIME : null;
    },
    load(id: string) {
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

function stamperEntry(resolved: ResolvedOptions): string {
  const config = JSON.stringify({
    attributes: resolved.attributes,
    stripAfterStamp: resolved.stripAfterStamp,
    devWarnings: resolved.devWarnings,
  });
  return [
    `import { createStamper } from '@sudodevstudio/astro-dom-stamp/browser';`,
    `createStamper(${config}).start();`,
  ].join('\n');
}
