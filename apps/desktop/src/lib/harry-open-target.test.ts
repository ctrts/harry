import { describe, expect, it } from 'vitest'

import {
  normalizeHarryOpenString,
  pathFromHarryDeepLink,
  pathFromOpenDeepLink,
  resolveHarryOpenPath
} from './harry-open-target'

describe('normalizeHarryOpenString', () => {
  it('accepts hash-router paths and strips a leading hash', () => {
    expect(normalizeHarryOpenString('/index-network/intent/1')).toBe('/index-network/intent/1')
    expect(normalizeHarryOpenString('#/index-network/intent/1')).toBe('/index-network/intent/1')
  })

  it('maps plugin-scoped harry:// deep links to the same path', () => {
    expect(normalizeHarryOpenString('harry://index-network/intent/1')).toBe('/index-network/intent/1')
    expect(normalizeHarryOpenString('harry://index-network/intent/1?focus=true')).toBe(
      '/index-network/intent/1?focus=true'
    )
  })

  it('maps harry://open/… deep links by stripping the open host', () => {
    expect(normalizeHarryOpenString('harry://open/index-network/intent/1')).toBe('/index-network/intent/1')
    expect(normalizeHarryOpenString('harry://open/settings/plugins')).toBe('/settings/plugins')
  })

  it('rejects reserved harry kinds and unsafe paths', () => {
    expect(normalizeHarryOpenString('harry://blueprint/morning-brief')).toBeNull()
    expect(normalizeHarryOpenString('harry://plugin/install')).toBeNull()
    expect(normalizeHarryOpenString('https://example.com/x')).toBeNull()
    expect(normalizeHarryOpenString('/../etc/passwd')).toBeNull()
    expect(normalizeHarryOpenString('index-network')).toBeNull()
  })
})

describe('resolveHarryOpenPath', () => {
  it('merges structured path + params', () => {
    expect(resolveHarryOpenPath({ path: '/index-network/intent/1', params: { focus: 'true' } })).toBe(
      '/index-network/intent/1?focus=true'
    )
  })

  it('resolves href the same as a bare string', () => {
    expect(resolveHarryOpenPath({ href: 'harry://index-network/intent/1' })).toBe('/index-network/intent/1')
  })
})

describe('pathFromHarryDeepLink', () => {
  it('builds the navigate path from a plugin-scoped deep-link payload', () => {
    expect(pathFromHarryDeepLink('index-network', 'intent/1')).toBe('/index-network/intent/1')
  })

  it('builds the navigate path from harry://open/… payloads', () => {
    expect(pathFromOpenDeepLink('index-network/intent/1')).toBe('/index-network/intent/1')
    expect(pathFromHarryDeepLink('open', 'agent/42')).toBe('/agent/42')
  })

  it('ignores reserved kinds', () => {
    expect(pathFromHarryDeepLink('blueprint', 'morning-brief')).toBeNull()
    expect(pathFromHarryDeepLink('plugin', 'install')).toBeNull()
  })
})
