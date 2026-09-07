import test from 'node:test'
import assert from 'node:assert/strict'
import {
  contrastRatio,
  daylight,
  hexToRgb,
  luminance,
  nextPaletteChange,
  paletteFor,
  precipitationFor,
  skyStops,
  skyStrength,
  solarAltitude,
  weatherEffect
} from './useSky.js'

const HONOLULU = { latitude: 21.31, longitude: -157.86 }

function altitude(iso) {
  return solarAltitude(new Date(iso), HONOLULU.latitude, HONOLULU.longitude)
}

/** First minute in the window where the altitude crosses the horizon upward. */
function crossing(startIso, target, rising) {
  const start = new Date(startIso).getTime()
  let previous = solarAltitude(new Date(start), HONOLULU.latitude, HONOLULU.longitude)
  for (let minute = 1; minute <= 1440; minute += 1) {
    const time = start + minute * 60000
    const next = solarAltitude(new Date(time), HONOLULU.latitude, HONOLULU.longitude)
    if (rising ? previous < target && next >= target : previous > target && next <= target) return time
    previous = next
  }
  throw new Error('no crossing')
}

test('solarAltitude puts the sun overhead at solar noon and under the horizon at midnight', () => {
  // Honolulu sits at 21.31 N, so the equinox sun tops out near 90 - 21.31.
  let peak = -90
  for (let minute = 0; minute < 1440; minute += 1) {
    peak = Math.max(peak, solarAltitude(
      new Date(Date.UTC(2026, 8, 22) + minute * 60000), HONOLULU.latitude, HONOLULU.longitude
    ))
  }
  assert.ok(Math.abs(peak - 68.7) < 0.5, `equinox peak was ${peak}`)
  assert.ok(altitude('2026-09-06T12:00:00Z') < -20, 'local 02:00 is deep night')
})

test('solarAltitude agrees with published Honolulu sunrise and sunset', () => {
  // 2026-09-06 HST: sunrise 06:17, sunset 18:44. The horizon is -0.833 degrees
  // once refraction and the sun's own radius are taken off.
  const sunrise = new Date(crossing('2026-09-06T10:00:00Z', -0.833, true))
  const sunset = new Date(crossing('2026-09-06T20:00:00Z', -0.833, false))
  assert.equal(sunrise.toISOString(), '2026-09-06T16:17:00.000Z')
  assert.equal(sunset.toISOString(), '2026-09-07T04:44:00.000Z')
})

test('daylight is a smooth ramp across the twilight band', () => {
  assert.equal(daylight(-30), 0)
  assert.equal(daylight(-12), 0)
  assert.equal(daylight(6), 1)
  assert.equal(daylight(45), 1)
  assert.ok(Math.abs(daylight(-3) - 0.5) < 0.001, 'the band is centred on -3 degrees')

  let previous = 0
  for (let a = -12; a <= 6; a += 0.25) {
    const value = daylight(a)
    assert.ok(value >= previous, `daylight went backwards at ${a}`)
    assert.ok(value - previous < 0.05, `daylight jumped at ${a}`)
    previous = value
  }
})

test('the palette flips just after the sun clears the horizon, not at first light', () => {
  assert.equal(paletteFor(daylight(-6)), 'dark', 'civil twilight is still dark')
  assert.equal(paletteFor(daylight(-0.833)), 'dark', 'sunrise itself is still dark')
  assert.equal(paletteFor(daylight(0.5)), 'dark')
  assert.equal(paletteFor(daylight(3)), 'light')
  assert.equal(paletteFor(daylight(45)), 'light')
})

test('the sky gradient stays ordered dark-at-top through the whole dawn', () => {
  for (let t = 0; t <= 1.0001; t += 0.02) {
    const stops = skyStops(t, null)
    const [top, middle, bottom] = ['top', 'middle', 'bottom']
      .map((stop) => luminance(hexToRgb(stops[stop])))
    assert.ok(top <= middle + 0.001, `top outshone the middle at ${t}`)
    assert.ok(middle <= bottom + 0.001, `middle outshone the horizon at ${t}`)
  }
})

test('the sky brightens monotonically as the sun rises', () => {
  let previous = -1
  for (let t = 0; t <= 1.0001; t += 0.02) {
    const value = luminance(hexToRgb(skyStops(t, null).middle))
    assert.ok(value >= previous - 0.001, `the sky dimmed while the sun rose at ${t}`)
    previous = value
  }
})

test('the anchor skies are hit exactly, so dawn and dusk are the same list', () => {
  assert.deepEqual(skyStops(0, null), { top: '#04060e', middle: '#080d1b', bottom: '#101a2f' })
  assert.deepEqual(skyStops(1, null), { top: '#bcd8f4', middle: '#dfeaf7', bottom: '#f4f6f8' })
})

test('weather only tints the sky and never darkens midday past legible', () => {
  const clear = skyStops(1, 0)
  const storm = skyStops(1, 95)
  assert.deepEqual(clear, skyStops(1, null), 'clear skies are the untouched gradient')
  for (const stop of ['top', 'middle', 'bottom']) {
    assert.ok(
      luminance(hexToRgb(storm[stop])) < luminance(hexToRgb(clear[stop])),
      `${stop} did not darken under a thunderstorm`
    )
  }
})

