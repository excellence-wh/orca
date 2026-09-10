import type {
  RedmineConnectionStatus,
  RedmineSite,
  RedmineUser
} from '../../shared/redmine-types'
import {
  classifyRedmineError,
  normalizeRedmineUrl,
  redmineRequest
} from './redmine-request'
import {
  credentialErrors,
  deleteToken,
  getSiteFile,
  hasStoredToken,
  readToken,
  saveToken,
  writeSiteFile
} from './redmine-site-store'

const TEST_REQUEST_TIMEOUT_MS = 8000

// The site id is the normalized server URL; it is stable across sessions and
// used to derive the encrypted token filename.
export function redmineSiteIdForUrl(siteUrl: string): string {
  return normalizeRedmineUrl(siteUrl)
}

export function redmineSiteForId(siteId: string): RedmineSite | null {
  const file = getSiteFile()
  return file.sites.find((site) => site.id === siteId) ?? null
}

// The connection classifier yields RedmineReadError (which can carry
// 'not_found'); connection status only exposes lifecycle errors, so fold
// not_found into 'unknown'.
function toConnectionError(error: unknown): RedmineConnectionStatus['error'] {
  const read = classifyRedmineError(error)
  return {
    type: read.type === 'not_found' ? 'unknown' : read.type,
    message: read.message
  }
}

export async function testRedmineConnection(
  siteUrl: string,
  apiKey: string
): Promise<{ user: RedmineUser | null; error?: RedmineConnectionStatus['error'] }> {
  try {
    const data = await redmineRequest<{ user?: { id?: number; firstname?: string; lastname?: string; login?: string } }>(
      siteUrl,
      apiKey,
      '/users/current.json',
      { signal: AbortSignal.timeout(TEST_REQUEST_TIMEOUT_MS) }
    )
    const user = data?.user
    if (user && typeof user.id === 'number') {
      const name = [user.firstname, user.lastname].filter(Boolean).join(' ') || `User ${user.id}`
      return { user: { id: user.id, name, login: user.login ?? null } }
    }
    return { user: null, error: { type: 'unknown', message: 'Redmine returned an unexpected user payload.' } }
  } catch (error) {
    return { user: null, error: toConnectionError(error) }
  }
}

export async function connectRedmineSite(
  siteUrl: string,
  apiKey: string
): Promise<{ ok: boolean; site?: RedmineSite; viewer?: RedmineUser; error?: RedmineConnectionStatus['error'] }> {
  const connection = await testRedmineConnection(siteUrl, apiKey)
  if (connection.error || !connection.user) {
    return { ok: false, error: connection.error ?? { type: 'unknown', message: 'Unable to connect.' } }
  }

  const id = redmineSiteIdForUrl(siteUrl)
  saveToken(id, apiKey)
  const file = getSiteFile()
  const site: RedmineSite = {
    id,
    siteUrl: normalizeRedmineUrl(siteUrl),
    displayName: new URL(normalizeRedmineUrl(siteUrl)).hostname,
    hasToken: true
  }
  const sites = file.sites.filter((existing) => existing.id !== id)
  sites.unshift(site)
  writeSiteFile({ ...file, activeSiteId: id, selectedSiteId: id, sites })
  return { ok: true, site, viewer: connection.user }
}

export function disconnectRedmineSite(siteId: string): void {
  deleteToken(siteId)
  const file = getSiteFile()
  const remaining = file.sites.filter((site) => site.id !== siteId)
  const nextActive = remaining[0]?.id ?? null
  writeSiteFile({
    ...file,
    sites: remaining,
    activeSiteId: nextActive,
    selectedSiteId: nextActive
  })
}

export function getRedmineStatus(): RedmineConnectionStatus {
  const file = getSiteFile()
  const sites = file.sites.filter((site) => hasStoredToken(site.id))
  const activeSite = sites.find((site) => site.id === file.activeSiteId) ?? sites[0] ?? null
  const connected = Boolean(activeSite)

  let error: RedmineConnectionStatus['error'] | null = null
  if (activeSite) {
    const credentialError = credentialErrors.get(activeSite.id)
    if (credentialError) {
      error = { type: 'decryption', message: credentialError }
    }
  } else {
    const firstError = credentialErrors.values().next().value as string | undefined
    if (firstError) {
      error = { type: 'decryption', message: firstError }
    }
  }

  return {
    connected,
    activeSite,
    selectedSiteId: file.selectedSiteId,
    viewer: null,
    error
  }
}

export function _readRedmineTokenForTest(siteId: string): string | null {
  return readToken(siteId)
}
