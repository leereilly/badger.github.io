import { spawnSync } from 'node:child_process'
import { mkdtemp, rename, rm, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { captureOptions, loopAngle, renderAngle, withDoomCapture } from './lib/doom-capture.mjs'
import { encodeDoomWebp, webpByteLimit } from './lib/doom-webp.mjs'

let temporary
try {
  const options = captureOptions('webp')
  for (const tool of ['img2webp', 'webpmux']) {
    if (spawnSync(tool, ['-version'], { stdio: 'ignore' }).status !== 0) {
      throw new Error(`Install the WebP tools before capturing (${tool} is missing), e.g. brew install webp.`)
    }
  }
  const output = resolve(options.output)
  await withDoomCapture(options, async page => {
    temporary = await mkdtemp(join(dirname(output), '.doom-webp-'))
    const frames = []
    const count = options.fps * options.seconds
    for (let index = 0; index < count; index++) {
      if (index) await page.clock.runFor(Math.round(index * 1000 / options.fps) - Math.round((index - 1) * 1000 / options.fps))
      await renderAngle(page, loopAngle(index, count))
      const path = join(temporary, `${index}.png`)
      await page.screenshot({ path, type: 'png', omitBackground: true, animations: 'allow' })
      frames.push(path)
      if (index % options.fps === 0) console.log(`Captured ${index / options.fps}/${options.seconds}s`)
    }
    const encoded = join(temporary, 'encoded.webp')
    const result = await encodeDoomWebp(frames, options.fps, encoded)
    const ready = join(temporary, 'ready.webp')
    const mux = spawnSync('webpmux', ['-set', 'bgcolor', '0,0,0,0', encoded, '-o', ready], { encoding: 'utf8' })
    if (mux.status !== 0) throw new Error(`Could not set transparent WebP canvas: ${mux.stderr}`)
    if ((await stat(ready)).size >= webpByteLimit) throw new Error('Final WebP exceeds the 10 MB limit; reduce --fps or --seconds.')
    await rename(ready, output)
    console.log(`Saved ${output} (${options.width}x${options.height}, ${options.fps} fps, ${options.seconds}s, ${(result.size / 1_000_000).toFixed(2)} MB, quality ${result.quality}, transparent infinite loop).`)
  })
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  if (temporary) await rm(temporary, { recursive: true, force: true })
}
