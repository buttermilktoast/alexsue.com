<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import Icon from './Icon.vue'
import sources from './sources.json'

const themes = [
  { id: 'ridge', name: 'Mountain mist', scene: 'Koʻolau at dawn' },
  { id: 'pacific', name: 'Pacific blue', scene: 'Pacific twilight' },
  { id: 'dunes', name: 'Desert dusk', scene: 'Desert at sunset' },
]
const filters = [
  ['All feeds', 'grid'], ['News', 'news'], ['Tech', 'tech'], ['Games', 'games'], ['Comics', 'comic'],
]
// Production reads the snapshot the scheduled Lambda keeps in S3 (infra/feeds/);
// local development reads the one scripts/update-home-feeds.py writes.
const feedsUrl = import.meta.env.VITE_FEEDS_URL || './feeds.json'
const sourcesById = new Map(sources.map(source => [source.id, source]))
const defaults = sources.filter(source => source.enabled).map(source => source.id)
const settingsKey = 'daily-brief.settings.v1'
const saved = readLocal(settingsKey)
const order = ref(Array.isArray(saved?.order) ? [...new Set(saved.order.filter(id => sourcesById.has(id)))] : defaults)
const theme = ref(themes.find(item => item.id === saved?.theme) ?? themes[0])
const category = ref('All feeds')
const snapshot = ref(null)
const loading = ref(true)
const failed = ref(false)
const now = ref(new Date())
const selectedCard = ref(null)
const dragging = ref(null)
const imageFailed = ref(false)
const failedThumbnails = ref(new Set())
const expandedSources = ref(new Set())
const manager = ref(null)
const themeDialog = ref(null)
const searchInput = ref(null)
const query = ref('')
const announcement = ref('')
let clock
let pointerDrag
let ignoreClick = false
let lastChecked = 0

const visible = computed(() => order.value.map(id => sourcesById.get(id))
  .filter(source => category.value === 'All feeds' || source.category === category.value))
const matching = computed(() => {
  const term = query.value.trim().toLowerCase()
  return sources.filter(source => !term || `${source.name} ${source.category} ${source.id === 'gamedev' ? 'Gamasutra' : ''}`.toLowerCase().includes(term))
})
const date = computed(() => new Intl.DateTimeFormat(undefined, {
  weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
}).format(now.value))
const collectionTime = computed(() => Date.parse(snapshot.value?.generatedAt))
const delayed = computed(() => now.value - collectionTime.value >= 2 * 60 * 60 * 1000)
const collectionLabel = computed(() => Number.isFinite(collectionTime.value)
  ? `Last feed collection on ${new Date(collectionTime.value).toLocaleString()}`
  : '')
const feedStatus = computed(() => {
  if (loading.value) return 'Checking feeds…'
  if (!Number.isFinite(collectionTime.value)) return failed.value ? 'Feed update unavailable' : 'Waiting for first feed update'
  const age = relativeTime(collectionTime.value)
  if (failed.value) return `Last available update ${age}`
  return delayed.value ? `Refresh delayed · last update ${age}` : `Headlines updated ${age}`
})

function readLocal(key) {
  try {
    return JSON.parse(localStorage.getItem(key))
  } catch {
    return null
  }
}

watch([order, theme], () => {
  try {
    localStorage.setItem(settingsKey, JSON.stringify({ order: order.value, theme: theme.value.id }))
  } catch {
    // Keep settings in memory when storage is disabled or full.
  }
})

