<script setup>
import { site } from '../data/site.js'
import SectionBlock from './SectionBlock.vue'
</script>

<template>
  <SectionBlock id="links" title="Links">
    <ul class="list">
      <li v-for="link in site.links" :key="link.href">
        <a
          :href="link.href"
          :target="link.external ? '_blank' : null"
          :rel="link.external ? 'noopener' : null"
        >
          {{ link.label }}
          <template v-if="link.external">
            <span class="arrow" aria-hidden="true">↗</span>
            <span class="sr-only">(opens in a new tab)</span>
          </template>
        </a>
      </li>
    </ul>
  </SectionBlock>
</template>

<style scoped>
.list {
  display: grid;
}

li + li {
  border-top: 1px solid var(--border);
}

a {
  display: block;
  padding: 0.6rem 1.15rem;
  font-size: 0.9375rem;
}

.arrow {
  font-size: 0.8em;
  color: var(--muted);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
