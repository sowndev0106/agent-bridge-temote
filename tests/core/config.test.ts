import { describe, it, expect } from 'vitest'
import { CONFIG_DEFAULTS, validateConfig, mergeConfig } from '../../src/server/core/config.js'

describe('config', () => {
  it('has correct defaults', () => {
    expect(CONFIG_DEFAULTS.port).toBe(4096)
    expect(CONFIG_DEFAULTS.host).toBe('0.0.0.0')
    expect(CONFIG_DEFAULTS.password).toBe('')
    expect(CONFIG_DEFAULTS.linkExtractTimeout).toBe(30)
  })

  it('validateConfig returns no errors for valid config', () => {
    expect(validateConfig({ port: 3000, logLevel: 'debug', host: '127.0.0.1', sessionSecret: 'x' })).toEqual([])
  })

  it('validateConfig flags an empty sessionSecret', () => {
    const errors = validateConfig({ host: '127.0.0.1', sessionSecret: '' })
    expect(errors.some(e => e.includes('sessionSecret'))).toBe(true)
  })

  it('validateConfig catches invalid port', () => {
    const errors = validateConfig({ port: 99999, host: '127.0.0.1' })
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]).toContain('"port"')
    expect(errors[0]).toContain("arc help")
  })

  it('validateConfig catches invalid logLevel', () => {
    const errors = validateConfig({ logLevel: 'verbose' as never, host: '127.0.0.1' })
    expect(errors[0]).toContain('"logLevel"')
  })

  it('validateConfig requires password when host is not 127.0.0.1', () => {
    const errors = validateConfig({ host: '0.0.0.0', password: '' })
    expect(errors[0]).toContain('password')
  })

  it('mergeConfig deep-merges agents overrides', () => {
    const merged = mergeConfig(CONFIG_DEFAULTS, {
      agents: { claude: { command: 'claude-custom' } }
    })
    expect(merged.agents.claude?.command).toBe('claude-custom')
    expect(merged.port).toBe(4096)
  })
})
