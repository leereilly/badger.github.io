import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { rename, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { captureOptions, loopAngle, renderAngle, withDoomCapture } from './lib/doom-capture.mjs'

try {
  const options = captureOptions('video')
  if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0) throw new Error('Install FFmpeg before capturing video.')
  const output = resolve(options.output)
  const temporary = `${output}.${process.pid}.tmp.mp4`
  const ready = `${output}.${process.pid}.ready.mp4`
  const count = options.fps * options.seconds
  const split = Math.floor(count / 2)
  try {
    await withDoomCapture(options, async page => {
      const encoder = spawn('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-f', 'image2pipe', '-framerate', String(options.fps), '-i', 'pipe:0',
        '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '0',
        '-pix_fmt', 'yuv420p', '-movflags', '+faststart', temporary,
      ], { stdio: ['pipe', 'ignore', 'pipe'] })
      let errors = ''
      encoder.stderr.on('data', chunk => { errors += chunk })
      const finished = new Promise((accept, reject) => {
        encoder.once('error', reject)
        encoder.once('close', code => code === 0 ? accept() : reject(new Error(`FFmpeg failed (${code}): ${errors}`)))
      })
      // Observe early failures while the browser is still generating frames.
      finished.catch(() => {})
      encoder.stdin.on('error', () => {})
      try {
        for (let index = 0; index < count; index++) {
          if (index) await page.clock.runFor(Math.round(index * 1000 / options.fps) - Math.round((index - 1) * 1000 / options.fps))
          await renderAngle(page, loopAngle(index - split, count))
          const png = await page.screenshot({ type: 'png', animations: 'allow' })
          if (encoder.exitCode !== null || encoder.stdin.destroyed) throw new Error(`FFmpeg stopped: ${errors}`)
          if (!encoder.stdin.write(png)) await once(encoder.stdin, 'drain')
          if (index % options.fps === 0) console.log(`Captured ${index / options.fps}/${options.seconds}s`)
        }
        encoder.stdin.end()
        await finished
      } catch (error) {
        encoder.kill('SIGTERM')
        await finished.catch(() => {})
        throw error
      }
    })
    // Move the source cut to the hidden back; the visible gameplay stays continuous across the loop.
    const rotated = spawnSync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-ss', String(split / options.fps), '-i', temporary,
      ...(split ? ['-i', temporary, '-filter_complex',
        `[0:v]setpts=PTS-STARTPTS[tail];[1:v]trim=end_frame=${split},setpts=PTS-STARTPTS[head];[tail][head]concat=n=2:v=1:a=0[loop]`,
      '-map', '[loop]'] : []),
      '-frames:v', String(count), '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart', ready,
    ], { encoding: 'utf8' })
    if (rotated.status !== 0) throw new Error(`Could not join the front-first video loop: ${rotated.stderr}`)
    await rename(ready, output)
    console.log(`Saved ${output} (3840x2160, ${options.fps} fps, ${options.seconds}s, silent seamless turn).`)
  } finally {
    await rm(temporary, { force: true })
    await rm(ready, { force: true })
  }
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
