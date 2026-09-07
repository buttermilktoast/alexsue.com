<script setup>
import { computed, provide, watchEffect } from 'vue'
import { site } from './data/site.js'
import { useWeather, weatherKey } from './composables/useWeather.js'
import { useSky } from './composables/useSky.js'
import { setSky, useTheme } from './composables/useTheme.js'
import DashboardHeader from './components/DashboardHeader.vue'
import NowSection from './components/NowSection.vue'
import ProjectsSection from './components/ProjectsSection.vue'
import StatusSection from './components/StatusSection.vue'
import ConditionsSection from './components/ConditionsSection.vue'
import LinksSection from './components/LinksSection.vue'
import SiteFooter from './components/SiteFooter.vue'
import SkyBackdrop from './components/SkyBackdrop.vue'

const weather = useWeather(site.weather)
provide(weatherKey, weather)

const { preference } = useTheme()
const { palette, stops, precipitation, changesAt } = useSky(
  site.weather,
  computed(() => weather.current.value?.weather_code ?? null)
)

// The sun runs whether or not anyone is looking at it, but it only reaches the
// document while the visitor has asked for the sky.
watchEffect(() => setSky(preference.value === 'sky'
  ? { palette: palette.value, color: stops.value.top, changesAt: changesAt.value }
  : null))
</script>

<template>
  <SkyBackdrop v-if="preference === 'sky'" :stops="stops" :precipitation="precipitation" />

  <div class="page">
    <DashboardHeader />

    <main class="main">
      <NowSection />
      <ProjectsSection />
      <StatusSection />
      <ConditionsSection />
      <LinksSection />
    </main>

    <SiteFooter />
  </div>
</template>

<style scoped>
.page {
  position: relative;
  z-index: 1;
  max-width: var(--measure);
  margin: 0 auto;
  padding: 3rem 1.25rem 2.5rem;
}

.main {
  display: grid;
  gap: 2rem;
  margin-top: 2rem;
}

@media (min-width: 720px) {
  .page {
    padding: 4.5rem 2rem 3rem;
  }
}
</style>
