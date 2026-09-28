import { useCallback, useEffect, useState } from 'react'
import { StellarWalletsKit } from '@creit-tech/stellar-wallets-kit'
import { AlbedoModule } from '@creit-tech/stellar-wallets-kit/modules/albedo'
import { FREIGHTER_ID, FreighterModule } from '@creit-tech/stellar-wallets-kit/modules/freighter'
import { HanaModule } from '@creit-tech/stellar-wallets-kit/modules/hana'
import { LobstrModule } from '@creit-tech/stellar-wallets-kit/modules/lobstr'
import { RabetModule } from '@creit-tech/stellar-wallets-kit/modules/rabet'
import { xBullModule } from '@creit-tech/stellar-wallets-kit/modules/xbull'
import { KitEventType, Networks, SwkAppDarkTheme, SwkAppLightTheme } from '@creit-tech/stellar-wallets-kit/types'
import { NETWORK_PASSPHRASE } from '../lib/stellar'

// Le kit est un singleton statique : on l'initialise une seule fois au chargement.
// Il mémorise le wallet choisi dans le localStorage et l'oublie à la déconnexion.
// Liste explicite plutôt que defaultModules() : ce dernier embarque le module
// MetaMask, qui dépend de l'ancienne version npm du kit et casse le build.
StellarWalletsKit.init({
  modules: [
    new FreighterModule(),
    new xBullModule(),
    new LobstrModule(),
    new AlbedoModule(),
    new HanaModule(),
    new RabetModule(),
  ],
  network: Networks.TESTNET,
  theme: matchMedia('(prefers-color-scheme: dark)').matches ? SwkAppDarkTheme : SwkAppLightTheme,
})

const SYNC_MS = 3000

export interface Wallet {
  address: string | null
  walletName: string | null
  wrongNetwork: boolean
  connecting: boolean
  /** Ouvre le sélecteur de wallet (sert aussi à changer de wallet). */
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  sign: (
    xdr: string,
    opts?: { networkPassphrase?: string },
  ) => Promise<{ signedTxXdr: string; signerAddress?: string }>
}

async function readNetwork(): Promise<string | null> {
  try {
    return (await StellarWalletsKit.getNetwork()).networkPassphrase
  } catch {
    return null // certains wallets n'exposent pas leur réseau : on ne bloque pas
  }
}

function currentWalletName(): string | null {
  try {
    return StellarWalletsKit.selectedModule.productName
  } catch {
    return null
  }
}

export function useWallet(): Wallet {
  const [address, setAddress] = useState<string | null>(null)
  const [walletName, setWalletName] = useState<string | null>(null)
  const [passphrase, setPassphrase] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)

  // Reflète l'état du kit : session restaurée au chargement, connexion, déconnexion.
  useEffect(() => {
    const offState = StellarWalletsKit.on(KitEventType.STATE_UPDATED, ({ payload }) => {
      setAddress(payload.address ?? null)
      setWalletName(payload.address ? currentWalletName() : null)
    })
    const offDisconnect = StellarWalletsKit.on(KitEventType.DISCONNECT, () => {
      setAddress(null)
      setWalletName(null)
      setPassphrase(null)
    })
    return () => {
      offState()
      offDisconnect()
    }
  }, [])

  // Freighter ne notifie pas les changements de compte ou de réseau faits dans
  // l'extension : on relit régulièrement tant qu'une session Freighter est active.
  useEffect(() => {
    if (!address) return
    const sync = async () => {
      setPassphrase(await readNetwork())
      if (currentWalletName() && StellarWalletsKit.selectedModule.productId === FREIGHTER_ID) {
        try {
          const { address: current } = await StellarWalletsKit.fetchAddress()
          if (current) setAddress(current)
        } catch {
          // accès révoqué dans l'extension : l'utilisateur devra se reconnecter
        }
      }
    }
    sync()
    const id = setInterval(sync, SYNC_MS)
    return () => clearInterval(id)
  }, [address])

  const connect = useCallback(async () => {
    setConnecting(true)
    try {
      const { address: addr } = await StellarWalletsKit.authModal()
      setAddress(addr)
      setWalletName(currentWalletName())
      setPassphrase(await readNetwork())
    } finally {
      setConnecting(false)
    }
  }, [])

  const disconnect = useCallback(async () => {
    await StellarWalletsKit.disconnect()
    setAddress(null)
    setWalletName(null)
    setPassphrase(null)
  }, [])

  const sign = useCallback<Wallet['sign']>(
    (xdr, opts) =>
      StellarWalletsKit.signTransaction(xdr, {
        networkPassphrase: opts?.networkPassphrase ?? NETWORK_PASSPHRASE,
        address: address ?? undefined,
      }),
    [address],
  )

  return {
    address,
    walletName,
    wrongNetwork: !!address && !!passphrase && passphrase !== NETWORK_PASSPHRASE,
    connecting,
    connect,
    disconnect,
    sign,
  }
}
