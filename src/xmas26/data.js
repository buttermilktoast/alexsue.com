// The family's year, from the MerryRoll API (merryroll repo: api/README.md, SPEC §4.2).
// No DOM dependencies, so `node --test` covers these helpers.
//
// GET /card is public and returns { recipient, card, photos }:
// - recipient: { name, message } when the link carries a known personal code (?to=auntiesu), else
//   null. The family adds people in the app; the code only personalises the page, which is public.
// - photos: every pick in the family collection, public fields only. Being in the collection is
//   being on this page; there's no publish step.
// - A video pick (type "video", MerryRoll SPEC §3.6) also has `video`, a ≤ 30 s .mp4, and `duration`
//   in seconds. Its url/thumb are a still frame, so the tree and collage treat it like any photo.
// - card.cardFront / card.cardBack: the printed card's images, { url, w, h } or null. The family
//   sets them from the app's "Your card" screen.
// - reactions: the emoji keys visitors can tap under a photo (["heart", …]), or null when the family
//   has turned them off. Each photo then carries its counts, { heart: 3 }. POST /reactions adds one.
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
      viewKey: text(p.id) ? `id:${text(p.id)}` : `url:${p.url.split(/[?#]/, 1)[0]}`,
      url: p.url,
      thumb: httpsUrl(p.thumb) ? p.thumb : p.url,
      w: p.w,
      h: p.h,
      takenAt: text(p.takenAt) || null,
      place: text(p.place),
      caption: text(p.caption),
      addedBy: text(p.addedBy),
      video: p.type === 'video' && httpsUrl(p.video) ? p.video : null,
      duration: p.type === 'video' && Number.isFinite(p.duration) && p.duration > 0 ? p.duration : null,
      reactions: reactionCountsFromApi(p.reactions),
    }))
    .map((p, i) => ({ p, i, day: dayOf(p.takenAt) }))
    .sort((a, b) => (a.day && b.day ? a.day - b.day || a.i - b.i : a.day ? -1 : b.day ? 1 : a.i - b.i))
    .map(({ p }) => p)
}

const PHOTO_HISTORY_KEY = `xmas${YEAR % 100}-viewed-photos-v1`

/** First visit sets the baseline. After that, only opening a new pick marks it viewed. */
export function createPhotoHistory(picks, getStorage = () => globalThis.localStorage) {
  const read = () => {
    try {
      const stored = JSON.parse(getStorage()?.getItem(PHOTO_HISTORY_KEY) ?? 'null')
      if (Array.isArray(stored)) return new Set(stored.filter((key) => typeof key === 'string' && key))
    } catch { /* Unavailable or invalid history is treated like a first visit. */ }
    return null
  }
  const saved = read()
  const viewed = saved ?? new Set(picks.map((p) => p.viewKey).filter(Boolean))
  const write = () => {
    try {
      const keys = new Set([...(read() ?? []), ...viewed])
      getStorage()?.setItem(PHOTO_HISTORY_KEY, JSON.stringify([...keys]))
    } catch { /* Keep the history for this visit even when storage is blocked. */ }
  }
  if (!saved && viewed.size) write()

  const isNew = (photo) => Boolean(photo.viewKey && !viewed.has(photo.viewKey))
  return {
    isNew,
    markViewed(photo) {
      if (!isNew(photo)) return false
      viewed.add(photo.viewKey)
      write()
      return true
    },
  }
}

