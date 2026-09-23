import { describe, expect, it, vi } from 'vitest';
import astroDomStamp from '../src/index.js';

function setupArgs() {
  const injected: string[] = [];
  const configs: unknown[] = [];
  const middleware: Array<{ entrypoint: string; order: string }> = [];
  return {
    injected,
    configs,
    middleware,
    args: {
      config: { integrations: [] as Array<{ name: string }> },
      updateConfig: (config: unknown) => configs.push(config),
      injectScript: (_stage: string, code: string) => injected.push(code),
      addMiddleware: (entry: { entrypoint: string; order: string }) => middleware.push(entry),
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
  it('injects the browser script and the runtime module', async () => {
    const { args, injected, configs } = setupArgs();
    const integration = astroDomStamp({ read: ['id', 'sku'], enabled: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (integration.hooks['astro:config:setup'] as any)(args);

    expect(injected).toHaveLength(1);
    expect(injected[0]).toContain('createStamper');
    expect(injected[0]).toContain('"data-stamp-sku"');

    const plugins = (configs[0] as { vite: { plugins: Array<{ name: string }> } }).vite.plugins;
    expect(plugins.map((p) => p.name)).toEqual([
      'astro-dom-stamp:transform-js',
      'astro-dom-stamp:runtime',
    ]);
  });

  it('serves a runtime module with the options already baked in', async () => {
    const { args, configs } = setupArgs();
    const integration = astroDomStamp({ read: ['id'], enabled: true, skipFields: ['variant'] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (integration.hooks['astro:config:setup'] as any)(args);

    const plugin = (
      configs[0] as {
        vite: {
          plugins: Array<{
            name: string;
            resolveId(id: string): string | null;
            load(id: string): string | null;
          }>;
        };
      }
    ).vite.plugins.find((p) => p.name === 'astro-dom-stamp:runtime')!;

    const resolved = plugin.resolveId('virtual:astro-dom-stamp/runtime');
    expect(resolved).toBe('\0virtual:astro-dom-stamp/runtime');
    expect(plugin.resolveId('./something-else')).toBeNull();

    const code = plugin.load(resolved!)!;
    expect(code).toContain('export const __encode');
    expect(code).toContain('export const __encodeResult');
    expect(code).toContain('"variant"');
    // Must go through createEncoder: the transform passes promises as well as
    // values, and the raw encode functions would return a promise untouched.
    expect(code).toContain('createEncoder');
  });
});

describe('build report', () => {
  async function runBuild(sources: string[], files: Array<[string, string]>) {
    const { args, configs } = setupArgs();
    const integration = astroDomStamp({ read: ['id'], enabled: true, sources });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (integration.hooks['astro:config:setup'] as any)(args);
    const plugin = (
      configs[0] as {
        vite: {
          plugins: Array<{ name: string; transform: { handler(code: string, id: string): unknown } }>;
        };
      }
    ).vite.plugins.filter((p) => p.name.startsWith('astro-dom-stamp:transform'));
    for (const [id, code] of files) for (const p of plugin) p.transform.handler(code, id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (integration.hooks['astro:build:done'] as any)(args);
    return args.logger;
  }

  it('counts what each rule wrapped', async () => {
    const logger = await runBuild(
      ['client.*'],
      [
        ['/p/src/lib/a.ts', 'const a = await res.json();'],
        ['/p/src/lib/b.ts', 'const b = await client.query(Q);'],
      ],
    );
    const lines = logger.info.mock.calls.map((c) => String(c[0]));
    expect(lines).toContain('wrapped 2 data sources in 2 file(s)');
    expect(lines.some((l) => l.includes('.json()  1'))).toBe(true);
    expect(lines.some((l) => l.includes('client.*  1'))).toBe(true);
  });

  it('warns about a configured source that matched nothing', async () => {
    const logger = await runBuild(['http.get'], [['/p/src/lib/a.ts', 'const a = await res.json();']]);
    const warnings = logger.warn.mock.calls.map((c) => String(c[0]));
    expect(warnings.some((w) => w.includes('"http.get" matched no call'))).toBe(true);
  });

  it('warns when nothing at all came from fetch', async () => {
    const logger = await runBuild(['client.*'], [['/p/src/lib/a.ts', 'const b = await client.query(Q);']]);
    const warnings = logger.warn.mock.calls.map((c) => String(c[0]));
    expect(warnings.some((w) => w.includes('no `.json()` call was wrapped'))).toBe(true);
  });
});

describe('single-file component renderers', () => {
  async function pluginNames(integrations: Array<{ name: string }>): Promise<string[]> {
    const { args, configs } = setupArgs();
    args.config.integrations = integrations;
    const integration = astroDomStamp({ read: ['id'], enabled: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (integration.hooks['astro:config:setup'] as any)(args);
    return (configs[0] as { vite: { plugins: Array<{ name: string }> } }).vite.plugins.map(
      (p) => p.name,
    );
  }

  it('adds no second pass to a project without Vue or Svelte', async () => {
    expect(await pluginNames([{ name: '@astrojs/react' }])).not.toContain(
      'astro-dom-stamp:transform-sfc',
    );
  });

  it.each(['@astrojs/vue', '@astrojs/svelte'])('adds the second pass for %s', async (name) => {
    expect(await pluginNames([{ name }])).toContain('astro-dom-stamp:transform-sfc');
  });
});

describe('excludeUrls', () => {
  async function setup(excludeUrls?: string[]) {
    const args = setupArgs();
    const integration = astroDomStamp({ read: ['id'], enabled: true, ...(excludeUrls ? { excludeUrls } : {}) });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (integration.hooks['astro:config:setup'] as any)(args.args);
    const plugin = (
      args.configs[0] as {
        vite: { plugins: Array<{ name: string; resolveId(id: string): string | null; load(id: string): string | null }> };
      }
    ).vite.plugins.find((p) => p.name === 'astro-dom-stamp:runtime')!;
    return { ...args, plugin };
  }

  it('adds no middleware when no path is excluded', async () => {
    expect((await setup()).middleware).toHaveLength(0);
  });

  it('adds the middleware ahead of the project\'s own', async () => {
    const { middleware } = await setup(['/admin/*']);
    expect(middleware).toEqual([
      { entrypoint: 'virtual:astro-dom-stamp/middleware', order: 'pre' },
    ]);
  });

  it('serves a middleware that scopes the decision to the request', async () => {
    const { plugin } = await setup(['/admin/*']);
    const code = plugin.load(plugin.resolveId('virtual:astro-dom-stamp/middleware')!)!;
    expect(code).toContain('AsyncLocalStorage');
    expect(code).toContain('"/admin/*"');
    expect(code).toContain('export const onRequest');
    expect(code).toContain('storage.run');
  });

  it('gives the browser script the same patterns', async () => {
    const { injected } = await setup(['/admin/*', '/checkout/*']);
    expect(injected[0]).toContain('"excludeUrls":["/admin/*","/checkout/*"]');
  });
});

describe('the runtime module knows about excluded paths', () => {
  it('passes excludeUrls through, or the server would encode them anyway', async () => {
    const { args, configs } = setupArgs();
    const integration = astroDomStamp({
      read: ['id'],
      enabled: true,
      excludeUrls: ['/admin/*'],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (integration.hooks['astro:config:setup'] as any)(args);
    const plugin = (
      configs[0] as {
        vite: {
          plugins: Array<{
            name: string;
            resolveId(id: string): string | null;
            load(id: string): string | null;
          }>;
        };
      }
    ).vite.plugins.find((p) => p.name === 'astro-dom-stamp:runtime')!;
    const code = plugin.load(plugin.resolveId('virtual:astro-dom-stamp/runtime')!)!;
    expect(code).toContain('"excludeUrls":["/admin/*"]');
  });
});