function relativeTime(value) {
  const minutes = Math.floor((now.value - new Date(value)) / 60000)
  if (!Number.isFinite(minutes)) return ''
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`
}

function shortDate(value) {
  return value ? new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric' }).format(new Date(value)) : ''
}

async function refresh() {
  loading.value = true
  lastChecked = Date.now()
  try {
    const response = await fetch(feedsUrl, { cache: 'no-store', signal: AbortSignal.timeout(10000) })
    if (!response.ok) throw new Error('Feed snapshot unavailable')
    const data = await response.json()
    if (!data.feeds || typeof data.feeds !== 'object') throw new Error('Invalid feed snapshot')
    imageFailed.value = false
    snapshot.value = data
    failed.value = false
  } catch {
    failed.value = true
  } finally {
    now.value = new Date()
    loading.value = false
  }
}

function refreshWhenVisible() {
  if (!document.hidden && !loading.value && Date.now() - lastChecked > 15 * 60000) refresh()
}

function itemsFor(source) {
  return snapshot.value?.feeds[source.id]?.items ?? []
}

function toggleFeed(id) {
  const enabled = order.value.includes(id)
  order.value = enabled ? order.value.filter(item => item !== id) : [...order.value, id]
  selectedCard.value = null
  announcement.value = `${sourcesById.get(id).name} ${enabled ? 'removed' : 'added'}`
}

function changeCategory(label) {
  category.value = label
  selectedCard.value = null
}

function toggleExpanded(id) {
  const next = new Set(expandedSources.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedSources.value = next
}

async function openManager() {
  query.value = ''
  selectedCard.value = null
  manager.value.showModal()
  await nextTick()
  searchInput.value.focus()
}

function moveCard(id, targetId) {
  if (id === targetId || !targetId) return
  const next = [...order.value]
  const oldPosition = next.indexOf(id)
  const position = next.indexOf(targetId)
  if (oldPosition < 0 || position < 0) return
  next.splice(oldPosition, 1)
  next.splice(position, 0, id)
  order.value = next
  announcement.value = `Moved ${sourcesById.get(id).name}`
}

function adjacent(id, direction) {
  return visible.value[visible.value.findIndex(source => source.id === id) + direction]?.id
}

function startDrag(event, id) {
  if (!event.isPrimary || event.button !== 0) return
  ignoreClick = false
  pointerDrag = { id, x: event.clientX, y: event.clientY }
  event.currentTarget.setPointerCapture(event.pointerId)
}

function moveDrag(event) {
  if (!pointerDrag) return
  if (!dragging.value && Math.hypot(event.clientX - pointerDrag.x, event.clientY - pointerDrag.y) < 8) return
  selectedCard.value = null
  const card = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-source]')
  dragging.value = { id: pointerDrag.id, target: card?.dataset.source }
}

function endDrag(event) {
  if (dragging.value) {
    if (event.type === 'pointerup') moveCard(dragging.value.id, dragging.value.target)
    ignoreClick = true
    dragging.value = null
  }
  pointerDrag = null
}

function toggleCardMenu(event, id) {
  if (ignoreClick && event.detail > 0) return
  selectedCard.value = selectedCard.value === id ? null : id
}

function dismissCardMenu(event) {
  if (!event.target.closest('[data-card-actions]')) selectedCard.value = null
}

onMounted(() => {
  refresh()
  clock = setInterval(() => {
    now.value = new Date()
    refreshWhenVisible()
  }, 60000)
  document.addEventListener('visibilitychange', refreshWhenVisible)
  document.addEventListener('click', dismissCardMenu)
})
onUnmounted(() => {
  clearInterval(clock)
  document.removeEventListener('visibilitychange', refreshWhenVisible)
  document.removeEventListener('click', dismissCardMenu)
})
</script>

<template>
  <header class="topbar">
    <div class="shell masthead">
      <a class="brand" href="/home/" aria-label="The Daily Brief home">
        <span class="brand-icon"><Icon name="brief" /></span>
        <span>The Daily Brief</span>
      </a>
      <div class="toolbar">
        <button class="quiet" type="button" @click="themeDialog.showModal()"><Icon name="image" /><span>Background</span></button>
        <button class="primary" type="button" @click="openManager"><Icon name="plus" /><span>Manage feeds</span></button>
      </div>
    </div>
  </header>

  <main class="shell">
    <section class="hero" :style="{ '--wallpaper': 'url(/home/wallpapers/' + theme.id + '.webp)' }" aria-labelledby="page-title">
      <div class="hero-content">
        <p class="edition"><span class="edition-line"></span>{{ date }}</p>
        <h1 id="page-title">The Daily Brief<span>.</span></h1>
        <p class="subtitle">Your headlines, all in one place.</p>
      </div>
      <button class="scene" type="button" @click="themeDialog.showModal()" aria-label="Change background">
        <Icon name="image" /> {{ theme.scene }}
      </button>
    </section>

    <div class="feedbar">
      <nav aria-label="Filter feeds" class="filters">
        <button v-for="[label, icon] in filters" :key="label" type="button" :aria-pressed="category === label" @click="changeCategory(label)">
          <Icon :name="icon" />{{ label }}
        </button>
      </nav>
      <div class="feed-status">
        <span :title="collectionLabel">{{ feedStatus }}</span>
        <button type="button" class="icon-button" aria-label="Check for updated headlines" title="Check for updated headlines" :disabled="loading" @click="refresh">
          <Icon name="refresh" :class="{ spinning: loading }" />
        </button>
      </div>
    </div>

    <section aria-labelledby="feeds-title">
      <div class="section-heading">
        <div class="section-name">
          <h2 id="feeds-title">Your feeds</h2>
          <span class="feed-count">{{ visible.length }}</span>
        </div>
        <span v-if="visible.length > 1" class="drag-hint"><Icon name="grip" /> Drag to rearrange</span>
      </div>

      <p class="sr-only" aria-live="polite">{{ announcement }}</p>

      <div v-if="visible.length" class="feed-grid">
        <article v-for="source in visible" :key="source.id" :data-source="source.id"
          class="card" :class="{ comic: source.id === 'foxtrot', moving: dragging?.id === source.id, 'drop-target': dragging?.target === source.id && dragging.id !== source.id }">
          <header class="card-head">
            <span class="source-mark" :style="{ '--mark-color': source.color }" aria-hidden="true">{{ source.mark }}</span>
            <div class="source-name">
              <h3><a :href="source.site" target="_blank" rel="noopener noreferrer">{{ source.name }}</a></h3>
              <p>{{ source.id === 'foxtrot' ? 'Sunday comic' : source.category }}<span v-if="snapshot?.feeds[source.id]?.via" class="via"
                :title="'These headlines come from a ' + snapshot.feeds[source.id].via + ' search, not ' + source.name + '’s own feed'"> · via {{ snapshot.feeds[source.id].via }}</span></p>
            </div>
            <div class="card-actions" data-card-actions>
              <button class="icon-button grip" type="button" :aria-label="'Arrange ' + source.name"
                :aria-expanded="selectedCard === source.id" title="Drag to rearrange or click for options"
                @pointerdown="startDrag($event, source.id)" @pointermove="moveDrag" @pointerup="endDrag"
                @pointercancel="endDrag" @lostpointercapture="endDrag" @click="toggleCardMenu($event, source.id)"
                @keydown.esc="selectedCard = null"><Icon name="grip" /></button>
              <div v-if="selectedCard === source.id" class="card-menu" @keydown.esc="selectedCard = null">
                <button type="button" :disabled="!adjacent(source.id, -1)" @click="moveCard(source.id, adjacent(source.id, -1))">Move earlier</button>
                <button type="button" :disabled="!adjacent(source.id, 1)" @click="moveCard(source.id, adjacent(source.id, 1))">Move later</button>
                <button type="button" @click="toggleFeed(source.id)">Remove feed</button>
              </div>
            </div>
          </header>

          <template v-if="source.id === 'foxtrot'">
            <a v-if="itemsFor(source)[0]?.image && !imageFailed" class="comic-frame" :href="itemsFor(source)[0].url" target="_blank" rel="noopener noreferrer">
              <img :src="itemsFor(source)[0].image" :alt="'FoxTrot comic by Bill Amend: ' + itemsFor(source)[0].title" @error="imageFailed = true" />
            </a>
            <a v-else class="comic-frame comic-placeholder" :href="itemsFor(source)[0]?.url ?? source.site" target="_blank" rel="noopener noreferrer">
              <Icon name="comic" />
              <span>FoxTrot</span>
              <small>by Bill Amend</small>
            </a>
            <div class="comic-caption">
              <div>
                <p>{{ itemsFor(source)[0]?.title ?? 'The Sunday strip' }}</p>
                <span>{{ itemsFor(source)[0]?.date ? shortDate(itemsFor(source)[0].date) : 'New strips each Sunday' }}</span>
              </div>
              <a :href="itemsFor(source)[0]?.url ?? source.site" target="_blank" rel="noopener noreferrer">Read comic <Icon name="link" /></a>
            </div>
          </template>
          <template v-else-if="itemsFor(source).length">
            <ul class="headlines">
              <li v-for="item in itemsFor(source).slice(0, expandedSources.has(source.id) ? 10 : 4)" :key="item.url">
                <a :href="item.url" target="_blank" rel="noopener noreferrer">
                  <span class="headline-thumbnail" aria-hidden="true">
                    <img v-if="item.thumbnail && !failedThumbnails.has(item.thumbnail)" :src="item.thumbnail"
                      alt="" width="48" height="40" loading="lazy" decoding="async" referrerpolicy="no-referrer"
                      @error="failedThumbnails.add(item.thumbnail)" />
                    <Icon v-else name="news" />
                  </span>
                  <span>{{ item.title }}</span>
                  <time v-if="item.date" :datetime="item.date" :title="shortDate(item.date)">{{ relativeTime(item.date) }}</time>
                </a>
              </li>
            </ul>
            <div class="card-footer">
              <span v-if="snapshot?.feeds[source.id]?.stale">Last available headlines</span>
              <button v-if="itemsFor(source).length > 4" type="button" @click="toggleExpanded(source.id)">{{ expandedSources.has(source.id) ? 'Show fewer' : 'More headlines' }}</button>
              <a v-else :href="source.site" target="_blank" rel="noopener noreferrer">Visit source <Icon name="link" /></a>
            </div>
          </template>
          <div v-else-if="loading" class="skeleton" role="status" aria-label="Loading headlines">
            <span v-for="row in 4" :key="row"></span>
          </div>
          <div v-else class="card-empty">
            <p>Headlines unavailable.</p>
            <a :href="source.site" target="_blank" rel="noopener noreferrer">Visit {{ source.name }} <Icon name="link" /></a>
          </div>
        </article>
      </div>

      <div v-else class="empty">
        <Icon name="news" />
        <h3>No feeds here yet</h3>
        <button class="primary" type="button" @click="openManager"><Icon name="plus" /> Manage feeds</button>
      </div>
    </section>

    <footer class="footer"><span>The Daily Brief</span><span>Your layout and background are saved in this browser.</span></footer>
  </main>

  <dialog ref="manager" class="dialog" aria-labelledby="manager-title" @click.self="manager.close()">
    <div class="dialog-inner">
      <div class="dialog-head">
        <h2 id="manager-title">Manage feeds</h2>
        <button class="icon-button" type="button" aria-label="Close feed manager" @click="manager.close()"><Icon name="close" /></button>
      </div>
      <label class="search"><Icon name="search" /><input ref="searchInput" v-model="query" type="search" placeholder="Find a source" aria-label="Find a source" /></label>
      <div class="catalog">
        <label v-for="source in matching" :key="source.id" class="catalog-row">
          <span class="source-mark" :style="{ '--mark-color': source.color }" aria-hidden="true">{{ source.mark }}</span>
          <span class="catalog-name">{{ source.name }}<small>{{ source.id === 'gamedev' ? 'Games · Formerly Gamasutra' : source.category }}</small></span>
          <input type="checkbox" :checked="order.includes(source.id)" @change="toggleFeed(source.id)" />
        </label>
        <p v-if="!matching.length" class="no-results">No matching sources.</p>
      </div>
      <div class="dialog-footer"><span>{{ order.length }} followed</span><button class="primary" type="button" @click="manager.close()">Done</button></div>
    </div>
  </dialog>

  <dialog ref="themeDialog" class="dialog themes" aria-labelledby="theme-title" @click.self="themeDialog.close()">
    <div class="dialog-inner">
      <div class="dialog-head">
        <h2 id="theme-title">Choose a background</h2>
        <button class="icon-button" type="button" aria-label="Close backgrounds" @click="themeDialog.close()"><Icon name="close" /></button>
      </div>
      <div class="theme-list">
        <button v-for="item in themes" :key="item.id" type="button" class="theme-option" :aria-pressed="theme.id === item.id"
          @click="theme = item; themeDialog.close()">
          <img :src="'/home/wallpapers/' + item.id + '.webp'" alt="" />
          <span>{{ item.name }}</span><Icon v-if="theme.id === item.id" name="check" />
        </button>
      </div>
    </div>
  </dialog>
</template>
