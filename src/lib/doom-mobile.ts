import type { DoomKey } from './doom-input'
import { githubUsername } from './doom-avatar'

export function initDoomMobile(
  root: HTMLElement,
  handlers: {
    key: (source: string, key: DoomKey, pressed: boolean) => void
    release: () => void
    selectAvatar: (username: string) => Promise<boolean>
  },
  signal: AbortSignal,
) {
  const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-doom-key]')]
  const held = new Map<number, HTMLButtonElement>()
  const release = (pointer: number) => {
    const button = held.get(pointer)
    if (!button) return
    held.delete(pointer)
    handlers.key(`touch:${pointer}`, button.dataset.doomKey as DoomKey, false)
    button.dataset.pressed = String([...held.values()].includes(button))
  }
  const clear = () => {
    for (const pointer of held.keys()) release(pointer)
  }
  for (const button of buttons) {
    button.addEventListener('pointerdown', event => {
      if (event.button !== 0 || button.disabled) return
      event.preventDefault()
      button.setPointerCapture(event.pointerId)
      held.set(event.pointerId, button)
      button.dataset.pressed = 'true'
      handlers.key(`touch:${event.pointerId}`, button.dataset.doomKey as DoomKey, true)
    }, { signal })
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
      button.addEventListener(type, event => release(event.pointerId), { signal })
    }
    button.addEventListener('contextmenu', event => event.preventDefault(), { signal })
    button.addEventListener('click', event => {
      if (event.detail !== 0 || button.disabled) return
      const source = `touch-keyboard:${button.dataset.doomKey}`
      handlers.key(source, button.dataset.doomKey as DoomKey, true)
      window.setTimeout(() => handlers.key(source, button.dataset.doomKey as DoomKey, false), 150)
    }, { signal })
  }

  const options = root.querySelector<HTMLButtonElement>('[data-doom-view-options]')
  options?.addEventListener('click', () => {
    const expanded = options.getAttribute('aria-expanded') !== 'true'
    options.setAttribute('aria-expanded', String(expanded))
    root.dataset.viewOptions = String(expanded)
  }, { signal })

  const fullscreen = root.querySelector<HTMLButtonElement>('[data-doom-fullscreen]')
  let fallbackFullscreen = false
  const syncFullscreen = () => {
    const expanded = document.fullscreenElement === root || fallbackFullscreen
    root.dataset.fullscreen = String(expanded)
    document.body.classList.toggle('doom-fullscreen-open', expanded)
    fullscreen?.setAttribute('aria-pressed', String(expanded))
    fullscreen?.setAttribute('aria-label', expanded ? 'Exit fullscreen' : 'Enter fullscreen')
  }
  fullscreen?.addEventListener('click', async () => {
    handlers.release()
    if (document.fullscreenElement === root) {
      await document.exitFullscreen()
    } else if (fallbackFullscreen) {
      fallbackFullscreen = false
    } else {
      try {
        if (!root.requestFullscreen) throw new Error('Element fullscreen unavailable')
        await root.requestFullscreen()
      } catch {
        fallbackFullscreen = true
      }
    }
    syncFullscreen()
  }, { signal })
  root.addEventListener('fullscreenchange', event => {
    if (event.target !== root) return
    // The engine's document-level handler assumes fullscreen belongs to its canvas.
    event.stopPropagation()
    syncFullscreen()
  }, { signal })
  document.addEventListener('fullscreenchange', syncFullscreen, { signal })
  window.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !fallbackFullscreen) return
    fallbackFullscreen = false
    syncFullscreen()
    event.preventDefault()
    event.stopImmediatePropagation()
  }, { signal, capture: true })

  const form = root.querySelector<HTMLFormElement>('[data-doom-avatar-form]')
  const username = form?.querySelector<HTMLInputElement>('input')
  const status = root.querySelector<HTMLElement>('[data-doom-avatar-status]')
  const submit = form?.querySelector<HTMLButtonElement>('button[type="submit"]')
  form?.addEventListener('submit', async event => {
    event.preventDefault()
    if (!username || !status || !submit) return
    handlers.release()
    const value = username.value.trim().replace(/^@/, '')
    if (!githubUsername(value)) {
      status.textContent = 'Enter a valid GitHub username.'
      username.setAttribute('aria-invalid', 'true')
      return
    }
    username.removeAttribute('aria-invalid')
    submit.disabled = true
    status.textContent = 'Loading avatar...'
    try {
      const selected = await handlers.selectAvatar(value)
      if (signal.aborted) return
      status.textContent = selected
        ? `Avatar applied: @${value.toLowerCase()}.`
        : 'Avatar could not be loaded. Check the username and try again.'
      if (selected) username.blur()
    } catch {
      if (!signal.aborted) status.textContent = 'Avatar could not be loaded. Check the username and try again.'
    } finally {
      submit.disabled = false
    }
  }, { signal })
  signal.addEventListener('abort', () => {
    clear()
    document.body.classList.remove('doom-fullscreen-open')
  }, { once: true })
  return { clear }
}
