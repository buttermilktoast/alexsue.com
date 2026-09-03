import test from 'node:test'
import assert from 'node:assert/strict'
import { computeStatus, previousDate } from './status.mjs'

const config = { timeZone: 'Pacific/Honolulu', halfLifeDays: 14, minBaselineDays: 7 }
const at = (iso) => new Date(iso)
const push = (existing, input, iso) =>
  computeStatus({ existing, input, now: at(iso), config })

const dayOffset = (iso, days) =>
  new Date(at(iso).getTime() + days * 24 * 60 * 60 * 1000).toISOString()

test('seeds a baseline on the first completed day', () => {
  const day1 = push(null, { steps: 9000 }, '2026-09-01T20:00:00Z')
  assert.equal(day1._baseline.days, 0)
  assert.equal(day1.steps.pctOfAverage, null, 'no percentage without a baseline')

  // 2026-09-02T18:00Z is 08:00 HST the next local day, so day1 folds in.
  const day2 = push(day1, { steps: 500 }, '2026-09-02T18:00:00Z')
  assert.equal(day2._baseline.days, 1)
  assert.equal(day2._baseline.stepsAvg, 9000, 'first fold seeds directly')
  assert.equal(day2.steps.value, 500, 'steps reset at the day boundary')
})

test('mid-day pushes never fold, so partial days cannot drag the baseline', () => {
  let state = push(null, { steps: 10000 }, '2026-09-01T20:00:00Z')
  state = push(state, { steps: 400 }, '2026-09-02T18:00:00Z')   // folds day 1
  const seeded = state._baseline.stepsAvg

  // Three more pushes on the same local day.
  for (const iso of ['2026-09-02T20:00:00Z', '2026-09-02T22:00:00Z', '2026-09-03T03:00:00Z']) {
    state = push(state, { steps: 3000 }, iso)
    assert.equal(state._baseline.days, 1, `no extra fold at ${iso}`)
    assert.equal(state._baseline.stepsAvg, seeded, 'baseline untouched mid-day')
  }
})

test('baseline tracks a real change over time', () => {
  let state = push(null, { steps: 6000 }, '2026-09-01T20:00:00Z')
  // 40 days of 12000 steps, one push per day at 10:00 HST.
  for (let day = 1; day <= 40; day++) {
    state = push(state, { steps: 12000 }, dayOffset('2026-09-01T20:00:00Z', day))
  }
  assert.equal(state._baseline.days, 40)
  assert.ok(state._baseline.stepsAvg > 11000,
    `expected baseline to approach 12000, got ${state._baseline.stepsAvg}`)
  assert.ok(state.steps.pctOfAverage > 95 && state.steps.pctOfAverage < 110)
})

test('implausible samples are shown but never folded', () => {
  let state = push(null, { steps: 9000 }, '2026-09-01T20:00:00Z')
  state = push(state, { steps: 9000 }, '2026-09-02T20:00:00Z')
  const clean = state._baseline.stepsAvg

  // A garbage reading arrives and is rejected outright.
  const bad = push(state, { steps: 999999 }, '2026-09-02T22:00:00Z')
  assert.equal(bad.steps.value, 9000, 'out-of-bounds sample ignored, prior value kept')
  assert.equal(bad._baseline.stepsAvg, clean, 'baseline untouched')

  const hr = push(state, { restingHeartRate: 400 }, '2026-09-02T22:00:00Z')
  assert.equal(hr.heart, undefined, 'no heart row from an impossible reading')
})

test('a steps-only push does not wipe the heart row', () => {
  const withHeart = push(null, { steps: 5000, restingHeartRate: 58 }, '2026-09-02T20:00:00Z')
  assert.equal(withHeart.heart.value, 58)

  const stepsOnly = push(withHeart, { steps: 6000 }, '2026-09-02T22:00:00Z')
  assert.equal(stepsOnly.heart.value, 58, 'heart carried forward')
  assert.equal(stepsOnly.steps.value, 6000)
})

test('the heart row carries a number and no classification', () => {
  let state = null
  for (let day = 0; day <= 8; day++) {
    state = push(state, { steps: 8000, restingHeartRate: 58 },
      dayOffset('2026-09-01T20:00:00Z', day))
  }
  assert.ok(state._baseline.days >= 7, 'baseline is ready')
  assert.equal(state.heart.value, 58)
  assert.equal(state.heart.label, undefined, 'no label even with a full baseline')
  assert.equal(state.heart.state, 'idle')
})

