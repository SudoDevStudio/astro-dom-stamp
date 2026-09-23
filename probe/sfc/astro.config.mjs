import { defineConfig } from 'astro/config';
import { writeFileSync } from 'node:fs';
import node from '@astrojs/node';
import vue from '@astrojs/vue';
import svelte from '@astrojs/svelte';
import astroDomStamp from '@sudodevstudio/astro-dom-stamp';

// With ADS_ORDER=1 the build only records where .vue and .svelte reach a
// transform hook, and in what state.
const seen = [];
function probe(enforce) {
  return {
    name: `probe-${enforce ?? 'normal'}`,
    ...(enforce ? { enforce } : {}),
    transform(code, id) {
      if (id.includes('node_modules')) return null;
      if (!/\.(vue|svelte)(\?|$)/.test(id)) return null;
      seen.push({
        at: enforce ?? 'normal',
        id: id.replace(process.cwd(), ''),
        compiled: /createElementVNode|_createBlock|\$\.template|createBlock|from ['"]svelte\/internal|_sfc_main/.test(code),
        hasTemplateTag: /<template[\s>]/.test(code),
        hasScriptTag: /<script[\s>]/.test(code),
        hasJsonCall: code.includes('.json()'),
        head: code.slice(0, 70).replace(/\s+/g, ' '),
      });
      return null;
    },
    buildEnd() {
      writeFileSync(new URL('./order-result.json', import.meta.url), JSON.stringify(seen, null, 2));
    },
  };
}

const ordering = process.env.ADS_ORDER === '1';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [
    vue(),
    svelte(),
    ...(ordering
      ? [{
          name: 'probe',
          hooks: {
            'astro:config:setup': ({ updateConfig }) => {
              updateConfig({ vite: { plugins: [probe('pre'), probe(null), probe('post')] } });
            },
          },
        }]
      : [
          astroDomStamp({
            read: ['id', 'uid', 'sku'],
            enabled: process.env.ASTRO_DOM_STAMP_EDIT === 'true',
          }),
        ]),
  ],
});
