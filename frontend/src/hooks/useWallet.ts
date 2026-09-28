import { useCallback, useEffect, useState } from 'react'
import { WatchWalletChanges } from '@stellar/freighter-api'
import { StellarWalletsKit } from '@creit-tech/stellar-wallets-kit'
import { activeAddress } from '@creit-tech/stellar-wallets-kit/state'
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
  /** Message d'aide à afficher (ex. : comment changer de compte avec Freighter). */
  notice: WalletNotice | null
  dismissNotice: () => void
  /** Ouvre le sélecteur de wallet (sert aussi à changer de wallet). */
  connect: () => Promise<void>
  /** Demande à Freighter d'autoriser le compte actuellement actif dans l'extension. */
  authorizeActiveAccount: () => Promise<void>
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

export type WalletNotice = 'freighter-same-account' | 'freighter-needs-access'

function isFreighter(): boolean {
  return currentWalletName() !== null && StellarWalletsKit.selectedModule.productId === FREIGHTER_ID
}

export function useWallet(): Wallet {
  const [address, setAddress] = useState<string | null>(null)
  const [walletName, setWalletName] = useState<string | null>(null)
  const [passphrase, setPassphrase] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [notice, setNotice] = useState<WalletNotice | null>(null)

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

  // Freighter ne permet pas de choisir un compte depuis le site : c'est le compte
  // actif dans l'extension qui fait foi. On l'observe passivement (sans jamais
  // redemander d'autorisation) pour suivre les changements de compte et de réseau.
  useEffect(() => {
    if (!address) return
    if (!isFreighter()) {
      const sync = async () => setPassphrase(await readNetwork())
      sync()
      const id = setInterval(sync, SYNC_MS)
      return () => clearInterval(id)
    }
    const watcher = new WatchWalletChanges(SYNC_MS)
    watcher.watch(({ address: active, networkPassphrase, error }) => {
      if (error) return
      setPassphrase(networkPassphrase)
      if (!active) {
        // Le compte actif n'a pas encore autorisé ce site : Freighter ne donne pas son adresse.
        setNotice('freighter-needs-access')
        return
      }
      setNotice((n) => (n === 'freighter-needs-access' ? null : n))
      if (active !== activeAddress.value) activeAddress.value = active // garde le kit synchronisé
    })
    return () => watcher.stop()
  }, [address])

  const connect = useCallback(async () => {
    setConnecting(true)
    const previous = activeAddress.value
    try {
      const { address: addr } = await StellarWalletsKit.authModal()
      setAddress(addr)
      setWalletName(currentWalletName())
      setPassphrase(await readNetwork())
      setNotice(isFreighter() && addr === previous ? 'freighter-same-account' : null)
    } finally {
      setConnecting(false)
    }
  }, [])

  const authorizeActiveAccount = useCallback(async () => {
    // fetchAddress passe par requestAccess : Freighter affiche sa fenêtre d'autorisation.
    const { address: addr } = await StellarWalletsKit.fetchAddress()
    setAddress(addr)
    setNotice(null)
  }, [])

  const disconnect = useCallback(async () => {
    await StellarWalletsKit.disconnect()
    setNotice(null)
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
    notice,
    dismissNotice: () => setNotice(null),
    connect,
    authorizeActiveAccount,
    disconnect,
    sign,
  }
}