test('the baseline still tracks heart rate for later use', () => {
  let state = null
  for (let day = 0; day <= 8; day++) {
    state = push(state, { steps: 8000, restingHeartRate: 58 },
      dayOffset('2026-09-01T20:00:00Z', day))
  }
  assert.ok(state._baseline.restingHrAvg > 0, 'accumulator kept')
})

test('workouts carry forward then age out', () => {
  const endedAt = '2026-09-02T17:00:00Z'
  const fresh = push(null, { workout: { type: 'Outdoor Run', minutes: 32, endedAt } },
    '2026-09-02T18:00:00Z')
  assert.equal(fresh.workout.type, 'Outdoor Run')
  assert.equal(fresh.workout.minutes, 32)

  const later = push(fresh, { steps: 4000 }, '2026-09-03T18:00:00Z')
  assert.equal(later.workout.type, 'Outdoor Run', 'still within 72h')

  const stale = push(fresh, { steps: 4000 }, '2026-09-06T18:00:00Z')
  assert.equal(stale.workout, undefined, 'aged out past 72h')
})

test('day boundary uses the configured timezone, not UTC', () => {
  // 2026-09-02T06:00Z is still 2026-09-01 in Honolulu (UTC-10).
  const state = push(null, { steps: 7000 }, '2026-09-02T06:00:00Z')
  assert.equal(state.day, '2026-09-01')
})

test('numeric strings from Shortcuts are accepted', () => {
  const state = push(null, { steps: '8231', restingHeartRate: '56' }, '2026-09-02T20:00:00Z')
  assert.equal(state.steps.value, 8231)
  assert.equal(state.heart.value, 56)
})

test('newline-separated sample text is summed, never truncated', () => {
  const seeded = push(null, { steps: 5000 }, '2026-09-02T20:00:00Z')
  const messy = push(seeded, { steps: '1200\n3400\n900' }, '2026-09-02T22:00:00Z')
  // Reading only the first line would store 1200 -- a wrong number rather
  // than a missing one, which is the failure this guards against.
  assert.equal(messy.steps.value, 5500)
})

test('empty and non-numeric strings are rejected', () => {
  const seeded = push(null, { steps: 5000, restingHeartRate: 58 }, '2026-09-02T20:00:00Z')
  const blank = push(seeded, { steps: '', restingHeartRate: 'n/a' }, '2026-09-02T22:00:00Z')
  assert.equal(blank.steps.value, 5000)
  assert.equal(blank.heart.value, 58)
})

test('a workout duration sent as a string is accepted', () => {
  const state = push(null,
    { workout: { type: 'Outdoor Run', minutes: '32', endedAt: '2026-09-02T19:00:00Z' } },
    '2026-09-02T20:00:00Z')
  assert.equal(state.workout.minutes, 32)
})

test('sums a newline-separated sample list', () => {
  const state = push(null, { steps: '1200\n3400\n900' }, '2026-09-02T20:00:00Z')
  assert.equal(state.steps.value, 5500)
})

test('sums a semicolon-separated list and a real array', () => {
  assert.equal(push(null, { steps: '1200;3400;900' }, '2026-09-02T20:00:00Z').steps.value, 5500)
  assert.equal(push(null, { steps: [1200, 3400, 900] }, '2026-09-02T20:00:00Z').steps.value, 5500)
  assert.equal(push(null, { steps: ['1200', '3400'] }, '2026-09-02T20:00:00Z').steps.value, 4600)
})

test('commas are thousand separators, never delimiters', () => {
  // Splitting on commas would turn one reading of 1200 into 1 + 200.
  assert.equal(push(null, { steps: '1,200' }, '2026-09-02T20:00:00Z').steps.value, 1200)
  assert.equal(push(null, { steps: '1,200\n3,400' }, '2026-09-02T20:00:00Z').steps.value, 4600)
})

test('unit suffixes on each sample still parse', () => {
  assert.equal(push(null, { steps: '1200 count\n3400 count' }, '2026-09-02T20:00:00Z').steps.value, 4600)
})

test('one unparseable entry rejects the whole total', () => {
  const seeded = push(null, { steps: 5000 }, '2026-09-02T20:00:00Z')
  const messy = push(seeded, { steps: '1200\nno idea\n900' }, '2026-09-02T22:00:00Z')
  assert.equal(messy.steps.value, 5000, 'carried forward rather than undercounted')
})

test('blank lines are ignored', () => {
  assert.equal(push(null, { steps: '1200\n\n3400\n' }, '2026-09-02T20:00:00Z').steps.value, 4600)
})

