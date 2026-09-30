import { Address, contract, nativeToScVal, Networks, rpc, scValToNative } from '@stellar/stellar-sdk'
import { displayName } from './labels'

export const RPC_URL = import.meta.env.VITE_RPC_URL as string
export const FACTORY_ID = import.meta.env.VITE_FACTORY_ID as string
export const NETWORK_PASSPHRASE = Networks.TESTNET
export const EXPLORER = 'https://stellar.expert/explorer/testnet'

export const server = new rpc.Server(RPC_URL)

// --- Types miroirs des contrats Rust (contracts/*/src/lib.rs) ---

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

/** Fiche d'un pot dans le registre (`PotInfo` côté Rust). */
export interface PotInfo {
  id: number
  address: string
  owner: string
  title: string
  participants: string[]
  amount: bigint
  deadline: bigint
  created_ledger: number
}

type Tx<T> = Promise<contract.AssembledTransaction<T>>

// Seules les méthodes utilisées sont décrites : le reste est lu dans le spec on-chain.
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

export interface PotFactoryContract {
  list: (args: { start: number; limit: number }) => Tx<PotInfo[]>
  create_pot: (args: {
    owner: string
    title: string
    participants: string[]
    amount: bigint
    deadline: bigint
  }) => Tx<contract.Result<string>>
}

export type Action = 'contribute' | 'approve' | 'withdraw'
export type PotClient = contract.Client & GroupPaymentContract
export type FactoryClient = contract.Client & PotFactoryContract

type Signer = contract.ClientOptions['signTransaction']

function options(contractId: string, publicKey?: string, signTransaction?: Signer) {
  return { contractId, rpcUrl: RPC_URL, networkPassphrase: NETWORK_PASSPHRASE, publicKey, signTransaction }
}

// Tous les pots partagent le même Wasm, donc le même spec : on ne le télécharge
// qu'une fois, au lieu d'une fois par pot comme le ferait Client.from.
let potSpec: Promise<contract.Spec> | undefined

function getPotSpec(contractId: string): Promise<contract.Spec> {
  potSpec ??= contract.Client.from(options(contractId))
    .then((c) => c.spec)
    .catch((e) => {
      potSpec = undefined // on réessaiera au prochain appel
      throw e
    })
  return potSpec
}

export async function makePotClient(contractId: string, publicKey?: string, signTransaction?: Signer) {
  const spec = await getPotSpec(contractId)
  return new contract.Client(spec, options(contractId, publicKey, signTransaction)) as PotClient
}

let factorySpec: Promise<contract.Spec> | undefined

export async function makeFactoryClient(publicKey?: string, signTransaction?: Signer) {
  factorySpec ??= contract.Client.from(options(FACTORY_ID))
    .then((c) => c.spec)
    .catch((e) => {
      factorySpec = undefined
      throw e
    })
  const spec = await factorySpec
  return new contract.Client(spec, options(FACTORY_ID, publicKey, signTransaction)) as FactoryClient
}

