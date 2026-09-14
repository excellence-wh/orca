import { describe, expect, it, vi } from 'vitest'
import { SshFilesystemProvider } from './ssh-filesystem-provider'

function createMux() {
  return {
    request: vi.fn().mockResolvedValue(undefined),
    notify: vi.fn(),
    onNotification: vi.fn(() => () => {}),
    onNotificationByMethod: vi.fn(() => () => {}),
    onDispose: vi.fn(() => () => {}),
    dispose: vi.fn(),
    isDisposed: vi.fn().mockReturnValue(false)
  } as never
}

function createSftpStub() {
  const written: Buffer[] = []
  const writeStream = {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (event === 'close') {
        writeStream.closeHandler = handler
      }
      return writeStream
    }),
    off: vi.fn(() => writeStream),
    end: vi.fn((buffer: Buffer) => {
      written.push(buffer)
      writeStream.closeHandler?.()
    }),
    destroy: vi.fn(),
    closeHandler: undefined as ((...args: unknown[]) => void) | undefined
  }
  const sftp = { createWriteStream: vi.fn(() => writeStream), end: vi.fn() }
  return { sftp, written }
}

/**
 * `overwrite` is the opt-out of the create-only default, so it must reach the SFTP flags rather
 * than stopping at the provider boundary: a save of an existing workbook died on EEXIST.
 */
describe('SshFilesystemProvider writeFileBase64 overwrite', () => {
  it('opens the remote file for replacement when the caller asks to overwrite', async () => {
    const { sftp, written } = createSftpStub()
    const provider = new SshFilesystemProvider('conn-1', createMux(), async () => sftp as never)

    await provider.writeFileBase64('/home/user/book.xlsx', 'cG5n', { overwrite: true })

    expect(sftp.createWriteStream).toHaveBeenCalledWith('/home/user/book.xlsx', { flags: 'w' })
    expect(written).toEqual([Buffer.from('png')])
  })

  it('stays create-only without the overwrite flag', async () => {
    const { sftp } = createSftpStub()
    const provider = new SshFilesystemProvider('conn-1', createMux(), async () => sftp as never)

    await provider.writeFileBase64('/home/user/book.xlsx', 'cG5n')

    expect(sftp.createWriteStream).toHaveBeenCalledWith('/home/user/book.xlsx', { flags: 'wx' })
  })

  it('stays create-only without the overwrite flag on the raw transfer path', async () => {
    const writeBuffer = vi.fn().mockResolvedValue(undefined)
    const provider = new SshFilesystemProvider('conn-1', createMux(), undefined, { writeBuffer })

    await provider.writeFileBase64('/home/user/book.xlsx', 'cG5n', { overwrite: true })
    await provider.writeFileBase64('/home/user/book.xlsx', 'cG5n')

    expect(writeBuffer).toHaveBeenNthCalledWith(1, '/home/user/book.xlsx', Buffer.from('png'), {
      append: false,
      exclusive: false
    })
    expect(writeBuffer).toHaveBeenNthCalledWith(2, '/home/user/book.xlsx', Buffer.from('png'), {
      append: false,
      exclusive: true
    })
  })

  it('appends the later chunks of a staged upload', async () => {
    const { sftp } = createSftpStub()
    const provider = new SshFilesystemProvider('conn-1', createMux(), async () => sftp as never)

    await provider.writeFileBase64Chunk('/home/user/book.xlsx', 'cG5n', true)

    expect(sftp.createWriteStream).toHaveBeenCalledWith('/home/user/book.xlsx', { flags: 'a' })
  })
})
