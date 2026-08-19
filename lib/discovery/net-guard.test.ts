import { describe, expect, it } from 'vitest'
import { blockedHostname, blockedReason, isBlockedAddress } from './net-guard'

describe('SSRF address guard', () => {
  it('refuses the cloud metadata endpoint by address and by name', () => {
    expect(blockedReason('169.254.169.254')).toBe('CLOUD_METADATA')
    expect(blockedHostname('metadata.google.internal')).toBe('CLOUD_METADATA')
  })

  it('refuses loopback, private and link-local ranges', () => {
    expect(blockedReason('127.0.0.1')).toBe('LOOPBACK')
    expect(blockedReason('127.99.1.2')).toBe('LOOPBACK')
    expect(blockedReason('10.1.2.3')).toBe('PRIVATE')
    expect(blockedReason('172.16.0.1')).toBe('PRIVATE')
    expect(blockedReason('172.31.255.255')).toBe('PRIVATE')
    expect(blockedReason('192.168.1.1')).toBe('PRIVATE')
    expect(blockedReason('169.254.1.1')).toBe('LINK_LOCAL')
    expect(blockedReason('0.0.0.0')).toBe('UNSPECIFIED')
    expect(blockedReason('100.64.0.1')).toBe('CARRIER_GRADE_NAT')
  })

  it('does not over-block neighbouring public ranges', () => {
    // 172.15 and 172.32 sit either side of the private 172.16/12 block.
    expect(blockedReason('172.15.0.1')).toBeNull()
    expect(blockedReason('172.32.0.1')).toBeNull()
    expect(blockedReason('11.0.0.1')).toBeNull()
    expect(blockedReason('93.184.216.34')).toBeNull()
    expect(blockedReason('8.8.8.8')).toBeNull()
  })

  it('cannot be bypassed by writing a private address as IPv6-mapped', () => {
    expect(blockedReason('::ffff:127.0.0.1')).toBe('LOOPBACK')
    expect(blockedReason('::ffff:169.254.169.254')).toBe('CLOUD_METADATA')
    expect(blockedReason('::ffff:10.0.0.1')).toBe('PRIVATE')
  })

  it('refuses IPv6 loopback and local ranges', () => {
    expect(blockedReason('::1')).toBe('LOOPBACK')
    expect(blockedReason('::')).toBe('UNSPECIFIED')
    expect(blockedReason('fd00::1')).toBe('UNIQUE_LOCAL')
    expect(blockedReason('fe80::1')).toBe('LINK_LOCAL')
    expect(blockedReason('2606:4700:4700::1111')).toBeNull()
  })

  it('refuses hostnames that never need resolving', () => {
    expect(blockedHostname('localhost')).toBe('LOOPBACK')
    expect(blockedHostname('LOCALHOST')).toBe('LOOPBACK')
    expect(blockedHostname('api.localhost')).toBe('LOOPBACK')
    expect(blockedHostname('db.internal')).toBe('PRIVATE')
    expect(blockedHostname('printer.local')).toBe('PRIVATE')
  })

  it('allows an ordinary public hostname through to DNS resolution', () => {
    expect(blockedHostname('example.edu')).toBeNull()
    expect(blockedHostname('ox.ac.uk')).toBeNull()
  })

  it('exposes a simple boolean for callers that do not need the reason', () => {
    expect(isBlockedAddress('127.0.0.1')).toBe(true)
    expect(isBlockedAddress('8.8.8.8')).toBe(false)
  })
})
