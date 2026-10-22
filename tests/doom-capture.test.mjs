import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { captureOptions, decodeDoomHud, loopAngle } from '../scripts/lib/doom-capture.mjs'
import { encodeDoomWebp } from '../scripts/lib/doom-webp.mjs'

test('capture defaults to UHD and rejects invalid frame counts and unknown options', () => {
  assert.deepEqual(captureOptions('video', []), {
    output: 'artifacts/d00m3d-loop.mp4', url: undefined,
    width: 3840, height: 2160, fps: 30, seconds: 12, timeout: 120000,
  })
  for (const args of [['--fps', '0'], ['--seconds', 'NaN'], ['--seconds', '0.01'], ['--typo', '1']]) {
    assert.throws(() => captureOptions('video', args))
  }
  assert.equal(captureOptions('og', []).width, 1200)
  assert.equal(captureOptions('og', []).height, 630)
})

test('WebP capture uses a smaller transparent animation without changing video defaults', () => {
  const options = captureOptions('webp', [])
  assert.equal(options.output, 'artifacts/d00m3d-loop.webp')
  assert.equal(options.width, 960)
  assert.equal(options.height, 540)
  assert.equal(options.fps, 20)
  assert.equal(options.seconds, 12)
  assert.equal(options.transparent, true)
  assert.equal(captureOptions('webp', ['--fps', '25', '--seconds', '4']).fps, 25)
  assert.throws(() => captureOptions('webp', ['--seconds', '0.05']), /at least two frames/)
})

test('one turn starts on the gameplay side without duplicating the endpoint', () => {
  const count = 360
  const step = Math.PI * 2 / count
  assert.equal(loopAngle(0, count), 0)
  assert.ok(Math.abs(loopAngle(count, count) - loopAngle(0, count) - Math.PI * 2) < 1e-12)
  assert.ok(Math.abs(loopAngle(count - 1, count) + step - loopAngle(count, count)) < 1e-12)
})

test('WebP encoder writes WebP and rejects an unattainable size limit', {
  skip: spawnSync('img2webp', ['-version'], { stdio: 'ignore' }).status !== 0,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'doom-webp-test-'))
  try {
    const frame = join(directory, 'frame.png')
    const output = join(directory, 'animation.webp')
    await writeFile(frame, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'))
    const result = await encodeDoomWebp([frame, frame], 20, output)
    assert.equal(result.size, (await stat(output)).size)
    assert.ok(result.size < 10_000_000)
    assert.equal((await readFile(output)).toString('ascii', 8, 12), 'WEBP')
    await assert.rejects(encodeDoomWebp([frame, frame], 20, output, 1), /Reduce --fps or --seconds/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('HUD decoder reads palette and column posts, rejecting missing or malformed WADs', () => {
  const palette = Buffer.alloc(768)
  palette.set([20, 30, 40], 3)
  const patch = Buffer.alloc(20)
  patch.writeUInt16LE(1, 0)
  patch.writeUInt16LE(2, 2)
  patch.writeUInt32LE(12, 8)
  patch.set([0, 2, 0, 1, 1, 0, 255], 12)
  const directory = 12 + palette.length + patch.length
  const wad = Buffer.alloc(directory + 32)
  wad.write('IWAD')
  wad.writeUInt32LE(2, 4)
  wad.writeUInt32LE(directory, 8)
  palette.copy(wad, 12)
  patch.copy(wad, 12 + palette.length)
  for (const [index, name, offset, size] of [
    [0, 'PLAYPAL', 12, palette.length], [1, 'STBAR', 12 + palette.length, patch.length],
  ]) {
    wad.writeUInt32LE(offset, directory + index * 16)
    wad.writeUInt32LE(size, directory + index * 16 + 4)
    wad.write(name, directory + index * 16 + 8)
  }
  assert.deepEqual(decodeDoomHud(wad), { width: 1, height: 2, pixels: [20, 30, 40, 255, 20, 30, 40, 255] })
  assert.throws(() => decodeDoomHud(Buffer.from('bad')), /WAD/)
  wad.write('ABSENT', directory + 24)
  assert.throws(() => decodeDoomHud(wad), /STBAR/)
})
