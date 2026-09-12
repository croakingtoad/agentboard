import { describe, expect, test, beforeEach } from 'bun:test'
import { SessionRegistry } from '../SessionRegistry'
import type { AgentSession, Session } from '../../shared/types'

const baseSession: Session = {
  id: 'session-1',
  name: 'alpha',
  tmuxWindow: 'agentboard:1',
  projectPath: '/home/example/project',
  status: 'waiting',
  lastActivity: new Date('2024-01-01T00:00:00.000Z').toISOString(),
  createdAt: new Date('2024-01-01T00:00:00.000Z').toISOString(),
  source: 'managed',
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return { ...baseSession, ...overrides }
}

function makeAgentSession(overrides: Partial<AgentSession> = {}): AgentSession {
  return {
    id: 'agent-1',
    name: 'agent-alpha',
    projectPath: '/home/example/project',
    status: 'active',
    ...overrides,
  } as AgentSession
}

describe('SessionRegistry.getAll', () => {
  test('returns empty array on fresh registry', () => {
    const registry = new SessionRegistry()
    expect(registry.getAll()).toEqual([])
  })

  test('returns all sessions after replaceSessions', () => {
    const registry = new SessionRegistry()
    const s1 = makeSession({ id: 'a' })
    const s2 = makeSession({ id: 'b' })
    registry.replaceSessions([s1, s2])
    const all = registry.getAll()
    expect(all).toHaveLength(2)
    expect(all.map((s) => s.id).sort()).toEqual(['a', 'b'])
  })
})

describe('SessionRegistry.get', () => {
  test('returns undefined for missing session', () => {
    const registry = new SessionRegistry()
    expect(registry.get('does-not-exist')).toBeUndefined()
  })

  test('returns the session when it exists', () => {
    const registry = new SessionRegistry()
    const s = makeSession({ id: 'found', name: 'my-session' })
    registry.replaceSessions([s])
    const result = registry.get('found')
    expect(result?.id).toBe('found')
    expect(result?.name).toBe('my-session')
  })
})

describe('SessionRegistry.setAgentSessions / getAgentSessions', () => {
  test('getAgentSessions returns empty lists by default', () => {
    const registry = new SessionRegistry()
    const { active, inactive } = registry.getAgentSessions()
    expect(active).toEqual([])
    expect(inactive).toEqual([])
  })

  test('setAgentSessions stores and retrieves active and inactive lists', () => {
    const registry = new SessionRegistry()
    const active = [makeAgentSession({ id: 'a1', status: 'active' })]
    const inactive = [makeAgentSession({ id: 'i1', status: 'inactive' })]

    registry.setAgentSessions(active, inactive)

    const stored = registry.getAgentSessions()
    expect(stored.active).toHaveLength(1)
    expect(stored.active[0]?.id).toBe('a1')
    expect(stored.inactive).toHaveLength(1)
    expect(stored.inactive[0]?.id).toBe('i1')
  })

  test('emits agent-sessions event when data changes', () => {
    const registry = new SessionRegistry()
    const events: Array<{ active: AgentSession[]; inactive: AgentSession[] }> = []
    registry.on('agent-sessions', (payload) => events.push(payload))

    const active = [makeAgentSession({ id: 'a1' })]
    registry.setAgentSessions(active, [])

    expect(events).toHaveLength(1)
    expect(events[0]?.active).toHaveLength(1)
  })

  test('skips emit when data is identical (snapshot dedup)', () => {
    const registry = new SessionRegistry()
    const events: unknown[] = []
    registry.on('agent-sessions', () => events.push(true))

    const active = [makeAgentSession({ id: 'a1' })]
    registry.setAgentSessions(active, [])
    registry.setAgentSessions(active, []) // identical call

    expect(events).toHaveLength(1)
  })

  test('emits again when data differs from previous snapshot', () => {
    const registry = new SessionRegistry()
    const events: unknown[] = []
    registry.on('agent-sessions', () => events.push(true))

    registry.setAgentSessions([makeAgentSession({ id: 'a1' })], [])
    registry.setAgentSessions([makeAgentSession({ id: 'a2' })], [])

    expect(events).toHaveLength(2)
  })

  test('setAgentSessions replacing active with inactive triggers event', () => {
    const registry = new SessionRegistry()
    const events: Array<{ active: AgentSession[]; inactive: AgentSession[] }> = []
    registry.on('agent-sessions', (payload) => events.push(payload))

    const session = makeAgentSession({ id: 'x1' })
    registry.setAgentSessions([session], [])
    registry.setAgentSessions([], [session])

    expect(events).toHaveLength(2)
    expect(events[1]?.active).toHaveLength(0)
    expect(events[1]?.inactive).toHaveLength(1)
  })
})