/** "0:07", "0:30": a video's length for its badge. */
export function durationText(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
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

// ---------------------------------------------------------------------------------------------
// Emoji reactions: tap one under a photo, see how many people did. Anonymous counts, no comments.
// Keep the keys in step with REACTIONS in the merryroll API (api/src/lib.mjs). Only warm, family-safe
// emoji, mostly faces, and nothing newer than Emoji 14 (iOS 15.4), so every phone has the glyph.
// ---------------------------------------------------------------------------------------------
export const REACTION_EMOJI = Object.freeze({
  heart: '❤️', laugh: '😂', love: '😍', aww: '🥹', clap: '👏', tree: '🎄',
  // The "more" picker, in its order: faces, then hearts and hands, then the season.
  smile: '😊', grin: '😄', rofl: '🤣', adore: '🥰', kiss: '😘', hug: '🤗', starstruck: '🤩',
  wow: '😮', halo: '😇', cool: '😎', party: '🥳', yum: '😋', wink: '😉', tear: '🥲',
  hearthands: '🫶', sparkleheart: '💖', hearts: '💕', thumbsup: '👍', hooray: '🙌', thanks: '🙏',
  sparkles: '✨', tada: '🎉', star: '🌟', gift: '🎁', snowman: '⛄', snowflake: '❄️', santa: '🎅', cookie: '🍪',
})
export const REACTION_NAMES = Object.freeze({
  heart: 'Heart', laugh: 'Laughing', love: 'Heart eyes', aww: 'Aww', clap: 'Clapping', tree: 'Christmas tree',
  smile: 'Smiling', grin: 'Big smile', rofl: 'Rolling with laughter', adore: 'Smiling with hearts', kiss: 'Blowing a kiss',
  hug: 'Hug', starstruck: 'Star-struck', wow: 'Wow', halo: 'Angel', cool: 'Cool', party: 'Party', yum: 'Yum', wink: 'Wink',
  tear: 'Smiling with a tear', hearthands: 'Heart hands', sparkleheart: 'Sparkling heart', hearts: 'Two hearts',
  thumbsup: 'Thumbs up', hooray: 'Hooray', thanks: 'Thank you', sparkles: 'Sparkles', tada: 'Celebrate', star: 'Star',
  gift: 'Present', snowman: 'Snowman', snowflake: 'Snowflake', santa: 'Santa', cookie: 'Cookie',
})
/** The row under every photo. The rest of what the API offers waits behind its "more" chip. */
export const QUICK_REACTIONS = Object.freeze(['heart', 'laugh', 'love', 'aww', 'clap', 'tree'])

/**
 * The emoji the page offers, in the API's order. Empty when the family has turned reactions off
 * (null) or the API predates them (missing), so the row simply doesn't appear.
 */
export function reactionsFromApi(list) {
  if (!Array.isArray(list)) return []
  return [...new Set(list.filter((k) => typeof k === 'string' && Object.hasOwn(REACTION_EMOJI, k)))]
}

/** The API's list split into the always-shown row and the picker, each in the API's order. */
export function splitReactions(keys) {
  return { quick: keys.filter((k) => QUICK_REACTIONS.includes(k)), more: keys.filter((k) => !QUICK_REACTIONS.includes(k)) }
}

/**
 * What the "more" chip shows for one photo, so the row keeps one width on a phone however many
 * emoji are in use: the (up to) two picker emoji with the most taps, and all the picker's taps added up.
 */
export function moreSummary(more, counts = {}, max = 2) {
  const used = more.filter((k) => counts[k] > 0)
  const top = used.map((k, i) => ({ k, i, n: counts[k] })).sort((a, b) => b.n - a.n || a.i - b.i).slice(0, max).map(({ k }) => k)
  return { top, total: used.reduce((sum, k) => sum + counts[k], 0) }
}

/** One photo's counts, `{ heart: 3 }`: known emoji with whole counts above zero only. */
export function reactionCountsFromApi(r) {
  const out = {}
  if (!r || typeof r !== 'object') return out
  for (const k of Object.keys(REACTION_EMOJI)) if (Number.isInteger(r[k]) && r[k] > 0) out[k] = r[k]
  return out
}

const REACTED_KEY = `xmas${YEAR % 100}-reactions-v1`

/** Which emoji this browser has tapped on each photo, so a second tap takes it back. */
export function createReactionMemory(getStorage = () => globalThis.localStorage) {
  let mine = {}
  try {
    const stored = JSON.parse(getStorage()?.getItem(REACTED_KEY) ?? 'null')
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) mine = stored
  } catch { /* Unavailable or invalid: start fresh. */ }
  const list = (id) => (Array.isArray(mine[id]) ? mine[id] : [])
  return {
    has: (id, key) => list(id).includes(key),
    /** Whether this browser has a reaction on any photo: the "Tap to react" line goes once it has. */
    any: () => Object.values(mine).some((keys) => Array.isArray(keys) && keys.length > 0),
    set(id, key, on) {
      const keys = new Set(list(id))
      if (on) keys.add(key); else keys.delete(key)
      if (keys.size) mine[id] = [...keys]; else delete mine[id]
      try { getStorage()?.setItem(REACTED_KEY, JSON.stringify(mine)) } catch { /* Remembered for this visit only. */ }
    },
  }
}

/** Adds (on) or takes back (off) one emoji on a photo. Resolves to that photo's counts from the API. */
export async function postReaction({ pickId, emoji, on, to = null, base = API_BASE, fetchImpl = fetch }) {
  const res = await fetchImpl(`${base}/reactions`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pickId, emoji, on, ...(to ? { to } : {}) }),
  })
  if (!res.ok) throw new Error(`POST /reactions ${res.status}`)
  return reactionCountsFromApi((await res.json())?.reactions)
}
