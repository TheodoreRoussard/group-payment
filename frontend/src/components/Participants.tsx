import { displayName } from '../lib/labels'
import type { GroupPaymentState } from '../lib/stellar'
import { AddressLink } from './AddressLink'
import { Avatar } from './Avatar'
import { Check, Lock, ThumbUp } from './Icons'

export function Participants({ state, me }: { state: GroupPaymentState; me: string | null }) {
  const executed = state.status === 'Executed'
  return (
    <section className="card">
      <header className="card-head">
        <h2>Participants</h2>
        <span className="muted">{state.participants.length} membres</span>
      </header>
      <ul className="participants">
        {state.participants.map(({ address, state: p }) => (
          <li key={address} className={address === me ? 'is-me' : undefined}>
            <Avatar address={address} />
            <div className="who">
              <span className="name">
                {displayName(address) ?? 'Participant'}
                {address === me && <span className="tag">Vous</span>}
              </span>
              <AddressLink address={address} />
            </div>
            <div className="chips">
              <span className={`chip ${p.contributed || executed ? 'chip-on' : ''}`}>
                {p.contributed || executed ? <Check width={13} height={13} /> : <Lock width={13} height={13} />}
                {p.contributed || executed ? 'Part versée' : 'À verser'}
              </span>
              <span className={`chip ${p.approved || executed ? 'chip-on chip-strong' : ''}`}>
                {p.approved || executed ? <Check width={13} height={13} /> : <ThumbUp width={13} height={13} />}
                {p.approved || executed ? 'Accord donné' : 'Accord attendu'}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
