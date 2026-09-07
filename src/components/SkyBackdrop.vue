<script setup>
import { computed, ref, watchEffect } from 'vue'
import { skyStrength } from '../composables/useSky.js'

const props = defineProps({
  stops: { type: Object, required: true },
  precipitation: { type: String, default: null }
})

// How much of the sky the page can show is a question about the palette, so it
// is asked of the palette: the tokens are read back from the document after the
// theme has been stamped rather than copied into JavaScript, keeping the
// stylesheet the only place the colours are written down.
const strength = ref(1)
watchEffect(() => {
  const tokens = getComputedStyle(document.documentElement)
  const read = (name) => tokens.getPropertyValue(name).trim()
  strength.value = skyStrength(props.stops.top, read('--background'), read('--muted'))
}, { flush: 'post' })

const gradient = computed(() => ({
  opacity: strength.value,
  background: `linear-gradient(to bottom, ${props.stops.top} 0%, ${props.stops.middle} 34%, ${props.stops.bottom} 68%)`
}))
</script>

<template>
  <div class="sky" aria-hidden="true">
    <div class="gradient" :style="gradient"></div>
    <div v-if="precipitation" class="precipitation" :class="precipitation"></div>
  </div>
</template>

<style scoped>
/* The sky sits over the page background rather than replacing it, and fades
   down the viewport. The top of the page is mostly sky; by the time the content
   starts it is a tint, so no text is asked to hold contrast against a horizon.
   The gradient is compressed into the upper viewport for the same reason -- a
   horizon stop pinned at 100% is a horizon nobody ever sees. */
.sky {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
  -webkit-mask-image: linear-gradient(
    to bottom,
    rgb(0 0 0 / 100%) 0,
    rgb(0 0 0 / 72%) 26vh,
    rgb(0 0 0 / 40%) 62vh,
    rgb(0 0 0 / 22%) 100%
  );
  mask-image: linear-gradient(
    to bottom,
    rgb(0 0 0 / 100%) 0,
    rgb(0 0 0 / 72%) 26vh,
    rgb(0 0 0 / 40%) 62vh,
    rgb(0 0 0 / 22%) 100%
  );
}

.gradient {
  position: absolute;
  inset: 0;
  /* One palette change per dawn is worth easing rather than cutting. */
  transition: opacity 1200ms ease;
}

/* Falling weather is drawn at its own strength rather than the gradient's: a
   drop is thin and sparse where the wash is broad, so it costs the text far
   less contrast, and rain matters most in daylight -- exactly when the wash has
   been turned down. Two layers at different scales and speeds so the fall reads
   as depth rather than as one sliding texture. Each tile is much wider than the
   drop in it, which is what keeps the drops separate instead of running
   together into bands, and each animation travels exactly one tile, so the loop
   has no seam. The global prefers-reduced-motion rule in style.css freezes them
   into a still texture rather than removing them. */
.precipitation {
  position: absolute;
  inset: 0;
  opacity: 0.6;
}

.precipitation::before,
.precipitation::after {
  content: '';
  position: absolute;
  inset: -30%;
  transform: rotate(7deg);
}

.rain::before,
.rain::after {
  background-image: radial-gradient(0.9px 9px at 50% 50%, var(--sky-drop) 0 55%, transparent 100%);
  background-size: 30px 62px;
  animation: sky-rain-near 0.75s linear infinite;
}

.rain::before {
  background-image: radial-gradient(0.7px 6px at 50% 50%, var(--sky-drop) 0 55%, transparent 100%);
  background-size: 23px 47px;
  opacity: 0.55;
  animation: sky-rain-far 1.15s linear infinite;
}

.snow::before,
.snow::after {
  background-image: radial-gradient(circle at 50% 50%, var(--sky-drop) 0 1.4px, transparent 1.9px);
  background-size: 46px 46px;
  animation: sky-snow-near 7s linear infinite;
}

.snow::before {
  background-size: 31px 31px;
  opacity: 0.55;
  animation: sky-snow-far 11s linear infinite;
}

@keyframes sky-rain-near { to { background-position: 0 62px; } }
@keyframes sky-rain-far { to { background-position: 0 47px; } }
@keyframes sky-snow-near { to { background-position: 12px 46px; } }
@keyframes sky-snow-far { to { background-position: -8px 31px; } }
</style>
