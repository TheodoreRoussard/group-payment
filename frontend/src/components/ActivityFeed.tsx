import { displayName } from '../lib/labels'
import { EXPLORER, formatXlm, shortAddress, type Activity } from '../lib/stellar'
import { Check, External, Lock, Send, Undo } from './Icons'

const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' })

function ago(date: Date, now: Date): string {
  const s = Math.round((date.getTime() - now.getTime()) / 1000)
  if (s > -60) return "à l'instant"
  if (s > -3600) return rtf.format(Math.round(s / 60), 'minute')
  if (s > -86400) return rtf.format(Math.round(s / 3600), 'hour')
  return rtf.format(Math.round(s / 86400), 'day')
}

const COPY = {
  contributed: { icon: Lock, verb: 'a versé', tone: '' },
  approved: { icon: Check, verb: 'a donné son accord', tone: '' },
  withdrawn: { icon: Undo, verb: 'a retiré', tone: 'tone-muted' },
  executed: { icon: Send, verb: 'Paiement exécuté vers', tone: 'tone-success' },
} as const

export function ActivityFeed({ activity, now }: { activity: Activity[]; now: Date }) {
  return (
    <section className="card">
      <header className="card-head">
        <h2>Historique on-chain</h2>
        <span className="muted">events du contrat</span>
      </header>
      {activity.length === 0 ? (
        <p className="empty">Aucune activité pour l’instant.</p>
      ) : (
        <ol className="feed">
          {activity.map((a) => {
            const { icon: Icon, verb, tone } = COPY[a.kind]
            const who = displayName(a.who) ?? shortAddress(a.who)
            return (
              <li key={a.id} className={tone}>
                <span className="feed-icon"><Icon width={14} height={14} /></span>
                <div className="feed-body">
                  <p>
                    {a.kind === 'executed' ? (
                      <>{verb} <strong>{who}</strong></>
                    ) : (
                      <><strong>{who}</strong> {verb}</>
                    )}
                    {a.amount !== undefined && <> · <span className="num">{formatXlm(a.amount)} XLM</span></>}
                  </p>
                  <a href={`${EXPLORER}/tx/${a.txHash}`} target="_blank" rel="noreferrer">
                    {ago(a.at, now)} <External width={11} height={11} />
                  </a>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
