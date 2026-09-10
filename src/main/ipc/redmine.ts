import { ipcMain } from 'electron'
import type { RedmineListFilter } from '../../shared/redmine-types'
import {
  connectRedmineSite,
  disconnectRedmineSite,
  getRedmineStatus,
  testRedmineConnection
} from '../redmine/client'
import { getRedmineIssue, listRedmineIssues } from '../redmine/issues'
import { readToken } from '../redmine/redmine-site-store'

export function registerRedmineHandlers(): void {
  ipcMain.handle('redmine:connect', async (_event, args: { siteUrl?: string; apiKey?: string }) => {
    const siteUrl = typeof args?.siteUrl === 'string' ? args.siteUrl.trim() : ''
    const apiKey = typeof args?.apiKey === 'string' ? args.apiKey.trim() : ''
    if (!siteUrl || !apiKey) {
      return {
        ok: false,
        error: { type: 'unknown', message: 'Server URL and API key are required.' }
      }
    }
    const result = await connectRedmineSite(siteUrl, apiKey)
    if (!result.ok) {
      return { ok: false, error: result.error }
    }
    return { ok: true, site: result.site, viewer: result.viewer }
  })

  ipcMain.handle('redmine:disconnect', async (_event, args?: { siteId?: string }) => {
    if (typeof args?.siteId === 'string') {
      disconnectRedmineSite(args.siteId)
    }
  })

  ipcMain.handle('redmine:status', async () => {
    return getRedmineStatus()
  })

  ipcMain.handle(
    'redmine:testConnection',
    async (_event, args: { siteUrl?: string; apiKey?: string }) => {
      const siteUrl = typeof args?.siteUrl === 'string' ? args.siteUrl.trim() : ''
      const apiKey = typeof args?.apiKey === 'string' ? args.apiKey.trim() : ''
      if (!siteUrl || !apiKey) {
        return {
          ok: false,
          error: { type: 'unknown', message: 'Server URL and API key are required.' }
        }
      }
      const result = await testRedmineConnection(siteUrl, apiKey)
      if (!result.user || result.error) {
        return {
          ok: false,
          error: result.error ?? { type: 'unknown', message: 'Unable to connect.' }
        }
      }
      return { ok: true, user: result.user }
    }
  )

  ipcMain.handle('redmine:listIssues', async (_event, args?: { filter?: RedmineListFilter }) => {
    const creds = activeCredentials()
    if (!creds) {
      return {
        items: [],
        totalCount: 0,
        error: { type: 'auth', message: 'No Redmine site connected.' }
      }
    }
    return listRedmineIssues(creds.siteUrl, creds.apiKey, args?.filter ?? {})
  })

  ipcMain.handle('redmine:getIssue', async (_event, args?: { issueId?: number }) => {
    const creds = activeCredentials()
    const issueId = typeof args?.issueId === 'number' ? args.issueId : Number.NaN
    if (!creds) {
      return null
    }
    if (!Number.isFinite(issueId)) {
      return null
    }
    return getRedmineIssue(creds.siteUrl, creds.apiKey, issueId)
  })
}

function activeCredentials(): { siteUrl: string; apiKey: string } | null {
  const status = getRedmineStatus()
  const site = status.activeSite
  if (!site) {
    return null
  }
  const apiKey = readToken(site.id)
  if (!apiKey) {
    return null
  }
  return { siteUrl: site.siteUrl, apiKey }
}
