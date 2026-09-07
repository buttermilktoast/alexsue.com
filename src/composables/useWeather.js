import { computed, onMounted, onUnmounted, ref } from 'vue'

const UNIT_KEY = 'alexsue-weather-unit'

// One reading serves both the conditions section and the sky backdrop, so the
// composable is created once in App.vue and handed down rather than called
// twice -- two calls would mean two polls of Open-Meteo for the same number.
export const weatherKey = Symbol('weather')

export function weatherUrl(config) {
  const params = new URLSearchParams({
    latitude: config.latitude,
    longitude: config.longitude,
    timezone: config.timezone,
    current: 'temperature_2m,apparent_temperature,weather_code,is_day',
    daily: 'sunrise,sunset',
    temperature_unit: 'celsius',
    timeformat: 'unixtime',
    forecast_days: '2'
  })
  return `https://api.open-meteo.com/v1/forecast?${params}`
}

export function formatTemperature(celsius, unit) {
  if (!Number.isFinite(celsius)) return '—'
  return `${Math.round(unit === 'F' ? celsius * 9 / 5 + 32 : celsius)}°${unit}`
}

export function describeWeather(code, isDay) {
  if (code === 0) return isDay ? 'Clear skies' : 'Clear night'
  if (code === 1) return 'Mostly clear'
  if (code === 2) return 'Partly cloudy'
  if (code === 3) return 'Overcast'
  if ([45, 48].includes(code)) return 'Foggy'
  if ([51, 53, 55].includes(code)) return 'Drizzle'
  if ([56, 57].includes(code)) return 'Freezing drizzle'
  if ([61, 63, 65].includes(code)) return 'Rain'
  if ([66, 67].includes(code)) return 'Freezing rain'
  if ([71, 73, 75, 77].includes(code)) return 'Snow'
  if ([80, 81, 82].includes(code)) return 'Rain showers'
  if ([85, 86].includes(code)) return 'Snow showers'
  if ([95, 96, 99].includes(code)) return 'Thunderstorms'
  return 'Conditions unavailable'
}

export function currentWeather(payload, now, staleAfterMs) {
  const current = payload?.current
  if (!Number.isFinite(current?.time) || !Number.isFinite(current?.temperature_2m)) return null
  const age = now - current.time * 1000
  if (age >= staleAfterMs || age < -15 * 60 * 1000) return null
  return current
}

export function nextSunEvent(daily, now) {
  return ['sunrise', 'sunset']
    .flatMap((kind) => (Array.isArray(daily?.[kind]) ? daily[kind] : [])
      .filter((time) => Number.isFinite(time) && time * 1000 > now)
      .map((time) => ({ label: kind === 'sunrise' ? 'Sunrise' : 'Sunset', time: time * 1000 })))
    .sort((a, b) => a.time - b.time)[0] ?? null
}

export function useWeather(config) {
  const payload = ref(null)
  const loading = ref(true)
  const now = ref(Date.now())
  const unit = ref(config.defaultUnit)
  let timer
  let controller
  let disposed = false
  let lastAttempt = 0

  function setUnit(value) {
    if (value !== 'C' && value !== 'F') return
    unit.value = value
    try { localStorage.setItem(UNIT_KEY, value) } catch { /* Storage may be disabled. */ }
  }

  async function refresh() {
    if (controller || disposed) return
    lastAttempt = Date.now()
    controller = new AbortController()
    const timeout = setTimeout(() => controller?.abort(), 10000)
    try {
      const response = await fetch(weatherUrl(config), {
        signal: controller.signal,
        credentials: 'omit',
        referrerPolicy: 'no-referrer'
      })
      if (!response.ok) throw new Error(`weather ${response.status}`)
      const data = await response.json()
      if (!currentWeather(data, Date.now(), config.staleAfterMs)) throw new Error('Invalid weather data')
      if (!disposed) payload.value = data
    } catch {
      // Retain a recent reading on transient errors; old readings expire below.
    } finally {
      clearTimeout(timeout)
      controller = null
      if (!disposed) {
        loading.value = false
        now.value = Date.now()
      }
    }
  }

  function tick() {
    now.value = Date.now()
    if (now.value - lastAttempt >= config.intervalMs) refresh()
  }

  function onVisibilityChange() {
    clearInterval(timer)
    if (document.visibilityState === 'hidden') return
    tick()
    timer = setInterval(tick, 60000)
  }

  onMounted(() => {
    try {
      const saved = localStorage.getItem(UNIT_KEY)
      if (saved === 'C' || saved === 'F') unit.value = saved
    } catch { /* Use the configured default when storage is unavailable. */ }
    onVisibilityChange()
    document.addEventListener('visibilitychange', onVisibilityChange)
  })

  onUnmounted(() => {
    disposed = true
    clearInterval(timer)
    controller?.abort()
    document.removeEventListener('visibilitychange', onVisibilityChange)
  })

  const current = computed(() => currentWeather(payload.value, now.value, config.staleAfterMs))
  const sunEvent = computed(() => current.value ? nextSunEvent(payload.value?.daily, now.value) : null)
  return { current, sunEvent, loading, unit, setUnit }
}
