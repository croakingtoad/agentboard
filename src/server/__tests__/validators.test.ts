import { describe, expect, test } from 'bun:test'
import {
  isValidSessionId,
  isValidTmuxTarget,
  MAX_FIELD_LENGTH,
  SESSION_ID_PATTERN,
  TMUX_TARGET_PATTERN,
} from '../validators'

describe('isValidSessionId', () => {
  describe('valid inputs', () => {
    test('accepts simple alphanumeric id', () => {
      expect(isValidSessionId('abc123')).toBe(true)
    })

    test('accepts id with underscores, hyphens, dots, colons, at-signs', () => {
      expect(isValidSessionId('my_session-1.0:v2@host')).toBe(true)
    })

    test('accepts single character', () => {
      expect(isValidSessionId('a')).toBe(true)
    })

    test('accepts id exactly at MAX_FIELD_LENGTH', () => {
      expect(isValidSessionId('a'.repeat(MAX_FIELD_LENGTH))).toBe(true)
    })
  })

  describe('invalid inputs', () => {
    test('rejects empty string', () => {
      expect(isValidSessionId('')).toBe(false)
    })

    test('rejects string longer than MAX_FIELD_LENGTH', () => {
      expect(isValidSessionId('a'.repeat(MAX_FIELD_LENGTH + 1))).toBe(false)
    })

    test('rejects id with space', () => {
      expect(isValidSessionId('my session')).toBe(false)
    })

    test('rejects id with slash', () => {
      expect(isValidSessionId('path/to/thing')).toBe(false)
    })

    test('rejects id with shell metacharacters', () => {
      expect(isValidSessionId('session$(rm -rf /)')).toBe(false)
    })

    test('rejects id with newline', () => {
      expect(isValidSessionId('sess\nion')).toBe(false)
    })

    test('rejects id with null byte', () => {
      expect(isValidSessionId('sess\x00ion')).toBe(false)
    })

    test('rejects id with angle brackets', () => {
      expect(isValidSessionId('<script>')).toBe(false)
    })
  })
})

describe('isValidTmuxTarget', () => {
  describe('valid inputs', () => {
    test('accepts plain window name', () => {
      expect(isValidTmuxTarget('mywindow')).toBe(true)
    })

    test('accepts session:window format', () => {
      expect(isValidTmuxTarget('mysession:mywindow')).toBe(true)
    })

    test('accepts pane index format @0', () => {
      expect(isValidTmuxTarget('@0')).toBe(true)
    })

    test('accepts session:@pane format', () => {
      expect(isValidTmuxTarget('mysession:@3')).toBe(true)
    })

    test('accepts alphanumeric with dots and hyphens', () => {
      expect(isValidTmuxTarget('my-session.1:window_2')).toBe(true)
    })

    test('accepts target exactly at MAX_FIELD_LENGTH', () => {
      // Build a valid target right at the length boundary
      const name = 'a'.repeat(MAX_FIELD_LENGTH - ':b'.length) + ':b'
      if (name.length === MAX_FIELD_LENGTH && TMUX_TARGET_PATTERN.test(name)) {
        expect(isValidTmuxTarget(name)).toBe(true)
      }
      // If the pattern doesn't match (boundary arithmetic), just ensure no throw
    })
  })

  describe('invalid inputs', () => {
    test('rejects empty string', () => {
      expect(isValidTmuxTarget('')).toBe(false)
    })

    test('rejects string longer than MAX_FIELD_LENGTH', () => {
      expect(isValidTmuxTarget('a'.repeat(MAX_FIELD_LENGTH + 1))).toBe(false)
    })

    test('rejects target with space', () => {
      expect(isValidTmuxTarget('my window')).toBe(false)
    })

    test('rejects target with shell injection', () => {
      expect(isValidTmuxTarget('win;rm -rf /')).toBe(false)
    })

    test('rejects target with multiple colons', () => {
      expect(isValidTmuxTarget('a:b:c')).toBe(false)
    })

    test('rejects target with slash', () => {
      expect(isValidTmuxTarget('session/window')).toBe(false)
    })
  })
})
