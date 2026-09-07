<script setup>
import { useTheme } from '../composables/useTheme.js'

const { preference, setTheme } = useTheme()

const options = [
  { value: 'system', glyph: '◐', label: 'Match system theme' },
  { value: 'light', glyph: '☀', label: 'Light theme' },
  { value: 'dark', glyph: '☾', label: 'Dark theme' }
]
</script>

<template>
  <div class="theme" role="group" aria-label="Color theme">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      :aria-pressed="preference === option.value"
      :aria-label="option.label"
      :title="option.label"
      @click="setTheme(option.value)"
    >
      <span aria-hidden="true">{{ option.glyph }}</span>
    </button>
  </div>
</template>

<style scoped>
.theme {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 2px;
}

.theme button {
  min-width: 32px;
  min-height: 28px;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  line-height: 1;
  cursor: pointer;
}

.theme button[aria-pressed='true'] {
  background: var(--text);
  color: var(--surface);
}

.theme button:hover:not([aria-pressed='true']) {
  background: var(--background);
}
</style>
