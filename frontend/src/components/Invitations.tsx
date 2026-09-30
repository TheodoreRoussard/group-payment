import { useEffect, useRef, useState } from 'react'
import { displayName } from '../lib/labels'
import type { Notification } from '../lib/notifications'
import { formatXlm, shortAddress } from '../lib/stellar'
import { Bell, Check, Mail, ThumbUp } from './Icons'

interface Props {
  items: Notification[]
  seen: Set<string>
  onSeen: (keys: string[]) => void
  onOpenPot: (address: string) => void
}

const nameOf = (a: string) => displayName(a) ?? shortAddress(a)

export function Invitations({ items, seen, onSeen, onOpenPot }: Props) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const unread = items.filter((n) => !seen.has(n.key))

  // À la fermeture, tout ce qui a été affiché passe en « lu ».
  const close = () => {
    setOpen(false)
    if (unread.length) onSeen(unread.map((n) => n.key))
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && close()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  })

  const invites = items.filter((n) => n.kind === 'invite').length

  return (
    <div className="notif" ref={root}>
      <button
        className={`icon-btn bell ${unread.length ? 'has-unread' : ''}`}
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-label={`Invitations et notifications${unread.length ? ` (${unread.length} non lues)` : ''}`}
      >
        <Bell width={18} height={18} />
        {unread.length > 0 && <span className="badge">{unread.length}</span>}
      </button>

      {open && (
        <div className="notif-panel" role="dialog" aria-label="Invitations">
          <header>
            <strong>Invitations</strong>
            <span className="muted">
              {invites ? `${invites} en attente` : 'à jour'}
            </span>
          </header>
          {items.length === 0 ? (
            <p className="notif-empty">
              Rien pour l’instant. Quand quelqu’un vous invite dans un pot, l’invitation apparaît ici.
            </p>
          ) : (
            <ul>
              {items.map((n) => (
                <li key={n.key}>
                  <button
                    className={`notif-item ${seen.has(n.key) ? '' : 'is-unread'}`}
                    onClick={() => {
                      close()
                      onOpenPot(n.pot.address)
                    }}
                  >
                    <span className={`notif-icon kind-${n.kind}`}>
                      {n.kind === 'invite' ? <Mail width={14} height={14} /> : n.kind === 'approve' ? <ThumbUp width={14} height={14} /> : <Check width={14} height={14} />}
                    </span>
                    <span className="notif-body">
                      <Text n={n} />
                      <span className="notif-cta">
                        {n.kind === 'invite' ? 'Voir et verser ma part →' : n.kind === 'approve' ? 'Donner mon accord →' : 'Voir le pot →'}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function Text({ n }: { n: Notification }) {
  const { pot, state } = n
  const total = state.config.amount * BigInt(state.participants.length)
  const deadline = new Date(Number(state.config.deadline) * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
  if (n.kind === 'invite')
    return (
      <span>
        <strong>{nameOf(pot.owner)}</strong> vous invite dans <strong>« {pot.title} »</strong>
        <span className="notif-sub">Part de {formatXlm(state.config.amount)} XLM · avant le {deadline}</span>
      </span>
    )
  if (n.kind === 'approve')
    return (
      <span>
        Votre accord est attendu dans <strong>« {pot.title} »</strong>
        <span className="notif-sub">{state.approvals}/{state.participants.length} accords · avant le {deadline}</span>
      </span>
    )
  return (
    <span>
      Vous avez reçu <strong>{formatXlm(total)} XLM</strong>
      <span className="notif-sub">Paiement de « {pot.title} » exécuté</span>
    </span>
  )
}
