<script lang="ts">
  import { onMount } from 'svelte';
  import type { Product } from '../lib/data.ts';

  let products: Product[] = $state([]);

  onMount(async () => {
    const res = await fetch('/api/products.json');
    products = (await res.json()) as Product[];
  });
</script>

<ul class="sveltefeed">
  {#each products as p (p.id)}
    <li class="sveltefeed-card">
      <h3>{p.title}</h3>
      <p>{p.blurb}</p>
    </li>
  {/each}
</ul>
