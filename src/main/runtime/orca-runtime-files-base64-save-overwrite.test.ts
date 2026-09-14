import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveAuthorizedPathMock } from './orca-runtime-files-mock-registry'
import {
  createRuntimeFileCommands,
  useRuntimeFileCommandsLifecycle
} from './orca-runtime-files-test-harness'
import { getSshFilesystemProvider } from '../providers/ssh-filesystem-dispatch'

vi.mock('fs', async () => (await import('./orca-runtime-files-mock-registry')).fsModuleMock())
vi.mock('fs/promises', async () =>
  (await import('./orca-runtime-files-mock-registry')).fsPromisesModuleMock()
)
vi.mock(
  './file-watcher-host',
  async () => (await import('./orca-runtime-files-mock-registry')).fileWatcherHostMock
)
vi.mock('../ipc/filesystem-auth', async () =>
  (await import('./orca-runtime-files-mock-registry')).filesystemAuthModuleMock()
)
vi.mock('../git/runner', async () =>
  (await import('./orca-runtime-files-mock-registry')).gitRunnerModuleMock()
)
vi.mock(
  '../ipc/rg-availability',
  async () => (await import('./orca-runtime-files-mock-registry')).rgAvailabilityMock
)
vi.mock(
  '../ipc/local-worktree-runtime-options',
  async () => (await import('./orca-runtime-files-mock-registry')).localWorktreeRuntimeOptionsMock
)
vi.mock(
  '../ipc/filesystem-search-git',
  async () => (await import('./orca-runtime-files-mock-registry')).filesystemSearchGitMock
)
vi.mock(
  '../providers/ssh-filesystem-dispatch',
  async () => (await import('./orca-runtime-files-mock-registry')).sshFilesystemDispatchMock
)

function base64(text: string): string {
  return Buffer.from(text, 'utf-8').toString('base64')
}

/** Base64 writes touch the real filesystem so an overwrite is observable, not just asserted. */
describe('RuntimeFileCommands base64 writes', () => {
  useRuntimeFileCommandsLifecycle()

  const tempDirs: string[] = []

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
    tempDirs.length = 0
  })

  async function createRealWorktree(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'orca-runtime-base64-'))
    tempDirs.push(dir)
    resolveAuthorizedPathMock.mockImplementation(async (p: string) => p)
    return dir
  }

  it('overwrites a workbook that the editor is saving over', async () => {
    const dir = await createRealWorktree()
    const { commands } = createRuntimeFileCommands({ path: dir })

    await commands.writeFileExplorerFileBase64(
      'id:wt-1',
      'book.xlsx',
      base64('first save'),
      undefined,
      undefined,
      'local'
    )
    await commands.writeFileExplorerFileBase64(
      'id:wt-1',
      'book.xlsx',
      base64('second save'),
      undefined,
      undefined,
      'local'
    )

    await expect(readFile(join(dir, 'book.xlsx'), 'utf-8')).resolves.toBe('second save')
  })

  it('replaces the staged file on a first chunk and appends later chunks', async () => {
    const dir = await createRealWorktree()
    const { commands } = createRuntimeFileCommands({ path: dir })

    await commands.writeFileExplorerFileBase64Chunk(
      'id:wt-1',
      '.book.xlsx.orca-upload-stale',
      base64('abandoned upload'),
      false,
      undefined,
      undefined,
      'local'
    )
    await commands.writeFileExplorerFileBase64Chunk(
      'id:wt-1',
      '.book.xlsx.orca-upload-stale',
      base64('first half'),
      false,
      undefined,
      undefined,
      'local'
    )
    await commands.writeFileExplorerFileBase64Chunk(
      'id:wt-1',
      '.book.xlsx.orca-upload-stale',
      base64('+ second half'),
      true,
      undefined,
      undefined,
      'local'
    )

    await expect(readFile(join(dir, '.book.xlsx.orca-upload-stale'), 'utf-8')).resolves.toBe(
      'first half+ second half'
    )
  })

  it('asks the SSH provider to overwrite the workbook it routes a save to', async () => {
    const writeFileBase64 = vi.fn().mockResolvedValue(undefined)
    vi.mocked(getSshFilesystemProvider).mockReturnValue({ writeFileBase64 } as never)
    const { commands, store } = createRuntimeFileCommands()
    store.getRepo.mockReturnValue({ connectionId: 'ssh-1' })

    await commands.writeFileExplorerFileBase64(
      'id:wt-1',
      'book.xlsx',
      base64('save'),
      0,
      'ssh-1',
      'ssh:ssh-1'
    )

    expect(writeFileBase64).toHaveBeenCalledWith('/repo/book.xlsx', base64('save'), {
      overwrite: true
    })
  })
})
