<script lang="ts">
  import { onMount } from 'svelte';
  import type { Product } from '../lib/catalog.ts';

  let products: Product[] = $state([]);

  onMount(async () => {
    const res = await fetch('/api/products.json');
    products = (await res.json()) as Product[];
  });
</script>

<ul class="grid">
  {#each products as product (product.id)}
    <li class="card svelte-card">
      <h3>{product.title}</h3>
      <p>{product.tagline}</p>
    </li>
  {/each}
</ul>
