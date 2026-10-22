import { execFile } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { promisify } from 'node:util'

const run = promisify(execFile)
export const webpByteLimit = 10_000_000

export async function encodeDoomWebp(frames, fps, output, byteLimit = webpByteLimit) {
  const inputs = frames.flatMap((frame, index) => [
    '-d', String(Math.round((index + 1) * 1000 / fps) - Math.round(index * 1000 / fps)), frame,
  ])
  for (const quality of [75, 55, 35, 15]) {
    await run('img2webp', ['-loop', '0', '-min_size', '-lossy', '-q', String(quality), '-m', '4', ...inputs, '-o', output])
    const { size } = await stat(output)
    if (size < byteLimit) return { size, quality }
    console.log(`WebP at quality ${quality} exceeds the size limit; reducing quality.`)
  }
  throw new Error(`Could not encode WebP under ${byteLimit} bytes. Reduce --fps or --seconds.`)
}