/** Lecture complète de l'état d'un pot : 4 simulations gratuites, en parallèle. */
export async function readState(contractId: string): Promise<GroupPaymentState> {
  const client = await makePotClient(contractId)
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

/** Tous les pots du registre (par pages de 50). */
export async function listFactoryPots(): Promise<PotInfo[]> {
  if (!FACTORY_ID) return []
  const factory = await makeFactoryClient()
  const out: PotInfo[] = []
  for (let start = 0; ; start += 50) {
    const page = (await factory.list({ start, limit: 50 })).result
    out.push(...page)
    if (page.length < 50) return out
  }
}

// --- Erreurs des contrats → messages compréhensibles ---

const CONTRACT_ERRORS: Record<number, string> = {
  // Constructeur du pot (remontent via le registre à la création)
  1: 'Ajoutez au moins un participant.',
  2: 'Un pot ne peut pas dépasser 50 participants.',
  3: 'Un participant apparaît deux fois.',
  4: 'Le montant par personne doit être positif.',
  5: "L'échéance doit être dans le futur.",
  // Actions sur un pot
  6: "Cette adresse ne fait pas partie du groupe.",
  7: 'Vous avez déjà versé votre part.',
  8: "Vous devez d'abord verser votre part.",
  9: 'Vous avez déjà donné votre accord.',
  10: 'La date limite est dépassée : seul le retrait reste possible.',
  11: 'Le paiement a déjà été exécuté.',
  // Registre
  100: 'Le titre doit faire entre 1 et 64 caractères.',
  101: 'Le propriétaire ne peut pas être participant de son propre pot.',
  102: "L'un des participants a atteint la limite de 200 pots.",
  103: 'Pot introuvable dans le registre.',
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
 * La simulation préalable fait échouer tôt (et gratuitement) une transaction invalide.
 */
async function submit<T>(
  build: () => Tx<T>,
  onPhase: (phase: Phase) => void,
): Promise<{ hash: string; result: T }> {
  onPhase('simulating')
  const tx = await build()
  const sim = tx.simulation
  if (sim && rpc.Api.isSimulationError(sim)) throw new Error(sim.error)
  onPhase('signing')
  await tx.sign()
  onPhase('sending')
  const sent = await tx.send()
  const res = sent.getTransactionResponse
  if (res && res.status !== rpc.Api.GetTransactionStatus.SUCCESS)
    throw new Error(`Transaction ${res.status}`)
  return { hash: sent.sendTransactionResponse?.hash ?? '', result: sent.result }
}

export async function sendAction(
  client: PotClient,
  action: Action,
  from: string,
  onPhase: (phase: Phase) => void,
): Promise<string> {
  return (await submit(() => client[action]({ from }), onPhase)).hash
}

export interface NewPot {
  title: string
  participants: string[]
  amount: bigint
  deadline: bigint
}

/** Crée un pot via le registre ; `owner` en est le destinataire. Retourne son adresse. */
export async function createPot(
  owner: string,
  signTransaction: Signer,
  pot: NewPot,
  onPhase: (phase: Phase) => void,
): Promise<{ hash: string; address: string }> {
  const factory = await makeFactoryClient(owner, signTransaction)
  const { hash, result } = await submit(() => factory.create_pot({ owner, ...pot }), onPhase)
  return { hash, address: result.unwrap() }
}

/** Le compte existe-t-il sur le testnet ? (un compte non financé ne pourra jamais verser) */
export async function accountExists(address: string): Promise<boolean> {
  try {
    await server.getAccount(address)
    return true
  } catch {
    return false
  }
}

// --- Historique : les events émis par le pot (et par le registre à sa création) ---

export type ActivityKind = 'created' | 'invited' | 'contributed' | 'approved' | 'withdrawn' | 'executed'

export interface Activity {
  id: string
  kind: ActivityKind
  who: string
  amount?: bigint
  at: Date
  txHash: string
}

const MAX_PAGES_PER_READ = 20

// Le RPC ne parcourt qu'une fenêtre limitée de ledgers par requête (~10 000) :
// on pagine avec le curseur jusqu'au dernier ledger, et on garde curseur + events
// en mémoire (par pot) pour que chaque rafraîchissement ne lise que les nouveaux ledgers.
interface ActivityCache {
  cursor: string
  log: Activity[]
}
const activityCache = new Map<string, ActivityCache>()

/** Ledger atteint par un curseur d'events (les 32 bits de poids fort du TOID). */
function cursorLedger(cursor: string): number {
  return Number(BigInt(cursor.split('-')[0]) >> 32n)
}

const EVENT_KIND: Record<string, ActivityKind> = {
  pot_created: 'created',
  invited: 'invited',
  contributed: 'contributed',
  approved: 'approved',
  withdrawn: 'withdrawn',
  executed: 'executed',
}

function toActivity(ev: rpc.Api.EventResponse): Activity {
  const name = scValToNative(ev.topic[0]) as string
  const data = scValToNative(ev.value) as Record<string, bigint | number>
  return {
    id: ev.id,
    kind: EVENT_KIND[name],
    // pot_created : [nom, pot, propriétaire] ; tous les autres : [nom, personne, …]
    who: scValToNative(name === 'pot_created' ? ev.topic[2] : ev.topic[1]) as string,
    amount: (data.amount ?? data.total) as bigint | undefined,
    at: new Date(ev.ledgerClosedAt),
    txHash: ev.txHash,
  }
}

const topic = {
  symbol: (s: string) => nativeToScVal(s, { type: 'symbol' }).toXDR('base64'),
  address: (a: string) => Address.fromString(a).toScVal().toXDR('base64'),
}

/**
 * `fromFactory` : le pot a été créé par le registre, qui a émis sa création et les
 * invitations. Ces events vivent sur le registre, dans le ledger de création.
 */
export async function readActivity(
  pot: string,
  startLedger: number,
  fromFactory: boolean,
): Promise<Activity[]> {
  let cache = activityCache.get(pot)
  const filters: rpc.Api.EventFilter[] = [{ type: 'contract', contractIds: [pot] }]

  if (!cache) {
    // Le RPC ne conserve qu'environ 7 jours d'events : on ne peut pas partir d'avant.
    const { oldestLedger } = await server.getHealth()
    const from = Math.max(startLedger, oldestLedger)
    const [res, creation] = await Promise.all([
      server.getEvents({ startLedger: from, filters, limit: 100 }),
      fromFactory && startLedger >= oldestLedger
        ? server.getEvents({
            startLedger,
            limit: 100,
            filters: [
              {
                type: 'contract',
                contractIds: [FACTORY_ID],
                topics: [
                  [topic.symbol('pot_created'), topic.address(pot), '*'],
                  [topic.symbol('invited'), '*', topic.address(pot)],
                ],
              },
            ],
          })
        : null,
    ])
    const created = (creation?.events ?? []).filter((ev) => ev.ledger === startLedger)
    cache = { cursor: res.cursor, log: [...created, ...res.events].map(toActivity) }
    activityCache.set(pot, cache)
    if (cursorLedger(res.cursor) >= res.latestLedger) return sorted(cache.log)
  }

  for (let page = 0; page < MAX_PAGES_PER_READ; page++) {
    const res = await server.getEvents({ cursor: cache.cursor, filters, limit: 100 })
    const seen = new Set(cache.log.map((a) => a.id))
    cache.log.push(...res.events.filter((ev) => !seen.has(ev.id)).map(toActivity))
    cache.cursor = res.cursor
    if (cursorLedger(res.cursor) >= res.latestLedger) break
  }
  return sorted(cache.log)
}

/** Du plus récent au plus ancien (les ids d'events sont triables comme des chaînes). */
function sorted(log: Activity[]): Activity[] {
  return [...log].sort((a, b) => (a.id < b.id ? 1 : -1))
}

// --- Formatage ---

const STROOPS_PER_XLM = 10_000_000n

export function formatXlm(stroops: bigint): string {
  const whole = stroops / STROOPS_PER_XLM
  const frac = stroops % STROOPS_PER_XLM
  const fracStr = frac === 0n ? '' : ',' + frac.toString().padStart(7, '0').replace(/0+$/, '')
  return whole.toLocaleString('fr-FR') + fracStr
}

/** "12,5" ou "12.5" → stroops. Retourne null si la saisie n'est pas un montant valide. */
export function parseXlm(input: string): bigint | null {
  const m = input.trim().replace(',', '.').match(/^(\d+)(?:\.(\d{1,7}))?$/)
  if (!m) return null
  return BigInt(m[1]) * STROOPS_PER_XLM + BigInt((m[2] ?? '').padEnd(7, '0'))
}

export function shortAddress(a: string): string {
  return `${a.slice(0, 4)}…${a.slice(-4)}`
}
