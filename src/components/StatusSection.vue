<script setup>
import { computed } from 'vue'
import { site } from '../data/site.js'
import { useLiveStatus } from '../composables/useLiveStatus.js'
import SectionBlock from './SectionBlock.vue'
import StatusDot from './StatusDot.vue'

const { rows: liveRows } = useLiveStatus(site.live)

// Live rows simply disappear when the data goes stale or the fetch fails,
// leaving the hand-written rows behind.
const statuses = computed(() => [...site.statuses, ...liveRows.value])
</script>

<template>
  <SectionBlock id="status" title="Status">
    <dl class="grid">
      <div v-for="status in statuses" :key="status.label" class="entry">
        <dt>{{ status.label }}</dt>
        <dd>
          <StatusDot :state="status.state" />
          <span :title="status.title">{{ status.value }}</span>
        </dd>
      </div>
    </dl>
  </SectionBlock>
</template>

<style scoped>
.entry {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.7rem 1.15rem;
}

.entry + .entry {
  border-top: 1px solid var(--border);
}

dt {
  font-size: 0.9375rem;
}

dd {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin: 0;
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  text-align: right;
}
</style>
