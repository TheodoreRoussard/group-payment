import { useEffect, useState } from 'react'
import { ActionPanel } from './components/ActionPanel'
import { ActivityFeed } from './components/ActivityFeed'
import { AddressLink } from './components/AddressLink'
import { Avatar } from './components/Avatar'
import { Alert, Lock, Send, ThumbUp } from './components/Icons'
import { Overview } from './components/Overview'
import { Participants } from './components/Participants'
import { useGroupPayment } from './hooks/useGroupPayment'
import { useWallet, type Wallet } from './hooks/useWallet'
import { displayName } from './lib/labels'
import { CONTRACT_ID, shortAddress } from './lib/stellar'

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
  const { state, activity, error, refresh } = useGroupPayment()
  const now = useNow()

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>
            <i /><i /><i />
          </span>
          <span>Pot commun</span>
          <span className="pill pill-network">Testnet</span>
        </div>
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
      </header>

      {wallet.notice && <WalletNoticeBar wallet={wallet} />}

      {error && !state && (
        <p className="notice notice-error page-error"><Alert /> Impossible de lire le contrat : {error}</p>
      )}

      {!state ? (
        <Skeleton />
      ) : (
        <main className="layout">
          <div className="col-main">
            <Overview state={state} now={now} />
            <Participants state={state} me={wallet.address} />
          </div>
          <aside className="col-side">
            <ActionPanel state={state} wallet={wallet} now={now} onDone={refresh} />
            <HowItWorks />
            <ActivityFeed activity={activity} now={now} />
          </aside>
        </main>
      )}

      <footer className="footer">
        <span>Contrat <AddressLink address={CONTRACT_ID} /></span>
        <span className="muted">Données lues en direct sur le testnet Stellar · actualisation toutes les 6 s</span>
      </footer>
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
    <main className="layout" aria-busy>
      <div className="col-main">
        <div className="card skeleton" style={{ height: 340 }} />
        <div className="card skeleton" style={{ height: 240 }} />
      </div>
      <aside className="col-side">
        <div className="card skeleton" style={{ height: 220 }} />
      </aside>
    </main>
  )
}
