import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

async function compileModule(path) {
  const compiled = await build({
    entryPoints: [fileURLToPath(new URL(path, import.meta.url))],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
  })
  return import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)
}

async function compileDoomPage() {
  const modules = {
    './badge-editor-model-controller': `
      export function createBadgeModelController(load) {
        return {
          start() { void load(new AbortController().signal, () => {}) },
          setButtons() {},
          setRotated() {},
          setDisplayRotated() {},
          updateFrame() {},
          dispose() {},
        }
      }
    `,
    './badge-editor-model': `
      export function initBadgeModel(_host, _canvas, input) {
        globalThis.__doomModelInput = input
        return { ready: Promise.resolve(), dispose() {} }
      }
    `,
    './doom-runtime': `
      export async function loadDoomRuntime() {
        document.title = 'Engine window title'
        return globalThis.__doomRuntime
      }
    `,
  }
  const compiled = await build({
    entryPoints: [fileURLToPath(new URL('../src/lib/doom-page.ts', import.meta.url))],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    plugins: [{
      name: 'doom-page-test-stubs',
      setup(build) {
        build.onResolve({ filter: /.*/ }, args => (
          modules[args.path] ? { path: args.path, namespace: 'doom-page-test' } : undefined
        ))
        build.onLoad({ filter: /.*/, namespace: 'doom-page-test' }, args => ({
          contents: modules[args.path],
          loader: 'ts',
        }))
      },
    }],
  })
  return import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)
}

const [{ doomRotation }, { badgeDoomKey, doomKey }] = await Promise.all([
  compileModule('../src/lib/doom-orientation.ts'),
  compileModule('../src/lib/doom-input.ts'),
])

const page = await readFile(new URL('../src/pages/virtual.astro', import.meta.url), 'utf8')
test('sharing follows the pro tip rather than appearing above the game', () => {
  assert.match(page, /<DoomProTip\s*\/>\s*<DoomShare\s*\/>/)
})
const component = await readFile(new URL('../src/components/doom-simulator.astro', import.meta.url), 'utf8')
const navigation = await readFile(new URL('../src/components/app-navigation.tsx', import.meta.url), 'utf8')
const footer = await readFile(new URL('../src/components/Footer.astro', import.meta.url), 'utf8')
const doomPage = await readFile(new URL('../src/lib/doom-page.ts', import.meta.url), 'utf8')
const badgeModel = await readFile(new URL('../src/lib/badge-editor-model.ts', import.meta.url), 'utf8')
const readme = await readFile(new URL('../public/doom/README.md', import.meta.url), 'utf8')

test('secret Doom route is noindex and absent from navigation and footer', () => {
  assert.match(page, /robots="noindex,nofollow"/)
  assert.doesNotMatch(navigation, /\/virtual/)
  assert.doesNotMatch(footer, /\/virtual/)
})

test('Doom intro keeps the punchline and links to Universe virtual registration and on demand', async () => {
  const callout = await readFile(new URL('../src/components/universe-callout.astro', import.meta.url), 'utf8')
  assert.match(page, /But does it run DOOM\?<\/h1>/)
  assert.match(page, /On a GitHub badge\? Seriously\?<\/p>/)
  assert.match(page, /Of course it does\.<\/p>\s*<UniverseCallout \/>\s*<DoomDownload \/>\s*<\/header>\s*<DoomSimulator \/>/)
  assert.doesNotMatch(page, /Secret editor route/)
  assert.ok(callout.includes('href="https://githubuniverse.com/?utm_source=GitHub&utm_medium=Site&utm_campaign=virtual_badge_uni_26"'))
  assert.match(callout, /Register virtually \/ watch on demand/)
  assert.match(callout, /Hear more about the badge in the keynotes\./)
  assert.doesNotMatch(callout, /Missed the action|Catch it on demand/)
})

