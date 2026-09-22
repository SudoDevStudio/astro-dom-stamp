import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import astroDomStamp from '@sudodevstudio/astro-dom-stamp';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [
    astroDomStamp({
      read: ['id', 'uid', 'sku'],
      enabled: process.env.ASTRO_DOM_STAMP_EDIT === 'true',
      sources: ['http.get'],
    }),
  ],
});
