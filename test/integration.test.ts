import { describe, expect, it, vi } from 'vitest';
import astroDomStamp from '../src/index.js';

function setupArgs() {
  const injected: string[] = [];
  const configs: unknown[] = [];
  return {
    injected,
    configs,
    args: {
      updateConfig: (config: unknown) => configs.push(config),
      injectScript: (_stage: string, code: string) => injected.push(code),
      logger: { info: vi.fn(), warn: vi.fn() },
    },
  };
}

describe('production build', () => {
  it('registers no hooks at all when disabled', () => {
    const integration = astroDomStamp({ read: ['id'], enabled: false });
    expect(integration.name).toBe('astro-dom-stamp');
    expect(Object.keys(integration.hooks)).toHaveLength(0);
  });

  it('still validates options, so a typo fails the production build too', () => {
    expect(() => astroDomStamp({ read: [], enabled: false })).toThrow(/`read` is required/);
  });
});

describe('edit build', () => {
  it('injects the browser script and the runtime module', () => {
    const { args, injected, configs } = setupArgs();
    const integration = astroDomStamp({ read: ['id', 'sku'], enabled: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (integration.hooks['astro:config:setup'] as any)(args);

    expect(injected).toHaveLength(1);
    expect(injected[0]).toContain('createStamper');
    expect(injected[0]).toContain('"data-sku"');

    const plugins = (configs[0] as { vite: { plugins: Array<{ name: string }> } }).vite.plugins;
    expect(plugins.map((p) => p.name)).toEqual(['astro-dom-stamp:runtime']);
  });

  it('serves a runtime module with the options already baked in', () => {
    const { args, configs } = setupArgs();
    const integration = astroDomStamp({ read: ['id'], enabled: true, skipFields: ['variant'] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (integration.hooks['astro:config:setup'] as any)(args);

    const plugin = (
      configs[0] as {
        vite: { plugins: Array<{ resolveId(id: string): string | null; load(id: string): string | null }> };
      }
    ).vite.plugins[0]!;

    const resolved = plugin.resolveId('virtual:astro-dom-stamp/runtime');
    expect(resolved).toBe('\0virtual:astro-dom-stamp/runtime');
    expect(plugin.resolveId('./something-else')).toBeNull();

    const code = plugin.load(resolved!)!;
    expect(code).toContain('export const __encode');
    expect(code).toContain('export const __encodeResult');
    expect(code).toContain('"variant"');
  });
});
