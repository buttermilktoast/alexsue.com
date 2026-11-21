// node --test src/xmas26/data.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dayOf, photosFromApi, createPhotoHistory, cardFaces, previewLabel, fetchCard, cleanName, codeFromSearch, recipientFromApi, withoutCode, durationText } from './data.js'

test('dayOf keeps the calendar day the photo was taken, in its own time zone', () => {
  const d = dayOf('2026-07-12T23:30:00-10:00')
  assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate()], [2026, 6, 12])
  assert.equal(dayOf('2026-02-01').getMonth(), 1)
  for (const bad of [null, undefined, '', 'yesterday', '2026-13-01', '2026-00-10']) assert.equal(dayOf(bad), null, String(bad))
})

test('photosFromApi: showable photos only, oldest first, undated last', () => {
  const photos = photosFromApi([
    { id: 'p_c', url: 'https://cdn/c.jpg', thumb: 'https://cdn/c-t.jpg', takenAt: '2026-09-01T10:00:00-10:00', place: ' Kailua ', addedBy: 'Laura' },
    { id: 'p_none', url: 'https://cdn/n.jpg' },
    { id: 'p_a', url: 'https://cdn/a.jpg', takenAt: '2026-01-01T09:00:00-10:00', caption: 'New Year swim', fingerprint: 'secret' },
    { id: 'p_bad', url: 'javascript:alert(1)', takenAt: '2026-03-01' },
    null,
  ])
  assert.deepEqual(photos.map((p) => p.id), ['p_a', 'p_c', 'p_none'])
  assert.equal(photos[0].thumb, 'https://cdn/a.jpg')        // no thumb: fall back to the full photo
  assert.equal(photos[1].place, 'Kailua')
  assert.equal(photos[2].takenAt, null)
  assert.ok(!('fingerprint' in photos[0]))
  assert.deepEqual(photosFromApi(undefined), [])
})

test('return visits flag only new picks and keep the badge until each is opened', () => {
  const [old, video, newPhoto] = photosFromApi([
    { id: 'old', url: 'https://cdn/old.jpg' },
    { id: 'new-video', type: 'video', url: 'https://cdn/poster.jpg', video: 'https://cdn/clip.mp4' },
    { id: 'new-photo', url: 'https://cdn/new.jpg' },
  ])
  const store = new Map()
  const getStorage = () => ({ getItem: (key) => store.get(key), setItem: (key, value) => store.set(key, value) })
  assert.equal(createPhotoHistory([old], getStorage).isNew(old), false)

  const picks = [video, old, newPhoto]
  const returnVisit = createPhotoHistory(picks, getStorage)
  const otherTab = createPhotoHistory(picks, getStorage)
  assert.deepEqual(picks.map(returnVisit.isNew), [true, false, true])
  assert.deepEqual(picks.map(createPhotoHistory(picks, getStorage).isNew), [true, false, true])
  assert.equal(returnVisit.markViewed(video), true)
  assert.equal(returnVisit.isNew(video), false)
  assert.equal(returnVisit.markViewed(video), false)
  assert.equal(otherTab.markViewed(newPhoto), true)
  assert.deepEqual(picks.map(createPhotoHistory(picks, getStorage).isNew), [false, false, false])
})

test('legacy photo keys survive a reordered list and refreshed signed URLs', () => {
  const [first, second] = photosFromApi([{ url: 'https://cdn/first.jpg?a=1' }, { url: 'https://cdn/second.jpg' }])
  const [secondAgain, firstAgain] = photosFromApi([{ url: second.url }, { url: 'https://cdn/first.jpg?a=2' }])
  assert.equal(firstAgain.viewKey, first.viewKey)
  assert.equal(secondAgain.viewKey, second.viewKey)
  assert.notEqual(first.viewKey, second.viewKey)
})

test('sample photos never set a baseline and unavailable storage does not stop the card', () => {
  const sample = { id: 's1' }
  let writes = 0
  const store = () => ({ getItem: () => '{invalid', setItem: () => { writes++ } })
  const preview = createPhotoHistory([sample], store)
  assert.equal(preview.isNew(sample), false)
  assert.equal(preview.markViewed(sample), false)
  assert.equal(writes, 0)

  const unavailable = () => { throw new Error('Storage blocked') }
  const [photo] = photosFromApi([{ id: 'one', url: 'https://cdn/one.jpg' }])
  assert.equal(createPhotoHistory([photo], unavailable).isNew(photo), false)
})

test('cardFaces: https images only, null for a missing side', () => {
  assert.deepEqual(cardFaces(null), { front: null, back: null })
  assert.deepEqual(
    cardFaces({ cardFront: { url: 'https://cdn/front.jpg', w: 2400, h: 1714 }, cardBack: { url: 'http://insecure/back.jpg' } }),
    { front: 'https://cdn/front.jpg', back: null },
  )
})

