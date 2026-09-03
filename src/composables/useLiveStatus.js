// Polls the S3 status object and exposes it as rows the Status section can render.
//
// Two rules matter here. Data is only shown while it is fresh enough to be
// true -- a missed push should read as unknown, not as a stale number
// presented confidently. And polling stops while the tab is hidden, so a page
// left open overnight neither burns requests nor wakes up showing yesterday.

import { computed, onMounted, onUnmounted, ref } from 'vue'

const MINUTE = 60 * 1000

export function useLiveStatus({ url, intervalMs, staleAfterMs }) {
  const payload = ref(null)
  const failed = ref(false)
  const now = ref(Date.now())

  let pollTimer = null
  let clockTimer = null
  let lastAttempt = 0
  let inFlight = null

  async function load() {
    if (!url || inFlight) return
    lastAttempt = Date.now()

    inFlight = fetch(url, { mode: 'cors' })
      .then((response) => {
        if (!response.ok) throw new Error(`status ${response.status}`)
        return response.json()
      })
      .then((json) => {
        payload.value = json
        failed.value = false
      })
      .catch(() => {
        // Keep the last good payload; the staleness check below retires it.
        failed.value = true
      })
      .finally(() => {
        inFlight = null
        now.value = Date.now()
      })

    return inFlight
  }

  function startPolling() {
    stopPolling()
    pollTimer = setInterval(load, intervalMs)
  }

  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = null
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      stopPolling()
      return
    }
    // Catch up on whatever was missed while hidden, then resume the cadence.
    if (Date.now() - lastAttempt >= intervalMs) load()
    startPolling()
  }

  onMounted(() => {
    load()
    startPolling()
    // Drives the age calculation so rows retire on their own between polls.
    clockTimer = setInterval(() => { now.value = Date.now() }, MINUTE)
    document.addEventListener('visibilitychange', onVisibilityChange)
  })

  onUnmounted(() => {
    stopPolling()
    if (clockTimer) clearInterval(clockTimer)
    document.removeEventListener('visibilitychange', onVisibilityChange)
  })

  const ageMs = computed(() => {
    const updated = Date.parse(payload.value?.updated ?? '')
    return Number.isNaN(updated) ? Infinity : now.value - updated
  })

  // Age is measured from the push timestamp, not the fetch: a successful
  // request for a six-hour-old object is still stale data.
  const isFresh = computed(() => payload.value !== null && ageMs.value < staleAfterMs)

  const rows = computed(() => buildRows(payload.value, now.value, staleAfterMs))

  return { rows, isFresh, failed, payload, refresh: load }
}

export function relativeTime(ms) {
  const minutes = Math.round(ms / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

// Age is measured from the payload's own push timestamp, not from when it was
// fetched: a successful request for a six-hour-old object is still stale data.
export function buildRows(payload, nowMs, staleAfterMs) {
  if (!payload?.updated) return []

  const updated = Date.parse(payload.updated)
  if (Number.isNaN(updated)) return []
  const age = nowMs - updated
  const fresh = age < staleAfterMs

  // Shown fresh or not: when data goes stale the health rows disappear but
  // this one stays and turns idle, so a broken pipeline reads as "last sync
  // 9h ago" rather than the rows silently vanishing with no explanation.
  const sync = {
    label: 'Last sync',
    value: relativeTime(age),
    title: new Date(updated).toLocaleString(),
    state: fresh ? 'ok' : 'idle'
  }
  if (!fresh) return [sync]

  const { steps, heart, workout } = payload
  const out = []

  if (steps?.value != null) {
    out.push({
      label: 'Steps',
      value: typeof steps.pctOfAverage === 'number'
        ? `${steps.value.toLocaleString()} · ${steps.pctOfAverage}% of avg`
        : steps.value.toLocaleString(),
      state: steps.state ?? 'idle'
    })
  }

  if (heart?.value != null) {
    out.push({
      label: 'Resting heart',
      value: heart.label ? `${heart.label} · ${heart.value} bpm` : `${heart.value} bpm`,
      state: heart.state ?? 'idle'
    })
  }

  if (workout?.type) {
    out.push({
      label: 'Last workout',
      value: `${workout.type}${workout.minutes ? ` · ${workout.minutes}m` : ''}`,
      state: 'ok'
    })
  }

  out.push(sync)
  return out
}
