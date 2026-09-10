import { describe, expect, it } from 'vitest'
import { classifyRedmineError, normalizeRedmineUrl, RedmineApiError } from './redmine-request'

describe('normalizeRedmineUrl https enforcement', () => {
  it('allows https hosts and trims a trailing slash', () => {
    expect(normalizeRedmineUrl('https://redmine.example.com/')).toBe('https://redmine.example.com')
  })

  it('allows http on loopback hosts', () => {
    expect(normalizeRedmineUrl('http://127.0.0.1:9080')).toBe('http://127.0.0.1:9080')
    expect(normalizeRedmineUrl('http://localhost:3000/')).toBe('http://localhost:3000')
    expect(normalizeRedmineUrl('http://[::1]:8080')).toBe('http://[::1]:8080')
  })

  it('rejects http on a non-loopback host (API key travels cleartext)', () => {
    expect(() => normalizeRedmineUrl('http://redmine.example.com')).toThrow(RedmineApiError)
  })

  it('classifies the rejection as an unknown read error', () => {
    try {
      normalizeRedmineUrl('http://redmine.example.com')
    } catch (error) {
      const classified = classifyRedmineError(error)
      expect(classified.type).toBe('unknown')
      expect(classified.message).toMatch(/HTTPS/)
    }
  })
})

describe('classifyRedmineError', () => {
  it('classifies 401/403 as auth', () => {
    expect(classifyRedmineError(new RedmineApiError('denied', 401)).type).toBe('auth')
  })

  it('classifies 404 as not_found', () => {
    expect(classifyRedmineError(new RedmineApiError('missing', 404)).type).toBe('not_found')
  })

  it('classifies aborts as network', () => {
    expect(classifyRedmineError(new DOMException('aborted', 'AbortError')).type).toBe('network')
  })
})
