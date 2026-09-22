import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import { writeFileSync } from 'node:fs';

/**
 * Answers one question: when our `transform` hook sees a `.astro` id, is the
 * code still Astro source or already compiled JS? The answer decides whether we
 * need `@astrojs/compiler-rs` at all, or whether `oxc-parser` alone is enough.
 */
const seen = [];

function probe(enforce) {
  return {
    name: `probe-${enforce ?? 'normal'}`,
    ...(enforce ? { enforce } : {}),
    transform(code, id) {
      if (id.includes('node_modules')) return null;
      if (!/\.(astro|ts|tsx|js)($|\?)/.test(id)) return null;
      seen.push({
        enforce: enforce ?? 'normal',
        id: id.split('/').slice(-2).join('/'),
        compiled: code.includes('createComponent') || code.includes('$$createComponent'),
        hasFrontmatterFence: /^---/m.test(code),
        hasFetchCall: code.includes('res.json()') || code.includes('.json()'),
        head: code.slice(0, 90).replace(/\s+/g, ' '),
      });
      return null;
    },
    buildEnd() {
      writeFileSync(new URL('./probe-result.json', import.meta.url), JSON.stringify(seen, null, 2));
    },
  };
}

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [
    {
      name: 'probe',
      hooks: {
        'astro:config:setup': ({ updateConfig }) => {
          updateConfig({ vite: { plugins: [probe('pre'), probe(null), probe('post')] } });
        },
      },
    },
  ],
});
