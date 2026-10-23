export function initDoomProTip(root: HTMLElement) {
  const original = root.querySelector<HTMLElement>('[data-doom-tip-default]')!
  const change = root.querySelector<HTMLElement>('[data-doom-tip-change]')!
  const abort = new AbortController()
  const { signal } = abort
  const update = () => {
    const hasUsername = Boolean(new URLSearchParams(location.search).get('u'))
    original.hidden = hasUsername
    change.hidden = !hasUsername
  }
  update()
  document.addEventListener('doom:avatar-change', update, { signal })
  window.addEventListener('popstate', update, { signal })
  const dispose = () => abort.abort()
  window.addEventListener('pagehide', dispose, { signal, once: true })
  return dispose
}
