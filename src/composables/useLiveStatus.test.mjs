import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRows, relativeTime } from './useLiveStatus.js'

const STALE_AFTER = 3 * 60 * 60 * 1000
const NOW = Date.parse('2026-09-03T12:00:00Z')

const payload = (updated, extra = {}) => ({
  updated,
  steps: { value: 10611, pctOfAverage: 101, state: 'ok' },
  heart: { value: 56, label: 'nominal', state: 'ok' },
  workout: { type: 'Outdoor Run', minutes: 32, endedAt: '2026-09-03T09:00:00Z' },
  ...extra
})

const labels = (rows) => rows.map((r) => r.label)

test('fresh payload renders the health rows and the sync row last', () => {
  const rows = buildRows(payload('2026-09-03T11:48:00Z'), NOW, STALE_AFTER)
  assert.deepEqual(labels(rows), ['Steps', 'Resting heart', 'Last workout', 'Last sync'])
  assert.equal(rows[0].value, '10,611 · 101% of avg')
  assert.equal(rows[1].value, 'nominal · 56 bpm')
  assert.equal(rows[3].value, '12m ago')
  assert.equal(rows[3].state, 'ok')
})

test('stale payload keeps only the sync row, so the gap is visible', () => {
  const rows = buildRows(payload('2026-09-03T03:00:00Z'), NOW, STALE_AFTER)
  assert.deepEqual(labels(rows), ['Last sync'])
  assert.equal(rows[0].value, '9h ago')
  assert.equal(rows[0].state, 'idle', 'reads as unknown rather than current')
})

test('no payload renders nothing at all', () => {
  assert.deepEqual(buildRows(null, NOW, STALE_AFTER), [])
  assert.deepEqual(buildRows({}, NOW, STALE_AFTER), [])
  assert.deepEqual(buildRows({ updated: 'not a date' }, NOW, STALE_AFTER), [])
})

test('rows are omitted individually when their field is absent', () => {
  const partial = { updated: '2026-09-03T11:50:00Z', steps: { value: 400, state: 'idle' } }
  assert.deepEqual(labels(buildRows(partial, NOW, STALE_AFTER)), ['Steps', 'Last sync'])
})

test('a missing percentage shows the bare count, not "null%"', () => {
  const early = payload('2026-09-03T11:50:00Z', {
    steps: { value: 6412, pctOfAverage: null, state: 'idle' }
  })
  assert.equal(buildRows(early, NOW, STALE_AFTER)[0].value, '6,412')
})

test('relative time reads naturally across the ranges', () => {
  assert.equal(relativeTime(20 * 1000), 'just now')
  assert.equal(relativeTime(12 * 60 * 1000), '12m ago')
  assert.equal(relativeTime(2 * 60 * 60 * 1000), '2h ago')
  assert.equal(relativeTime(50 * 60 * 60 * 1000), '2d ago')
})
