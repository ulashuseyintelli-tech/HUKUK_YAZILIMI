/**
 * IP Address Hasher
 * 
 * Phase 10.2 - Task 2.1
 * 
 * HMAC-SHA256 based IP hashing for KVKK compliance.
 * 
 * Rules:
 * - Secret yoksa → null döner (fail-closed, plaintext yazılmaz)
 * - IP normalize edilir, sonra hash'lenir
 * - Hash truncate edilir (32 char) for storage efficiency
 */

import * as crypto from 'crypto';
import { normalizeIp } from './ip-normalizer';

/**
 * Hash an IP address using HMAC-SHA256.
 * 
 * @param ip - Raw IP address
 * @param secret - HMAC secret (null = no hashing, returns null)
 * @returns Hashed IP (32 chars) or null
 */
export function hashIp(ip: string | null | undefined, secret: string | null): string | null {
  // No secret = fail-closed (no IP stored)
  if (!secret) {
    return null;
  }
  
  // Normalize IP first
  const normalized = normalizeIp(ip);
  if (!normalized) {
    return null;
  }
  
  // HMAC-SHA256
  const hash = crypto
    .createHmac('sha256', secret)
    .update(normalized)
    .digest('hex')
    .substring(0, 32); // Truncate for storage efficiency
  
  return hash;
}
