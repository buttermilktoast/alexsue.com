<script setup>
import { computed, inject } from 'vue'
import { site } from '../data/site.js'
import { describeWeather, formatTemperature, weatherKey } from '../composables/useWeather.js'
import SectionBlock from './SectionBlock.vue'

const config = site.weather
const { current, sunEvent, loading, unit, setUnit } = inject(weatherKey)
const timeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: config.timezone, hour: 'numeric', minute: '2-digit'
})
const conditions = computed(() => current.value
  ? describeWeather(current.value.weather_code, current.value.is_day === 1)
  : '')
</script>

<template>
  <SectionBlock id="conditions" title="Local conditions">
    <div class="conditions">
      <div class="topline">
        <span class="location">{{ config.location }}</span>
        <div class="units" role="group" aria-label="Temperature unit">
          <button
            v-for="option in ['C', 'F']"
            :key="option"
            type="button"
            :aria-pressed="unit === option"
            :aria-label="option === 'C' ? 'Celsius' : 'Fahrenheit'"
            @click="setUnit(option)"
          >°{{ option }}</button>
        </div>
      </div>

      <div v-if="current" class="readings">
        <div>
          <div class="weather">
            <span class="day-icon" aria-hidden="true">{{ current.is_day === 1 ? '☀' : '☾' }}</span>
            <span class="temperature">{{ formatTemperature(current.temperature_2m, unit) }}</span>
            <span class="description">{{ conditions }}</span>
          </div>
          <p v-if="Number.isFinite(current.apparent_temperature)" class="detail">
            Feels like {{ formatTemperature(current.apparent_temperature, unit) }}
          </p>
        </div>
        <p v-if="sunEvent" class="sun-event">
          <span>{{ sunEvent.label }}</span>
          <time :datetime="new Date(sunEvent.time).toISOString()">{{ timeFormatter.format(sunEvent.time) }}</time>
          <span class="timezone">HST</span>
        </p>
      </div>
      <p v-else class="empty" role="status">
        {{ loading ? 'Checking the skies…' : 'Weather temporarily unavailable.' }}
      </p>

      <div class="footnote">
        <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Weather by Open-Meteo</a>
        <span v-if="current">As of {{ timeFormatter.format(current.time * 1000) }} HST</span>
      </div>
    </div>
  </SectionBlock>
</template>

<style scoped>
.conditions { padding: 0.9rem 1.15rem; }
.topline, .readings, .weather, .footnote { display: flex; align-items: center; gap: 0.75rem; }
.topline, .readings, .footnote { justify-content: space-between; }
.location { font-size: 0.9375rem; }
.units { display: inline-flex; border: 1px solid var(--border); border-radius: 5px; padding: 2px; }
.units button {
  min-width: 36px;
  min-height: 32px;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--muted);
  font-family: var(--font-mono);
  cursor: pointer;
}
.units button[aria-pressed='true'] { background: var(--text); color: var(--surface); }
.units button:hover:not([aria-pressed='true']) { background: var(--background); }
.readings { margin-top: 0.9rem; flex-wrap: wrap; }
.weather { flex-wrap: wrap; gap: 0.6rem; }
.day-icon { font-size: 1.6rem; color: var(--muted); }
.temperature { font-size: 1.65rem; letter-spacing: -0.05em; font-variant-numeric: tabular-nums; }
.description, .detail, .sun-event, .empty { color: var(--muted); font-size: 0.8125rem; }
.detail { margin-top: 0.15rem; }
.sun-event { display: flex; align-items: baseline; gap: 0.4rem; flex-wrap: wrap; }
.sun-event time { color: var(--text); font-family: var(--font-mono); }
.timezone { font-size: 0.7rem; }
.empty { padding: 1rem 0; }
.footnote { flex-wrap: wrap; margin-top: 1rem; color: var(--muted); font-size: 0.6875rem; gap: 0.25rem 1rem; }
</style>
