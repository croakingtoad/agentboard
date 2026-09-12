import { describe, expect, test } from 'bun:test'
import { shellQuote } from '../shellQuote'

describe('shellQuote', () => {
  describe('safe strings — pass through unquoted', () => {
    test('simple alphanumeric', () => {
      expect(shellQuote('hello')).toBe('hello')
    })

    test('alphanumeric with dots, hyphens, slashes, colons, at, plus, equals', () => {
      expect(shellQuote('path/to/file.txt')).toBe('path/to/file.txt')
      expect(shellQuote('user@host:port')).toBe('user@host:port')
      expect(shellQuote('key=value+extra')).toBe('key=value+extra')
    })

    test('uppercase letters pass unquoted', () => {
      expect(shellQuote('MyTool')).toBe('MyTool')
    })

    test('digits-only string passes unquoted', () => {
      expect(shellQuote('12345')).toBe('12345')
    })

    test('underscore passes unquoted', () => {
      expect(shellQuote('my_variable')).toBe('my_variable')
    })
  })

  describe('unsafe strings — single-quoted with escaping', () => {
    test('string with space is single-quoted', () => {
      expect(shellQuote('hello world')).toBe("'hello world'")
    })

    test('string with semicolon is single-quoted', () => {
      expect(shellQuote('a;b')).toBe("'a;b'")
    })

    test('string with dollar sign is single-quoted', () => {
      expect(shellQuote('$HOME')).toBe("'$HOME'")
    })

    test('string with backtick is single-quoted', () => {
      expect(shellQuote('`cmd`')).toBe("'`cmd`'")
    })

    test('string with double quote is single-quoted', () => {
      expect(shellQuote('"value"')).toBe("'\"value\"'")
    })

    test('string with newline is single-quoted', () => {
      expect(shellQuote('line1\nline2')).toBe("'line1\nline2'")
    })

    test('empty string is single-quoted', () => {
      // empty string is not safe (regex /^[safe chars]+$/ fails on empty)
      expect(shellQuote('')).toBe("''")
    })
  })

  describe('internal single-quote escaping', () => {
    test("string with a single quote uses the \\'' escape pattern", () => {
      expect(shellQuote("it's")).toBe("'it'\\''s'")
    })

    test("string with multiple single quotes escapes each one", () => {
      expect(shellQuote("a'b'c")).toBe("'a'\\''b'\\''c'")
    })

    test("string that is only a single quote", () => {
      expect(shellQuote("'")).toBe("''\\'''")
    })
  })

  describe('round-trip safety', () => {
    test('output is safe for bash eval (no unintended word splitting)', () => {
      const dangerous = 'a b; rm -rf / && echo $(whoami)'
      const quoted = shellQuote(dangerous)
      // The quoted form must start and end with single-quotes
      expect(quoted.startsWith("'")).toBe(true)
      expect(quoted.endsWith("'")).toBe(true)
    })
  })
})
