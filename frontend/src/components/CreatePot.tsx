import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { StrKey } from '@stellar/stellar-sdk'
import type { Wallet } from '../hooks/useWallet'
import { displayName, LABELS } from '../lib/labels'
import {
  accountExists,
  createPot,
  EXPLORER,
  explainError,
  formatXlm,
  isModalClosed,
  parseXlm,
  shortAddress,
  type Phase,
} from '../lib/stellar'
import { Avatar } from './Avatar'
import { Alert, Close, Crown, External, Plus, Send, Spinner, Wallet as WalletIcon } from './Icons'

const MAX_TITLE_BYTES = 64 // limite du contrat, en octets UTF-8 (un « é » en compte 2)
const MAX_PARTICIPANTS = 50

const PHASE_LABEL: Record<Phase, string> = {
  simulating: 'Vérification…',
  signing: 'Confirmez dans votre wallet…',
  sending: 'Déploiement du pot…',
}

type Existence = 'checking' | 'ok' | 'missing'

/** Valeur par défaut d'un <input type="datetime-local"> : dans 7 jours, à l'heure locale. */
function inSevenDays(): string {
  const d = new Date(Date.now() + 7 * 86_400_000)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

interface Props {
  wallet: Wallet
  onCreated: (address: string) => void
  onCancel: () => void
}

export function CreatePot({ wallet, onCreated, onCancel }: Props) {
  const me = wallet.address
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('100')
  const [deadline, setDeadline] = useState(inSevenDays)
  const [participants, setParticipants] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [draftError, setDraftError] = useState<string | null>(null)
  const [existence, setExistence] = useState<Record<string, Existence>>({})
  const [phase, setPhase] = useState<Phase | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ hash: string; address: string } | null>(null)

  // Vérifie que chaque invité a un compte financé : sinon il ne pourra jamais verser.
  useEffect(() => {
    for (const p of participants) {
      if (existence[p]) continue
      setExistence((e) => ({ ...e, [p]: 'checking' }))
      accountExists(p).then((ok) => setExistence((e) => ({ ...e, [p]: ok ? 'ok' : 'missing' })))
    }
  }, [participants, existence])

  const add = (raw: string): boolean => {
    // On accepte plusieurs adresses collées d'un coup (espaces, virgules, retours à la ligne).
    const candidates = raw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean)
    if (!candidates.length) return false
    for (const c of candidates) {
      if (!StrKey.isValidEd25519PublicKey(c)) {
        setDraftError(`« ${c.length > 14 ? shortAddress(c) : c} » n’est pas une adresse Stellar valide (G…, 56 caractères).`)
        return false
      }
      if (c === me) {
        setDraftError('Vous êtes le destinataire de ce pot : vous ne pouvez pas y participer.')
        return false
      }
    }
    const next = [...new Set([...participants, ...candidates])]
    if (next.length > MAX_PARTICIPANTS) {
      setDraftError(`${MAX_PARTICIPANTS} participants maximum.`)
      return false
    }
    setParticipants(next)
    setDraftError(null)
    return true
  }

  const amountStroops = parseXlm(amount)
  const deadlineDate = new Date(deadline)
  const titleBytes = new TextEncoder().encode(title.trim()).length
  const contacts = useMemo(
    () => Object.keys(LABELS).filter((a) => a !== me && !participants.includes(a)),
    [me, participants],
  )
  const missing = participants.filter((p) => existence[p] === 'missing')

  const problems = [
    !title.trim() && 'Donnez un titre au pot.',
    titleBytes > MAX_TITLE_BYTES && 'Le titre est trop long.',
    (!amountStroops || amountStroops <= 0n) && 'Indiquez un montant par personne valide.',
    !(deadlineDate.getTime() > Date.now() + 60_000) && 'L’échéance doit être dans le futur.',
    participants.length === 0 && 'Invitez au moins un participant.',
  ].filter(Boolean) as string[]

  const busy = phase !== null
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!me || problems.length || busy) return
    setError(null)
    try {
      const res = await createPot(
        me,
        wallet.sign,
        {
          title: title.trim(),
          participants,
          amount: amountStroops!,
          deadline: BigInt(Math.floor(deadlineDate.getTime() / 1000)),
        },
        setPhase,
      )
      setDone(res)
    } catch (err) {
      setError(explainError(err))
    } finally {
      setPhase(null)
    }
  }

  if (done) {
    return (
      <section className="card create-done">
        <span className="done-icon"><Send width={22} height={22} /></span>
        <h1>« {title.trim()} » est en ligne</h1>
        <p className="lead">
          Le pot a été déployé sur le testnet et {participants.length} invitation{participants.length > 1 ? 's ont' : ' a'} été
          enregistrée{participants.length > 1 ? 's' : ''} dans le registre. Chaque participant la verra dans sa cloche de notifications
          en se connectant, depuis n’importe quel appareil.
        </p>
        <div className="create-done-actions">
          <button className="btn btn-primary" onClick={() => onCreated(done.address)}>Ouvrir le pot</button>
          <a className="btn btn-ghost" href={`${EXPLORER}/tx/${done.hash}`} target="_blank" rel="noreferrer">
            Voir la transaction <External width={13} height={13} />
          </a>
        </div>
      </section>
    )
  }

  return (
    <form className="create" onSubmit={submit}>
      <section className="card">
        <header className="create-head">
          <div>
            <p className="eyebrow">Nouveau pot commun</p>
            <h1>Créer un pot et inviter les participants</h1>
          </div>
          <button type="button" className="icon-btn" onClick={onCancel} aria-label="Annuler"><Close /></button>
        </header>

        <div className="field">
          <label htmlFor="title">Titre</label>
          <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. : Loyer de novembre" autoFocus />
          <span className={`field-hint ${titleBytes > MAX_TITLE_BYTES ? 'is-error' : ''}`}>{titleBytes}/{MAX_TITLE_BYTES}</span>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="amount">Part par personne</label>
            <div className="input-suffix">
              <input id="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <span>XLM</span>
            </div>
          </div>
          <div className="field">
            <label htmlFor="deadline">Échéance</label>
            <input id="deadline" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
        </div>

        <div className="field">
          <label htmlFor="invite">Participants invités</label>
          <div className="invite-input">
            <input
              id="invite"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value)
                setDraftError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (add(draft)) setDraft('')
                }
              }}
              onPaste={(e) => {
                const text = e.clipboardData.getData('text')
                if (/[\s,;]/.test(text.trim())) {
                  e.preventDefault()
                  if (add(text)) setDraft('')
                }
              }}
              placeholder="Adresse du compte : GARD…ROZX"
              spellCheck={false}
              autoComplete="off"
            />
            <button type="button" className="btn" onClick={() => add(draft) && setDraft('')} disabled={!draft.trim()}>
              <Plus /> Inviter
            </button>
          </div>
          {draftError && <span className="field-hint is-error">{draftError}</span>}
          {contacts.length > 0 && (
            <div className="contacts">
              <span className="hint">Comptes de démo :</span>
              {contacts.map((a) => (
                <button type="button" key={a} className="contact" onClick={() => add(a)}>
                  <Plus width={12} height={12} /> {displayName(a)}
                </button>
              ))}
            </div>
          )}

          {participants.length > 0 && (
            <ul className="invitees">
              {participants.map((p) => (
                <li key={p}>
                  <Avatar address={p} size={30} />
                  <span className="who">
                    <span className="name">{displayName(p) ?? 'Participant'}</span>
                    <span className="address">{shortAddress(p)}</span>
                  </span>
                  <span className={`exist exist-${existence[p] ?? 'checking'}`}>
                    {existence[p] === 'missing' ? 'Compte introuvable' : existence[p] === 'ok' ? 'Compte actif' : 'Vérification…'}
                  </span>
                  <button type="button" className="icon-btn" onClick={() => setParticipants(participants.filter((x) => x !== p))} aria-label="Retirer">
                    <Close width={14} height={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {missing.length > 0 && (
            <p className="notice notice-warning">
              <Alert />
              {missing.length > 1 ? 'Certains comptes n’existent' : 'Un compte n’existe'} pas encore sur le testnet. Tant qu’il n’est pas
              financé (Friendbot), ce participant ne pourra pas verser sa part et le paiement restera bloqué.
            </p>
          )}
        </div>
      </section>

      <aside className="card create-summary">
        <header className="card-head"><h2>Récapitulatif</h2></header>
        <dl>
          <div>
            <dt>Destinataire</dt>
            <dd>
              {me ? (
                <span className="recipient-me"><Crown width={13} height={13} /> Vous · {displayName(me) ?? shortAddress(me)}</span>
              ) : '—'}
            </dd>
          </div>
          <div><dt>Participants</dt><dd>{participants.length}</dd></div>
          <div><dt>Part par personne</dt><dd>{amountStroops ? `${formatXlm(amountStroops)} XLM` : '—'}</dd></div>
          <div className="total">
            <dt>Vous recevrez</dt>
            <dd>{amountStroops ? `${formatXlm(amountStroops * BigInt(participants.length))} XLM` : '—'}</dd>
          </div>
        </dl>
        <p className="hint">
          Ces règles sont gravées dans le contrat à sa création : personne, pas même vous, ne pourra les modifier. Le paiement partira
          tout seul au dernier accord.
        </p>

        {!me ? (
          <button type="button" className="btn btn-primary btn-block" onClick={() => wallet.connect().catch((e) => !isModalClosed(e) && setError(explainError(e)))}>
            <WalletIcon /> Connecter mon wallet
          </button>
        ) : wallet.wrongNetwork ? (
          <p className="notice notice-warning"><Alert /> Passez votre wallet sur le réseau Testnet.</p>
        ) : (
          <button type="submit" className="btn btn-primary btn-block" disabled={busy || problems.length > 0}>
            {busy ? <><Spinner /> {PHASE_LABEL[phase!]}</> : <><Send /> Créer le pot et inviter</>}
          </button>
        )}
        {me && problems.length > 0 && <p className="hint">{problems[0]}</p>}
        {error && <p className="notice notice-error"><Alert /> {error}</p>}
      </aside>
    </form>
  )
}
