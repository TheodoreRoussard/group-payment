import type { PotEntry } from './pots'
import type { GroupPaymentState } from './stellar'

export type NotificationKind = 'invite' | 'approve' | 'paid'

export interface Notification {
  /** Stable tant que la situation ne change pas : sert à retenir ce qui a été lu. */
  key: string
  kind: NotificationKind
  pot: PotEntry
  state: GroupPaymentState
}

/**
 * Les notifications se déduisent de l'état on-chain, rien n'est stocké à part :
 * une invitation disparaît d'elle-même quand la part est versée.
 */
export function notificationsFor(
  me: string,
  pots: PotEntry[],
  summaries: Record<string, GroupPaymentState>,
  now: Date,
): Notification[] {
  const out: Notification[] = []
  for (const pot of pots) {
    const state = summaries[pot.address]
    if (!state) continue
    const open = state.status === 'Open' && now.getTime() <= Number(state.config.deadline) * 1000
    const mine = state.participants.find((p) => p.address === me)?.state
    const push = (kind: NotificationKind) => out.push({ key: `${pot.address}:${kind}`, kind, pot, state })

    if (mine && open && !mine.contributed) push('invite')
    else if (mine && open && !mine.approved) push('approve')
    if (state.config.recipient === me && state.status === 'Executed') push('paid')
  }
  return out
}

/** Ce qui demande une action de ma part dans ce pot (pour la pastille de la sidebar). */
export function needsMyAction(me: string | null, state: GroupPaymentState | undefined, now: Date): boolean {
  if (!me || !state || state.status !== 'Open') return false
  if (now.getTime() > Number(state.config.deadline) * 1000) return false
  const mine = state.participants.find((p) => p.address === me)?.state
  return !!mine && (!mine.contributed || !mine.approved)
}
