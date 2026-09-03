<script setup>
defineProps({
  id: { type: String, required: true },
  title: { type: String, required: true }
})
</script>

<template>
  <section :id="id" :aria-labelledby="`${id}-heading`">
    <h2 :id="`${id}-heading`" class="heading">{{ title }}</h2>
    <div class="panel">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.heading {
  margin-bottom: 0.6rem;
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 600;
  font-family: var(--font-mono);
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
}
</style>
