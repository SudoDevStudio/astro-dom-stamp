<script setup lang="ts">
import type { Product } from '../lib/catalog.ts';
defineProps<{ products: Product[] }>();
</script>

<template>
  <ul class="grid">
    <li v-for="product in products" :key="product.id" class="card vue-card">
      <h3>{{ product.title }}</h3>
      <p>{{ product.tagline }}</p>
      <strong>{{ product.priceLabel }}</strong>
    </li>
  </ul>
</template>
