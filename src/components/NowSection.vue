<script setup>
import { site } from '../data/site.js'
import SectionBlock from './SectionBlock.vue'

const current = site.now.currentProject
</script>

<template>
  <SectionBlock id="now" title="Now">
    <div class="row">
      <dl class="current">
        <dt>Current project</dt>
        <dd>
          <a v-if="current.url" :href="current.url">{{ current.name }}</a>
          <span v-else>{{ current.name }}</span>
        </dd>
      </dl>
      <p v-if="current.description" class="note">{{ current.description }}</p>
    </div>

    <div v-if="site.now.items.length" class="row">
      <h3 class="label">Recently</h3>
      <ul class="items">
        <li v-for="item in site.now.items" :key="item">{{ item }}</li>
      </ul>
    </div>
  </SectionBlock>
</template>

<style scoped>
.row {
  padding: 1rem 1.15rem;
}

.row + .row {
  border-top: 1px solid var(--border);
}

.current dt,
.label {
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 500;
  font-family: var(--font-mono);
}

.current dd {
  font-size: 1rem;
  font-weight: 500;
}

.note {
  margin-top: 0.15rem;
  color: var(--muted);
  font-size: 0.875rem;
}

.items {
  margin-top: 0.35rem;
  display: grid;
  gap: 0.2rem;
  font-size: 0.9375rem;
}
</style>
