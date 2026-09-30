import { useEffect, useMemo, useState } from 'react'
import { ActionPanel } from './components/ActionPanel'
import { ActivityFeed } from './components/ActivityFeed'
import { AddressLink } from './components/AddressLink'
import { Avatar } from './components/Avatar'
import { CreatePot } from './components/CreatePot'
import { Alert, Close, Lock, Menu, Send, ThumbUp } from './components/Icons'
import { Invitations } from './components/Invitations'
import { Overview } from './components/Overview'
import { Participants } from './components/Participants'
import { Sidebar } from './components/Sidebar'
import { useGroupPayment } from './hooks/useGroupPayment'
import { usePots } from './hooks/usePots'
import { useRoute } from './hooks/useRoute'
import { useSeen } from './hooks/useSeen'
import { useWallet, type Wallet } from './hooks/useWallet'
import { displayName } from './lib/labels'
import { notificationsFor } from './lib/notifications'
import type { PotEntry } from './lib/pots'
import { FACTORY_ID, shortAddress } from './lib/stellar'

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

export default function App() {
  const wallet = useWallet()
  const now = useNow()
  const { route, go } = useRoute()
  const { pots, summaries, loaded, refresh: refreshPots } = usePots()
  const { seen, markSeen } = useSeen(wallet.address)
  const [drawer, setDrawer] = useState(false)

  const selected = route.name === 'pot' ? pots.find((p) => p.address === route.id) ?? null : null

  // Sans pot dans l'URL, on ouvre le plus récent (sans polluer l'historique).
  useEffect(() => {
    if (route.name === 'home' && pots.length) location.replace(`#/pot/${pots[0].address}`)
  }, [route.name, pots])

  const notifications = useMemo(
    () => (wallet.address ? notificationsFor(wallet.address, pots, summaries, now) : []),
    [wallet.address, pots, summaries, now],
  )

  const open = (address: string) => {
    go({ name: 'pot', id: address })
    setDrawer(false)
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <button className="icon-btn menu-btn" onClick={() => setDrawer(true)} aria-label="Ouvrir la liste des pots">
            <Menu width={18} height={18} />
          </button>
          <span className="logo" aria-hidden>
            <i /><i /><i />
          </span>
          <span>Pot commun</span>
          <span className="pill pill-network">Testnet</span>
        </div>
        <div className="topbar-right">
          {wallet.address && (
            <Invitations items={notifications} seen={seen} onSeen={markSeen} onOpenPot={open} />
          )}
          {wallet.address ? (
            <div className="account">
              <Avatar address={wallet.address} size={28} />
              <span className="account-who">
                <span className="account-name">{displayName(wallet.address) ?? shortAddress(wallet.address)}</span>
                {wallet.walletName && <span className="account-wallet">via {wallet.walletName}</span>}
              </span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => wallet.connect().catch(() => {})}
                disabled={wallet.connecting}
                title="Choisir un autre wallet. Avec Freighter, le compte se change dans l’extension."
              >
                Changer
              </button>
              <button className="btn btn-ghost btn-sm" onClick={wallet.disconnect}>Déconnecter</button>
            </div>
          ) : (
            <button className="btn btn-sm" onClick={() => wallet.connect().catch(() => {})} disabled={wallet.connecting}>
              Connecter un wallet
            </button>
          )}
        </div>
      </header>

      <div className="shell">
        <div className={`sidebar-wrap ${drawer ? 'is-open' : ''}`}>
          <button className="icon-btn drawer-close" onClick={() => setDrawer(false)} aria-label="Fermer">
            <Close />
          </button>
          <Sidebar
            pots={pots}
            summaries={summaries}
            loaded={loaded}
            selected={selected?.address ?? null}
            creating={route.name === 'new'}
            me={wallet.address}
            now={now}
            onSelect={open}
            onCreate={() => {
              go({ name: 'new' })
              setDrawer(false)
            }}
          />
        </div>
        {drawer && <div className="scrim" onClick={() => setDrawer(false)} />}

        <main className="content">
          {wallet.notice && <WalletNoticeBar wallet={wallet} />}

          {route.name === 'new' ? (
            <CreatePot
              wallet={wallet}
              onCancel={() => history.back()}
              onCreated={async (address) => {
                await refreshPots()
                open(address)
              }}
            />
          ) : selected ? (
            <PotView key={selected.address} pot={selected} wallet={wallet} now={now} onChanged={refreshPots} />
          ) : loaded && route.name === 'pot' ? (
            <p className="notice notice-warning"><Alert /> Ce pot n’existe pas dans le registre.</p>
          ) : (
            <Skeleton />
          )}

          <footer className="footer">
            <span className="footer-links">
              {selected && <span>Contrat du pot <AddressLink address={selected.address} /></span>}
              {FACTORY_ID && <span>Registre <AddressLink address={FACTORY_ID} /></span>}
            </span>
            <span className="muted">Données lues en direct sur le testnet Stellar</span>
          </footer>
        </main>
      </div>
    </div>
  )
}

