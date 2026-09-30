import { useCallback, useEffect, useState } from 'react'

// Notifications déjà vues, par compte. Simple confort d'affichage propre à ce
// navigateur : l'état qui compte (invitations, paiements) est on-chain.
const keyFor = (me: string) => `potcommun:seen:${me}`

function load(me: string | null): Set<string> {
  if (!me) return new Set()
  try {
    return new Set(JSON.parse(localStorage.getItem(keyFor(me)) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

export function useSeen(me: string | null) {
  const [seen, setSeen] = useState(() => load(me))
  useEffect(() => setSeen(load(me)), [me])

  const markSeen = useCallback(
    (keys: string[]) => {
      if (!me) return
      setSeen((prev) => {
        const next = new Set([...prev, ...keys])
        try {
          localStorage.setItem(keyFor(me), JSON.stringify([...next]))
        } catch {
          // stockage indisponible (navigation privée) : on garde l'état en mémoire
        }
        return next
      })
    },
    [me],
  )
  return { seen, markSeen }
}
