<script setup>
defineProps({
  // 'ok' | 'warn' | 'idle'
  state: { type: String, default: 'idle' }
})
</script>

<template>
  <span class="dot" :class="`dot--${state}`" aria-hidden="true" />
</template>

<style scoped>
.dot {
  display: inline-block;
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--status-idle);
}

.dot--ok {
  background: var(--status-ok);
}

.dot--warn {
  background: var(--status-warn);
}
</style>
