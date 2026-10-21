// STBAR border samples from the bundled Doom 1 shareware WAD, outside changing HUD fields.
const hudSamples = [
  [0, 168, 151], [0, 188, 139],
  [4, 196, 87], [20, 199, 47], [30, 198, 79], [70, 199, 35],
  [100, 199, 71], [130, 199, 47], [180, 199, 59], [210, 199, 47],
  [250, 199, 47], [280, 199, 27], [315, 171, 67], [319, 180, 39],
  [318, 188, 67], [315, 196, 55],
]

export function hasDoomHud(context: CanvasRenderingContext2D) {
  const { data } = context.getImageData(0, 168, 320, 32)
  const levels = hudSamples.map(([x, y]) => data[((y - 168) * 320 + x) * 4 + 1])
  const low = Math.min(...levels)
  const range = Math.max(...levels) - low
  if (range < 20) return false
  // Normalize palette flashes and gamma without treating the title screen as a HUD.
  return levels.filter((level, index) => Math.abs((level - low) / range - (hudSamples[index][2] - 27) / 124) < 0.12).length >= 14
}

function cheatKey(letter: string, type: 'keydown' | 'keypress' | 'keyup') {
  const code = type === 'keypress' ? letter.charCodeAt(0) : letter.toUpperCase().charCodeAt(0)
  const event = new KeyboardEvent(type, {
    key: letter,
    code: `Key${letter.toUpperCase()}`,
    keyCode: code,
    charCode: type === 'keypress' ? code : 0,
    which: code,
    bubbles: true,
    cancelable: true,
  })
  document.dispatchEvent(event)
}

export function createPartyMarty(
  root: HTMLElement,
  video: HTMLVideoElement,
  signal: AbortSignal,
  reportError: (message: string) => void,
) {
  let buffer = ''
  let active = false
  let paused = false
  let started = false
  let pending = ''
  let nextKey = 0
  let nextRefill = 0
  let failed = false
  const fail = (error: unknown) => {
    if (failed || signal.aborted) return
    failed = true
    video.pause()
    console.warn('Party Marty video could not be played.', error)
    reportError('Party Marty video unavailable. Doom cheats remain active.')
  }
  const play = () => {
    if (active && !paused && !failed) void video.play().catch(fail)
  }
  root.addEventListener('keydown', event => {
    const target = event.target instanceof Element ? event.target : null
    if (active || paused || event.repeat || event.isComposing) return
    if (event.ctrlKey || event.altKey || event.metaKey || target?.closest('input, textarea, select, [contenteditable], [role="textbox"]')) {
      buffer = ''
      return
    }
    buffer = /^[a-z]$/i.test(event.key) ? (buffer + event.key.toLowerCase()).slice(-10) : ''
    if (buffer !== 'partymarty') return
    active = true
    video.src = '/doom/partymarty.mp4'
    play()
  }, { signal })
  video.addEventListener('error', () => fail(video.error), { signal })
  window.addEventListener('blur', () => { buffer = '' }, { signal })

  return {
    render(context: CanvasRenderingContext2D, now = performance.now()) {
      if (!active || paused) return
      const hud = hasDoomHud(context)
      if (hud && !started) {
        started = true
        pending = 'iddqdidkfa'
        nextRefill = now + 5000
      }
      if (started && !pending && now >= nextRefill) {
        pending = 'idkfa'
        nextRefill = now + 5000
      }
      if (pending && now >= nextKey) {
        const letter = pending[0]
        pending = pending.slice(1)
        cheatKey(letter, 'keydown')
        cheatKey(letter, 'keypress')
        cheatKey(letter, 'keyup')
        nextKey = now + 50
      }
      if (!hud || failed || video.readyState < 2) return
      const smoothing = context.imageSmoothingEnabled
      context.imageSmoothingEnabled = false
      context.drawImage(video, 143, 169, 35, 31)
      context.imageSmoothingEnabled = smoothing
    },
    setPaused(value: boolean) {
      paused = value
      if (paused) {
        buffer = ''
        video.pause()
      } else play()
    },
    dispose() {
      active = false
      video.pause()
      video.removeAttribute('src')
      video.load()
    },
  }
}
