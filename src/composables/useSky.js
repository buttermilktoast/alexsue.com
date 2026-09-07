import { computed, onMounted, onUnmounted, ref, unref } from 'vue'

// Sky-driven theming. The palette follows the sun over the fixed city in
// site.weather, computed here rather than fetched: the coordinates are known
// at build time, so the page can dress itself before the network answers and
// keeps dressing itself correctly if the network never does. Weather only
// tints an already-decided sky -- a thunderstorm at noon is a darker noon, not
// a night.

const RAD = Math.PI / 180
const DAY_MS = 86400000
const J1970 = 2440588
const J2000 = 2451545
const OBLIQUITY = 23.4397 * RAD

// The twilight band the gradient spans. Below nautical twilight the last glow
// is gone and every darker sky looks the same; above a few degrees the sun has
// cleared the horizon haze and the sky stops changing quickly.
const NIGHT_ALTITUDE = -12
const FULL_DAY_ALTITUDE = 6

// How dark weather may make a sky, as a fraction of the same moment's clear
// one. Greying moves a colour toward a grey of its own luminance, so it leaves
// luminance untouched and this single bound is the whole legibility guarantee:
// no sky is ever more than this far below the clear sky the palette was chosen
// against. Stated once here rather than hoped for from the numbers below.
const MIN_DIM = 0.62

// Where the light/dark palette flips. Expressed against the sun rather than
// against the rendered sky so that weather never flips it: dark text arriving
// on a storm-darkened backdrop would be a contrast bug, not a mood.
// 0.82 lands about a degree above the horizon -- just after actual sunrise.
const PALETTE_FLIP = 0.82

/**
 * Sun altitude in degrees above the horizon. The standard low-precision solar
 * position (NOAA, as popularised by SunCalc): good to a hundredth of a degree,
 * which is far past anything a background gradient can show.
 */
export function solarAltitude(date, latitude, longitude) {
  const days = date.getTime() / DAY_MS - 0.5 + J1970 - J2000
  const meanAnomaly = RAD * (357.5291 + 0.98560028 * days)
  const center = RAD * (1.9148 * Math.sin(meanAnomaly)
    + 0.02 * Math.sin(2 * meanAnomaly)
    + 0.0003 * Math.sin(3 * meanAnomaly))
  const eclipticLongitude = meanAnomaly + center + RAD * 102.9372 + Math.PI
  const declination = Math.asin(Math.sin(OBLIQUITY) * Math.sin(eclipticLongitude))
  const rightAscension = Math.atan2(
    Math.sin(eclipticLongitude) * Math.cos(OBLIQUITY),
    Math.cos(eclipticLongitude)
  )
  const hourAngle = RAD * (280.16 + 360.9856235 * days) + RAD * longitude - rightAscension
  const phi = RAD * latitude
  return Math.asin(
    Math.sin(phi) * Math.sin(declination)
    + Math.cos(phi) * Math.cos(declination) * Math.cos(hourAngle)
  ) / RAD
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value))
}

/**
 * How far through the dawn the sky is: 0 at night, 1 in full day. Smoothstepped
 * so neither end has a kink -- the gradient must not visibly lurch into place
 * at the moment the sun crosses -12 degrees.
 */
export function daylight(altitudeDegrees) {
  const t = clamp01((altitudeDegrees - NIGHT_ALTITUDE) / (FULL_DAY_ALTITUDE - NIGHT_ALTITUDE))
  return t * t * (3 - 2 * t)
}

export function paletteFor(daylightValue) {
  return daylightValue >= PALETTE_FLIP ? 'light' : 'dark'
}

// Skies at six points through the dawn, bottom-lit: the warm stop stays low in
// the frame the way a real horizon does, so the top of the page darkens long
// before the horizon does. Dusk is the same list read backwards -- the sun does
// not know which way it is going.
const SKY_ANCHORS = [
  { at: 0, top: '#04060e', middle: '#080d1b', bottom: '#101a2f' },
  { at: 0.34, top: '#080e22', middle: '#181a38', bottom: '#332349' },
  { at: 0.56, top: '#141c46', middle: '#3d2f61', bottom: '#8a4a63' },
  { at: 0.74, top: '#2f5697', middle: '#8a6a92', bottom: '#e59a68' },
  { at: 0.88, top: '#8fb6e2', middle: '#cdd5e0', bottom: '#f6d9b8' },
  { at: 1, top: '#bcd8f4', middle: '#dfeaf7', bottom: '#f4f6f8' }
]

const STOPS = ['top', 'middle', 'bottom']

