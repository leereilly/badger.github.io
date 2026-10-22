import { githubUsername } from './doom-avatar'

export type SocialPlatform = 'x' | 'linkedin' | 'threads' | 'facebook' | 'bluesky' | 'mastodon'
const text = 'But does it run DOOM? On a GitHub badge. Play with your GitHub avatar.'

export function shareURL(href: string, source?: string) {
  const url = new URL(href)
  const username = githubUsername(url.searchParams.get('u') ?? '')
  url.search = ''
  url.hash = ''
  if (username) url.searchParams.set('u', username)
  if (source) {
    url.searchParams.set('utm_source', source)
    url.searchParams.set('utm_medium', 'social')
    url.searchParams.set('utm_campaign', 'd00m3d')
  }
  if (url.search) url.pathname = url.pathname.replace(/\/$/, '') || '/'
  return url.href
}

export function withUniverseUsername(href: string, value: string) {
  const url = new URL(href)
  if (url.hostname !== 'githubuniverse.com') return href
  const username = githubUsername(value)
  if (username) url.searchParams.set('utm_content', username)
  else url.searchParams.delete('utm_content')
  return url.href
}

export function mastodonOrigin(value: string) {
  const error = () => new Error('Enter your Mastodon server, for example mastodon.social.')
  let url: URL
  try { url = new URL(value.includes('://') ? value.trim() : `https://${value.trim()}`) }
  catch { throw error() }
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
    url.pathname !== '/' || url.search || url.hash ||
    !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(url.hostname)) throw error()
  return url.origin
}

export function socialURL(platform: SocialPlatform, href: string, server?: string) {
  const link = shareURL(href, platform)
  const message = `${text}\n${link}`
  const destinations: Record<SocialPlatform, [string, Record<string, string>]> = {
    x: ['https://twitter.com/intent/tweet', { text, url: link }],
    linkedin: ['https://www.linkedin.com/sharing/share-offsite/', { url: link }],
    threads: ['https://www.threads.net/intent/post', { text: message }],
    facebook: ['https://www.facebook.com/sharer/sharer.php', { u: link }],
    bluesky: ['https://bsky.app/intent/compose', { text: message }],
    mastodon: [`${server ? mastodonOrigin(server) : 'https://mastodon.social'}/share`, { text: message }],
  }
  const [base, params] = destinations[platform]
  const url = new URL(base)
  url.search = new URLSearchParams(params).toString()
  return url.href
}

export function initDoomShare(root: HTMLElement) {
  const copy = root.querySelector<HTMLButtonElement>('[data-share-copy]')!
  const native = root.querySelector<HTMLButtonElement>('[data-share-native]')!
  const status = root.querySelector<HTMLElement>('[data-share-status]')!
  const mastodon = root.querySelector<HTMLFormElement>('[data-share-mastodon-form]')!
  const server = mastodon.querySelector<HTMLInputElement>('input')!
  const links = [...root.querySelectorAll<HTMLAnchorElement>('[data-share-platform]')]
  const abort = new AbortController()
  const { signal } = abort
  const refresh = () => {
    for (const link of links) link.href = socialURL(link.dataset.sharePlatform as SocialPlatform, location.href)
    const username = new URLSearchParams(location.search).get('u') ?? ''
    for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href^="https://githubuniverse.com/"]')) {
      link.href = withUniverseUsername(link.href, username)
    }
  }
  refresh()
  document.addEventListener('doom:avatar-change', refresh, { signal })
  window.addEventListener('popstate', refresh, { signal })
  copy.addEventListener('click', async () => {
    try {
      const url = shareURL(location.href)
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url)
      else {
        const field = document.createElement('textarea')
        field.value = url
        field.style.position = 'fixed'
        field.style.opacity = '0'
        root.append(field)
        field.select()
        const copied = document.execCommand('copy')
        field.remove()
        copy.focus()
        if (!copied) throw new Error('Clipboard unavailable')
      }
      status.textContent = 'Link copied'
    } catch {
      status.textContent = 'Could not copy. Select the link below.'
      const fallback = root.querySelector<HTMLInputElement>('[data-share-fallback]')!
      fallback.hidden = false
      fallback.value = shareURL(location.href)
      fallback.focus()
      fallback.select()
    }
  }, { signal })
  const mobile = window.matchMedia('(pointer: coarse)')
  const showNative = () => { native.hidden = !(mobile.matches && typeof navigator.share === 'function') }
  showNative()
  mobile.addEventListener('change', showNative, { signal })
  native.addEventListener('click', async () => {
    try {
      await navigator.share({ title: 'D00M3D', text, url: shareURL(location.href, 'native') })
      status.textContent = 'Shared'
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
      status.textContent = 'Choose a platform or copy the link.'
    }
  }, { signal })
  root.querySelector('[data-share-mastodon]')!.addEventListener('click', () => {
    mastodon.hidden = !mastodon.hidden
    if (!mastodon.hidden) server.focus()
  }, { signal })
  server.addEventListener('input', () => server.setCustomValidity(''), { signal })
  mastodon.addEventListener('submit', event => {
    event.preventDefault()
    try {
      const url = socialURL('mastodon', location.href, server.value)
      window.open(url, '_blank', 'noopener,noreferrer')
      server.setCustomValidity('')
    } catch (error) {
      server.setCustomValidity((error as Error).message)
      server.reportValidity()
    }
  }, { signal })
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !mastodon.hidden && mastodon.contains(document.activeElement)) {
      mastodon.hidden = true
      root.querySelector<HTMLButtonElement>('[data-share-mastodon]')?.focus()
    }
  }, { signal })
  window.addEventListener('pagehide', () => abort.abort(), { signal, once: true })
  return () => abort.abort()
}
