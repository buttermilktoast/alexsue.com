import test from 'node:test'
import assert from 'node:assert/strict'
import { applyTheme, DEFAULT_THEME, normalizeTheme, themeAttribute } from './useTheme.js'

function fakeRoot() {
  return {
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value },
    removeAttribute(name) { delete this.attributes[name] }
  }
}

test('normalizeTheme keeps the four known preferences', () => {
  assert.equal(normalizeTheme('sky'), 'sky')
  assert.equal(normalizeTheme('system'), 'system')
  assert.equal(normalizeTheme('light'), 'light')
  assert.equal(normalizeTheme('dark'), 'dark')
})

test('normalizeTheme falls back to the sky for anything else', () => {
  assert.equal(DEFAULT_THEME, 'sky')
  for (const value of [null, undefined, '', 'DARK', 'sepia', 0]) {
    assert.equal(normalizeTheme(value), 'sky')
  }
})

test('themeAttribute stamps nothing for system so CSS tracks the OS', () => {
  assert.equal(themeAttribute('system'), null)
  assert.equal(themeAttribute('light'), 'light')
  assert.equal(themeAttribute('dark'), 'dark')
})

test('themeAttribute stamps the palette the sun has earned', () => {
  assert.equal(themeAttribute('sky', 'dark'), 'dark')
  assert.equal(themeAttribute('sky', 'light'), 'light')
})

test('themeAttribute falls through to the OS until the sun has been read', () => {
  assert.equal(themeAttribute('sky'), null)
  assert.equal(themeAttribute('sky', null), null)
  assert.equal(themeAttribute('sky', 'dusk'), null)
  assert.equal(themeAttribute('nonsense'), null, 'unknown values land on the sky')
})

test('applyTheme clears a previous choice when returning to system', () => {
  const root = fakeRoot()

  applyTheme(root, 'dark')
  assert.equal(root.attributes['data-theme'], 'dark')

  applyTheme(root, 'light')
  assert.equal(root.attributes['data-theme'], 'light')

  applyTheme(root, 'system')
  assert.equal('data-theme' in root.attributes, false)
})

test('applyTheme re-stamps as the sky crosses from night into day', () => {
  const root = fakeRoot()

  applyTheme(root, 'sky', 'dark')
  assert.equal(root.attributes['data-theme'], 'dark')

  applyTheme(root, 'sky', 'light')
  assert.equal(root.attributes['data-theme'], 'light')

  applyTheme(root, 'sky', null)
  assert.equal('data-theme' in root.attributes, false)
})
