import type { AstroIntegration } from 'astro';
import { resolveOptions, type AstroDomStampOptions, type ResolvedOptions } from './core/options.js';

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
            plugins: [runtimeModulePlugin(options, resolved)],
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
      return [
        `import { encode, encodeResult } from '@sudodevstudio/astro-dom-stamp/runtime';`,
        `const settings = ${settings};`,
        `settings.skipFields = new Set(settings.skipFields);`,
        `export const __encode = (value) => encode(value, settings);`,
        `export const __encodeResult = (value) => encodeResult(value, settings);`,
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