test('an empty workout type means no workout, not an error', () => {
  const seeded = push(null, { steps: 5000 }, '2026-09-02T20:00:00Z')
  const blank = push(seeded, { steps: 5100, workout: { type: '', minutes: '' } },
    '2026-09-02T21:00:00Z')
  assert.equal(blank.workout, undefined)
  assert.equal(blank.steps.value, 5100, 'the rest of the push still lands')
})

test('workout duration is accepted in seconds', () => {
  const state = push(null,
    { workout: { type: 'Outdoor Run', seconds: '1920', endedAt: '2026-09-02T19:00:00Z' } },
    '2026-09-02T20:00:00Z')
  assert.equal(state.workout.minutes, 32)
})

test('a missing end time means the workout just happened', () => {
  const state = push(null, { workout: { type: 'Yoga', minutes: 20 } }, '2026-09-02T20:00:00Z')
  assert.equal(state.workout.type, 'Yoga')
  assert.equal(state.workout.endedAt, '2026-09-02T20:00:00.000Z')
})

test('a clock-formatted duration is read as minutes:seconds', () => {
  const state = push(null,
    { lastWorkoutName: 'Outdoor Run', lastWorkoutDuration: '10:03',
      lastWorkoutTimestamp: '2026-09-02T19:00:00Z' },
    '2026-09-02T20:00:00Z')
  assert.equal(state.workout.type, 'Outdoor Run')
  assert.equal(state.workout.minutes, 10, '10:03 is ten minutes, not ten hours')
})

test('a three-part duration is hours:minutes:seconds', () => {
  const state = push(null,
    { lastWorkoutName: 'Long Ride', lastWorkoutDuration: '1:30:00',
      lastWorkoutTimestamp: '2026-09-02T19:00:00Z' },
    '2026-09-02T20:00:00Z')
  assert.equal(state.workout.minutes, 90)
})

test("Shortcuts' local timestamp is read in the configured zone", () => {
  // 18:27 in Honolulu on Sep 2 is 04:27 UTC on Sep 3.
  const state = push(null,
    { lastWorkoutName: 'Outdoor Run', lastWorkoutDuration: '10:03',
      lastWorkoutTimestamp: 'Sep 2, 2026 at 18:27' },
    '2026-09-03T05:00:00Z')
  assert.equal(state.workout.endedAt, '2026-09-03T04:27:00.000Z')
})

test('a local timestamp is not read as UTC and thrown away as future-dated', () => {
  // Parsed naively this would be 18:27 UTC, ten hours ahead of the real
  // instant, and a workout dated in the future is nonsense.
  const state = push(null,
    { lastWorkoutName: 'Outdoor Run', lastWorkoutDuration: '10:03',
      lastWorkoutTimestamp: 'Sep 2, 2026 at 18:27' },
    '2026-09-03T05:00:00Z')
  assert.ok(Date.parse(state.workout.endedAt) < Date.parse('2026-09-03T05:00:00Z'),
    'ended in the past')
})

test('flat fields still work when the name is missing', () => {
  const seeded = push(null, { steps: 5000 }, '2026-09-02T20:00:00Z')
  const noName = push(seeded,
    { steps: 5200, lastWorkoutName: '', lastWorkoutDuration: '10:03' },
    '2026-09-02T21:00:00Z')
  assert.equal(noName.workout, undefined)
  assert.equal(noName.steps.value, 5200)
})

test('a heart rate under exertion is kept, not discarded', () => {
  // The old resting-only ceiling of 120 would have thrown this away.
  const state = push(null, { restingHeartRate: '148' }, '2026-09-02T20:00:00Z')
  assert.equal(state.heart.value, 148)
})

test('heartRate is accepted as an alias for restingHeartRate', () => {
  assert.equal(push(null, { heartRate: '66' }, '2026-09-02T20:00:00Z').heart.value, 66)
  // The field the shortcut already sends still wins nothing away from it.
  assert.equal(push(null, { restingHeartRate: '66' }, '2026-09-02T20:00:00Z').heart.value, 66)
})

test('a physiologically impossible rate is still rejected', () => {
  const seeded = push(null, { restingHeartRate: 60 }, '2026-09-02T20:00:00Z')
  assert.equal(push(seeded, { restingHeartRate: 400 }, '2026-09-02T21:00:00Z').heart.value, 60)
})

