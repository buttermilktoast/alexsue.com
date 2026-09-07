import test from 'node:test'
import assert from 'node:assert/strict'
import { currentWeather, describeWeather, formatTemperature, nextSunEvent } from './useWeather.js'

test('temperatures convert from Celsius, preserving zero and rejecting missing data', () => {
  assert.equal(formatTemperature(0, 'F'), '32°F')
  assert.equal(formatTemperature(26.5, 'F'), '80°F')
  assert.equal(formatTemperature(26.5, 'C'), '27°C')
  assert.equal(formatTemperature(null, 'F'), '—')
})

test('current readings expire using the provider timestamp and reject invalid data', () => {
  const now = Date.parse('2026-09-05T22:00:00Z')
  const payload = { current: { time: now / 1000, temperature_2m: 0 } }
  assert.equal(currentWeather(payload, now, 3600000), payload.current)
  assert.equal(currentWeather(payload, now + 3600000, 3600000), null)
  assert.equal(currentWeather(payload, now - 3600000, 3600000), null)
  assert.equal(currentWeather({ current: { ...payload.current, temperature_2m: null } }, now, 3600000), null)
  assert.equal(currentWeather(null, now, 3600000), null)
})

test('sun events use absolute times and switch to tomorrow sunrise after sunset', () => {
  const seconds = (iso) => Date.parse(iso) / 1000
  const daily = {
    sunrise: [seconds('2026-09-05T16:15:00Z'), seconds('2026-09-06T16:15:00Z')],
    sunset: [seconds('2026-09-06T04:40:00Z'), seconds('2026-09-07T04:40:00Z')]
  }
  assert.deepEqual(nextSunEvent(daily, Date.parse('2026-09-06T01:00:00Z')), {
    label: 'Sunset', time: Date.parse('2026-09-06T04:40:00Z')
  })
  assert.deepEqual(nextSunEvent(daily, Date.parse('2026-09-06T05:00:00Z')), {
    label: 'Sunrise', time: Date.parse('2026-09-06T16:15:00Z')
  })
  assert.equal(nextSunEvent(undefined, Date.now()), null)
})

test('conditions distinguish night, rain, and unknown codes', () => {
  assert.equal(describeWeather(0, false), 'Clear night')
  assert.equal(describeWeather(80, true), 'Rain showers')
  assert.equal(describeWeather(null, true), 'Conditions unavailable')
})
