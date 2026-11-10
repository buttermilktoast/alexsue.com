// node --test src/xmas26/data.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dayOf, photosFromApi, cardFaces, previewLabel, fetchCard } from './data.js'

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