test('badge firmware download follows Universe with accessible installation help', async () => {
  const download = await readFile(new URL('../src/components/doom-download.astro', import.meta.url), 'utf8')
  const viewer = await readFile(new URL('../src/components/document-viewer.astro', import.meta.url), 'utf8')
  assert.match(download, /href=\{sitePath\('\/doom\/downloads\/doom\.uf2'\)\}/)
  assert.match(download, /download="doom\.uf2"/)
  assert.match(download, /Get DOOM for your badge/)
  assert.match(download, /<DocumentViewer id="doom-install"/)
  assert.match(download, /title: 'Install Doom on your badge',\s*label: 'Installation help'/)
  assert.doesNotMatch(download, /label: '\?'/)
  assert.match(download, /Hold HOME, tap RESET once/)
  assert.match(download, /RP2350 drive, not the BADGER drive/)
  assert.match(download, /Flashing replaces the firmware/)
  assert.match(download, /Back up your badge files/)
  assert.match(download, /To return to MonaOS/)
  assert.match(viewer, /aria-label=\{label \? title : undefined\}/)
  assert.match(viewer, /title\.textContent = link\.getAttribute\('aria-label'\) \|\| link\.textContent/)
  const firmware = await readFile(new URL('../public/doom/downloads/doom.uf2', import.meta.url))
  assert.equal(firmware.length % 512, 0)
  assert.equal(firmware.readUInt32LE(0), 0x0a324655)
  assert.equal(firmware.readUInt32LE(4), 0x9e5d5157)
})

test('bottom link list is removed while video return controls remain available', async () => {
  const links = await readFile(new URL('../src/components/doom-badge-links.astro', import.meta.url), 'utf8')
  assert.doesNotMatch(links, /<nav|Five lower badge buttons|doomBadgeActions|data-doom-video-open/)
  assert.match(links, /data-doom-video-toolbar/)
  assert.match(links, /data-doom-video-close/)
})

test('Doom starts with the noclip protip and includes contextual avatar hints', async () => {
  const tips = await readFile(new URL('../src/components/doom-pro-tip.astro', import.meta.url), 'utf8')
  assert.match(page, /<DoomProTip \/>/)
  assert.match(tips, /Once the game has started, click the badge screen and type/)
  assert.match(tips, /<code[^>]*>IDSPISPOPD<\/code>/)
  assert.match(tips, /to walk through walls\./)
  assert.ok(tips.includes('https://github.com/id-Software/DOOM/blob/a77dfb96cb91780ca334d0d4cfd86957558007e0/linuxdoom-1.10/st_stuff.c#L426-L431'))
  assert.match(tips, /prefers-reduced-motion: reduce/)
  assert.match(tips, /sitePath\('\/images\/mona-mindblown\.webp'\)/)
  assert.match(tips, /sitePath\('\/images\/mona-mindblown\.gif'\)/)
  assert.match(tips, /alt="Mindblown Mona" width="32" height="32"/)
  assert.match(tips, /Explore this and other cheat codes in the original source code/)
  assert.match(tips, /data-doom-tip-default/)
  assert.match(tips, /data-doom-tip-discover hidden/)
  assert.match(tips, /Once the game has started, click the badge screen, type <code[^>]*>@YOUR-GITHUB-USERNAME<\/code>, then press Enter/)
  assert.match(tips, /data-doom-tip-change hidden/)
  assert.doesNotMatch(tips, /sessionStorage|Use the arrow keys|Knee-Deep in the Dead|lower right physical button/)
})

test('legal notices and keyboard controls use collapsed native disclosures', async () => {
  const legal = await readFile(new URL('../src/components/doom-legal.astro', import.meta.url), 'utf8')
  assert.match(page, /<DoomLegal \/>/)
  assert.match(legal, /<details>/)
  assert.match(legal, /The boring legal stuff/)
  assert.match(legal, /© id Software/)
  assert.match(legal, /Not affiliated with id Software, Bethesda Softworks, or Microsoft/)
  assert.match(legal, /Shareware license/)
  assert.match(legal, /Engine GPLv2/)
  assert.match(legal, /Corresponding source/)
  assert.match(component, /<details class="doom-controls[^"]*">/)
  assert.match(component, /<summary[^>]*>Controls<\/summary>/)
  assert.doesNotMatch(`${legal}\n${component}`, /<details[^>]*\bopen\b/)
})

