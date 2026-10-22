import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { createServer } from 'node:net'
import { dirname, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

export const projectRoot = fileURLToPath(new URL('../../', import.meta.url))

export function captureOptions(kind, args = process.argv.slice(2)) {
  const { values } = parseArgs({
    args,
    options: Object.fromEntries(['output', 'url', 'fps', 'seconds', 'timeout'].map(key => [key, { type: 'string' }])),
  })
  const fps = Number(values.fps ?? (kind === 'webp' ? 20 : 30))
  const seconds = Number(values.seconds ?? 12)
  const timeout = Number(values.timeout ?? 120000)
  if (!Number.isInteger(fps) || fps < 1 || fps > 120) throw new Error('--fps must be an integer from 1 to 120.')
  if (!Number.isFinite(seconds) || seconds <= 0 || !Number.isSafeInteger(fps * seconds)) {
    throw new Error('--seconds must produce a positive, whole number of frames.')
  }
  if (!Number.isFinite(timeout) || timeout <= 0) throw new Error('--timeout must be positive (milliseconds).')
  if (kind === 'webp' && fps * seconds < 2) throw new Error('Animated WebP requires at least two frames.')
  if (values.url && !['http:', 'https:'].includes(new URL(values.url).protocol)) throw new Error('--url must be HTTP(S).')
  return {
    output: values.output ?? (kind === 'webp' ? 'artifacts/d00m3d-loop.webp' : kind === 'video' ? 'artifacts/d00m3d-loop.mp4' : 'public/images/d00m3d-og.png'),
    url: values.url,
    width: kind === 'webp' ? 960 : kind === 'video' ? 3840 : 1200,
    height: kind === 'webp' ? 540 : kind === 'video' ? 2160 : 630,
    ...(kind === 'webp' ? { transparent: true } : {}),
    fps, seconds, timeout,
  }
}

export function loopAngle(index, count) {
  return Math.PI * 2 * index / count
}

export function decodeDoomHud(bytes) {
  const wad = Buffer.from(bytes)
  if (wad.length < 12 || !['IWAD', 'PWAD'].includes(wad.toString('ascii', 0, 4))) throw new Error('Invalid Doom WAD.')
  const count = wad.readUInt32LE(4)
  const directory = wad.readUInt32LE(8)
  if (directory + count * 16 > wad.length) throw new Error('Invalid WAD directory.')
  function lump(name) {
    for (let index = 0; index < count; index++) {
      const entry = directory + index * 16
      if (wad.toString('ascii', entry + 8, entry + 16).replace(/\0/g, '') !== name) continue
      const start = wad.readUInt32LE(entry)
      const end = start + wad.readUInt32LE(entry + 4)
      if (end > wad.length) throw new Error(`Invalid WAD lump: ${name}.`)
      return wad.subarray(start, end)
    }
    throw new Error(`WAD is missing ${name}.`)
  }
  const palette = lump('PLAYPAL')
  const patch = lump('STBAR')
  if (palette.length < 768 || patch.length < 8) throw new Error('Invalid WAD HUD.')
  const width = patch.readUInt16LE(0)
  const height = patch.readUInt16LE(2)
  if (!width || !height || width > 320 || height > 200 || patch.length < 8 + width * 4) throw new Error('Invalid WAD HUD dimensions.')
  const pixels = new Uint8Array(width * height * 4)
  for (let x = 0; x < width; x++) {
    let cursor = patch.readUInt32LE(8 + x * 4)
    for (;;) {
      if (cursor >= patch.length) throw new Error('Invalid WAD HUD column.')
      const top = patch[cursor++]
      if (top === 255) break
      const length = patch[cursor++]
      cursor++
      if (cursor + length + 1 > patch.length || top + length > height) throw new Error('Invalid WAD HUD post.')
      for (let y = 0; y < length; y++) {
        const color = patch[cursor + y] * 3
        pixels.set([...palette.subarray(color, color + 3), 255], ((top + y) * width + x) * 4)
      }
      cursor += length + 1
    }
  }
  return { width, height, pixels: [...pixels] }
}

async function startSite(timeout) {
  const socket = createServer()
  await new Promise((accept, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', accept) })
  const { port } = socket.address()
  await new Promise(accept => socket.close(accept))
  const child = spawn(process.execPath, ['node_modules/astro/astro.js', 'dev', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, BASE_PATH: '/' },
  })
  let log = ''
  child.stdout.on('data', chunk => { log = (log + chunk).slice(-8000) })
  child.stderr.on('data', chunk => { log = (log + chunk).slice(-8000) })
  const stop = async () => {
    if (child.exitCode !== null) return
    const exited = new Promise(accept => child.once('exit', accept))
    child.kill('SIGTERM')
    await exited
  }
  const url = `http://127.0.0.1:${port}/d00m3d/`
  try {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`Astro exited:\n${log}`)
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(2000) })
        if (response.ok) return { url, stop }
      } catch {}
      await delay(250)
    }
    throw new Error(`Astro did not become ready:\n${log}`)
  } catch (error) {
    await stop()
    throw error
  }
}

