import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { build } from 'esbuild'

const compiled = await build({
  entryPoints: [fileURLToPath(new URL('../src/lib/doom-pro-tip.ts', import.meta.url))],
  bundle: true, format: 'esm', platform: 'node', write: false,
})
const { initDoomProTip } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)

function setup(t, search = '') {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const original = { hidden: false }
  const attributes = new Set()
  const avatar = {
    hidden: true,
    setAttribute: key => attributes.add(key),
    removeAttribute: key => attributes.delete(key),
  }
  const change = { hidden: true }
  const location = { search }
  const document = new EventTarget()
  const window = Object.assign(new EventTarget(), {
    setTimeout: (...args) => setTimeout(...args),
    clearTimeout: handle => clearTimeout(handle),
  })
  const previous = new Map()
  for (const [key, value] of Object.entries({ document, window, location })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  }
  const dispose = initDoomProTip({
    querySelector: selector => ({
      '[data-doom-tip-default]': original,
      '[data-doom-tip-discover]': avatar,
      '[data-doom-tip-change]': change,
    })[selector],
  })
  t.after(() => {
    dispose()
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  })
  return { original, avatar, change, attributes, location, document, window, dispose }
}

test('pro tip changes exactly after ten seconds without a username and highlights once', t => {
  const { original, avatar, attributes } = setup(t)
  t.mock.timers.tick(9999)
  assert.equal(original.hidden, false)
  assert.equal(avatar.hidden, true)
  t.mock.timers.tick(1)
  assert.equal(original.hidden, true)
  assert.equal(avatar.hidden, false)
  assert.ok(attributes.has('data-attention'))
})

test('existing usernames immediately get the change-avatar tip and URL changes keep it consistent', t => {
  const { original, avatar, change, attributes, location, document, window } = setup(t, '?u=leereilly')
  assert.equal(original.hidden, true)
  assert.equal(change.hidden, false)
  t.mock.timers.tick(10000)
  assert.equal(avatar.hidden, true)
  location.search = ''
  document.dispatchEvent(new Event('doom:avatar-change'))
  assert.equal(avatar.hidden, false)
  assert.equal(change.hidden, true)
  location.search = '?u=octocat'
  window.dispatchEvent(new Event('popstate'))
  assert.equal(avatar.hidden, true)
  assert.equal(original.hidden, true)
  assert.equal(change.hidden, false)
  assert.equal(attributes.has('data-attention'), false)
  location.search = ''
  document.dispatchEvent(new Event('doom:avatar-change'))
  assert.equal(avatar.hidden, false)
  assert.equal(attributes.has('data-attention'), false)
})

test('a username entered before the timer expires prevents the replacement', t => {
  const { avatar, location } = setup(t)
  t.mock.timers.tick(5000)
  location.search = '?u=octocat'
  t.mock.timers.tick(5000)
  assert.equal(avatar.hidden, true)
})

test('leaving the page cancels the delayed hint', t => {
  const { avatar, dispose } = setup(t)
  dispose()
  t.mock.timers.tick(10000)
  assert.equal(avatar.hidden, true)
})