test('previewLabel says what is still sample content, and nothing once all of it is real', () => {
  assert.equal(previewLabel({ realPhotos: false, realFront: false, realBack: false }), 'Preview · sample card & photos')
  assert.equal(previewLabel({ realPhotos: true, realFront: true, realBack: false }), 'Preview · sample card')
  assert.equal(previewLabel({ realPhotos: false, realFront: true, realBack: true }), 'Preview · sample photos')
  assert.equal(previewLabel({ realPhotos: true, realFront: true, realBack: true }), null)
})

test('fetchCard returns the JSON, and throws on an error status or a hang', async () => {
  const ok = await fetchCard({ base: 'https://api', fetchImpl: async (url) => ({ ok: url === 'https://api/card', json: async () => ({ photos: [] }) }) })
  assert.deepEqual(ok, { photos: [] })
  await assert.rejects(fetchCard({ base: 'https://api', fetchImpl: async () => ({ ok: false, status: 500 }) }), /500/)
  const hang = (_, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))))
  await assert.rejects(fetchCard({ base: 'https://api', fetchImpl: hang, timeoutMs: 20 }), /aborted/)
})

test('cleanName tidies a typed name and caps it at 40 characters', () => {
  assert.equal(cleanName('  Auntie\n  Mei '), 'Auntie Mei')
  assert.equal(cleanName('x'.repeat(200)).length, 40)
  assert.equal(cleanName('   '), '')
  assert.equal(cleanName(null), '')
})

test('codeFromSearch: a usable personal code, or null', () => {
  assert.equal(codeFromSearch('?to=auntiesu'), 'auntiesu')
  assert.equal(codeFromSearch('?src=qr&to=%20Sues%20'), 'sues')
  for (const none of ['', '?to=', '?to=a', '?src=qr', '?to=fam%23alexsue', '?to=../x', undefined]) assert.equal(codeFromSearch(none), null, String(none))
})

test('recipientFromApi: a name is needed, the note keeps its line breaks', () => {
  assert.deepEqual(recipientFromApi({ code: 'auntiesu', name: ' Auntie Sue ', message: ' See you\nat New Year! ' }), { name: 'Auntie Sue', message: 'See you\nat New Year!' })
  assert.deepEqual(recipientFromApi({ name: 'Tutu' }), { name: 'Tutu', message: '' })
  for (const none of [null, undefined, {}, { name: '  ', message: 'hi' }]) assert.equal(recipientFromApi(none), null)
})

test('fetchCard sends the personal code when there is one', async () => {
  const seen = []
  const fetchImpl = async (url) => { seen.push(url); return { ok: true, json: async () => ({}) } }
  await fetchCard({ base: 'https://api', fetchImpl })
  await fetchCard({ base: 'https://api', fetchImpl, to: 'auntiesu' })
  assert.deepEqual(seen, ['https://api/card', 'https://api/card?to=auntiesu'])
})

test('withoutCode drops only the personal code', () => {
  assert.equal(withoutCode('https://alexsue.com/xmas26/?to=auntiesu'), 'https://alexsue.com/xmas26/')
  assert.equal(withoutCode('https://alexsue.com/xmas26/?src=qr&to=sues'), 'https://alexsue.com/xmas26/?src=qr')
})

test('photosFromApi: a video pick keeps its clip and length; photos and bad clips get none', () => {
  const [v, p, bad] = photosFromApi([
    { id: 'v', type: 'video', url: 'https://cdn/full/v.jpg', thumb: 'https://cdn/thumb/v.jpg', video: 'https://cdn/video/v.mp4', duration: 29.97, takenAt: '2026-01-01T00:00:00Z' },
    { id: 'p', url: 'https://cdn/full/p.jpg', video: 'https://cdn/video/p.mp4', duration: 4, takenAt: '2026-02-01T00:00:00Z' },
    { id: 'b', type: 'video', url: 'https://cdn/full/b.jpg', video: 'http://cdn/video/b.mp4', duration: -1, takenAt: '2026-03-01T00:00:00Z' },
  ])
  assert.equal(v.video, 'https://cdn/video/v.mp4')
  assert.equal(v.duration, 29.97)
  assert.equal(v.url, 'https://cdn/full/v.jpg')      // the still frame, for the tree
  assert.equal(p.video, null)
  assert.equal(p.duration, null)
  assert.equal(bad.video, null)                       // only https clips
  assert.equal(bad.duration, null)
})

test('durationText', () => {
  assert.equal(durationText(7.4), '0:07')
  assert.equal(durationText(29.97), '0:30')
  assert.equal(durationText(undefined), '0:00')
})
