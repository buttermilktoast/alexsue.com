import { onMounted, onUnmounted, ref } from 'vue'

const THEME_KEY = 'alexsue-theme'

export const THEMES = ['system', 'light', 'dark']

export function normalizeTheme(value) {
  return THEMES.includes(value) ? value : 'system'
}

/**
 * The value to stamp on <html>, or null to leave the document unmarked.
 * 'system' deliberately stamps nothing: the prefers-color-scheme rules in
 * style.css stay in charge, so the OS is tracked by the media query rather
 * than by a listener that has to re-run JavaScript to keep up.
 */
export function themeAttribute(preference) {
  const theme = normalizeTheme(preference)
  return theme === 'system' ? null : theme
}

export function applyTheme(root, preference) {
  const attribute = themeAttribute(preference)
  if (attribute) root.setAttribute('data-theme', attribute)
  else root.removeAttribute('data-theme')
}

export function useTheme() {
  const preference = ref('system')
  let media

  // The browser chrome tint has no media-query fallback that also honours an
  // explicit choice, so it is read back from whichever palette actually won.
  function syncThemeColor() {
    const meta = document.querySelector('meta[name="theme-color"]')
    if (!meta) return
    const background = getComputedStyle(document.documentElement)
      .getPropertyValue('--background')
      .trim()
    if (background) meta.setAttribute('content', background)
  }

  function apply() {
    applyTheme(document.documentElement, preference.value)
    syncThemeColor()
  }

  function setTheme(value) {
    preference.value = normalizeTheme(value)
    try {
      localStorage.setItem(THEME_KEY, preference.value)
    } catch { /* Storage may be disabled. */ }
    apply()
  }

  onMounted(() => {
    try {
      preference.value = normalizeTheme(localStorage.getItem(THEME_KEY))
    } catch { /* Storage may be disabled. */ }
    apply()
    media = window.matchMedia?.('(prefers-color-scheme: dark)')
    media?.addEventListener('change', syncThemeColor)
  })

  onUnmounted(() => media?.removeEventListener('change', syncThemeColor))

  return { preference, setTheme }
}
