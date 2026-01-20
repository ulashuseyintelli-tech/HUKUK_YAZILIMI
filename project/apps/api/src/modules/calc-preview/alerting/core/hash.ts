/**
 * Deterministic Hash Utilities
 * 
 * Production Alerting System - Sprint 0
 * 
 * Stable hash wrapper for deterministic key generation.
 * Uses Node.js crypto for consistent hashing across restarts.
 * 
 * @see .kiro/specs/production-alerting-system/design.md
 * @see Requirements 13.2, 16.1
 */

import { createHash } from 'crypto';

/**
 * Hash algorithm to use
 * SHA-256 provides good distribution and collision resistance
 */
const HASH_ALGORITHM = 'sha256';

/**
 * Hash output encoding
 */
const HASH_ENCODING = 'hex';

/**
 * Hash output length (characters)
 * 16 hex chars = 64 bits = sufficient for dedupe keys
 */
const HASH_LENGTH = 16;

/**
 * Generate a deterministic hash from input string
 * 
 * Properties:
 * - Same input always produces same output
 * - Different inputs produce different outputs (with high probability)
 * - Output is URL-safe (hex encoding)
 * - Output length is fixed (16 characters)
 * 
 * @param input - String to hash
 * @returns Deterministic hash string (16 hex characters)
 */
export function deterministicHash(input: string): string {
  return createHash(HASH_ALGORITHM)
    .update(input, 'utf8')
    .digest(HASH_ENCODING)
    .substring(0, HASH_LENGTH);
}

/**
 * Generate a deterministic hash from multiple parts
 * 
 * Parts are joined with ':' separator before hashing.
 * 
 * @param parts - Array of strings to hash
 * @returns Deterministic hash string
 */
export function deterministicHashParts(...parts: (string | number)[]): string {
  const input = parts.map(p => String(p)).join(':');
  return deterministicHash(input);
}

/**
 * Generate a full-length deterministic hash (64 characters)
 * 
 * Use when more entropy is needed (e.g., incident IDs).
 * 
 * @param input - String to hash
 * @returns Full SHA-256 hash (64 hex characters)
 */
export function deterministicHashFull(input: string): string {
  return createHash(HASH_ALGORITHM)
    .update(input, 'utf8')
    .digest(HASH_ENCODING);
}

/**
 * Generate a unique ID with timestamp prefix
 * 
 * Format: {timestamp_hex}_{hash}
 * 
 * This ensures:
 * - Chronological ordering (timestamp prefix)
 * - Uniqueness (hash suffix)
 * - Determinism (same inputs at same time = same ID)
 * 
 * @param parts - Parts to include in hash
 * @param timestampMs - Timestamp in milliseconds
 * @returns Unique ID string
 */
export function generateTimestampedId(
  parts: (string | number)[],
  timestampMs: number,
): string {
  const timestampHex = timestampMs.toString(16).padStart(12, '0');
  const hash = deterministicHashParts(...parts, timestampMs);
  return `${timestampHex}_${hash}`;
}

/**
 * Extract timestamp from timestamped ID
 * 
 * @param id - Timestamped ID
 * @returns Timestamp in milliseconds, or null if invalid
 */
export function extractTimestampFromId(id: string): number | null {
  const parts = id.split('_');
  if (parts.length < 2) return null;
  
  const timestampHex = parts[0];
  const timestamp = parseInt(timestampHex, 16);
  
  if (isNaN(timestamp)) return null;
  return timestamp;
}

/**
 * Validate that a hash is in expected format
 * 
 * @param hash - Hash to validate
 * @returns True if valid hex hash of expected length
 */
export function isValidHash(hash: string): boolean {
  if (typeof hash !== 'string') return false;
  if (hash.length !== HASH_LENGTH) return false;
  return /^[0-9a-f]+$/.test(hash);
}

/**
 * Validate that a full hash is in expected format
 * 
 * @param hash - Hash to validate
 * @returns True if valid full SHA-256 hex hash
 */
export function isValidFullHash(hash: string): boolean {
  if (typeof hash !== 'string') return false;
  if (hash.length !== 64) return false;
  return /^[0-9a-f]+$/.test(hash);
}
