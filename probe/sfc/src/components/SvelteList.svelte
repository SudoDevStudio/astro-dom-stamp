<script lang="ts">
  import type { Product } from '../lib/data.ts';
  let { products }: { products: Product[] } = $props();
</script>

<ul class="svelte">
  {#each products as p (p.id)}
    <li class="svelte-card">
      <h3>{p.title}</h3>
      <p>{p.blurb}</p>
    </li>
  {/each}
</ul>
