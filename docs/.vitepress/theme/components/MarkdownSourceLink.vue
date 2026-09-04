<script setup lang="ts">
import { computed } from "vue";
import { useData } from "vitepress";

const { page } = useData();
const href = computed(() => {
  const rel = page.value.relativePath;
  if (!rel) return "";
  return `https://raw.githubusercontent.com/stepupgaming/comfy-workflows/main/docs/${rel}`;
});
</script>

<template>
  <p v-if="href" class="md-source-link">
    <a :href="href">View Markdown source</a>
  </p>
</template>
