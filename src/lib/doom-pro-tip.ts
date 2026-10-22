export function initDoomProTip(root: HTMLElement) {
  const original = root.querySelector<HTMLElement>('[data-doom-tip-default]')!
  const discover = root.querySelector<HTMLElement>('[data-doom-tip-discover]')!
  const change = root.querySelector<HTMLElement>('[data-doom-tip-change]')!
  const abort = new AbortController()
  const { signal } = abort
  let elapsed = false
  let highlighted = false
  const update = () => {
    const hasUsername = Boolean(new URLSearchParams(location.search).get('u'))
    const showDiscover = elapsed && !hasUsername
    original.hidden = hasUsername || elapsed
    discover.hidden = !showDiscover
    change.hidden = !hasUsername
    if (showDiscover && !highlighted) {
      highlighted = true
      discover.setAttribute('data-attention', '')
    } else if (!showDiscover) discover.removeAttribute('data-attention')
  }
  update()
  const timer = window.setTimeout(() => { elapsed = true; update() }, 10000)
  document.addEventListener('doom:avatar-change', update, { signal })
  window.addEventListener('popstate', update, { signal })
  const dispose = () => { window.clearTimeout(timer); abort.abort() }
  window.addEventListener('pagehide', dispose, { signal, once: true })
  return dispose
}
