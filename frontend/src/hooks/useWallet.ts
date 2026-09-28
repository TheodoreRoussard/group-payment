import { useCallback, useEffect, useState } from 'react'
import {
  getAddress,
  getNetwork,
  isConnected,
  requestAccess,
  signTransaction,
  WatchWalletChanges,
} from '@stellar/freighter-api'
import { NETWORK_PASSPHRASE } from '../lib/stellar'

export interface Wallet {
  installed: boolean | null
  address: string | null
  wrongNetwork: boolean
  connecting: boolean
  connect: () => Promise<void>
  disconnect: () => void
  sign: (
    xdr: string,
    opts?: { networkPassphrase?: string },
  ) => Promise<{ signedTxXdr: string; signerAddress?: string }>
}

export function useWallet(): Wallet {
  const [installed, setInstalled] = useState<boolean | null>(null)
  const [address, setAddress] = useState<string | null>(null)
  const [passphrase, setPassphrase] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)

  // Au chargement : Freighter est-il installé, et l'app déjà autorisée ?
  useEffect(() => {
    ;(async () => {
      const { isConnected: ok } = await isConnected()
      setInstalled(ok)
      if (!ok) return
      const { address: addr } = await getAddress() // "" tant que l'accès n'est pas accordé
      if (addr) {
        setAddress(addr)
        setPassphrase((await getNetwork()).networkPassphrase)
      }
    })()
  }, [])

  // Suit les changements de compte ou de réseau faits dans l'extension.
  useEffect(() => {
    if (!address) return
    const watcher = new WatchWalletChanges(2000)
    watcher.watch(({ address: addr, networkPassphrase, error }) => {
      if (error) return
      if (addr) setAddress(addr)
      setPassphrase(networkPassphrase)
    })
    return () => watcher.stop()
  }, [address])

  const connect = useCallback(async () => {
    setConnecting(true)
    try {
      const { isConnected: ok } = await isConnected()
      setInstalled(ok)
      if (!ok) throw new Error("L'extension Freighter n'est pas installée.")
      const { address: addr, error } = await requestAccess()
      if (error) throw new Error(error.message)
      setAddress(addr)
      setPassphrase((await getNetwork()).networkPassphrase)
    } finally {
      setConnecting(false)
    }
  }, [])

  const disconnect = useCallback(() => {
    setAddress(null)
    setPassphrase(null)
  }, [])

  const sign = useCallback<Wallet['sign']>(
    async (xdr, opts) => {
      const res = await signTransaction(xdr, {
        networkPassphrase: opts?.networkPassphrase ?? NETWORK_PASSPHRASE,
        address: address ?? undefined,
      })
      if (res.error) throw new Error(res.error.message)
      return res
    },
    [address],
  )

  return {
    installed,
    address,
    wrongNetwork: !!address && !!passphrase && passphrase !== NETWORK_PASSPHRASE,
    connecting,
    connect,
    disconnect,
    sign,
  }
}
