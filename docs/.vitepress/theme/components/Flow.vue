<script setup lang="ts">
defineProps<{
  steps: string[];
}>();
</script>

<template>
  <ol class="cwf-flow" aria-label="Process steps">
    <li v-for="(step, i) in steps" :key="i">
      <span class="cwf-flow-n">{{ i + 1 }}</span>
      <span class="cwf-flow-t">{{ step }}</span>
    </li>
  </ol>
</template>

<style scoped>
.cwf-flow {
  list-style: none;
  padding: 0;
  margin: 1.25rem 0 1.75rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 0;
}
.cwf-flow li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.95rem;
}
.cwf-flow li:not(:last-child)::after {
  content: "→";
  margin: 0 0.65rem 0 0.35rem;
  color: var(--vp-c-text-3);
}
.cwf-flow-n {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.4rem;
  height: 1.4rem;
  border-radius: 999px;
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
  font-size: 0.75rem;
  font-weight: 700;
  flex: none;
}
.cwf-flow-t {
  font-family: var(--vp-font-family-mono);
  font-size: 0.85rem;
}
@media (max-width: 639px) {
  .cwf-flow {
    flex-direction: column;
  }
  .cwf-flow li:not(:last-child)::after {
    content: "↓";
    margin-left: 0.35rem;
  }
}
</style>
