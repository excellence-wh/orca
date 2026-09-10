import { describe, expect, it, vi, beforeEach } from 'vitest'
import { buildRegistry, type RpcHandler } from '../core'
import { REDMINE_METHODS } from './redmine'
import {
  connectRedmineSite,
  disconnectRedmineSite,
  getRedmineStatus,
  testRedmineConnection
} from '../../../redmine/client'
import { getRedmineIssue, listRedmineIssues } from '../../../redmine/issues'
import { readToken } from '../../../redmine/redmine-site-store'

vi.mock('../../../redmine/client', () => ({
  connectRedmineSite: vi.fn(),
  disconnectRedmineSite: vi.fn(),
  getRedmineStatus: vi.fn(),
  testRedmineConnection: vi.fn()
}))

vi.mock('../../../redmine/issues', () => ({
  getRedmineIssue: vi.fn(),
  listRedmineIssues: vi.fn()
}))

vi.mock('../../../redmine/redmine-site-store', () => ({
  readToken: vi.fn()
}))

const connectRedmineSiteMock = vi.mocked(connectRedmineSite)
const disconnectRedmineSiteMock = vi.mocked(disconnectRedmineSite)
const getRedmineStatusMock = vi.mocked(getRedmineStatus)
const testRedmineConnectionMock = vi.mocked(testRedmineConnection)
const getRedmineIssueMock = vi.mocked(getRedmineIssue)
const listRedmineIssuesMock = vi.mocked(listRedmineIssues)
const readTokenMock = vi.mocked(readToken)

const registry = buildRegistry(REDMINE_METHODS)
const ctx = {} as Parameters<RpcHandler<unknown>>[1]

const site = {
  id: 'https://rm.example.com',
  siteUrl: 'https://rm.example.com',
  displayName: 'rm',
  hasToken: true
}

function connectedStatus() {
  return {
    connected: true,
    activeSite: site,
    selectedSiteId: site.id,
    viewer: null,
    error: null
  }
}
function disconnectedStatus() {
  return { connected: false, activeSite: null, selectedSiteId: null, viewer: null, error: null }
}

async function invoke(name: string, params?: unknown): Promise<unknown> {
  const method = registry.get(name)
  if (!method || 'stream' in method) {
    throw new Error(`method not found: ${name}`)
  }
  return method.handler(params, ctx)
}

beforeEach(() => {
  vi.clearAllMocks()
  getRedmineStatusMock.mockReturnValue(disconnectedStatus())
})

describe('REDMINE_METHODS registration', () => {
  it('exposes the six read/connect methods', () => {
    expect([...registry.keys()].sort()).toEqual([
      'redmine.connect',
      'redmine.disconnect',
      'redmine.getIssue',
      'redmine.listIssues',
      'redmine.status',
      'redmine.testConnection'
    ])
  })
})

describe('redmine.status', () => {
  it('returns the current site status', async () => {
    getRedmineStatusMock.mockReturnValue(connectedStatus())
    expect(await invoke('redmine.status')).toEqual(connectedStatus())
  })
})

describe('redmine.connect / testConnection', () => {
  it('trims and forwards connect params', async () => {
    connectRedmineSiteMock.mockResolvedValue({
      ok: true,
      site,
      viewer: { id: 1, name: 'A', login: 'a' }
    })
    const result = await invoke('redmine.connect', {
      siteUrl: '  https://rm.example.com  ',
      apiKey: '  secret  '
    })
    expect(connectRedmineSiteMock).toHaveBeenCalledWith('https://rm.example.com', 'secret')
    expect(result).toMatchObject({ ok: true })
  })

  it('wraps a successful testConnection into the ok shape', async () => {
    testRedmineConnectionMock.mockResolvedValue({
      user: { id: 1, name: 'Ada', login: 'ada' }
    })
    const result = await invoke('redmine.testConnection', {
      siteUrl: 'https://rm.example.com',
      apiKey: 'k'
    })
    expect(result).toEqual({ ok: true, user: { id: 1, name: 'Ada', login: 'ada' } })
  })

  it('wraps a failed testConnection into ok:false', async () => {
    testRedmineConnectionMock.mockResolvedValue({
      user: null,
      error: { type: 'auth', message: 'bad key' }
    })
    const result = await invoke('redmine.testConnection', {
      siteUrl: 'https://rm.example.com',
      apiKey: 'nope'
    })
    expect(result).toEqual({ ok: false, error: { type: 'auth', message: 'bad key' } })
  })
})

describe('redmine.disconnect', () => {
  it('forwards a valid site id', async () => {
    await invoke('redmine.disconnect', { siteId: 'site-a' })
    expect(disconnectRedmineSiteMock).toHaveBeenCalledWith('site-a')
  })

  it('ignores a missing site id', async () => {
    await invoke('redmine.disconnect', undefined)
    expect(disconnectRedmineSiteMock).not.toHaveBeenCalled()
  })
})

describe('redmine.listIssues', () => {
  it('returns an auth error when no site is connected', async () => {
    const result = await invoke('redmine.listIssues', { filter: { scope: 'assigned' } })
    expect(result).toEqual({
      items: [],
      totalCount: 0,
      error: { type: 'auth', message: 'No Redmine site connected.' }
    })
    expect(listRedmineIssuesMock).not.toHaveBeenCalled()
  })

  it('lists issues with the active site credentials', async () => {
    getRedmineStatusMock.mockReturnValue(connectedStatus())
    readTokenMock.mockReturnValue('secret')
    listRedmineIssuesMock.mockResolvedValue({ items: [], totalCount: 0 })
    await invoke('redmine.listIssues', { filter: { scope: 'assigned' } })
    expect(listRedmineIssuesMock).toHaveBeenCalledWith('https://rm.example.com', 'secret', {
      scope: 'assigned'
    })
  })
})

describe('redmine.getIssue', () => {
  it('returns null when no site is connected', async () => {
    expect(await invoke('redmine.getIssue', { issueId: 1 })).toBeNull()
  })

  it('fetches the issue through the active site', async () => {
    getRedmineStatusMock.mockReturnValue(connectedStatus())
    readTokenMock.mockReturnValue('secret')
    getRedmineIssueMock.mockResolvedValue({ id: 1 } as never)
    const result = await invoke('redmine.getIssue', { issueId: 1 })
    expect(getRedmineIssueMock).toHaveBeenCalledWith('https://rm.example.com', 'secret', 1)
    expect(result).toMatchObject({ id: 1 })
  })
})
