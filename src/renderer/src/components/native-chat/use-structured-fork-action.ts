import { useMemo, useState } from 'react'
import { structuredForkEligibleItems } from '../../../../shared/agent-session-prefix'
import type { NativeChatStructuredViewProps } from './native-chat-view-types'
import type { useStructuredAgentSession } from './use-structured-agent-session'
import { forkStructuredSessionFromTurn } from './structured-agent-session-fork-command'
import { toRuntimeWorktreeSelector } from '@/runtime/runtime-worktree-selector'

const NO_ELIGIBLE_ITEMS: ReadonlySet<string> = new Set()

export function useStructuredForkAction(
  props: Omit<NativeChatStructuredViewProps, 'mode'>,
  controller: ReturnType<typeof useStructuredAgentSession>,
  worktreeId: string | undefined,
  onError: (message: string) => void
) {
  const [pending, setPending] = useState(false)
  const agent = props.agent === 'claude' ? 'claude' : props.agent === 'codex' ? 'codex' : undefined
  const enabled = Boolean(
    controller.forkSupported &&
    controller.forkSource &&
    worktreeId &&
    !controller.isWorking &&
    agent
  )
  // Hooks cannot be skipped, so the unavailable case is gated inside the memo instead: a live turn
  // emits a journal delta per frame and every one of them would rescan for a discarded result.
  const eligibleIds = useMemo(
    () =>
      enabled ? structuredForkEligibleItems(controller.journalItems ?? []) : NO_ELIGIBLE_ITEMS,
    [enabled, controller.journalItems]
  )
  if (!enabled || !controller.forkSource || !worktreeId || !agent) {
    return undefined
  }
  return {
    eligibleIds,
    pending,
    onFork: (itemId: string) => {
      if (!controller.forkSource) {
        return
      }
      setPending(true)
      void forkStructuredSessionFromTurn({
        target: props.target,
        worktree: toRuntimeWorktreeSelector(worktreeId),
        agent,
        source: { ...controller.forkSource, itemId }
      })
        .catch((error: unknown) => onError(error instanceof Error ? error.message : String(error)))
        .finally(() => setPending(false))
    }
  }
}