test('Doom starts with the complete badge visible rather than screen zoom', () => {
  assert.match(component, /data-model-full[^>]*aria-pressed="true"/)
  assert.match(component, /data-model-screen[^>]*aria-pressed="false"/)
})

test('Doom omits the bottom control buttons and asset checksum details', () => {
  assert.doesNotMatch(component, /data-doom-button|doom-key|Doom badge controls/)
  assert.doesNotMatch(component, /DoomAvatarControls|data-doom-avatar-(?:form|status)/)
  assert.doesNotMatch(page, /SHA-256|4,196,020|1d7d43be501e67d927/)
  assert.match(page, /Doom 1 v1\.9 shareware/)
})

test('page accurately names shareware and exposes the complete control set', () => {
  assert.match(page, /Doom 1 v1\.9 shareware/)
  assert.doesNotMatch(`${page}\n${component}`, /freeware/i)
  for (const control of ['Ctrl/J fire', 'Space/K use', 'Shift/Alt strafe', 'Escape menu', 'Enter confirm']) {
    assert.match(component, new RegExp(control.replace('/', '\\/')))
  }
  assert.doesNotMatch(component, /data-doom-start/)
  assert.match(component, /data-doom-load-state/)
  assert.match(doomPage, /void boot\(\)/)
  assert.match(doomPage, /root\.addEventListener\('pointerdown', unlockAudio/)
})

test('explicit rotation counter-rotates Doom and remaps held physical controls', () => {
  assert.match(doomPage, /model\.setRotated\(rotated\)/)
  assert.match(doomPage, /model\.setDisplayRotated\(rotated\)/)
  assert.match(doomPage, /modelRelative: true/)
  assert.match(doomPage, /displayFit: 'stretch'/)
  assert.match(doomPage, /if \(!modelRelative\) continue/)
  assert.match(doomPage, /badgeDoomKey\(bit, rotated\)/)
  assert.match(badgeModel, /if \(displayRotated\)[\s\S]*context\.rotate\(Math\.PI\)/)
  assert.match(readme, /Keyboard arrow keys always retain viewer-relative/)
})

test('rotation remaps model-relative inputs without changing fixed controls', async t => {
  class Element extends EventTarget {
    constructor(dataset = {}) {
      super()
      this.dataset = dataset
      this.hidden = false
      this.disabled = false
      this.textContent = ''
    }
    setAttribute(name, value) { this[name] = value }
    removeAttribute(name) { delete this[name] }
    setPointerCapture() {}
    focus() {}
  }

  const left = new Element({ badgeBit: '256' })
  const up = new Element({ badgeBit: '2048' })
  const canvas = Object.assign(new Element(), {
    width: 320,
    height: 200,
    getContext: () => ({
      fillStyle: '',
      font: '',
      fillRect() {},
      fillText() {},
      drawImage() {},
      getImageData: () => ({ data: new Uint8ClampedArray(320 * 32 * 4) }),
    }),
  })
  const runtimeCanvas = Object.assign(new Element(), {
    width: 320,
    height: 200,
    getContext: () => ({
      fillStyle: '',
      font: '',
      fillRect() {},
      fillText() {},
    }),
  })
  const rotate = new Element()
  const video = new Element()
  const videoFrame = new Element()
  const videoClose = new Element()
  const videoOpen = new Element()
  const videoToolbar = new Element()
  const partyVideo = Object.assign(new Element(), { pause() {}, load() {} })
  const modelHost = new Element()
  modelHost.querySelector = () => canvas
  const elements = new Map([
    ['[data-doom-screen]', canvas],
    ['[data-doom-runtime-screen]', runtimeCanvas],
    ['[data-doom-model]', modelHost],
    ['[data-doom-fallback]', new Element()],
    ['[data-model-rotate]', rotate],
    ['[data-doom-status]', new Element()],
    ['[data-doom-load-state]', new Element()],
    ['[data-model-screen]', new Element()],
    ['[data-model-full]', new Element()],
    ['[data-model-status]', new Element()],
    ['[data-model-zoom-in]', new Element()],
    ['[data-model-zoom-out]', new Element()],
    ['[data-doom-video]', video],
    ['[data-doom-video-frame]', videoFrame],
    ['[data-doom-video-close]', videoClose],
    ['[data-doom-video-toolbar]', videoToolbar],
    ['[data-party-marty-video]', partyVideo],
  ])
  const root = new Element()
  root.querySelector = selector => elements.get(selector)
  root.querySelectorAll = selector => {
    if (selector === '[data-doom-button]') return [left, up]
    if (selector === '[data-doom-video-open]') return [videoOpen]
    return []
  }

  const document = Object.assign(new EventTarget(), { hidden: false, title: 'D00M3D' })
  const opened = []
  const window = Object.assign(new EventTarget(), {
    setTimeout,
    AudioContext: undefined,
    open: (...args) => opened.push(args),
  })
  const previous = new Map()
  for (const [name, value] of Object.entries({ Element, HTMLElement: Element, document, window })) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
  }
  t.after(() => {
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else delete globalThis[name]
    }
    delete globalThis.__doomModelInput
    delete globalThis.__doomRuntime
  })

  const changes = []
  const playback = []
  globalThis.__doomRuntime = {
    key: (key, pressed) => changes.push([key, pressed]),
    pause() { playback.push('pause') },
    resume() { playback.push('resume') },
    syncSaves: async () => {},
    dispose() {},
  }
  const { initDoomPage } = await compileDoomPage()
  const messages = []
  const originalInfo = console.info
  console.info = (...args) => messages.push(args)
  t.after(() => { console.info = originalInfo })
  const page = initDoomPage(root)
  await page.start()
  assert.deepEqual(messages, [[
    '%cNot-so-secret cheat code:%c Type @[YOUR-GITHUB-USERNAME] and then ENTER for a surprise.',
    'font-weight: bold',
    'font-weight: normal',
  ]])
  assert.equal(elements.get('[data-doom-status]').hidden, true)
  assert.equal(document.title, 'D00M3D')
  page.key('ControlLeft', true)
  document.dispatchEvent(new Event('document-viewer:open'))
  assert.deepEqual(changes.splice(0), [['ControlLeft', true], ['ControlLeft', false]])
  assert.deepEqual(playback.splice(0), ['pause'])
  document.dispatchEvent(new Event('visibilitychange'))
  assert.deepEqual(playback.splice(0), ['pause'])
  document.hidden = true
  document.dispatchEvent(new Event('document-viewer:close'))
  assert.deepEqual(playback.splice(0), [])
  document.hidden = false
  document.dispatchEvent(new Event('visibilitychange'))
  assert.deepEqual(playback.splice(0), ['resume'])
  await Promise.resolve()
  const modelInput = globalThis.__doomModelInput
  const pointer = type => {
    const event = new Event(type)
    Object.defineProperties(event, {
      button: { value: 0 },
      pointerId: { value: 1 },
      detail: { value: 1 },
    })
    return event
  }
  const toggleRotation = () => rotate.dispatchEvent(new Event('click'))

  left.dispatchEvent(pointer('pointerdown'))
  left.dispatchEvent(pointer('pointerup'))
  assert.deepEqual(changes.splice(0), [['ArrowLeft', true], ['ArrowLeft', false]])

  toggleRotation()
  up.dispatchEvent(pointer('pointerdown'))
  up.dispatchEvent(pointer('pointerup'))
  assert.deepEqual(changes.splice(0), [['ArrowUp', true], ['ArrowUp', false]])

  modelInput(256, true)
  modelInput(256, false)
  assert.deepEqual(changes.splice(0), [['ArrowRight', true], ['ArrowRight', false]])

  toggleRotation()
  modelInput(256, true)
  toggleRotation()
  modelInput(256, false)
  assert.deepEqual(changes.splice(0), [
    ['ArrowLeft', true],
    ['ArrowLeft', false],
    ['ArrowRight', true],
    ['ArrowRight', false],
  ])

  left.dispatchEvent(pointer('pointerdown'))
  toggleRotation()
  left.dispatchEvent(pointer('pointerup'))
  assert.deepEqual(changes.splice(0), [['ArrowLeft', true], ['ArrowLeft', false]])

  toggleRotation()
  left.dispatchEvent(pointer('pointerdown'))
  modelInput(256, true)
  left.dispatchEvent(pointer('pointerup'))
  modelInput(256, false)
  assert.deepEqual(changes.splice(0), [
    ['ArrowLeft', true],
    ['ArrowRight', true],
    ['ArrowLeft', false],
    ['ArrowRight', false],
  ])

  left.dispatchEvent(pointer('pointerdown'))
  modelInput(512, true)
  left.dispatchEvent(pointer('pointerup'))
  assert.deepEqual(changes.splice(0), [['ArrowLeft', true]])
  modelInput(512, false)
  assert.deepEqual(changes.splice(0), [['ArrowLeft', false]])

  toggleRotation()
  for (const [bit, href] of [
    [16, 'https://www.reddit.com/r/itrunsdoom/'],
    [8, 'https://canitrundoom.org/'],
    [4, 'https://github.com/id-Software/DOOM'],
    [1, 'https://githubuniverse.com/?utm_source=GitHub&utm_medium=Site&utm_campaign=virtual_badge_uni_26'],
  ]) {
    modelInput(bit, true)
    toggleRotation()
    modelInput(bit, false)
    assert.deepEqual(changes.splice(0), [])
    assert.deepEqual(opened.splice(0), [[href, '_blank', 'noopener,noreferrer']])
  }

  modelInput(1024, true)
  modelInput(2, true)
  modelInput(2, false)
  assert.deepEqual(changes.splice(0), [
    ['ControlLeft', true],
    ['ControlLeft', false],
  ])
  assert.deepEqual(playback.splice(0), ['pause'])
  assert.equal(video.hidden, false)
  assert.equal(videoToolbar.hidden, false)
  assert.equal(left.disabled, true)
  assert.equal(videoFrame.src, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&playsinline=1&rel=0')
  assert.deepEqual(opened, [])

  page.key('Space', true)
  modelInput(1024, true)
  modelInput(1024, false)
  assert.deepEqual(changes.splice(0), [])
  document.dispatchEvent(new Event('document-viewer:open'))
  document.dispatchEvent(new Event('document-viewer:close'))
  document.dispatchEvent(new Event('visibilitychange'))
  assert.deepEqual(playback.splice(0), ['pause', 'pause'])

  videoClose.dispatchEvent(new Event('click'))
  assert.equal(videoFrame.src, undefined)
  assert.equal(video.hidden, true)
  assert.equal(videoToolbar.hidden, true)
  assert.equal(left.disabled, false)
  assert.deepEqual(playback.splice(0), ['resume'])
  page.key('Space', true)
  page.key('Space', false)
  assert.deepEqual(changes.splice(0), [['Space', true], ['Space', false]])

  videoOpen.dispatchEvent(new Event('click'))
  assert.equal(video.hidden, false)
  page.dispose()
  assert.equal(videoFrame.src, undefined)
})

test('fallback resets rotation so visible arrow controls stay viewer-relative', () => {
  let rotated = doomRotation(true, false)
  assert.equal(badgeDoomKey(256, rotated), 'ArrowRight')
  assert.equal(badgeDoomKey(2048, rotated), 'ArrowDown')

  rotated = doomRotation(rotated, true)
  assert.equal(rotated, false)
  assert.equal(badgeDoomKey(256, rotated), 'ArrowLeft')
  assert.equal(badgeDoomKey(512, rotated), 'ArrowRight')
  assert.equal(badgeDoomKey(2048, rotated), 'ArrowUp')
  assert.equal(badgeDoomKey(4096, rotated), 'ArrowDown')

  rotated = doomRotation(!rotated, true)
  assert.equal(rotated, false)
  assert.equal(badgeDoomKey(256, rotated), doomKey({ code: 'ArrowLeft' }))
  assert.match(doomPage, /fallbackMode = true[\s\S]*rotate\.disabled = true[\s\S]*applyOrientation\(false\)/)
})
