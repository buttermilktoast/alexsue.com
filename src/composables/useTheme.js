import { onMounted, ref } from 'vue'

const THEME_KEY = 'alexsue-theme'
const SKY_KEY = 'alexsue-sky'

export const THEMES = ['sky', 'system', 'light', 'dark']
export const DEFAULT_THEME = 'sky'

export function normalizeTheme(value) {
  return THEMES.includes(value) ? value : DEFAULT_THEME
}

/**
 * The value to stamp on <html>, or null to leave the document unmarked.
 *
 * 'system' deliberately stamps nothing: the prefers-color-scheme rules in
 * style.css stay in charge, so the OS is tracked by the media query rather
 * than by a listener that has to re-run JavaScript to keep up. 'sky' stamps
 * whichever palette the sun has earned, so the existing light and dark tokens
 * stay the only palettes in the codebase -- the sky adds a backdrop, not a
 * third set of colours. Until the sun has been read it also stamps nothing and
 * falls through to the OS, which is the better guess of the two.
 */
export function themeAttribute(preference, skyPalette = null) {
  const theme = normalizeTheme(preference)
  if (theme === 'system') return null
  if (theme === 'sky') return skyPalette === 'light' || skyPalette === 'dark' ? skyPalette : null
  return theme
}

export function applyTheme(root, preference, skyPalette = null) {
  const attribute = themeAttribute(preference, skyPalette)
  if (attribute) root.setAttribute('data-theme', attribute)
  else root.removeAttribute('data-theme')
}

// Theme state is a document-wide fact, so it is held once at module scope: the
// toggle and the backdrop both read it and must not drift apart.
const preference = ref(DEFAULT_THEME)
const sky = ref(null)
let started = false

function syncThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]')
  if (!meta) return
  // The browser chrome tint has no media-query fallback that also honours an
  // explicit choice, so it is read back from whichever palette actually won --
  // except under the sky, where the top of the gradient is what fills the gap
  // above the page.
  const tint = preference.value === 'sky' && sky.value?.color
    ? sky.value.color
    : getComputedStyle(document.documentElement).getPropertyValue('--background').trim()
  if (tint) meta.setAttribute('content', tint)
}

function apply() {
  applyTheme(document.documentElement, preference.value, sky.value?.palette ?? null)
  syncThemeColor()
}

/**
 * Hand the resolved sky to the theme. The flip time rides along so the
 * pre-paint script in index.html can stamp the right palette on the next visit
 * without re-deriving the sun before the module has loaded.
 */
export function setSky(value) {
  sky.value = value
  if (value?.palette && Number.isFinite(value.changesAt)) {
    try {
      localStorage.setItem(SKY_KEY, JSON.stringify({ palette: value.palette, until: value.changesAt }))
    } catch { /* Storage may be disabled. */ }
  }
  apply()
}

export function useTheme() {
  function setTheme(value) {
    preference.value = normalizeTheme(value)
    try {
      localStorage.setItem(THEME_KEY, preference.value)
    } catch { /* Storage may be disabled. */ }
    apply()
  }

  onMounted(() => {
    if (started) return
    started = true
    try {
      preference.value = normalizeTheme(localStorage.getItem(THEME_KEY))
    } catch { /* Storage may be disabled. */ }
    apply()
    // Kept for the lifetime of the document rather than torn down with any one
    // component: every component that reads the theme shares this listener.
    window.matchMedia?.('(prefers-color-scheme: dark)')?.addEventListener('change', syncThemeColor)
  })

  return { preference, setTheme }
}
