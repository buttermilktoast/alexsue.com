// The family's year, from the MerryRoll API (merryroll repo: api/README.md, SPEC §4.2).
// Pure functions, no DOM, so `node --test` covers them.
//
// GET /card is public and returns { recipient, card, photos }:
// - recipient: { name, message } when the link carries a known personal code (?to=auntiesu), else
//   null. The family adds people in the app; the code only personalises the page, which is public.
// - photos: every pick in the family collection, public fields only. Being in the collection is
//   being on this page; there's no publish step.
// - card.cardFront / card.cardBack: the printed card's images, { url, w, h } or null. The family
//   sets them from the app's "Your card" screen.
// Until real picks or card images exist, the page shows its painted samples and says so.

// Not a secret: the page has to call it, and the admin routes need the family key.
export const API_BASE =
  import.meta.env?.VITE_MERRYROLL_API || 'https://51zm7dsir1.execute-api.us-east-1.amazonaws.com'

export const YEAR = 2026

/**
 * How many photos the tree holds well (merryroll SPEC §3.6). A soft limit: the page shows every pick.
 * - best: up to here each polaroid is big enough to recognise on a phone.
 * - max: here the polaroids reach their smallest size; past it the tree turns into a wall of tiles
 *   (checked by rendering 31, 50, 75, 100 and 150 photos, Nov 2026).
 * The MerryRoll app uses the same numbers to warn before the family shares more than this.
 */
export const TREE_PHOTOS = Object.freeze({ best: 60, max: 80 })

/** Fetches the card, giving up after `timeoutMs` so a slow API never strands the page on its loader. */
export async function fetchCard({ base = API_BASE, fetchImpl = fetch, timeoutMs = 8000, to = null } = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetchImpl(`${base}/card${to ? `?to=${encodeURIComponent(to)}` : ''}`, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`GET /card ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

const httpsUrl = (u) => typeof u === 'string' && u.startsWith('https://')
const text = (s) => (typeof s === 'string' ? s.trim() : '')

/** "2026-07-12T18:03:00-10:00" → that calendar day, local midnight. The time zone it was taken in wins. */
export function dayOf(takenAt) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(takenAt ?? ''))
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return new Date(y, mo - 1, d)
}

/**
 * The collection's picks as the page uses them: only photos it can show (https URLs), oldest first,
 * undated ones last.
 */
export function photosFromApi(list) {
  if (!Array.isArray(list)) return []
  return list
    .filter((p) => p && httpsUrl(p.url))
    .map((p, i) => ({
      id: text(p.id) || `p${i}`,
      url: p.url,
      thumb: httpsUrl(p.thumb) ? p.thumb : p.url,
      w: p.w,
      h: p.h,
      takenAt: text(p.takenAt) || null,
      place: text(p.place),
      caption: text(p.caption),
      addedBy: text(p.addedBy),
    }))
    .map((p, i) => ({ p, i, day: dayOf(p.takenAt) }))
    .sort((a, b) => (a.day && b.day ? a.day - b.day || a.i - b.i : a.day ? -1 : b.day ? 1 : a.i - b.i))
    .map(({ p }) => p)
}

/** A typed name, tidied the way the API stores it: one line, single spaces, 40 characters at most. */
export function cleanName(s) {
  return (typeof s === 'string' ? s : '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40).trim()
}

/** The personal code in a link's query string (?to=auntiesu), or null if there isn't a usable one. */
export function codeFromSearch(search) {
  const code = (new URLSearchParams(search ?? '').get('to') ?? '').trim().toLowerCase()
  return /^[a-z0-9-]{2,24}$/.test(code) ? code : null
}

/** Who the link is for: { name, message }, or null when the code isn't known. The note keeps its line breaks. */
export function recipientFromApi(r) {
  const name = cleanName(r?.name)
  if (!name) return null
  return { name, message: text(r.message).slice(0, 500) }
}

/** The address to report to analytics: the same page with the personal code taken out (MerryRoll PRIVACY P7). */
export function withoutCode(href) {
  const url = new URL(href)
  url.searchParams.delete('to')
  return url.toString()
}

/** The card image URLs, or null for a side that isn't set. */
export function cardFaces(card) {
  const face = (f) => (f && httpsUrl(f.url) ? f.url : null)
  return { front: face(card?.cardFront), back: face(card?.cardBack) }
}

/** The small "Preview" label while any of the page is still sample content, or null once it's all real. */
export function previewLabel({ realPhotos, realFront, realBack }) {
  const sampleCard = !realFront || !realBack
  if (realPhotos && !sampleCard) return null
  if (!realPhotos && sampleCard) return 'Preview · sample card & photos'
  return realPhotos ? 'Preview · sample card' : 'Preview · sample photos'
}
