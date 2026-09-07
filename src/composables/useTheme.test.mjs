import test from 'node:test'
import assert from 'node:assert/strict'
import { applyTheme, normalizeTheme, themeAttribute } from './useTheme.js'

function fakeRoot() {
  return {
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value },
    removeAttribute(name) { delete this.attributes[name] }
  }
}

test('normalizeTheme keeps the three known preferences', () => {
  assert.equal(normalizeTheme('system'), 'system')
  assert.equal(normalizeTheme('light'), 'light')
  assert.equal(normalizeTheme('dark'), 'dark')
})

test('normalizeTheme falls back to system for anything else', () => {
  for (const value of [null, undefined, '', 'DARK', 'sepia', 0]) {
    assert.equal(normalizeTheme(value), 'system')
  }
})

test('themeAttribute stamps nothing for system so CSS tracks the OS', () => {
  assert.equal(themeAttribute('system'), null)
  assert.equal(themeAttribute('nonsense'), null)
  assert.equal(themeAttribute('light'), 'light')
  assert.equal(themeAttribute('dark'), 'dark')
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
