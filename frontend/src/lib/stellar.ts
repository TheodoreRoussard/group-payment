import { contract, Networks, rpc, scValToNative } from '@stellar/stellar-sdk'
import { displayName } from './labels'

export const CONTRACT_ID = import.meta.env.VITE_CONTRACT_ID as string
export const RPC_URL = import.meta.env.VITE_RPC_URL as string
export const START_LEDGER = Number(import.meta.env.VITE_START_LEDGER)
export const NETWORK_PASSPHRASE = Networks.TESTNET
export const EXPLORER = 'https://stellar.expert/explorer/testnet'

export const server = new rpc.Server(RPC_URL)

// --- Types miroirs du contrat Rust (src/lib.rs) ---

export type Status = 'Open' | 'Executed'

export interface Config {
  token: string
  recipient: string
  amount: bigint
  deadline: bigint
}

export interface ParticipantState {
  contributed: boolean
  approved: boolean
}

export interface GroupPaymentState {
  config: Config
  status: Status
  participants: { address: string; state: ParticipantState }[]
  approvals: number
}

type Tx<T> = Promise<contract.AssembledTransaction<T>>

// Seules les méthodes utilisées sont décrites : Client.from lit le reste on-chain.
export interface GroupPaymentContract {
  get_config: () => Tx<Config>
  get_status: () => Tx<{ tag: Status }>
  // Une Map Soroban est décodée en tableau de paires [clé, valeur].
  get_participants: () => Tx<[string, ParticipantState][]>
  get_approval_count: () => Tx<number>
  contribute: (args: { from: string }) => Tx<unknown>
  approve: (args: { from: string }) => Tx<unknown>
  withdraw: (args: { from: string }) => Tx<unknown>
}

export type Action = 'contribute' | 'approve' | 'withdraw'

export function makeClient(
  publicKey?: string,
  signTransaction?: contract.ClientOptions['signTransaction'],
) {
  return contract.Client.from<GroupPaymentContract>({
    contractId: CONTRACT_ID,
    rpcUrl: RPC_URL,
    networkPassphrase: NETWORK_PASSPHRASE,
    publicKey,
    signTransaction,
  })
}

let readClient: ReturnType<typeof makeClient> | undefined

/** Client sans compte ni signature, partagé : il ne sert qu'aux simulations de lecture. */
export function getReadClient() {
  readClient ??= makeClient().catch((e) => {
    readClient = undefined // on réessaiera au prochain appel
    throw e
  })
  return readClient
}

/** Lecture complète de l'état : 4 simulations gratuites, lancées en parallèle. */
export async function readState(
  client: contract.Client & GroupPaymentContract,
): Promise<GroupPaymentState> {
  const [config, status, participants, approvals] = await Promise.all([
    client.get_config(),
    client.get_status(),
    client.get_participants(),
    client.get_approval_count(),
  ])
  return {
    config: config.result,
    status: status.result.tag,
    // La Map du contrat est triée par adresse : on préfère un ordre lisible par nom.
    participants: participants.result
      .map(([address, state]) => ({ address, state }))
      .sort((a, b) =>
        (displayName(a.address) ?? '~' + a.address).localeCompare(displayName(b.address) ?? '~' + b.address),
      ),
    approvals: approvals.result,
  }
}

// --- Erreurs du contrat → messages compréhensibles ---

const CONTRACT_ERRORS: Record<number, string> = {
  6: "Cette adresse ne fait pas partie du groupe.",
  7: 'Vous avez déjà versé votre part.',
  8: "Vous devez d'abord verser votre part.",
  9: 'Vous avez déjà donné votre accord.',
  10: 'La date limite est dépassée : seul le retrait reste possible.',
  11: 'Le paiement a déjà été exécuté.',
}

/** Le wallet kit rejette avec des objets `{ code, message }` ; code -1 = sélecteur fermé. */
export function isModalClosed(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: unknown }).code === -1
}

