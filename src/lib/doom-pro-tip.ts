export function initDoomProTip(root: HTMLElement) {
  const original = root.querySelector<HTMLElement>('[data-doom-tip-default]')!
  const avatar = root.querySelector<HTMLElement>('[data-doom-tip-avatar]')!
  const discovery = root.querySelector<HTMLElement>('[data-doom-tip-discovery]')!
  const change = root.querySelector<HTMLElement>('[data-doom-tip-change]')!
  const abort = new AbortController()
  const { signal } = abort
  const update = () => {
    const hasUsername = Boolean(new URLSearchParams(location.search).get('u'))
    discovery.hidden = hasUsername
    change.hidden = !hasUsername
  }
  update()
  const timer = setTimeout(() => {
    original.hidden = true
    avatar.hidden = false
  }, 10_000)
  document.addEventListener('doom:avatar-change', update, { signal })
  window.addEventListener('popstate', update, { signal })
  const dispose = () => {
    clearTimeout(timer)
    abort.abort()
  }
  window.addEventListener('pagehide', dispose, { signal, once: true })
  return dispose
}
