// Orderly — password hashing using Node's built-in scrypt
// No external dependency. Slow enough to deter brute force, fast enough for low-volume auth.

import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'

const KEY_LEN = 64
const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1

export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  })
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, saltHex, hashHex] = stored.split('$')
    if (scheme !== 'scrypt' || !saltHex || !hashHex) return false
    const salt = Buffer.from(saltHex, 'hex')
    const storedHash = Buffer.from(hashHex, 'hex')
    const testHash = scryptSync(password, salt, KEY_LEN, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
    })
    if (testHash.length !== storedHash.length) return false
    return timingSafeEqual(testHash, storedHash)
  } catch {
    return false
  }
}

export function generateToken(): string {
  return randomBytes(32).toString('hex')
}
