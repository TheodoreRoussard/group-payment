import { useCallback, useEffect, useState } from 'react'
import {
  getReadClient,
  readActivity,
  readState,
  type Activity,
  type GroupPaymentState,
} from '../lib/stellar'

const POLL_MS = 6000 // ~1 ledger : l'état on-chain ne change pas plus vite

export function useGroupPayment() {
  const [state, setState] = useState<GroupPaymentState | null>(null)
  const [activity, setActivity] = useState<Activity[]>([])
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const client = await getReadClient()
      const [s, a] = await Promise.all([readState(client), readActivity()])
      setState(s)
      setActivity(a)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, POLL_MS)
    return () => clearInterval(id)
  }, [refresh])

  return { state, activity, error, refresh }
}
