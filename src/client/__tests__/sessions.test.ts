import { describe, expect, test } from 'bun:test'
import {
  sortSessions,
  getSessionOrderKey,
  getUniqueProjects,
  getUniqueHosts,
} from '../utils/sessions'
import type { Session } from '@shared/types'

// ── helpers ──────────────────────────────────────────────────────────────────

const makeSession = (overrides: Partial<Session> = {}): Session =>
  ({
    id: 'sess-1',
    agentSessionId: undefined,
    status: 'working',
    projectPath: '/home/user/project',
    host: 'localhost',
    createdAt: '2024-01-01T10:00:00Z',
    lastActivity: '2024-01-01T11:00:00Z',
    ...overrides,
  } as Session)

// ── getSessionOrderKey ────────────────────────────────────────────────────────

describe('getSessionOrderKey', () => {
  test('returns agentSessionId when present and non-empty', () => {
    const s = makeSession({ id: 'sess-1', agentSessionId: 'agent-abc' })
    expect(getSessionOrderKey(s)).toBe('agent-abc')
  })

  test('returns session id when agentSessionId is undefined', () => {
    const s = makeSession({ id: 'sess-2', agentSessionId: undefined })
    expect(getSessionOrderKey(s)).toBe('sess-2')
  })

  test('returns session id when agentSessionId is whitespace-only', () => {
    const s = makeSession({ id: 'sess-3', agentSessionId: '   ' })
    expect(getSessionOrderKey(s)).toBe('sess-3')
  })

  test('returns session id when agentSessionId is empty string', () => {
    const s = makeSession({ id: 'sess-4', agentSessionId: '' })
    expect(getSessionOrderKey(s)).toBe('sess-4')
  })
})

// ── sortSessions — created mode ───────────────────────────────────────────────

describe('sortSessions — created mode', () => {
  const older = makeSession({ id: 'a', createdAt: '2024-01-01T00:00:00Z' })
  const newer = makeSession({ id: 'b', createdAt: '2024-01-02T00:00:00Z' })

  test('desc: newer session comes first', () => {
    const result = sortSessions([older, newer], { mode: 'created', direction: 'desc' })
    expect(result[0].id).toBe('b')
  })

  test('asc: older session comes first', () => {
    const result = sortSessions([older, newer], { mode: 'created', direction: 'asc' })
    expect(result[0].id).toBe('a')
  })

  test('returns empty array when given no sessions', () => {
    expect(sortSessions([], { mode: 'created', direction: 'desc' })).toEqual([])
  })

  test('does not mutate the input array', () => {
    const input = [older, newer]
    sortSessions(input, { mode: 'created', direction: 'desc' })
    expect(input[0].id).toBe('a') // original order preserved
  })
})

// ── sortSessions — status mode ────────────────────────────────────────────────

describe('sortSessions — status mode', () => {
  const permissionSession = makeSession({
    id: 'perm',
    status: 'permission',
    lastActivity: '2024-01-01T12:00:00Z',
  })
  const workingSession = makeSession({
    id: 'work',
    status: 'working',
    lastActivity: '2024-01-01T11:00:00Z',
  })
  const waitingSession = makeSession({
    id: 'wait',
    status: 'waiting',
    lastActivity: '2024-01-01T10:00:00Z',
  })
  const unknownSession = makeSession({
    id: 'unkn',
    status: 'unknown',
    lastActivity: '2024-01-01T09:00:00Z',
  })

  test('permission < waiting < working < unknown', () => {
    const result = sortSessions(
      [unknownSession, workingSession, waitingSession, permissionSession],
      { mode: 'status', direction: 'asc' },
    )
    expect(result.map((s) => s.id)).toEqual(['perm', 'wait', 'work', 'unkn'])
  })

  test('sessions with same status are sorted by lastActivity desc', () => {
    const earlyWorking = makeSession({
      id: 'early',
      status: 'working',
      lastActivity: '2024-01-01T08:00:00Z',
    })
    const lateWorking = makeSession({
      id: 'late',
      status: 'working',
      lastActivity: '2024-01-01T20:00:00Z',
    })
    const result = sortSessions([earlyWorking, lateWorking], { mode: 'status', direction: 'asc' })
    expect(result[0].id).toBe('late')
  })
})

// ── sortSessions — manual mode ────────────────────────────────────────────────

