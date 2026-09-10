import { describe, expect, it, vi, beforeEach } from 'vitest'
import { registerRedmineHandlers } from './redmine'
import {
  connectRedmineSite,
  disconnectRedmineSite,
  getRedmineStatus,
  testRedmineConnection
} from '../redmine/client'
import { getRedmineIssue, listRedmineIssues } from '../redmine/issues'
import { readToken } from '../redmine/redmine-site-store'

const { handlers } = vi.hoisted(() => ({
  handlers: {} as Record<string, (event: unknown, args?: unknown) => Promise<unknown>>
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, args?: unknown) => Promise<unknown>) => {
      handlers[channel] = fn
    }
  }
}))

vi.mock('../redmine/client', () => ({
  connectRedmineSite: vi.fn(),
  disconnectRedmineSite: vi.fn(),
  getRedmineStatus: vi.fn(),
  testRedmineConnection: vi.fn()
}))

vi.mock('../redmine/issues', () => ({
  getRedmineIssue: vi.fn(),
  listRedmineIssues: vi.fn()
}))

vi.mock('../redmine/redmine-site-store', () => ({
  readToken: vi.fn()
}))

const connectRedmineSiteMock = vi.mocked(connectRedmineSite)
const disconnectRedmineSiteMock = vi.mocked(disconnectRedmineSite)
const getRedmineStatusMock = vi.mocked(getRedmineStatus)
const testRedmineConnectionMock = vi.mocked(testRedmineConnection)
const getRedmineIssueMock = vi.mocked(getRedmineIssue)
const listRedmineIssuesMock = vi.mocked(listRedmineIssues)
const readTokenMock = vi.mocked(readToken)

const invoke = (channel: string, args?: unknown) => handlers[channel](null, args)

const site = {
  id: 'https://rm.example.com',
  siteUrl: 'https://rm.example.com',
  displayName: 'rm',
  hasToken: true
}

function connectedStatus() {
  return { connected: true, activeSite: site, selectedSiteId: site.id, viewer: null, error: null }
}
function disconnectedStatus() {
  return { connected: false, activeSite: null, selectedSiteId: null, viewer: null, error: null }
}

beforeEach(() => {
  vi.clearAllMocks()
  getRedmineStatusMock.mockReturnValue(disconnectedStatus())
  registerRedmineHandlers()
})

describe('redmine:connect', () => {
  it('rejects when required fields are missing', async () => {
    expect(await invoke('redmine:connect', {})).toEqual({
      ok: false,
      error: { type: 'unknown', message: 'Server URL and API key are required.' }
    })
    expect(connectRedmineSiteMock).not.toHaveBeenCalled()
  })

  it('trims and forwards the connection when fields are present', async () => {
    connectRedmineSiteMock.mockResolvedValue({
      ok: true,
      site,
      viewer: { id: 1, name: 'Ada', login: 'ada' }
    })
    const result = await invoke('redmine:connect', {
      siteUrl: '  https://rm.example.com  ',
      apiKey: '  secret  '
    })
    expect(connectRedmineSiteMock).toHaveBeenCalledWith('https://rm.example.com', 'secret')
    expect(result).toEqual({
      ok: true,
      site,
      viewer: { id: 1, name: 'Ada', login: 'ada' }
    })
  })

  it('maps a failed connection to ok:false', async () => {
    connectRedmineSiteMock.mockResolvedValue({
      ok: false,
      error: { type: 'auth', message: 'bad' }
    })
    const result = await invoke('redmine:connect', {
      siteUrl: 'https://rm.example.com',
      apiKey: 'nope'
    })
    expect(result).toEqual({ ok: false, error: { type: 'auth', message: 'bad' } })
  })
})

describe('redmine:status', () => {
  it('forwards the current status', async () => {
    getRedmineStatusMock.mockReturnValue(connectedStatus())
    expect(await invoke('redmine:status')).toEqual(connectedStatus())
  })
})

describe('redmine:listIssues', () => {
  it('returns an auth error when no site is connected', async () => {
    const result = await invoke('redmine:listIssues', { filter: { scope: 'assigned' } })
    expect(result).toEqual({
      items: [],
      totalCount: 0,
      error: { type: 'auth', message: 'No Redmine site connected.' }
    })
    expect(listRedmineIssuesMock).not.toHaveBeenCalled()
  })

  it('lists issues using the active site token', async () => {
    getRedmineStatusMock.mockReturnValue(connectedStatus())
    readTokenMock.mockReturnValue('secret')
    listRedmineIssuesMock.mockResolvedValue({ items: [], totalCount: 0 })
    await invoke('redmine:listIssues', { filter: { scope: 'assigned' } })
    expect(listRedmineIssuesMock).toHaveBeenCalledWith('https://rm.example.com', 'secret', {
      scope: 'assigned'
    })
  })
})

describe('redmine:getIssue', () => {
  it('returns null when no site is connected', async () => {
    expect(await invoke('redmine:getIssue', { issueId: 1 })).toBeNull()
  })

  it('returns null for a non-finite issue id', async () => {
    getRedmineStatusMock.mockReturnValue(connectedStatus())
    readTokenMock.mockReturnValue('secret')
    expect(await invoke('redmine:getIssue', {})).toBeNull()
    expect(getRedmineIssueMock).not.toHaveBeenCalled()
  })

  it('fetches the issue through the active site', async () => {
    getRedmineStatusMock.mockReturnValue(connectedStatus())
    readTokenMock.mockReturnValue('secret')
    const issue = { id: 1 } as never
    getRedmineIssueMock.mockResolvedValue(issue)
    await invoke('redmine:getIssue', { issueId: 1 })
    expect(getRedmineIssueMock).toHaveBeenCalledWith('https://rm.example.com', 'secret', 1)
  })
})

describe('redmine:disconnect', () => {
  it('forwards a valid site id', async () => {
    await invoke('redmine:disconnect', { siteId: 'site-a' })
    expect(disconnectRedmineSiteMock).toHaveBeenCalledWith('site-a')
  })

  it('ignores a missing site id', async () => {
    await invoke('redmine:disconnect', undefined)
    expect(disconnectRedmineSiteMock).not.toHaveBeenCalled()
  })
})

describe('redmine:testConnection', () => {
  it('returns ok:true with the user on success', async () => {
    testRedmineConnectionMock.mockResolvedValue({ user: { id: 1, name: 'Ada', login: 'ada' } })
    const result = await invoke('redmine:testConnection', {
      siteUrl: 'https://rm.example.com',
      apiKey: 'k'
    })
    expect(result).toEqual({ ok: true, user: { id: 1, name: 'Ada', login: 'ada' } })
  })
})
