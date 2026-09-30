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

  const refresh = useCallback(async () => {
    if (!pot) return
    const address = pot.address
    try {
      const [s, a] = await Promise.all([
        readState(address),
        readActivity(address, pot.created_ledger, pot.fromFactory),
      ])
      if (current.current !== address) return // l'utilisateur a changé de pot entre-temps
      setState(s)
      setActivity(a)
      setError(null)
    } catch (e) {
      if (current.current === address) setError(e instanceof Error ? e.message : String(e))
    }
  }, [pot])

  useEffect(() => {
    current.current = pot?.address ?? null
    setState(null)
    setActivity([])
    setError(null)
    refresh()
    const id = setInterval(refresh, POLL_MS)
    return () => clearInterval(id)
  }, [pot?.address, refresh])

  return { state, activity, error, refresh }
}
