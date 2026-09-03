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

// Shortcuts reports workout duration in seconds and has no convenient way to
// emit an ISO timestamp, so accept what it can produce: a duration under
// either key, and a missing end time meaning "just now". Keeping this lenient
// is what lets the shortcut be three actions instead of six.
function normaliseWorkout(input, now, timeZone) {
  // Accepts either a nested workout object or the flat lastWorkout* fields,
  // which are far easier to produce in Shortcuts than a nested dictionary.
  const workout = input?.workout && typeof input.workout === 'object'
    ? input.workout
    : {
        type: input?.lastWorkoutName,
        duration: input?.lastWorkoutDuration,
        endedAt: input?.lastWorkoutTimestamp
      }
  if (!workout || typeof workout !== 'object') return null

  const type = typeof workout.type === 'string' ? workout.type.trim() : ''
  // An empty type is how "no workout today" arrives; it is not an error, and
  // it means the shortcut never needs a conditional branch to omit the field.
  if (type === '') return null

  const minutes = toNumber(workout.minutes)
  const seconds = toNumber(workout.seconds ?? workout.durationSeconds)
  const resolvedMinutes = minutes != null
    ? minutes
    : seconds != null
      ? Math.round(seconds / 60)
      : parseDuration(workout.duration)

  const parsed = parseTimestamp(workout.endedAt, timeZone)
  const endedAt = parsed == null ? now.getTime() : parsed

  // ISO string, matching the shape a carried-forward workout already has, so
  // both paths can be handled identically downstream.
  return { type, minutes: resolvedMinutes, endedAt: new Date(endedAt).toISOString() }
}

// Shortcuts formats a workout duration as a clock string ("10:03"), not a
// number of seconds. Two components are minutes:seconds, three are
// hours:minutes:seconds -- the ordinary reading of a duration.
export function parseDuration(value) {
  if (value == null) return null
  const text = String(value).trim()
  if (text === '') return null

  if (text.includes(':')) {
    const parts = text.split(':').map((part) => Number(part.trim()))
    if (parts.some((part) => !Number.isFinite(part) || part < 0)) return null
    if (parts.length === 2) return Math.round(parts[0] + parts[1] / 60)
    if (parts.length === 3) return Math.round(parts[0] * 60 + parts[1] + parts[2] / 60)
    return null
  }

  const number = toNumber(text)
  if (number == null) return null
  // A bare number is ambiguous. Read anything above five hours as seconds: a
  // 320-minute workout is unusual, a 320-second one is a brisk walk.
  return number > 300 ? Math.round(number / 60) : Math.round(number)
}

// How far ahead of UTC the zone is at a given instant.
function zoneOffsetMs(instant, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    })
      .formatToParts(instant)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)])
  )
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day,
    parts.hour % 24, parts.minute, parts.second)
  return asUtc - instant.getTime()
}

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
}

// Deliberately not Date.parse: for a string carrying no zone it uses the
// runtime's local zone, which is UTC on Lambda but the developer's zone
// locally -- so the same input would parse differently in test and in
// production. Components are read explicitly instead.
function parseNaiveParts(text) {
  const match = text.match(
    /^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})[\s,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i
  )
  if (!match) return null

  const month = MONTHS[match[1].slice(0, 3).toLowerCase()]
  if (month === undefined) return null

  let hour = Number(match[4])
  const meridiem = match[7]
  if (meridiem) {
    if (/pm/i.test(meridiem) && hour !== 12) hour += 12
    if (/am/i.test(meridiem) && hour === 12) hour = 0
  }
  if (hour > 23) return null

  return {
    year: Number(match[3]), month, day: Number(match[2]),
    hour, minute: Number(match[5]), second: Number(match[6] || 0)
  }
}

// Accepts ISO 8601, and the "Sep 2, 2026 at 18:27" shape Shortcuts produces.
// The latter carries no zone, so it is read as local wall-clock time in the
// configured zone rather than as UTC -- otherwise every workout lands ten
// hours off and is dropped for being dated in the future.
export function parseTimestamp(value, timeZone) {
  if (value == null) return null
  const text = String(value).trim()
  if (text === '') return null

  if (/[Zz]$|[+-]\d{2}:?\d{2}$/.test(text)) {
    const zoned = Date.parse(text)
    return Number.isNaN(zoned) ? null : zoned
  }

  const parts = parseNaiveParts(text.replace(/\s+at\s+/i, ' '))
  if (!parts) return null

  const asIfUtc = Date.UTC(parts.year, parts.month, parts.day,
    parts.hour, parts.minute, parts.second)
  return asIfUtc - zoneOffsetMs(new Date(asIfUtc), timeZone)
}

// Shortcuts sends health values as strings, and a multi-sample query arrives
// as newline-separated text rather than a single figure. Accept a clean
// numeric string, reject anything else -- "1200\n3400\n900" must not silently
// become 1200, since that would be a wrong reading rather than a missing one.
export function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

// Steps arrive as many samples per day. Shortcuts cannot reliably sum them,
// so the raw list is sent and totalled here.
//
// Split on newlines and semicolons but never on commas, which appear inside
// numbers as thousand separators. Each entry keeps only its leading number so
// a unit suffix ("2 count") still parses. If any non-empty entry fails to
// parse the whole push is rejected: undercounting a day silently is worse
// than showing the row as stale.
const MAX_SAMPLES = 10000

export function toStepTotal(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null

  const parts = Array.isArray(value)
    ? value
    : typeof value === 'string' ? value.split(/[\n\r;]+/) : null
  if (!parts || parts.length > MAX_SAMPLES) return null

  let total = 0
  let counted = 0
  for (const part of parts) {
    const text = String(part).trim().replace(/,/g, '')
    if (text === '') continue
    const match = text.match(/^-?\d+(?:\.\d+)?/)
    if (!match) return null
    total += Number(match[0])
    counted += 1
  }
  return counted === 0 ? null : Math.round(total)
}

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
  const inputSteps = toStepTotal(input.steps)
  const inputHeartRate = toNumber(input.restingHeartRate)

  const steps = plausible(inputSteps, BOUNDS.steps)
    ? inputSteps
    : (sameDay ? existing?.steps?.value ?? null : null)

  const heartRate = plausible(inputHeartRate, BOUNDS.restingHeartRate)
    ? inputHeartRate
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
  const workout = normaliseWorkout(input, now, timeZone) ?? existing?.workout ?? null
  if (workout?.type) {
    const endedAt = Date.parse(workout.endedAt ?? '')
    if (!Number.isNaN(endedAt) && now.getTime() - endedAt < WORKOUT_TTL_MS) {
      output.workout = {
        type: String(workout.type).slice(0, 40),
        minutes: plausible(toNumber(workout.minutes), BOUNDS.workoutMinutes)
          ? toNumber(workout.minutes)
          : null,
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
