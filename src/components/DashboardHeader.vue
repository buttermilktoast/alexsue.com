<script setup>
import { site } from '../data/site.js'
import StatusDot from './StatusDot.vue'
</script>

<template>
  <header class="header">
    <div class="bar">
      <span class="domain">{{ site.domain }}</span>
      <span class="online">
        <StatusDot state="ok" />
        <span>online</span>
      </span>
    </div>

    <h1 class="name">{{ site.name }}</h1>
    <p class="tagline">{{ site.tagline }}</p>
  </header>
</template>

<style scoped>
.header {
  padding-bottom: 1.75rem;
  border-bottom: 1px solid var(--border);
}

.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.5rem;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--muted);
}

.online {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.name {
  font-size: 1.5rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.tagline {
  color: var(--muted);
  font-size: 0.9rem;
}
</style>
