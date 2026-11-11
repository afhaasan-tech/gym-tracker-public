import { useCallback, useEffect, useState } from 'react'

/** Tiny hash router: #/path?query. Works on any static host and keeps deep links shareable. */
export type Route = { path: string; segments: string[]; query: URLSearchParams }

function parse(): Route {
  const raw = window.location.hash.replace(/^#/, '') || '/'
  const [pathPart, queryPart = ''] = raw.split('?')
  const path = ('/' + pathPart.replace(/^\/+/, '')).replace(/\/+$/, '') || '/'
  return { path, segments: path.split('/').filter(Boolean), query: new URLSearchParams(queryPart) }
}

export function useRoute() {
  const [route, setRoute] = useState<Route>(parse)
  useEffect(() => {
    const on = () => { setRoute(parse()); window.scrollTo({ top: 0 }) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const go = useCallback((to: string) => { window.location.hash = to.startsWith('#') ? to : '#' + to }, [])
  return { route, go }
}

/** Safe in-app return path: only local hash paths are accepted (no open redirects). */
export function safeNext(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('://')) return '/'
  return next
}
