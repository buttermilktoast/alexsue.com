// Pure status computation: no AWS, no I/O. index.mjs wraps this with S3 reads
// and writes so the interesting logic stays testable on its own.
//
// The object is both the database and the public API: `_baseline` carries the
// accumulator forward, everything else is what the site renders. There is no
// history, so a bad sample would poison the baseline permanently -- hence the
// plausibility bounds below. If it ever does drift, edit the JSON by hand and
// re-upload; the next push picks up from whatever is there.

// A sample outside these bounds is a glitch, not a reading. It is still shown
// if it is the current value, but it never reaches the baseline.
export const BOUNDS = {
  steps: [0, 100000],
  restingHeartRate: [30, 120],
  workoutMinutes: [0, 1440]
}

const WORKOUT_TTL_MS = 72 * 60 * 60 * 1000

export function plausible(value, [min, max]) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

// 'en-CA' formats as YYYY-MM-DD, which is what we want for date comparison.
export function localDay(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(date)
}

function describeHeart(value, baseline, ready) {
  if (!ready || baseline == null) return { label: null, state: 'idle' }
  const delta = value - baseline
  if (delta <= -3) return { label: 'low', state: 'ok' }
  if (delta <= 2) return { label: 'nominal', state: 'ok' }
  if (delta <= 6) return { label: 'elevated', state: 'warn' }
  return { label: 'high', state: 'warn' }
}

export function computeStatus({ existing, input, now, config }) {
  const { timeZone, halfLifeDays, minBaselineDays } = config
  // One fold per day, so the half-life is expressed directly in days.
  const alpha = 1 - Math.pow(0.5, 1 / halfLifeDays)
  const ewma = (previous, sample) =>
    previous == null ? sample : alpha * sample + (1 - alpha) * previous

  const today = localDay(now, timeZone)

  const baseline = {
    stepsAvg: null, restingHrAvg: null, days: 0, lastFolded: null,
    ...(existing?._baseline ?? {})
  }

  // Fold only completed days. Steps accumulate through the day, so folding a
  // mid-morning sample into a daily average would drag the baseline down.
  const previousDay = existing?.day ?? null
  if (previousDay && previousDay !== today && baseline.lastFolded !== previousDay) {
    const finalSteps = existing?.steps?.value
    const finalHr = existing?.heart?.value
    if (plausible(finalSteps, BOUNDS.steps)) {
      baseline.stepsAvg = ewma(baseline.stepsAvg, finalSteps)
    }
    if (plausible(finalHr, BOUNDS.restingHeartRate)) {
      baseline.restingHrAvg = ewma(baseline.restingHrAvg, finalHr)
    }
    baseline.days += 1
    baseline.lastFolded = previousDay
  }

  // A push carrying only steps must not wipe the heart row, so unspecified
  // fields carry forward. Steps reset at the day boundary; heart rate is a
  // point-in-time sample, so the last one stands until replaced.
  const sameDay = previousDay === today
  const steps = plausible(input.steps, BOUNDS.steps)
    ? input.steps
    : (sameDay ? existing?.steps?.value ?? null : null)

  const heartRate = plausible(input.restingHeartRate, BOUNDS.restingHeartRate)
    ? input.restingHeartRate
    : existing?.heart?.value ?? null

  const baselineReady = baseline.days >= minBaselineDays
  const output = { updated: now.toISOString(), day: today }

  if (steps != null) {
    const pct = baselineReady && baseline.stepsAvg
      ? Math.round((steps / baseline.stepsAvg) * 100)
      : null
    output.steps = { value: steps, pctOfAverage: pct, state: pct >= 100 ? 'ok' : 'idle' }
  }

  if (heartRate != null) {
    const { label, state } = describeHeart(heartRate, baseline.restingHrAvg, baselineReady)
    output.heart = { value: heartRate, label, state }
  }

  // Carry a workout forward until it ages out, so the row disappears on its
  // own rather than advertising last week's run.
  const workout = (input.workout?.type ? input.workout : null) ?? existing?.workout ?? null
  if (workout?.type) {
    const endedAt = Date.parse(workout.endedAt ?? '')
    if (!Number.isNaN(endedAt) && now.getTime() - endedAt < WORKOUT_TTL_MS) {
      output.workout = {
        type: String(workout.type).slice(0, 40),
        minutes: plausible(workout.minutes, BOUNDS.workoutMinutes) ? workout.minutes : null,
        endedAt: new Date(endedAt).toISOString()
      }
    }
  }

  output._baseline = {
    stepsAvg: baseline.stepsAvg == null ? null : Math.round(baseline.stepsAvg),
    restingHrAvg: baseline.restingHrAvg == null ? null : Number(baseline.restingHrAvg.toFixed(1)),
    days: baseline.days,
    lastFolded: baseline.lastFolded
  }

  return output
}