export function hexToRgb(hex) {
  const value = parseInt(hex.slice(1), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

export function rgbToHex(rgb) {
  return `#${rgb.map((c) => Math.round(clamp01(c / 255) * 255).toString(16).padStart(2, '0')).join('')}`
}

export function luminance(rgb) {
  return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255
}

/**
 * Weather is applied as two scalars rather than a palette per condition: pull
 * the sky toward grey of its own lightness, then dim it. The dim floor is set
 * so that even a thunderstorm at noon leaves a backdrop the light palette can
 * still be read against.
 */
export function weatherEffect(code) {
  if (!Number.isFinite(code)) return { grey: 0, dim: 1 }
  if (code <= 1) return { grey: 0, dim: 1 }
  if (code === 2) return { grey: 0.15, dim: 0.96 }
  if (code === 3) return { grey: 0.45, dim: 0.82 }
  if ([45, 48].includes(code)) return { grey: 0.72, dim: 0.86 }
  if ([51, 53, 55, 56, 57].includes(code)) return { grey: 0.5, dim: 0.8 }
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { grey: 0.58, dim: 0.88 }
  if ([95, 96, 99].includes(code)) return { grey: 0.7, dim: MIN_DIM }
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { grey: 0.62, dim: 0.7 }
  return { grey: 0, dim: 1 }
}

// The contrast the faintest text on the page must still clear against whatever
// the sky composites onto the page background behind it. WCAG AA for small
// text; the site's own --muted only starts at 5.3:1 on bare background, so
// there is not much of the sky's own room to give away.
const CONTRAST_TARGET = 4.5

// The mask's strength where the smallest text actually sits -- the mono bar in
// the header, a little way down from the top edge. The very top of the sky is
// stronger than this, but nothing is written on it.
const MASK_AT_TEXT = 0.9

export function contrastRatio(a, b) {
  const channel = (c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const relative = (rgb) => 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2])
  const [bright, dark] = [relative(a), relative(b)].sort((x, y) => y - x)
  return (bright + 0.05) / (dark + 0.05)
}

/**
 * How much of the sky the page can afford to show: the largest opacity at which
 * the palette's own faintest text still clears CONTRAST_TARGET against it.
 *
 * Solved rather than tuned, and solved against the live tokens rather than a
 * copy of them, so the stylesheet stays the only place the palette is written
 * down. It is also the reason there is no ceiling on how bright a sky may get
 * before the palette flips: a sky too bright to sit behind light text simply
 * gets turned down until it isn't.
 */
export function skyStrength(sky, background, muted) {
  const [skyRgb, backgroundRgb, mutedRgb] = [sky, background, muted].map(hexToRgb)
  for (let strength = 1; strength > 0; strength -= 0.02) {
    const composite = mix(backgroundRgb, skyRgb, strength * MASK_AT_TEXT)
    if (contrastRatio(mutedRgb, composite) >= CONTRAST_TARGET) return Math.round(strength * 100) / 100
  }
  return 0
}

export function precipitationFor(code) {
  if (!Number.isFinite(code)) return null
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow'
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(code)) return 'rain'
  return null
}

function mix(a, b, t) {
  return a.map((channel, i) => channel + (b[i] - channel) * t)
}

/** The three gradient stops for a given point in the dawn, tinted by weather. */
export function skyStops(daylightValue, weatherCode) {
  const t = clamp01(daylightValue)
  const upper = SKY_ANCHORS.findIndex((anchor) => anchor.at >= t)
  const to = SKY_ANCHORS[upper <= 0 ? 1 : upper]
  const from = SKY_ANCHORS[upper <= 0 ? 0 : upper - 1]
  const span = to.at - from.at
  const local = span > 0 ? (t - from.at) / span : 0
  const { grey, dim } = weatherEffect(weatherCode)

  const bounded = Math.max(dim, MIN_DIM)

  return Object.fromEntries(STOPS.map((stop) => {
    const blended = mix(hexToRgb(from[stop]), hexToRgb(to[stop]), local)
    const flat = luminance(blended) * 255
    const greyed = mix(blended, [flat, flat, flat], grey)
    return [stop, rgbToHex(greyed.map((channel) => channel * bounded))]
  }))
}

/**
 * The next time the palette flips, used only so the pre-paint script in
 * index.html can stamp the right theme without re-deriving the sun. Scanned
 * coarsely and then bisected: a minute of slop costs at most one corrected
 * flash on a load that happens to land inside it.
 */
export function nextPaletteChange(date, latitude, longitude, from = null) {
  const start = date.getTime()
  const current = from ?? paletteFor(daylight(solarAltitude(date, latitude, longitude)))
  const at = (time) => paletteFor(daylight(solarAltitude(new Date(time), latitude, longitude)))

  const STEP = 10 * 60 * 1000
  for (let time = start + STEP; time <= start + DAY_MS + STEP; time += STEP) {
    if (at(time) === current) continue
    let low = time - STEP
    let high = time
    while (high - low > 30000) {
      const middle = low + (high - low) / 2
      if (at(middle) === current) low = middle
      else high = middle
    }
    return Math.round(high)
  }
  return start + DAY_MS
}

export function useSky(config, weatherCode) {
  const now = ref(Date.now())
  let timer

  function tick() {
    now.value = Date.now()
  }

  function onVisibilityChange() {
    clearInterval(timer)
    if (document.visibilityState === 'hidden') return
    tick()
    timer = setInterval(tick, 60000)
  }

  onMounted(() => {
    onVisibilityChange()
    document.addEventListener('visibilitychange', onVisibilityChange)
  })

  onUnmounted(() => {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisibilityChange)
  })

  const altitude = computed(() => solarAltitude(new Date(now.value), config.latitude, config.longitude))
  const light = computed(() => daylight(altitude.value))
  const palette = computed(() => paletteFor(light.value))
  const stops = computed(() => skyStops(light.value, unref(weatherCode)))
  const precipitation = computed(() => precipitationFor(unref(weatherCode)))
  const changesAt = computed(() => nextPaletteChange(
    new Date(now.value), config.latitude, config.longitude, palette.value
  ))

  return { daylight: light, palette, stops, precipitation, changesAt }
}
