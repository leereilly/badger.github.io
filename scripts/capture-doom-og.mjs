import { captureOptions, renderAngle, withDoomCapture } from './lib/doom-capture.mjs'

try {
  const options = captureOptions('og')
  await withDoomCapture(options, async page => {
    await renderAngle(page, 0)
    await page.screenshot({ path: options.output, type: 'png', animations: 'allow' })
  })
  console.log(`Saved ${options.output} (1200x630).`)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
