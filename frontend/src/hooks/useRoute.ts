import { useCallback, useEffect, useState } from 'react'

/** `#/pot/<adresse>` ou `#/new` : l'URL reste partageable et survit au rechargement. */
export type Route = { name: 'pot'; id: string } | { name: 'new' } | { name: 'home' }

function parse(hash: string): Route {
  const [, name, id] = hash.replace(/^#/, '').split('/')
  if (name === 'pot' && id) return { name: 'pot', id }
  if (name === 'new') return { name: 'new' }
  return { name: 'home' }
}

export function useRoute() {
  const [route, setRoute] = useState(() => parse(location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parse(location.hash))
    addEventListener('hashchange', onChange)
    return () => removeEventListener('hashchange', onChange)
  }, [])
  const go = useCallback((r: Route) => {
    location.hash = r.name === 'pot' ? `/pot/${r.id}` : r.name === 'new' ? '/new' : ''
  }, [])
  return { route, go }
}
