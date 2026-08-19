import { isIP } from 'node:net'

/**
 * SSRF guard for the page fetcher.
 *
 * Discovery fetches URLs that came from a search engine — i.e. from the open
 * internet, chosen by third parties. Two things make that dangerous without a
 * guard:
 *
 *   1. A public hostname can resolve to a private address, and an attacker who
 *      controls DNS for a domain they can get indexed controls that.
 *   2. A public URL can 302 to `http://169.254.169.254/…` (cloud metadata) or
 *      to an internal service. Following redirects blindly hands the attacker
 *      a server-side request, and Lumen stores response text as opportunity
 *      content — so the response would be readable afterwards.
 *
 * So every hop is resolved and checked, not just the first URL.
 *
 * Pure and unit-tested: the address logic has no I/O.
 */

export type BlockReason =
  | 'LOOPBACK'
  | 'PRIVATE'
  | 'LINK_LOCAL'
  | 'CLOUD_METADATA'
  | 'UNSPECIFIED'
  | 'CARRIER_GRADE_NAT'
  | 'RESERVED'
  | 'MULTICAST'
  | 'UNIQUE_LOCAL'
  | null

const ipv4ToInt = (ip: string): number | null => {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let value = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const n = Number(part)
    if (n > 255) return null
    value = value * 256 + n
  }
  return value
}

const inRange = (value: number, cidrBase: string, bits: number): boolean => {
  const base = ipv4ToInt(cidrBase)
  if (base === null) return false
  const mask = bits === 0 ? 0 : (-1 << (32 - bits)) >>> 0
  return (value & mask) === (base & mask)
}

/** Returns why an address is refused, or null when it is a fine public address. */
export function blockedReason(address: string): BlockReason {
  const family = isIP(address)

  if (family === 4) {
    const value = ipv4ToInt(address)
    if (value === null) return 'RESERVED'

    // The cloud metadata endpoint is called out separately from link-local
    // because it is the specific thing an attacker is usually reaching for.
    if (address === '169.254.169.254') return 'CLOUD_METADATA'

    if (inRange(value, '0.0.0.0', 8)) return 'UNSPECIFIED'
    if (inRange(value, '127.0.0.0', 8)) return 'LOOPBACK'
    if (inRange(value, '10.0.0.0', 8)) return 'PRIVATE'
    if (inRange(value, '172.16.0.0', 12)) return 'PRIVATE'
    if (inRange(value, '192.168.0.0', 16)) return 'PRIVATE'
    if (inRange(value, '169.254.0.0', 16)) return 'LINK_LOCAL'
    if (inRange(value, '100.64.0.0', 10)) return 'CARRIER_GRADE_NAT'
    if (inRange(value, '192.0.0.0', 24)) return 'RESERVED'
    if (inRange(value, '192.0.2.0', 24)) return 'RESERVED'
    if (inRange(value, '198.18.0.0', 15)) return 'RESERVED'
    if (inRange(value, '198.51.100.0', 24)) return 'RESERVED'
    if (inRange(value, '203.0.113.0', 24)) return 'RESERVED'
    if (inRange(value, '224.0.0.0', 4)) return 'MULTICAST'
    if (inRange(value, '240.0.0.0', 4)) return 'RESERVED'
    return null
  }

  if (family === 6) {
    const normalised = address.toLowerCase().replace(/^\[|\]$/g, '')

    // IPv4-mapped (::ffff:127.0.0.1) must be judged by its IPv4 value, or the
    // whole guard is bypassed by writing the address a different way.
    const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(normalised)
    if (mapped) return blockedReason(mapped[1]!)

    if (normalised === '::1') return 'LOOPBACK'
    if (normalised === '::') return 'UNSPECIFIED'
    if (/^f[cd][0-9a-f]{2}:/.test(normalised)) return 'UNIQUE_LOCAL'
    if (/^fe[89ab][0-9a-f]:/.test(normalised)) return 'LINK_LOCAL'
    if (/^ff[0-9a-f]{2}:/.test(normalised)) return 'MULTICAST'
    return null
  }

  // Not an IP literal — the caller resolves the hostname and re-checks.
  return null
}

export const isBlockedAddress = (address: string): boolean => blockedReason(address) !== null

/** Hostnames that never need resolving to be refused. */
export function blockedHostname(hostname: string): BlockReason {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  // Most specific first: metadata.google.internal also ends in .internal, and
  // naming the actual hazard is more useful in an admin log than "private".
  if (host === 'metadata.google.internal' || host === 'metadata') return 'CLOUD_METADATA'
  if (host === 'localhost' || host.endsWith('.localhost')) return 'LOOPBACK'
  if (host.endsWith('.internal') || host.endsWith('.local')) return 'PRIVATE'
  return blockedReason(host)
}

export const BLOCK_EXPLANATION: Record<NonNullable<BlockReason>, string> = {
  LOOPBACK: 'resolves to this machine',
  PRIVATE: 'resolves to a private network address',
  LINK_LOCAL: 'resolves to a link-local address',
  CLOUD_METADATA: 'is a cloud metadata endpoint',
  UNSPECIFIED: 'is an unspecified address',
  CARRIER_GRADE_NAT: 'resolves to a carrier-grade NAT address',
  RESERVED: 'resolves to a reserved address',
  MULTICAST: 'is a multicast address',
  UNIQUE_LOCAL: 'resolves to a unique-local address',
}