test('an explicit yesterday total folds authoritatively', () => {
  // No push landed late the previous night; the morning push still banks it.
  const state = push(null, { steps: '400', stepsYesterday: '11200' },
    '2026-09-03T20:00:00Z')
  assert.equal(state._baseline.days, 1)
  assert.equal(state._baseline.stepsAvg, 11200)
  assert.equal(state._baseline.lastFolded, '2026-09-02')
  assert.equal(state.steps.value, 400, "today's count is unaffected")
})

test('repeated pushes through the day do not fold twice', () => {
  let state = push(null, { steps: '400', stepsYesterday: '11200' }, '2026-09-03T20:00:00Z')
  const after = state._baseline.stepsAvg
  for (const hour of ['21', '22', '23']) {
    state = push(state, { steps: '900', stepsYesterday: '11200' },
      `2026-09-03T${hour}:00:00Z`)
    assert.equal(state._baseline.days, 1, `no extra fold at ${hour}:00`)
    assert.equal(state._baseline.stepsAvg, after)
  }
})

test('consecutive days each fold once, from their own stated total', () => {
  let state = push(null, { steps: '300', stepsYesterday: '10000' }, '2026-09-03T20:00:00Z')
  state = push(state, { steps: '300', stepsYesterday: '12000' }, '2026-09-04T20:00:00Z')
  assert.equal(state._baseline.days, 2)
  assert.equal(state._baseline.lastFolded, '2026-09-03')
  assert.ok(state._baseline.stepsAvg > 10000 && state._baseline.stepsAvg < 12000)
})

test('without the field it still falls back to the last stored value', () => {
  const day1 = push(null, { steps: '9000' }, '2026-09-02T20:00:00Z')
  const day2 = push(day1, { steps: '500' }, '2026-09-03T20:00:00Z')
  assert.equal(day2._baseline.days, 1)
  assert.equal(day2._baseline.stepsAvg, 9000, 'inferred from the last push of that day')
})

test('an implausible yesterday total falls through rather than poisoning', () => {
  const day1 = push(null, { steps: '9000' }, '2026-09-02T20:00:00Z')
  const day2 = push(day1, { steps: '500', stepsYesterday: '999999' }, '2026-09-03T20:00:00Z')
  assert.equal(day2._baseline.stepsAvg, 9000, 'fell back to the stored value')
})

test('previousDate crosses month and year boundaries', () => {
  assert.equal(previousDate('2026-09-01'), '2026-08-31')
  assert.equal(previousDate('2026-03-01'), '2026-02-28')
  assert.equal(previousDate('2027-01-01'), '2026-12-31')
})

test('a rolling 24h total folds once per day', () => {
  let state = push(null, { steps: '400', stepsLast24h: '10500' }, '2026-09-03T20:00:00Z')
  assert.equal(state._baseline.days, 1)
  assert.equal(state._baseline.stepsAvg, 10500)

  // Sent again on every push through the same day: must not fold again.
  for (const hour of ['21', '22', '23']) {
    state = push(state, { steps: '900', stepsLast24h: '10800' },
      `2026-09-03T${hour}:00:00Z`)
    assert.equal(state._baseline.days, 1, `no second fold at ${hour}:00`)
    assert.equal(state._baseline.stepsAvg, 10500)
  }

  // Next local day folds once more.
  state = push(state, { steps: '200', stepsLast24h: '11000' }, '2026-09-04T20:00:00Z')
  assert.equal(state._baseline.days, 2)
})

test('the baseline never gains more days than the calendar has', () => {
  // Sources may be mixed as the shortcut changes; what must hold is that a
  // day contributes once, however that day's figure arrived.
  let state = null
  const days = [
    { steps: '9000', stepsLast24h: '10500' },   // rolling
    { steps: '300' },                            // fallback
    { steps: '400', stepsYesterday: '11000' },   // exact
    { steps: '500', stepsLast24h: '9800' }       // rolling again
  ]
  days.forEach((body, index) => {
    // Several pushes per day, as an hourly automation would send.
    for (const hour of ['14', '18', '22']) {
      const iso = `2026-09-0${3 + index}T${hour}:00:00Z`
      state = push(state, body, iso)
    }
  })
  assert.ok(state._baseline.days <= days.length,
    `expected at most ${days.length} folds, got ${state._baseline.days}`)
})

test('an explicit calendar total is preferred over the rolling one', () => {
  const state = push(null,
    { steps: '400', stepsYesterday: '12000', stepsLast24h: '9000' },
    '2026-09-03T20:00:00Z')
  assert.equal(state._baseline.stepsAvg, 12000, 'exact total wins')
  assert.equal(state._baseline.lastFolded, '2026-09-02')
})