test('no weather drops a sky below the legibility bound on its clear self', () => {
  // The bound is what the palette was chosen against, so it has to hold at
  // every moment and for every condition, not just the ones hand-checked.
  const codes = [0, 1, 2, 3, 45, 48, 51, 55, 61, 65, 71, 77, 80, 82, 85, 95, 99]
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const clear = skyStops(t, 0)
    for (const code of codes) {
      const sky = skyStops(t, code)
      for (const stop of ['top', 'middle', 'bottom']) {
        const dark = luminance(hexToRgb(sky[stop]))
        const bright = luminance(hexToRgb(clear[stop]))
        // Slack for the trip through 8-bit hex: at the near-black end of the
        // night a single channel step is a large share of the luminance.
        assert.ok(
          dark >= 0.62 * bright - 1.5 / 255,
          `code ${code} took ${stop} to ${(dark / bright).toFixed(3)} of clear at ${t.toFixed(2)}`
        )
      }
    }
  }
})

test('overcast pulls the sky toward grey without flipping the palette', () => {
  const overcast = hexToRgb(skyStops(1, 3).middle)
  const spread = Math.max(...overcast) - Math.min(...overcast)
  const clearSpread = (() => {
    const rgb = hexToRgb(skyStops(1, 0).middle)
    return Math.max(...rgb) - Math.min(...rgb)
  })()
  assert.ok(spread < clearSpread, 'overcast kept its full colour')
  assert.equal(paletteFor(daylight(45)), 'light', 'weather has no say in the palette')
})

test('weatherEffect leaves unknown and missing codes alone', () => {
  for (const code of [null, undefined, NaN, 'rain', 1234]) {
    assert.deepEqual(weatherEffect(code), { grey: 0, dim: 1 })
  }
})

test('precipitationFor distinguishes rain, snow and neither', () => {
  assert.equal(precipitationFor(0), null)
  assert.equal(precipitationFor(3), null)
  assert.equal(precipitationFor(45), null, 'fog is not falling water')
  assert.equal(precipitationFor(61), 'rain')
  assert.equal(precipitationFor(55), 'rain')
  assert.equal(precipitationFor(96), 'rain')
  assert.equal(precipitationFor(73), 'snow')
  assert.equal(precipitationFor(86), 'snow')
  assert.equal(precipitationFor(null), null)
})

test('nextPaletteChange finds the flip and reports the other palette there', () => {
  const night = new Date('2026-09-06T12:00:00Z') // 02:00 HST
  const flip = nextPaletteChange(night, HONOLULU.latitude, HONOLULU.longitude)
  const before = paletteFor(daylight(altitude(new Date(flip - 60000).toISOString())))
  const after = paletteFor(daylight(altitude(new Date(flip + 60000).toISOString())))
  assert.equal(before, 'dark')
  assert.equal(after, 'light')
  assert.ok(flip - night.getTime() < 24 * 60 * 60 * 1000)
})

test('nextPaletteChange never returns a time in the past', () => {
  for (let hour = 0; hour < 24; hour += 1) {
    const at = new Date(Date.UTC(2026, 8, 6, hour))
    assert.ok(nextPaletteChange(at, HONOLULU.latitude, HONOLULU.longitude) > at.getTime())
  }
})


test('contrastRatio matches the known WCAG endpoints', () => {
  assert.equal(contrastRatio([255, 255, 255], [0, 0, 0]), 21)
  assert.equal(contrastRatio([0, 0, 0], [255, 255, 255]), 21, 'the order does not matter')
  assert.equal(contrastRatio([18, 18, 18], [18, 18, 18]), 1)
})

test('skyStrength never lets the faintest text fall below the target', () => {
  // Both live palettes, at every sky the sun and weather can produce between
  // them. This is the guarantee the whole backdrop rests on.
  const tokens = { light: ['#f7f7f5', '#67676f'], dark: ['#131316', '#a0a0a8'] }
  for (let t = 0; t <= 1.0001; t += 0.02) {
    for (const code of [0, 3, 45, 61, 75, 95]) {
      const palette = paletteFor(t)
      const [background, muted] = tokens[palette]
      const sky = skyStops(t, code).top
      const strength = skyStrength(sky, background, muted)
      const composite = hexToRgb(background)
        .map((c, i) => c + (hexToRgb(sky)[i] - c) * strength * 0.9)
      assert.ok(
        contrastRatio(hexToRgb(muted), composite) >= 4.5,
        `${palette} muted fell to ${contrastRatio(hexToRgb(muted), composite).toFixed(2)} at t=${t.toFixed(2)} code ${code}`
      )
    }
  }
})

test('skyStrength shows the whole night sky and holds some of every day sky', () => {
  const dark = ['#131316', '#a0a0a8']
  const light = ['#f7f7f5', '#67676f']
  assert.equal(skyStrength(skyStops(0, null).top, ...dark), 1, 'a night sky costs nothing')
  assert.ok(skyStrength(skyStops(1, null).top, ...light) > 0.25, 'a clear day sky stays visible')
  assert.ok(
    skyStrength(skyStops(1, 95).top, ...light) > 0,
    'even a storm leaves something of the sky'
  )
})

test('skyStrength turns a sky down rather than up as it brightens under light text', () => {
  const dark = ['#131316', '#a0a0a8']
  const dim = skyStrength(skyStops(0.5, null).top, ...dark)
  const bright = skyStrength(skyStops(0.8, null).top, ...dark)
  assert.ok(bright < dim, 'the brightest pre-sunrise sky was not turned down')
})
