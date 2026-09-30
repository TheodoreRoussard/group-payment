import { displayName } from '../lib/labels'
import { formatXlm, type GroupPaymentState } from '../lib/stellar'
import { AddressLink } from './AddressLink'
import { Alert, Check, Clock } from './Icons'

export function formatCountdown(deadline: Date, now: Date): string {
  const s = Math.max(0, Math.floor((deadline.getTime() - now.getTime()) / 1000))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d} j ${h} h`
  if (h > 0) return `${h} h ${m} min`
  return `${m} min`
}

export function Overview({ title, state, now, me }: { title: string; state: GroupPaymentState; now: Date; me: string | null }) {
  const { config, participants, approvals, status } = state
  const n = participants.length
  const contributed = participants.filter((p) => p.state.contributed).length
  const deadline = new Date(Number(config.deadline) * 1000)
  const expired = status === 'Open' && now > deadline
  const recipientName = displayName(config.recipient) ?? 'destinataire'
  const target = config.amount * BigInt(n)

  return (
    <section className="card overview">
      <div className="overview-head">
        <div>
          <p className="eyebrow">
            Paiement de groupe · pour {me === config.recipient ? 'vous' : recipientName === 'destinataire' ? 'le destinataire' : recipientName}
          </p>
          <h1>{title}</h1>
        </div>
        <StatusPill status={status} expired={expired} />
      </div>

      <div className="amount">
        <span className="amount-value">
          {formatXlm(config.amount * BigInt(status === 'Executed' ? n : contributed))}
        </span>
        <span className="amount-target">/ {formatXlm(target)} XLM {status === 'Executed' ? 'versés' : 'en séquestre'}</span>
      </div>

      <div className="segments" role="img" aria-label={`${contributed} parts versées sur ${n}, ${approvals} accords`}>
        {participants.map(({ address, state: p }) => (
          <span
            key={address}
            className={`segment ${status === 'Executed' ? 'is-paid' : p.approved ? 'is-approved' : p.contributed ? 'is-contributed' : ''}`}
            title={displayName(address) ?? address}
          />
        ))}
      </div>
      <div className="legend">
        <span><i className="dot is-contributed" /> Part versée</span>
        <span><i className="dot is-approved" /> Part versée + accord</span>
        <span><i className="dot" /> En attente</span>
      </div>

      <dl className="stats">
        <div>
          <dt>Part par personne</dt>
          <dd>{formatXlm(config.amount)} XLM</dd>
        </div>
        <div>
          <dt>Accords</dt>
          <dd>{approvals} / {n}</dd>
        </div>
        <div>
          <dt>Échéance</dt>
          <dd title={deadline.toLocaleString('fr-FR')}>
            {status === 'Executed' ? '—' : expired ? 'Dépassée' : `dans ${formatCountdown(deadline, now)}`}
          </dd>
        </div>
        <div>
          <dt>Destinataire</dt>
          <dd className="recipient">
            {displayName(config.recipient) && <span>{displayName(config.recipient)}</span>}
            <AddressLink address={config.recipient} />
          </dd>
        </div>
      </dl>

      <Banner state={state} expired={expired} contributed={contributed} recipientName={recipientName} />
    </section>
  )
}

function StatusPill({ status, expired }: { status: string; expired: boolean }) {
  if (status === 'Executed') return <span className="pill pill-success"><Check width={13} height={13} /> Exécuté</span>
  if (expired) return <span className="pill pill-warning"><Clock width={13} height={13} /> Expiré</span>
  return <span className="pill pill-live"><i className="pulse" /> Collecte en cours</span>
}

function Banner({
  state,
  expired,
  contributed,
  recipientName,
}: {
  state: GroupPaymentState
  expired: boolean
  contributed: number
  recipientName: string
}) {
  const n = state.participants.length
  if (state.status === 'Executed') {
    return (
      <p className="banner banner-success">
        <Check /> {formatXlm(state.config.amount * BigInt(n))} XLM ont été versés au {recipientName.toLowerCase()}.
        Le contrat est clôturé.
      </p>
    )
  }
  if (expired) {
    return (
      <p className="banner banner-warning">
        <Alert /> La date limite est passée sans accord unanime. Le paiement ne partira plus :
        chacun peut récupérer sa part avec « Retirer ».
      </p>
    )
  }
  const missingFunds = n - contributed
  const missingApprovals = n - state.approvals
  return (
    <p className="banner">
      <Clock />
      {missingApprovals === 1 && missingFunds === 0
        ? 'Plus qu’un accord : il déclenchera automatiquement le paiement.'
        : `Encore ${missingApprovals} accords${missingFunds ? ` et ${missingFunds} ${missingFunds > 1 ? 'parts' : 'part'} à verser` : ''} avant le paiement automatique.`}
    </p>
  )
}
