import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('./project/', import.meta.url).pathname;
const count = Number(process.argv[2] ?? 1000);
// Share of modules that actually contain a fetch point. The rest are filtered
// out by the code filter without ever reaching our JS handler.
const ratio = Number(process.argv[3] ?? 1);

rmSync(root, { recursive: true, force: true });
mkdirSync(join(root, 'src/lib'), { recursive: true });
mkdirSync(join(root, 'src/pages'), { recursive: true });

let withFetch = 0;
for (let i = 0; i < count; i++) {
  const hasFetch = i % Math.max(1, Math.round(1 / ratio)) === 0;
  if (hasFetch) withFetch++;
  writeFileSync(
    join(root, `src/lib/loader${i}.ts`),
    hasFetch
      ? [
          `export interface Item${i} { id: string; title: string; blurb: string }`,
          `export async function load${i}(): Promise<Item${i}[]> {`,
          `  const res = await fetch('https://example.com/api/${i}');`,
          `  return (await res.json()) as Item${i}[];`,
          `}`,
          '',
        ].join('\n')
      : [
          `export interface Item${i} { id: string; title: string }`,
          `export function load${i}(items: Item${i}[]): Item${i}[] {`,
          `  return items.filter((item) => item.title.length > ${i % 7});`,
          `}`,
          '',
        ].join('\n'),
  );
}

writeFileSync(
  join(root, 'src/lib/index.ts'),
  Array.from({ length: count }, (_, i) => `export { load${i} } from './loader${i}.ts';`).join('\n') + '\n',
);

writeFileSync(
  join(root, 'src/pages/index.astro'),
  [
    '---',
    "import * as loaders from '../lib/index.ts';",
    'const names = Object.keys(loaders);',
    '---',
    '<html lang="en"><body><ul>{names.map((n) => <li>{n}</li>)}</ul></body></html>',
    '',
  ].join('\n'),
);

writeFileSync(
  join(root, 'astro.config.mjs'),
  [
    "import { defineConfig } from 'astro/config';",
    "import node from '@astrojs/node';",
    "import astroDomStamp from '@sudodevstudio/astro-dom-stamp';",
    '',
    'export default defineConfig({',
    "  output: 'server',",
    "  adapter: node({ mode: 'standalone' }),",
    '  integrations:',
    "    process.env.ADS_OFF === 'true'",
    '      ? []',
    "      : [astroDomStamp({ read: ['id', 'uid', 'sku'], enabled: true })],",
    '});',
    '',
  ].join('\n'),
);

console.log(`Generated ${count} modules, ${withFetch} with a fetch point, in ${root}`);
