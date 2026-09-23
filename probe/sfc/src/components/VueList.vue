<script setup lang="ts">
import type { Product } from '../lib/data.ts';
defineProps<{ products: Product[] }>();
</script>

<template>
  <ul class="vue">
    <li v-for="p in products" :key="p.id" class="vue-card">
      <h3>{{ p.title }}</h3>
      <p>{{ p.blurb }}</p>
    </li>
  </ul>
</template>
