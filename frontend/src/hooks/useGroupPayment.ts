import { useCallback, useEffect, useRef, useState } from 'react'
import type { PotEntry } from '../lib/pots'
import { readActivity, readState, type Activity, type GroupPaymentState } from '../lib/stellar'

const POLL_MS = 6000 // ~1 ledger : l'état on-chain ne change pas plus vite

/** État détaillé + historique du pot affiché. */
export function useGroupPayment(pot: PotEntry | null) {
  const [state, setState] = useState<GroupPaymentState | null>(null)
  const [activity, setActivity] = useState<Activity[]>([])
  const [error, setError] = useState<string | null>(null)
  const current = useRef<string | null>(null)

  // Dépendances primitives : la sidebar recrée les objets `pot` à chaque
  // rafraîchissement, et dépendre de l'objet relancerait l'effet ci-dessous
  // (vidage de l'état → squelette de chargement) toutes les 8 secondes.
  const address = pot?.address ?? null
  const startLedger = pot?.created_ledger ?? 0
  const fromFactory = pot?.fromFactory ?? false

  const refresh = useCallback(async () => {
    if (!address) return
    try {
      const [s, a] = await Promise.all([readState(address), readActivity(address, startLedger, fromFactory)])
      if (current.current !== address) return // l'utilisateur a changé de pot entre-temps
      setState(s)
      setActivity(a)
      setError(null)
    } catch (e) {
      if (current.current === address) setError(e instanceof Error ? e.message : String(e))
    }
  }, [address, startLedger, fromFactory])

  // Ne se relance que quand on change réellement de pot.
  useEffect(() => {
    current.current = address
    setState(null)
    setActivity([])
    setError(null)
    refresh()
    const id = setInterval(refresh, POLL_MS)
    return () => clearInterval(id)
  }, [address, refresh])

  return { state, activity, error, refresh }
}
