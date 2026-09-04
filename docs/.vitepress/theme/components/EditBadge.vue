<script setup lang="ts">
defineProps<{
  kind: "edit" | "generated";
}>();
</script>

<template>
  <span class="edit-badge" :data-kind="kind">
    <slot>{{ kind === "edit" ? "Edit this" : "Generated — do not hand-edit" }}</slot>
  </span>
</template>

<style scoped>
.edit-badge {
  display: inline-block;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  vertical-align: middle;
}
.edit-badge[data-kind="edit"] {
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}
.edit-badge[data-kind="generated"] {
  color: var(--vp-c-text-2);
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
}
</style>
