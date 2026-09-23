<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { Product } from '../lib/data.ts';

const products = ref<Product[]>([]);

onMounted(async () => {
  const res = await fetch('/api/products.json');
  products.value = (await res.json()) as Product[];
});
</script>

<template>
  <ul class="vuefeed">
    <li v-for="p in products" :key="p.id" class="vuefeed-card">
      <h3>{{ p.title }}</h3>
      <p>{{ p.blurb }}</p>
    </li>
  </ul>
</template>