describe('SessionRegistry.replaceSessions — createdAt preservation', () => {
  test('preserves createdAt from the first time a session is seen', () => {
    const registry = new SessionRegistry()
    const original = makeSession({ id: 'x', createdAt: '2024-01-01T00:00:00.000Z' })
    registry.replaceSessions([original])

    const updated = makeSession({ id: 'x', createdAt: '2024-06-01T00:00:00.000Z' })
    registry.replaceSessions([updated])

    // createdAt should stay as the FIRST observed value
    expect(registry.get('x')?.createdAt).toBe('2024-01-01T00:00:00.000Z')
  })

  test('uses incoming createdAt when session is brand-new', () => {
    const registry = new SessionRegistry()
    const s = makeSession({ id: 'new', createdAt: '2025-03-15T12:00:00.000Z' })
    registry.replaceSessions([s])
    expect(registry.get('new')?.createdAt).toBe('2025-03-15T12:00:00.000Z')
  })
})

describe('SessionRegistry.replaceSessions — NaN / invalid timestamps', () => {
  test('falls back to incoming activity when existing timestamp is invalid', () => {
    const registry = new SessionRegistry()
    const s = makeSession({ id: 'a', lastActivity: 'not-a-date' })
    registry.replaceSessions([s])

    const newer = makeSession({ id: 'a', lastActivity: '2025-01-01T00:00:00.000Z' })
    registry.replaceSessions([newer])

    // 'not-a-date' is NaN, so the valid incoming timestamp wins
    expect(registry.get('a')?.lastActivity).toBe('2025-01-01T00:00:00.000Z')
  })

  test('keeps existing activity when incoming timestamp is invalid', () => {
    const registry = new SessionRegistry()
    const s = makeSession({ id: 'a', lastActivity: '2025-01-01T00:00:00.000Z' })
    registry.replaceSessions([s])

    const badUpdate = makeSession({ id: 'a', lastActivity: 'not-a-date' })
    registry.replaceSessions([badUpdate])

    expect(registry.get('a')?.lastActivity).toBe('2025-01-01T00:00:00.000Z')
  })

  test('uses incoming when both existing and incoming are NaN', () => {
    const registry = new SessionRegistry()
    registry.replaceSessions([makeSession({ id: 'a', lastActivity: 'bad' })])
    registry.replaceSessions([makeSession({ id: 'a', lastActivity: 'also-bad' })])
    expect(registry.get('a')?.lastActivity).toBe('also-bad')
  })
})

describe('SessionRegistry — emit behaviour edge cases', () => {
  test('emits session-removed for each removed session individually', () => {
    const registry = new SessionRegistry()
    const removed: string[] = []
    registry.on('session-removed', (id) => removed.push(id))

    registry.replaceSessions([
      makeSession({ id: 'a' }),
      makeSession({ id: 'b' }),
      makeSession({ id: 'c' }),
    ])
    registry.replaceSessions([makeSession({ id: 'a' })])

    expect(removed.sort()).toEqual(['b', 'c'])
  })

  test('no session-removed events when all sessions are kept', () => {
    const registry = new SessionRegistry()
    const removed: string[] = []
    registry.on('session-removed', (id) => removed.push(id))

    registry.replaceSessions([makeSession({ id: 'a' })])
    registry.replaceSessions([makeSession({ id: 'a' })])

    expect(removed).toHaveLength(0)
  })
})