function PotView({ pot, wallet, now, onChanged }: { pot: PotEntry; wallet: Wallet; now: Date; onChanged: () => void }) {
  const { state, activity, error, refresh } = useGroupPayment(pot)

  if (!state) {
    return error ? (
      <p className="notice notice-error"><Alert /> Impossible de lire le contrat : {error}</p>
    ) : (
      <Skeleton />
    )
  }
  return (
    <div className="layout">
      <div className="col-main">
        <Overview title={pot.title} state={state} now={now} me={wallet.address} />
        <Participants state={state} me={wallet.address} />
      </div>
      <aside className="col-side">
        <ActionPanel
          pot={pot.address}
          state={state}
          wallet={wallet}
          now={now}
          onDone={() => {
            refresh()
            onChanged()
          }}
        />
        <ActivityFeed activity={activity} now={now} />
        <HowItWorks />
      </aside>
    </div>
  )
}

function WalletNoticeBar({ wallet }: { wallet: Wallet }) {
  if (wallet.notice === 'freighter-needs-access') {
    return (
      <div className="notice notice-warning wallet-notice" role="status">
        <Alert />
        <span>Le compte actif dans Freighter n’a pas encore autorisé ce site.</span>
        <button className="btn btn-sm" onClick={() => wallet.authorizeActiveAccount().catch(() => {})}>
          Autoriser ce compte
        </button>
      </div>
    )
  }
  return (
    <div className="notice notice-calm wallet-notice" role="status">
      <Alert />
      <span>
        Freighter utilise toujours <strong>le compte actif dans l’extension</strong>. Pour passer sur un autre compte
        (Carol par exemple), ouvrez Freighter et sélectionnez-le : la page suivra toute seule en quelques secondes.
      </span>
      <button className="btn btn-ghost btn-sm" onClick={wallet.dismissNotice}>OK</button>
    </div>
  )
}

function HowItWorks() {
  const items = [
    { icon: Lock, title: 'Chacun verse sa part', text: 'Les fonds sont bloqués dans le contrat, pas chez un organisateur.' },
    { icon: ThumbUp, title: 'Chacun donne son accord', text: 'Tant que tout le monde n’a pas approuvé, rien ne part. Chacun peut retirer sa part.' },
    { icon: Send, title: 'Le dernier accord paie', text: 'Le paiement s’exécute dans la transaction du dernier accord, sans intermédiaire.' },
  ]
  return (
    <section className="card how">
      <header className="card-head">
        <h2>Comment ça marche</h2>
      </header>
      <ol>
        {items.map(({ icon: Icon, title, text }) => (
          <li key={title}>
            <span className="how-icon"><Icon /></span>
            <div>
              <p className="how-title">{title}</p>
              <p className="hint">{text}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

function Skeleton() {
  return (
    <div className="layout" aria-busy>
      <div className="col-main">
        <div className="card skeleton" style={{ height: 340 }} />
        <div className="card skeleton" style={{ height: 240 }} />
      </div>
      <aside className="col-side">
        <div className="card skeleton" style={{ height: 220 }} />
      </aside>
    </div>
  )
}