describe('sortSessions — manual mode', () => {
  const a = makeSession({ id: 'a', agentSessionId: 'agent-a', createdAt: '2024-01-01T00:00:00Z' })
  const b = makeSession({ id: 'b', agentSessionId: 'agent-b', createdAt: '2024-01-02T00:00:00Z' })
  const c = makeSession({ id: 'c', agentSessionId: 'agent-c', createdAt: '2024-01-03T00:00:00Z' })

  test('follows manualOrder array', () => {
    const result = sortSessions([a, b, c], {
      mode: 'manual',
      direction: 'asc',
      manualOrder: ['agent-c', 'agent-a', 'agent-b'],
    })
    expect(result.map((s) => s.id)).toEqual(['c', 'a', 'b'])
  })

  test('sessions not in manualOrder go to the end, newest first', () => {
    // Only 'a' is in manualOrder; b and c are "new"
    const result = sortSessions([a, b, c], {
      mode: 'manual',
      direction: 'asc',
      manualOrder: ['agent-a'],
    })
    expect(result[0].id).toBe('a')
    // b and c should follow in createdAt desc order (c is newer)
    expect(result[1].id).toBe('c')
    expect(result[2].id).toBe('b')
  })

  test('falls back to the direction-aware created sort when manualOrder is empty', () => {
    // Empty manualOrder causes the manual branch to be skipped; the regular
    // created sort runs with the given direction.
    const result = sortSessions([a, b], {
      mode: 'manual',
      direction: 'asc',
      manualOrder: [],
    })
    // asc → older (a, Jan 1) comes before newer (b, Jan 2)
    expect(result[0].id).toBe('a')
    expect(result[1].id).toBe('b')
  })
})

// ── getUniqueProjects ─────────────────────────────────────────────────────────

describe('getUniqueProjects', () => {
  test('returns unique project paths sorted by most-recent activity', () => {
    const sessions = [
      makeSession({ projectPath: '/a', lastActivity: '2024-01-01T08:00:00Z' }),
      makeSession({ projectPath: '/b', lastActivity: '2024-01-01T10:00:00Z' }),
      makeSession({ projectPath: '/a', lastActivity: '2024-01-01T09:00:00Z' }),
    ]
    const result = getUniqueProjects(sessions, [])
    expect(result).toEqual(['/b', '/a'])
  })

  test('ignores sessions with empty or whitespace-only projectPath', () => {
    const sessions = [
      makeSession({ projectPath: '' }),
      makeSession({ projectPath: '   ' }),
      makeSession({ projectPath: '/valid' }),
    ]
    const result = getUniqueProjects(sessions, [])
    expect(result).toEqual(['/valid'])
  })

  test('returns empty array when all sessions have no projectPath', () => {
    const sessions = [makeSession({ projectPath: undefined as any })]
    expect(getUniqueProjects(sessions, [])).toEqual([])
  })

  test('merges active and inactive session paths', () => {
    const active = [makeSession({ projectPath: '/active', lastActivity: '2024-01-02T00:00:00Z' })]
    const inactive = [
      {
        projectPath: '/inactive',
        host: 'h',
        lastActivityAt: '2024-01-01T00:00:00Z',
      } as any,
    ]
    const result = getUniqueProjects(active, inactive)
    expect(result).toContain('/active')
    expect(result).toContain('/inactive')
    expect(result[0]).toBe('/active') // more recent first
  })
})

// ── getUniqueHosts ────────────────────────────────────────────────────────────

describe('getUniqueHosts', () => {
  test('returns unique hosts sorted by most-recent activity', () => {
    const sessions = [
      makeSession({ host: 'host-a', lastActivity: '2024-01-01T08:00:00Z' }),
      makeSession({ host: 'host-b', lastActivity: '2024-01-01T12:00:00Z' }),
    ]
    const result = getUniqueHosts(sessions, [])
    expect(result[0]).toBe('host-b')
  })

  test('ignores whitespace-only hosts', () => {
    const sessions = [makeSession({ host: '  ' }), makeSession({ host: 'real-host' })]
    const result = getUniqueHosts(sessions, [])
    expect(result).toEqual(['real-host'])
  })

  test('returns empty array when no sessions have a host', () => {
    expect(getUniqueHosts([], [])).toEqual([])
  })
})
