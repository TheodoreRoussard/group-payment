import { useState } from 'react'
import { needsMyAction } from '../lib/notifications'
import type { PotEntry } from '../lib/pots'
import { formatXlm, type GroupPaymentState } from '../lib/stellar'
import { Crown, Plus } from './Icons'

interface Props {
  pots: PotEntry[]
  summaries: Record<string, GroupPaymentState>
  loaded: boolean
  selected: string | null
  creating: boolean
  me: string | null
  now: Date
  onSelect: (address: string) => void
  onCreate: () => void
}

export function Sidebar({ pots, summaries, loaded, selected, creating, me, now, onSelect, onCreate }: Props) {
  const [filter, setFilter] = useState<'all' | 'mine'>('all')
  const isMine = (p: PotEntry) => !!me && (p.owner === me || p.participants.includes(me))
  const visible = filter === 'mine' ? pots.filter(isMine) : pots

  return (
    <nav className="sidebar" aria-label="Pots communs">
      <button className={`btn btn-block new-pot ${creating ? 'is-active' : ''}`} onClick={onCreate}>
        <Plus /> Nouveau pot
      </button>

      <div className="sidebar-head">
        <span className="eyebrow">Pots communs</span>
        {me && (
          <div className="segmented" role="tablist">
            <button role="tab" aria-selected={filter === 'all'} onClick={() => setFilter('all')}>Tous</button>
            <button role="tab" aria-selected={filter === 'mine'} onClick={() => setFilter('mine')}>Les miens</button>
          </div>
        )}
      </div>

      {!loaded ? (
        <div className="pot-list">
          {[0, 1].map((i) => <div key={i} className="pot-item skeleton" style={{ height: 76 }} />)}
        </div>
      ) : visible.length === 0 ? (
        <p className="hint sidebar-empty">
          {filter === 'mine' ? 'Aucun pot ne vous concerne pour l’instant.' : 'Aucun pot pour l’instant.'}
        </p>
      ) : (
        <ul className="pot-list">
          {visible.map((pot) => (
            <li key={pot.address}>
              <PotItem
                pot={pot}
                state={summaries[pot.address]}
                active={pot.address === selected && !creating}
                me={me}
                now={now}
                onClick={() => onSelect(pot.address)}
              />
            </li>
          ))}
        </ul>
      )}
    </nav>
  )
}

function PotItem({ pot, state, active, me, now, onClick }: {
  pot: PotEntry
  state: GroupPaymentState | undefined
  active: boolean
  me: string | null
  now: Date
  onClick: () => void
}) {
  const n = pot.participants.length
  const contributed = state?.participants.filter((p) => p.state.contributed).length ?? 0
  const executed = state?.status === 'Executed'
  const expired = !executed && now.getTime() > Number(pot.deadline) * 1000
  const role = me === pot.owner ? 'owner' : me && pot.participants.includes(me) ? 'participant' : null
  const action = needsMyAction(me, state, now)

  return (
    <button className={`pot-item ${active ? 'is-active' : ''}`} onClick={onClick} aria-current={active ? 'page' : undefined}>
      <span className="pot-item-top">
        <span className="pot-title">{pot.title}</span>
        {action && <span className="dot-alert" aria-label="Action attendue" />}
      </span>
      <span className="pot-meta">
        <span className={`status-dot ${executed ? 'is-done' : expired ? 'is-expired' : 'is-open'}`} />
        {!state ? '…' : executed ? 'Exécuté' : expired ? 'Expiré' : `${state.approvals}/${n} accords`}
        <span className="sep">·</span>
        {formatXlm(pot.amount * BigInt(n))} XLM
        {role && (
          <span className={`role role-${role}`}>
            {role === 'owner' ? <><Crown width={11} height={11} /> Destinataire</> : 'Participant'}
          </span>
        )}
      </span>
      <span className="mini-bar" aria-hidden>
        <i style={{ width: `${((executed ? n : contributed) / n) * 100}%` }} className={executed ? 'is-done' : ''} />
      </span>
    </button>
  )
}
