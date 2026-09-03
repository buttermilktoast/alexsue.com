<script setup>
import DashboardHeader from './components/DashboardHeader.vue'
import NowSection from './components/NowSection.vue'
import ProjectsSection from './components/ProjectsSection.vue'
import StatusSection from './components/StatusSection.vue'
import LinksSection from './components/LinksSection.vue'
import SiteFooter from './components/SiteFooter.vue'
</script>

<template>
  <div class="page">
    <DashboardHeader />

    <main class="main">
      <NowSection />
      <ProjectsSection />
      <StatusSection />
      <LinksSection />
    </main>

    <SiteFooter />
  </div>
</template>

<style scoped>
.page {
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
