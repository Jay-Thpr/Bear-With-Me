const WALKTHROUGH_STORAGE_KEY = 'skillQuest.walkthroughMode'

function currentSearchParams(): URLSearchParams | null {
  if (typeof window === 'undefined') {
    return null
  }
  return new URLSearchParams(window.location.search)
}

export function isWalkthroughMode(): boolean {
  if (typeof window === 'undefined') {
    return import.meta.env.VITE_WALKTHROUGH_MODE === 'true'
  }

  const params = currentSearchParams()
  const query = params?.get('walkthrough')
  if (query === '1') {
    localStorage.setItem(WALKTHROUGH_STORAGE_KEY, '1')
    return true
  }
  if (query === '0') {
    localStorage.removeItem(WALKTHROUGH_STORAGE_KEY)
    return false
  }

  if (import.meta.env.VITE_WALKTHROUGH_MODE === 'true') {
    return true
  }
  return localStorage.getItem(WALKTHROUGH_STORAGE_KEY) === '1'
}

export function setWalkthroughMode(enabled: boolean): void {
  if (typeof window === 'undefined') {
    return
  }
  if (enabled) {
    localStorage.setItem(WALKTHROUGH_STORAGE_KEY, '1')
  } else {
    localStorage.removeItem(WALKTHROUGH_STORAGE_KEY)
  }
}

export function walkthroughHref(path: string): string {
  if (typeof window === 'undefined') {
    return path
  }
  const url = new URL(path, window.location.origin)
  url.searchParams.set('walkthrough', '1')
  return `${url.pathname}${url.search}`
}
