import { useState, type ReactNode } from 'react'
import type { Wallet } from '../hooks/useWallet'
import { displayName } from '../lib/labels'
import {
  EXPLORER,
  explainError,
  formatXlm,
  makeClient,
  sendAction,
  type Action,
  type GroupPaymentState,
  type Phase,
} from '../lib/stellar'
import { Alert, Check, External, Lock, Send, Spinner, ThumbUp, Undo, Wallet as WalletIcon } from './Icons'

const PHASE_LABEL: Record<Phase, string> = {
  simulating: 'Vérification de la transaction…',
  signing: 'Confirmez dans Freighter…',
  sending: 'Envoi au réseau et confirmation…',
}

const DONE_LABEL: Record<Action, string> = {
  contribute: 'Votre part est en séquestre dans le contrat.',
  approve: 'Votre accord est enregistré.',
  withdraw: 'Votre part vous a été rendue.',
}

type Outcome = { ok: true; text: string; hash: string } | { ok: false; text: string }

interface Props {
  state: GroupPaymentState
  wallet: Wallet
  now: Date
  onDone: () => void
}

export function ActionPanel({ state, wallet, now, onDone }: Props) {
  const [confirm, setConfirm] = useState<Action | null>(null)
  const [phase, setPhase] = useState<Phase | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  if (wallet.installed === false) {
    return (
      <Shell>
        <p className="lead">Pour participer, installez le wallet <strong>Freighter</strong> et passez-le sur le réseau <strong>Testnet</strong>.</p>
        <a className="btn btn-primary btn-block" href="https://www.freighter.app/" target="_blank" rel="noreferrer">
          Installer Freighter <External />
        </a>
        <p className="hint">Vous pouvez suivre la cagnotte sans wallet : tout est public et en lecture libre.</p>
      </Shell>
    )
  }

  if (!wallet.address) {
    return (
      <Shell>
        <p className="lead">Connectez votre wallet pour voir ce que vous pouvez faire dans ce groupe.</p>
        <button className="btn btn-primary btn-block" onClick={() => wallet.connect().catch((e) => setOutcome({ ok: false, text: explainError(e) }))} disabled={wallet.connecting}>
          {wallet.connecting ? <Spinner /> : <WalletIcon />} Connecter Freighter
        </button>
        {outcome && !outcome.ok && <p className="notice notice-error"><Alert /> {outcome.text}</p>}
      </Shell>
    )
  }

  if (wallet.wrongNetwork) {
    return (
      <Shell>
        <p className="notice notice-warning">
          <Alert /> Freighter n’est pas sur le réseau Testnet. Changez de réseau dans l’extension : la page se mettra à jour toute seule.
        </p>
      </Shell>
    )
  }

  const me = wallet.address
  const mine = state.participants.find((p) => p.address === me)?.state
  if (!mine) {
    return (
      <Shell>
        <p className="notice">
          <Alert /> Le compte connecté ne fait pas partie de ce groupe. Seuls les membres listés à la création du contrat peuvent verser et approuver.
        </p>
        <p className="hint">
          Pour tester, importez dans Freighter la clé d’un participant de démo : <code>stellar keys show bob</code>.
        </p>
      </Shell>
    )
  }

  const n = state.participants.length
  const executed = state.status === 'Executed'
  const expired = !executed && now.getTime() > Number(state.config.deadline) * 1000
  const amount = formatXlm(state.config.amount)
  const total = formatXlm(state.config.amount * BigInt(n))
  const recipient = displayName(state.config.recipient) ?? 'le destinataire'
  const isLastApproval = !mine.approved && state.approvals === n - 1
  const busy = phase !== null

  const next: Action | null = executed || expired ? null : !mine.contributed ? 'contribute' : !mine.approved ? 'approve' : null
  const canWithdraw = !executed && mine.contributed

  const run = async (action: Action) => {
    setOutcome(null)
    try {
      const client = await makeClient(me, wallet.sign)
      const hash = await sendAction(client, action, me, setPhase)
      const triggered = action === 'approve' && isLastApproval
      setOutcome({ ok: true, hash, text: triggered ? `Dernier accord reçu : ${total} XLM ont été versés à ${recipient}.` : DONE_LABEL[action] })
      onDone()
    } catch (e) {
      setOutcome({ ok: false, text: explainError(e) })
    } finally {
      setPhase(null)
      setConfirm(null)
    }
  }

  const steps = [
    { label: `Verser ${amount} XLM`, done: mine.contributed || executed },
    { label: 'Donner votre accord', done: mine.approved || executed },
    { label: 'Paiement automatique', done: executed },
  ]
  const current = steps.findIndex((s) => !s.done)

  return (
    <Shell>
      <ol className="stepper">
        {steps.map((s, i) => (
          <li key={s.label} className={s.done ? 'is-done' : i === current ? 'is-current' : ''}>
            <span className="step-dot">{s.done ? <Check width={12} height={12} /> : i + 1}</span>
            {s.label}
          </li>
        ))}
      </ol>

      {confirm ? (
        <ConfirmBox
          action={confirm}
          amount={amount}
          total={total}
          recipient={recipient}
          isLastApproval={isLastApproval}
          busy={busy}
          phase={phase}
          onCancel={() => setConfirm(null)}
          onConfirm={() => run(confirm)}
        />
      ) : (
        <>
          {next === 'contribute' && (
            <button className="btn btn-primary btn-block" onClick={() => setConfirm('contribute')}>
              <Lock /> Verser ma part · {amount} XLM
            </button>
          )}
          {next === 'approve' && (
            <button className="btn btn-primary btn-block" onClick={() => setConfirm('approve')}>
              <ThumbUp /> {isLastApproval ? `Approuver et payer ${total} XLM` : 'Donner mon accord'}
            </button>
          )}
          {!next && !executed && !expired && (
            <p className="notice notice-calm">
              <Check /> Vous avez fait votre part. Le paiement partira dès que les {n - state.approvals} accord{n - state.approvals > 1 ? 's' : ''} restant{n - state.approvals > 1 ? 's' : ''} arriveront.
            </p>
          )}
          {executed && <p className="notice notice-success"><Check /> Paiement exécuté. Il n’y a plus rien à faire.</p>}
          {expired && !mine.contributed && <p className="notice"><Alert /> Date limite dépassée : plus aucune action possible.</p>}
          {canWithdraw && (
            <button className={`btn btn-block ${expired ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setConfirm('withdraw')}>
              <Undo /> Retirer ma part
            </button>
          )}
        </>
      )}

      {outcome && (
        <p className={`notice ${outcome.ok ? 'notice-success' : 'notice-error'}`} role="status">
          {outcome.ok ? <Check /> : <Alert />}
          <span>
            {outcome.text}
            {outcome.ok && outcome.hash && (
              <>
                {' '}
                <a href={`${EXPLORER}/tx/${outcome.hash}`} target="_blank" rel="noreferrer">
                  Voir la transaction <External width={11} height={11} />
                </a>
              </>
            )}
          </span>
        </p>
      )}
    </Shell>
  )
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <section className="card action-card">
      <header className="card-head">
        <h2>Votre action</h2>
      </header>
      {children}
    </section>
  )
}

function ConfirmBox(props: {
  action: Action
  amount: string
  total: string
  recipient: string
  isLastApproval: boolean
  busy: boolean
  phase: Phase | null
  onCancel: () => void
  onConfirm: () => void
}) {
  const { action, amount, total, recipient, isLastApproval, busy, phase } = props
  const rows: Record<Action, { title: string; lines: [string, string][]; note: string }> = {
    contribute: {
      title: 'Verser votre part',
      lines: [['Montant', `${amount} XLM`], ['Vers', 'Le contrat (séquestre)']],
      note: 'Les fonds restent bloqués dans le contrat. Vous pouvez les récupérer tant que le paiement n’est pas parti.',
    },
    approve: {
      title: isLastApproval ? 'Dernier accord : paiement immédiat' : 'Donner votre accord',
      lines: isLastApproval
        ? [['Paiement', `${total} XLM`], ['Vers', recipient]]
        : [['Mouvement de fonds', 'Aucun pour l’instant']],
      note: isLastApproval
        ? 'Votre signature déclenche le paiement dans la même transaction. Une fois confirmé, il est irréversible.'
        : 'Vous autorisez le paiement. Il ne partira que lorsque tout le monde aura approuvé.',
    },
    withdraw: {
      title: 'Retirer votre part',
      lines: [['Montant rendu', `${amount} XLM`], ['Vers', 'Votre compte']],
      note: 'Votre accord sera annulé en même temps : le paiement ne pourra pas partir sans vous.',
    },
  }
  const r = rows[action]
  return (
    <div className={`confirm ${isLastApproval && action === 'approve' ? 'confirm-strong' : ''}`}>
      <p className="confirm-title">{r.title}</p>
      <dl>
        {r.lines.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
        <div>
          <dt>Frais réseau</dt>
          <dd>moins de 0,05 XLM</dd>
        </div>
      </dl>
      <p className="hint">{r.note}</p>
      <div className="confirm-actions">
        <button className="btn btn-ghost" onClick={props.onCancel} disabled={busy}>Annuler</button>
        <button className="btn btn-primary" onClick={props.onConfirm} disabled={busy}>
          {busy ? <><Spinner /> {PHASE_LABEL[phase ?? 'simulating']}</> : <><Send /> Signer dans Freighter</>}
        </button>
      </div>
    </div>
  )
}
