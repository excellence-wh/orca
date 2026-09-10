// @vitest-environment happy-dom

import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const { eligible } = vi.hoisted(() => ({ eligible: vi.fn(() => new Set<string>(['assistant-1'])) }))
vi.mock('../../../../shared/agent-session-prefix', () => ({
  structuredForkEligibleItems: eligible
}))
vi.mock('./structured-agent-session-fork-command', () => ({
  forkStructuredSessionFromTurn: vi.fn()
}))

import { useStructuredForkAction } from './use-structured-fork-action'

type Props = Parameters<typeof useStructuredForkAction>[0]
type Controller = Parameters<typeof useStructuredForkAction>[1]

const props = { agent: 'codex', target: { kind: 'local' } } as unknown as Props

function controller(isWorking: boolean): Controller {
  return {
    forkSupported: true,
    forkSource: { sessionId: 'parent', expectedEpoch: 'epoch', expectedRuntimeFence: 1 },
    isWorking,
    journalItems: [{ itemId: 'assistant-1' }]
  } as unknown as Controller
}

describe('fork action eligibility work', () => {
  it('does no eligibility scan while a turn is live', () => {
    eligible.mockClear()
    // The action is unavailable mid-turn, but a live turn emits a journal delta per frame and the
    // memo runs before the early return — so an ungated memo rescans the transcript for nothing.
    const { result, rerender } = renderHook(() =>
      useStructuredForkAction(props, controller(true), 'worktree', () => {})
    )
    for (let index = 0; index < 5; index += 1) {
      rerender()
    }
    expect(result.current).toBeUndefined()
    expect(eligible).not.toHaveBeenCalled()
  })

  it('scans once the turn settles and the action becomes available', () => {
    eligible.mockClear()
    const { result } = renderHook(() =>
      useStructuredForkAction(props, controller(false), 'worktree', () => {})
    )
    expect(eligible).toHaveBeenCalled()
    expect(result.current?.eligibleIds.has('assistant-1')).toBe(true)
  })
})
