import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRows, formatDistance, msUntilNextSlot, relativeTime } from './useLiveStatus.js'

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
  assert.deepEqual(labels(rows), ['Steps', 'Heart rate', 'Last workout', 'Last sync'])
  assert.equal(rows[0].value, '10,611 · 101% of avg')
  assert.equal(rows[1].value, 'nominal · 56 bpm')
  assert.equal(rows[3].value, '12m ago')
  assert.equal(rows[3].state, 'ok')
})

test('stale payload still shows the readings, with every dot neutral', () => {
  const rows = buildRows(payload('2026-09-03T03:00:00Z'), NOW, STALE_AFTER)
  assert.deepEqual(labels(rows), ['Steps', 'Heart rate', 'Last workout', 'Last sync'])
  // The numbers survive; the sync row supplies the age that makes them honest.
  assert.equal(rows[0].value, '10,611 · 101% of avg')
  assert.equal(rows.at(-1).value, '9h ago')
  assert.deepEqual(rows.map((r) => r.state), ['idle', 'idle', 'idle', 'idle'],
    'nothing reads as a current assessment')
})

test('a fresh payload keeps its dots', () => {
  const rows = buildRows(payload('2026-09-03T11:48:00Z'), NOW, STALE_AFTER)
  assert.deepEqual(rows.map((r) => r.state), ['ok', 'ok', 'ok', 'ok'])
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

test('polls land on wall-clock slots, five minutes past each quarter', () => {
  const FIFTEEN = 15 * 60 * 1000
  const OFFSET = 5 * 60 * 1000
  const at = (iso) => Date.parse(iso)
  const nextSlot = (iso) =>
    new Date(at(iso) + msUntilNextSlot(at(iso), FIFTEEN, OFFSET)).toISOString()

  assert.equal(nextSlot('2026-09-03T14:00:00Z'), '2026-09-03T14:05:00.000Z')
  assert.equal(nextSlot('2026-09-03T14:06:00Z'), '2026-09-03T14:20:00.000Z')
  assert.equal(nextSlot('2026-09-03T14:49:59Z'), '2026-09-03T14:50:00.000Z')
  assert.equal(nextSlot('2026-09-03T14:51:00Z'), '2026-09-03T15:05:00.000Z')
})

test('a poll landing exactly on a slot waits for the next one, not zero', () => {
  const FIFTEEN = 15 * 60 * 1000
  const OFFSET = 5 * 60 * 1000
  // Returning 0 here would spin: schedule, fire immediately, reschedule.
  assert.equal(msUntilNextSlot(Date.parse('2026-09-03T14:05:00Z'), FIFTEEN, OFFSET), FIFTEEN)
})

test('slot maths holds with no offset and across the hour boundary', () => {
  const HOUR = 60 * 60 * 1000
  assert.equal(msUntilNextSlot(Date.parse('2026-09-03T14:30:00Z'), HOUR, 0), 30 * 60 * 1000)
  assert.equal(msUntilNextSlot(Date.parse('2026-09-03T23:58:00Z'), HOUR, 0), 2 * 60 * 1000)
})

test('the heart row shows the bare number when no label is sent', () => {
  const noLabel = {
    updated: '2026-09-03T11:50:00Z',
    heart: { value: 66, state: 'idle' }
  }
  const rows = buildRows(noLabel, Date.parse('2026-09-03T12:00:00Z'), 3 * 60 * 60 * 1000)
  assert.equal(rows[0].label, 'Heart rate')
  assert.equal(rows[0].value, '66 bpm')
})

const workoutRow = (workout) =>
  buildRows(payload('2026-09-03T11:48:00Z', { workout }), NOW, STALE_AFTER)
    .find((row) => row.label === 'Last workout')

test('a workout row appends distance and energy when they are present', () => {
  const row = workoutRow({
    type: 'Outdoor Run', minutes: 32, endedAt: '2026-09-03T09:00:00Z',
    distanceMeters: 5400, activeEnergyKcal: 410
  })
  assert.equal(row.value, 'Outdoor Run · 32m · 3.4 mi · 410 kcal')
})

test('workout metrics the payload lacks simply drop out of the row', () => {
  // A strength session has no distance, and the deployed shortcut sends
  // neither metric at all -- both must read as the original single line.
  const strength = workoutRow({
    type: 'Traditional Strength Training', minutes: 45,
    endedAt: '2026-09-03T09:00:00Z', distanceMeters: null, activeEnergyKcal: 260
  })
  assert.equal(strength.value, 'Traditional Strength Training · 45m · 260 kcal')

  const legacy = workoutRow(
    { type: 'Outdoor Run', minutes: 32, endedAt: '2026-09-03T09:00:00Z' })
  assert.equal(legacy.value, 'Outdoor Run · 32m')
})

test('distance is reported in miles, losing the decimal once it stops mattering', () => {
  assert.equal(formatDistance(5400), '3.4 mi')
  assert.equal(formatDistance(1609.344), '1.0 mi')
  assert.equal(formatDistance(42195), '26 mi', 'no decimal past ten miles')
  assert.equal(formatDistance(0), null, 'a zero distance is not a distance')
  assert.equal(formatDistance(null), null)
  assert.equal(formatDistance('5400'), null, 'a string is not a reading')
})
