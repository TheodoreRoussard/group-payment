import { useCallback, useEffect, useMemo, useState } from 'react'
import { DEMO_POTS, type PotEntry } from '../lib/pots'
import { listFactoryPots, readState, type GroupPaymentState } from '../lib/stellar'

const POLL_MS = 8000

/** Tous les pots connus (démo + registre) et un résumé de l'état de chacun. */
export function usePots() {
  const [factoryPots, setFactoryPots] = useState<PotEntry[]>([])
  const [summaries, setSummaries] = useState<Record<string, GroupPaymentState>>({})
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const listed = (await listFactoryPots()).map((p) => ({ ...p, fromFactory: true }))
      setFactoryPots(listed)
      const all = [...DEMO_POTS, ...listed]
      const states = await Promise.allSettled(all.map((p) => readState(p.address)))
      setSummaries((prev) => {
        const next = { ...prev }
        states.forEach((r, i) => {
          if (r.status === 'fulfilled') next[all[i].address] = r.value
        })
        return next
      })
    } catch {
      // réseau indisponible : on garde les dernières valeurs connues
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, POLL_MS)
    return () => clearInterval(id)
  }, [refresh])

  // Les plus récents en premier, la démo historique à la fin.
  const pots = useMemo(() => [...[...factoryPots].reverse(), ...DEMO_POTS], [factoryPots])
  return { pots, summaries, loaded, refresh }
}
