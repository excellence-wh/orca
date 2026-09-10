import {
  agentJournalSubmissionKey,
  parseAgentJournalItemKey
} from './agent-session-journal-item-key'
import type {
  AgentJournalItemIdentity,
  AgentJournalRenderItem,
  AgentJournalSnapshot
} from './agent-session-journal-types'
import type { AgentSessionProviderHandle } from './agent-session-provider-handle'
import type { AgentSessionRewindReason, AgentSessionRewindRecord } from './agent-session-rewind'
import { agentSessionPrefixWithinBounds } from './agent-session-prefix-bounds'
import { activeStructuredAgentSessionTurnId } from './structured-agent-session-projection'

type PrefixSelection =
  | { ok: false; reason: AgentSessionRewindReason }
  | {
      ok: true
      retained: AgentSessionRewindRecord['retained']
      providerItemId: string
      throughId: string
      beforeTurnId: string
      claude?: { targetUuid: string; previousLeafUuid: string; dropsTurn?: string }
    }

export function selectAgentSessionPrefix(
  input: Pick<AgentJournalSnapshot, 'items'> & {
    submissions?: AgentJournalSnapshot['submissions']
    itemId: string
    handle: AgentSessionProviderHandle
    boundary: 'before' | 'through'
  }
): PrefixSelection {
  const snapshot = input
  const providerKeys = new Map(
    (snapshot.submissions ?? []).flatMap((submission) =>
      submission.dispatchState === 'accepted' && submission.providerItemId
        ? [
            [
              agentJournalSubmissionKey(submission.clientMessageId),
              submission.providerItemId
            ] as const
          ]
        : []
    )
  )
  const providerKey = (itemId: string) => providerKeys.get(itemId) ?? itemId
  const selected = snapshot.items.findIndex((item) => item.itemId === input.itemId)
  const key = selected === -1 ? null : parseAgentJournalItemKey(providerKey(input.itemId))
  const head = input.handle
  if (!key || !head || key.provider !== head.provider) {
    return { ok: false, reason: 'invalid-target' }
  }
  let throughId = key.provider === 'codex' ? key.turnId : key.provider === 'claude' ? key.uuid : ''
  let boundary = selected
  let claude: { targetUuid: string; previousLeafUuid: string; dropsTurn?: string } | undefined
  if (key.provider === 'codex' && head.provider === 'codex') {
    if (key.threadId !== head.threadId) {
      return { ok: false, reason: 'invalid-target' }
    }
    boundary = snapshot.items.findIndex((item) => {
      const identity = parseAgentJournalItemKey(providerKey(item.itemId))
      return (
        (identity?.provider === 'codex' &&
          identity.threadId === key.threadId &&
          identity.turnId === key.turnId) ||
        (item.body.kind === 'status' && item.body.turnLifecycle?.turnId === key.turnId)
      )
    })
  } else if (key.provider === 'claude' && head.provider === 'claude') {
    if (key.sessionId !== head.sessionId) {
      return { ok: false, reason: 'invalid-target' }
    }
    if (input.boundary === 'before') {
      const previous = snapshot.items
        .slice(0, boundary)
        .map((item) => parseAgentJournalItemKey(providerKey(item.itemId)))
        .findLast(
          (identity) => identity?.provider === 'claude' && identity.sessionId === key.sessionId
        )
      if (previous?.provider !== 'claude') {
        return { ok: false, reason: 'invalid-target' }
      }
      const prompts = snapshot.items
        .slice(boundary)
        .filter((item) => item.body.kind === 'message' && item.body.role === 'user')
      const prompt =
        prompts.length === 1 ? parseAgentJournalItemKey(providerKey(prompts[0]!.itemId)) : null
      claude = {
        targetUuid: previous.uuid,
        previousLeafUuid: head.leafUuid ?? '',
        ...(prompt?.provider === 'claude' ? { dropsTurn: prompt.uuid } : {})
      }
    }
  } else {
    return { ok: false, reason: 'invalid-target' }
  }
  if (input.boundary === 'through') {
    const end = completedTurnEnd(snapshot.items, selected, providerKey)
    if (end === null) {
      return { ok: false, reason: 'busy' }
    }
    boundary = end
    if (key.provider === 'claude') {
      const leaf = snapshot.items
        .slice(0, boundary)
        .map((item) => parseAgentJournalItemKey(providerKey(item.itemId)))
        .findLast((identity) => identity?.provider === 'claude')
      if (leaf?.provider !== 'claude') {
        return { ok: false, reason: 'invalid-target' }
      }
      throughId = leaf.uuid
    }
  }
  const retained = snapshot.items.slice(0, boundary).map(({ itemId, body, observedAt }) => ({
    itemId: providerKey(itemId),
    body,
    observedAt
  }))
  if (!agentSessionPrefixWithinBounds(retained)) {
    return { ok: false, reason: 'history-limit' }
  }
  return {
    ok: true,
    retained,
    providerItemId: providerKey(input.itemId),
    throughId,
    beforeTurnId: key.provider === 'codex' ? key.turnId : '',
    ...(claude ? { claude } : {})
  }
}

/** End of the turn containing `selected`, or null while that turn is still live.
 *
 *  Settlement TOMBSTONES a turn's lifecycle row rather than rewriting it to `completed`, so a
 *  finished turn leaves no row behind and only the live turn still has one. Completion is
 *  therefore read as "not the active turn", off the same projection the chat view reads. */
function completedTurnEnd(
  items: readonly AgentJournalRenderItem[],
  selected: number,
  providerKey: (id: string) => string
): number | null {
  const nextPrompt = items.findIndex(
    (item, index) => index > selected && item.body.kind === 'message' && item.body.role === 'user'
  )
  const key = parseAgentJournalItemKey(providerKey(items[selected]!.itemId))
  return liveTurn(activeStructuredAgentSessionTurnId(items), key, nextPrompt === -1)
    ? null
    : nextPrompt === -1
      ? items.length
      : nextPrompt
}

/** Codex names the live turn in its own item keys; Claude does not, and a running turn is always
 *  the newest one, so a Claude row is live exactly when no later prompt bounds it. */
function liveTurn(
  activeTurnId: string | null,
  key: AgentJournalItemIdentity | null,
  isLastTurn: boolean
): boolean {
  if (activeTurnId === null) {
    return false
  }
  return key?.provider === 'codex' ? key.turnId === activeTurnId : isLastTurn
}

export function structuredForkEligibleItems(items: readonly AgentJournalRenderItem[]): Set<string> {
  const activeTurnId = activeStructuredAgentSessionTurnId(items)
  const lastPrompt = items.findLastIndex(
    (item) => item.body.kind === 'message' && item.body.role === 'user'
  )
  const eligible = new Set<string>()
  items.forEach((item, index) => {
    if (item.body.kind !== 'message' || item.body.role !== 'assistant') {
      return
    }
    // Parsing every key is wasted work on the idle journal a fork is actually taken from.
    if (
      activeTurnId === null ||
      !liveTurn(activeTurnId, parseAgentJournalItemKey(item.itemId), index > lastPrompt)
    ) {
      eligible.add(item.itemId)
    }
  })
  return eligible
}
