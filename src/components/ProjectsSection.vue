<script setup>
import { site } from '../data/site.js'
import SectionBlock from './SectionBlock.vue'
</script>

<template>
  <SectionBlock id="projects" title="Projects">
    <ul>
      <li v-for="project in site.projects" :key="project.title" class="project">
        <div class="line">
          <h3 class="title">
            <span v-if="project.emoji" class="emoji" aria-hidden="true">{{
              project.emoji
            }}</span>
            <a
              v-if="project.url"
              :href="project.url"
              rel="noopener"
              target="_blank"
            >
              {{ project.title }}
              <span class="arrow" aria-hidden="true">↗</span>
              <span class="sr-only">(opens in a new tab)</span>
            </a>
            <span v-else>{{ project.title }}</span>
          </h3>
          <span v-if="project.tag" class="tag">{{ project.tag }}</span>
        </div>

        <p class="description">{{ project.description }}</p>
        <p v-if="project.status" class="status">{{ project.status }}</p>
      </li>
    </ul>
  </SectionBlock>
</template>

<style scoped>
.project {
  padding: 1rem 1.15rem;
}

.project + .project {
  border-top: 1px solid var(--border);
}

.line {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
}

.title {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  font-size: 1rem;
  font-weight: 500;
}

/* Fixed width so the titles line up whatever glyph sits in front of them.
   Width plus gap is the 1.75rem the description and status indent by. */
.emoji {
  flex: none;
  width: 1.25rem;
  font-size: 1.05em;
  line-height: 1;
  text-align: center;
}

.arrow {
  font-size: 0.8em;
  color: var(--muted);
}

.tag,
.status {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 0.6875rem;
  letter-spacing: 0.04em;
}

/* Indented to the title text, past the emoji column. */
.description,
.status {
  padding-left: 1.75rem;
}

.description {
  margin-top: 0.15rem;
  color: var(--muted);
  font-size: 0.9375rem;
}

.status {
  margin-top: 0.35rem;
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