export function explainError(e: unknown): string {
  const text =
    e instanceof Error
      ? e.message
      : typeof e === 'object' && e !== null && 'message' in e
        ? String((e as { message: unknown }).message)
        : String(e)
  const code = text.match(/Error\(Contract, #(\d+)\)/)?.[1]
  if (code && CONTRACT_ERRORS[+code]) return CONTRACT_ERRORS[+code]
  if (/declined|rejected|denied/i.test(text)) return 'Signature refusée dans le wallet.'
  if (/balance|underfunded|insufficient/i.test(text)) return 'Solde insuffisant pour cette opération.'
  if (/not found|does not exist/i.test(text) && /account/i.test(text))
    return "Ce compte n'existe pas encore sur le testnet : financez-le via Friendbot."
  return text.length > 160 ? text.slice(0, 160) + '…' : text
}

export type Phase = 'simulating' | 'signing' | 'sending'

/**
 * Simule, fait signer par le wallet, envoie puis attend la confirmation.
 * La simulation préalable fait échouer tôt (et gratuitement) une action invalide.
 */
export async function sendAction(
  client: contract.Client & GroupPaymentContract,
  action: Action,
  from: string,
  onPhase: (phase: Phase) => void,
): Promise<string> {
  onPhase('simulating')
  const tx = await client[action]({ from })
  const sim = tx.simulation
  if (sim && rpc.Api.isSimulationError(sim)) throw new Error(sim.error)
  onPhase('signing')
  await tx.sign()
  onPhase('sending')
  const sent = await tx.send()
  const res = sent.getTransactionResponse
  if (res && res.status !== rpc.Api.GetTransactionStatus.SUCCESS)
    throw new Error(`Transaction ${res.status}`)
  return sent.sendTransactionResponse?.hash ?? ''
}

// --- Historique : les events émis par le contrat ---

export type ActivityKind = 'contributed' | 'approved' | 'withdrawn' | 'executed'

export interface Activity {
  id: string
  kind: ActivityKind
  who: string
  amount?: bigint
  at: Date
  txHash: string
}

const EVENT_FILTERS: rpc.Api.EventFilter[] = [{ type: 'contract', contractIds: [CONTRACT_ID] }]
const MAX_PAGES_PER_READ = 20

// Le RPC ne parcourt qu'une fenêtre limitée de ledgers par requête (~10 000) :
// une seule requête depuis le déploiement rate donc les events récents. On pagine
// avec le curseur jusqu'au dernier ledger, et on garde curseur + events en mémoire
// pour que chaque rafraîchissement ne lise que les nouveaux ledgers.
let activityCursor: string | undefined
let activityLog: Activity[] = []

/** Ledger atteint par un curseur d'events (les 32 bits de poids fort du TOID). */
function cursorLedger(cursor: string): number {
  return Number(BigInt(cursor.split('-')[0]) >> 32n)
}

function toActivity(ev: rpc.Api.EventResponse): Activity {
  const data = scValToNative(ev.value) as Record<string, bigint | number>
  return {
    id: ev.id,
    kind: scValToNative(ev.topic[0]) as ActivityKind,
    who: scValToNative(ev.topic[1]) as string,
    amount: (data.amount ?? data.total) as bigint | undefined,
    at: new Date(ev.ledgerClosedAt),
    txHash: ev.txHash,
  }
}

export async function readActivity(): Promise<Activity[]> {
  if (!activityCursor) {
    // Le RPC ne conserve qu'environ 7 jours d'events : on ne peut pas partir d'avant.
    const { oldestLedger } = await server.getHealth()
    const res = await server.getEvents({
      startLedger: Math.max(START_LEDGER, oldestLedger),
      filters: EVENT_FILTERS,
      limit: 100,
    })
    activityLog = res.events.map(toActivity)
    activityCursor = res.cursor
    if (cursorLedger(res.cursor) >= res.latestLedger) return [...activityLog].reverse()
  }

  for (let page = 0; page < MAX_PAGES_PER_READ; page++) {
    const res = await server.getEvents({ cursor: activityCursor, filters: EVENT_FILTERS, limit: 100 })
    const seen = new Set(activityLog.map((a) => a.id))
    activityLog.push(...res.events.filter((ev) => !seen.has(ev.id)).map(toActivity))
    activityCursor = res.cursor
    if (cursorLedger(res.cursor) >= res.latestLedger) break
  }
  return [...activityLog].reverse()
}

// --- Formatage ---

const STROOPS_PER_XLM = 10_000_000n

export function formatXlm(stroops: bigint): string {
  const whole = stroops / STROOPS_PER_XLM
  const frac = stroops % STROOPS_PER_XLM
  const fracStr = frac === 0n ? '' : ',' + frac.toString().padStart(7, '0').replace(/0+$/, '')
  return whole.toLocaleString('fr-FR') + fracStr
}

export function shortAddress(a: string): string {
  return `${a.slice(0, 4)}…${a.slice(-4)}`
}
