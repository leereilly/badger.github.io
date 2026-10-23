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
  const original = { hidden: false }
  const change = { hidden: true }
  const location = { search }
  const document = new EventTarget()
  const window = new EventTarget()
  const previous = new Map()
  for (const [key, value] of Object.entries({ document, window, location })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  }
  const dispose = initDoomProTip({
    querySelector: selector => ({
      '[data-doom-tip-default]': original,
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
  return { original, change, location, document, window, dispose }
}

test('avatar discovery is shown immediately without a username', t => {
  const { original, change } = setup(t)
  assert.equal(original.hidden, false)
  assert.equal(change.hidden, true)
})

test('existing usernames immediately get the change-avatar tip and URL changes keep it consistent', t => {
  const { original, change, location, document, window } = setup(t, '?u=leereilly')
  assert.equal(original.hidden, true)
  assert.equal(change.hidden, false)
  location.search = ''
  document.dispatchEvent(new Event('doom:avatar-change'))
  assert.equal(original.hidden, false)
  assert.equal(change.hidden, true)
  location.search = '?u=octocat'
  window.dispatchEvent(new Event('popstate'))
  assert.equal(original.hidden, true)
  assert.equal(change.hidden, false)
  location.search = ''
  document.dispatchEvent(new Event('doom:avatar-change'))
  assert.equal(original.hidden, false)
})

test('leaving the page removes avatar-change listeners', t => {
  const { original, location, document, dispose } = setup(t)
  dispose()
  location.search = '?u=octocat'
  document.dispatchEvent(new Event('doom:avatar-change'))
  assert.equal(original.hidden, false)
})
