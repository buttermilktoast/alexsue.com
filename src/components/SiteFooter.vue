<script setup>
import { site } from '../data/site.js'

const fullCommit = import.meta.env.VITE_GIT_COMMIT || 'development'
const isDev = fullCommit === 'development'
const shortCommit = isDev ? 'development' : fullCommit.slice(0, 7)

const repository = import.meta.env.VITE_GITHUB_REPOSITORY
const commitUrl =
  repository && !isDev
    ? `https://github.com/${repository}/commit/${fullCommit}`
    : null
</script>

<template>
  <footer class="footer">
    <span>{{ site.domain }}</span>
    <span aria-hidden="true">·</span>
    <span>
      version
      <a
        v-if="commitUrl"
        class="commit"
        :href="commitUrl"
        :title="fullCommit"
        rel="noopener"
        target="_blank"
      >{{ shortCommit }}</a>
      <span v-else class="commit" :title="fullCommit">{{ shortCommit }}</span>
    </span>
  </footer>
</template>

<style scoped>
.footer {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 2.5rem;
  padding-top: 1.25rem;
  border-top: 1px solid var(--border);
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 0.75rem;
}

.commit {
  color: var(--text);
}
</style>
