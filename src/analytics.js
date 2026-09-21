// The measurement ID is public; only the deployed site should send visits.
export function initAnalytics() {
  const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID?.trim()
  if (
    !import.meta.env.PROD ||
    !['alexsue.com', 'www.alexsue.com'].includes(window.location.hostname) ||
    !/^G-[A-Z0-9]+$/.test(measurementId || '')
  ) return

  window.dataLayer = window.dataLayer || []
  window.gtag = function () {
    window.dataLayer.push(arguments)
  }
  window.gtag('js', new Date())
  // config sends the initial page_view. No separate page-view event is needed.
  window.gtag('config', measurementId)

  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`
  document.head.appendChild(script)
}