export async function withDoomCapture(options, capture) {
  const { chromium } = await import('playwright')
  let site
  let browser
  try {
    if (!options.url) site = await startSite(options.timeout)
    const url = new URL(options.url ?? site.url)
    if (!url.pathname.endsWith('/')) url.pathname += '/'
    url.searchParams.set('capture', '1')
    browser = await chromium.launch()
    const page = await browser.newPage({
      viewport: { width: options.width, height: options.height },
      deviceScaleFactor: 1, colorScheme: 'dark', reducedMotion: 'reduce',
    })
    page.setDefaultTimeout(options.timeout)
    // Source edits and concurrent builds must not reload a paused recording.
    if (site) await page.routeWebSocket('**', socket => socket.close())
    // Install before boot so Emscripten and the recorder share a monotonic clock.
    await page.clock.install()
    await page.goto(url.href, { waitUntil: 'networkidle', timeout: options.timeout })
    await page.waitForFunction(() =>
      document.querySelector('[data-doom-model]')?.dataset.captureReady === 'true' &&
      document.querySelector('[data-doom-load-state]')?.textContent === 'Running',
    null, { timeout: options.timeout })
    const wadURL = new URL('../doom/DOOM1.WAD', url)
    const response = await page.request.get(wadURL.href)
    if (!response.ok()) throw new Error(`Could not read Doom HUD reference: HTTP ${response.status()}.`)
    const hud = decodeDoomHud(await response.body())
    console.log('Waiting for the Doom demo HUD and moving gameplay (not the title screen)...')
    await page.waitForFunction(({ width, height, pixels }) => {
      const source = document.querySelector('[data-doom-screen]')
      if (!source) return false
      const context = source.getContext('2d')
      const actual = context.getImageData(0, source.height - height, width, height).data
      let matching = 0
      let samples = 0
      for (let i = 0; i < pixels.length; i += 4 * 7) {
        if (!pixels[i + 3]) continue
        samples++
        if (Math.abs(actual[i] - pixels[i]) + Math.abs(actual[i + 1] - pixels[i + 1]) + Math.abs(actual[i + 2] - pixels[i + 2]) < 45) matching++
      }
      if (matching / samples < 0.6) { delete source.dataset.captureScene; return false }
      const scene = context.getImageData(0, 0, width, source.height - height).data
      let hash = 0
      for (let i = 0; i < scene.length; i += 97) hash = (hash * 31 + scene[i]) | 0
      const previous = source.dataset.captureScene
      source.dataset.captureScene = String(hash)
      return previous !== undefined && previous !== String(hash)
    }, hud, { polling: 100, timeout: options.timeout })
    await page.addStyleTag({ content: `
      body { overflow: hidden !important; }
      body > :not(main), main > :not(.doom-layout),
      .doom-layout > :not(#doom-simulator), #doom-simulator > :not(.doom-stage),
      .doom-stage > :not([data-doom-model]), [data-doom-model] > :not(canvas[role="img"]) { display: none !important; }
      main, .doom-layout, #doom-simulator, .doom-stage, [data-doom-model] {
        position: static !important; display: block !important; width: 100vw !important;
        height: 100vh !important; min-height: 0 !important; max-height: none !important;
        margin: 0 !important; padding: 0 !important; border: 0 !important;
      }
      [data-doom-model] { background: hsl(var(--background)) !important; }
      canvas[role="img"] { outline: none !important; }
      ${options.transparent ? `
        html, body, main, .doom-layout, #doom-simulator, .doom-stage, [data-doom-model] {
          background: transparent !important; box-shadow: none !important;
        }
        body::before, body::after { display: none !important; }
      ` : ''}
    ` })
    await page.evaluate(() => document.activeElement?.blur())
    await page.clock.pauseAt(new Date(Date.now() + 1000))
    await page.clock.runFor(100)
    await mkdir(dirname(resolve(options.output)), { recursive: true })
    await capture(page)
  } finally {
    await browser?.close()
    await site?.stop()
  }
}

export async function renderAngle(page, angle) {
  await page.evaluate(angle => {
    const host = document.querySelector('[data-doom-model]')
    if (host?.dataset.captureReady !== 'true') throw new Error('Capture renderer is unavailable. Use the local source or deploy the capture hook first.')
    host.dispatchEvent(new CustomEvent('badge:capture', { detail: { angle } }))
  }, angle)
}
