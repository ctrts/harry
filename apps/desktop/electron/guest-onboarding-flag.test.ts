import assert from 'node:assert/strict'

import { test } from 'vitest'

import { desktopBackendSpawnEnv, guestOnboardingEnabled, skipIntroEnabled } from './guest-onboarding'
import { buildSpawnCommand } from './remote-lifecycle'

test('skipIntroEnabled: exactly "1" in env or --skip-intro on argv skips the first-run film', () => {
  assert.equal(skipIntroEnabled([], { HARRY_SKIP_INTRO: '1' }), true)
  assert.equal(skipIntroEnabled(['electron', '.', '--skip-intro'], {}), true)

  assert.equal(skipIntroEnabled([], {}), false)
  assert.equal(skipIntroEnabled([], { HARRY_SKIP_INTRO: 'true' }), false)
})

test('guestOnboardingEnabled: exactly "1" in env or --guest-onboarding on argv turns the free tier on', () => {
  assert.equal(guestOnboardingEnabled([], { HARRY_GUEST_ONBOARDING: '1' }), true)
  assert.equal(guestOnboardingEnabled(['electron', '.', '--guest-onboarding'], {}), true)

  assert.equal(guestOnboardingEnabled([], {}), false)
  assert.equal(guestOnboardingEnabled([], { HARRY_GUEST_ONBOARDING: 'true' }), false)
  assert.equal(guestOnboardingEnabled([], { HARRY_GUEST_ONBOARDING: '0' }), false)
  assert.equal(guestOnboardingEnabled(['electron', '.', '--local'], { HARRY_GUEST_ONBOARDING: '' }), false)
})

test('desktopBackendSpawnEnv stamps the launch decision last and never lets an inherited value leak', () => {
  const base = {
    HARRY_HOME: '/tmp/home',
    HARRY_DESKTOP: '1',
    HARRY_GUEST_ONBOARDING: '1',
    PATH: '/usr/bin'
  }

  const on = desktopBackendSpawnEnv({ ...base, HARRY_GUEST_ONBOARDING: '0' }, true)
  assert.equal(on.HARRY_GUEST_ONBOARDING, '1')

  const off = desktopBackendSpawnEnv(base, false)
  assert.equal(off.HARRY_GUEST_ONBOARDING, '0', 'a stray inherited "1" must not turn the free tier on')

  for (const env of [on, off]) {
    assert.equal(env.HARRY_HOME, base.HARRY_HOME)
    assert.equal(env.HARRY_DESKTOP, base.HARRY_DESKTOP)
    assert.equal(env.PATH, base.PATH)
  }
})

test('remote SSH spawn command carries HARRY_GUEST_ONBOARDING=1 only when the launch decided on', () => {
  const on = buildSpawnCommand('/x/harry', 'work', { logPath: '~/.harry/log', guestOnboarding: true })
  assert.match(on, /exec env HARRY_DESKTOP=1 HARRY_GUEST_ONBOARDING=1 /)

  const off = buildSpawnCommand('/x/harry', 'work', { logPath: '~/.harry/log', guestOnboarding: false })
  assert.match(off, /exec env HARRY_DESKTOP=1 /)
  assert.doesNotMatch(off, /HARRY_GUEST_ONBOARDING/)

  const unset = buildSpawnCommand('/x/harry', 'work', { logPath: '~/.harry/log' })
  assert.doesNotMatch(unset, /HARRY_GUEST_ONBOARDING/)
})
