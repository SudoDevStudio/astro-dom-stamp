import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import react from '@astrojs/react';
import svelte from '@astrojs/svelte';
import vue from '@astrojs/vue';
import astroDomStamp from '@sudodevstudio/astro-dom-stamp';

const editing = process.env.ASTRO_DOM_STAMP_EDIT === 'true';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  vite: {
    define: {
      'import.meta.env.PUBLIC_ASTRO_DOM_STAMP_EDIT': JSON.stringify(String(editing)),
    },
  },
  integrations: [
    react(),
    vue(),
    svelte(),
    astroDomStamp({
      // `_type` becomes data-stamp-type, so an editor knows which
      // collection an element belongs to.
      read: ['_type', 'id', 'sku'],
      // Name the field each element renders, for field-level editing.
      deepStamps: true,
      enabled: editing,
      // Nothing runs on these paths: no markers in the response, no scanning.
      excludeUrls: ['/admin/*'],
    }),
  ],
});
