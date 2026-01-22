/**
 * Distributed Lock Service
 * 
 * Phase 11 - Snapshot Cleanup Orchestration
 * 
 * Redis-based distributed lock implementation using SET NX PX.
 * Prevents concurrent cleanup runs across multiple instances.
 * 
 * Key Design:
 * - SET NX PX for atomic acquire
 * - Lua script for safe release (only if lockId matches)
 * - TTL calculated from bounded run config
 */

import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { IDistributedLock, LockAcquireResult } from './cleanup.types';

// ============================================================================
// Lua Scripts
// ============================================================================

/**
 * Lua script for atomic check-and-delete (release lock only if lockId matches)
 * 
 * KEYS[1] = lock key
 * ARGV[1] = expected lockId
 * 
 * Returns 1 if deleted, 0 if not found or wrong lockId
 */
const RELEASE_LOCK_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`;

// ============================================================================
// Implementation
// ============================================================================

@Injectable()
export class DistributedLockService implements IDistributedLock {
  private readonly logger = new Logger(DistributedLockService.name);
  private readonly keyPrefix: string;

  constructor(
    private readonly redis: Redis,
    keyPrefix: string = 'hukuk:cleanup:',
  ) {
    this.keyPrefix = keyPrefix;
  }

  /**
   * Acquire a distributed lock
   * 
   * Uses Redis SET NX PX for atomic acquire with TTL.
   * 
   * @param lockKey Lock key (will be prefixed)
   * @param ttlMs Lock TTL in milliseconds
   * @returns Lock acquisition result
   */
  async acquireLock(lockKey: string, ttlMs: number): Promise<LockAcquireResult> {
    const fullKey = this.prefixKey(lockKey);
    const lockId = randomUUID();

    try {
      // SET NX PX - atomic acquire with TTL
      const result = await this.redis.set(fullKey, lockId, 'PX', ttlMs, 'NX');

      if (result === 'OK') {
        this.logger.debug('[DistributedLock] Lock acquired', {
          lockKey,
          lockId,
          ttlMs,
        });
        return { acquired: true, lockId };
      }

      // Lock exists - get existing lockId for logging
      const existingLockId = await this.redis.get(fullKey);
      
      this.logger.debug('[DistributedLock] Lock not acquired - already held', {
        lockKey,
        existingLockId,
      });
      
      return {
        acquired: false,
        existingLockId: existingLockId || undefined,
      };
    } catch (error) {
      this.logger.error('[DistributedLock] acquireLock failed', {
        lockKey,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Release a distributed lock
   * 
   * Uses Lua script for atomic check-and-delete.
   * Only releases if lockId matches (prevents releasing someone else's lock).
   * 
   * @param lockKey Lock key (will be prefixed)
   * @param lockId Lock ID from acquisition
   * @returns true if released, false if not held or wrong lockId
   */
  async releaseLock(lockKey: string, lockId: string): Promise<boolean> {
    const fullKey = this.prefixKey(lockKey);

    try {
      // Lua script for atomic check-and-delete
      const result = await this.redis.eval(
        RELEASE_LOCK_SCRIPT,
        1,
        fullKey,
        lockId,
      );

      const released = result === 1;
      
      this.logger.debug('[DistributedLock] Lock release attempt', {
        lockKey,
        lockId,
        released,
      });
      
      return released;
    } catch (error) {
      this.logger.error('[DistributedLock] releaseLock failed', {
        lockKey,
        lockId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Check if a lock is currently held
   * 
   * @param lockKey Lock key (will be prefixed)
   * @returns Lock ID if held, null if not held
   */
  async getLockHolder(lockKey: string): Promise<string | null> {
    const fullKey = this.prefixKey(lockKey);

    try {
      return await this.redis.get(fullKey);
    } catch (error) {
      this.logger.error('[DistributedLock] getLockHolder failed', {
        lockKey,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get remaining TTL for a lock
   * 
   * @param lockKey Lock key (will be prefixed)
   * @returns TTL in ms, -1 if no TTL, -2 if key doesn't exist
   */
  async getLockTtl(lockKey: string): Promise<number> {
    const fullKey = this.prefixKey(lockKey);

    try {
      return await this.redis.pttl(fullKey);
    } catch (error) {
      this.logger.error('[DistributedLock] getLockTtl failed', {
        lockKey,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private prefixKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }
}

// ============================================================================
// In-Memory Implementation (for testing)
// ============================================================================

/**
 * In-memory distributed lock for testing
 * 
 * NOT for production use - only for unit tests.
 */
export class InMemoryDistributedLock implements IDistributedLock {
  private readonly locks = new Map<string, { lockId: string; expiresAt: number }>();

  async acquireLock(lockKey: string, ttlMs: number): Promise<LockAcquireResult> {
    const now = Date.now();
    
    // Cleanup expired locks
    const existing = this.locks.get(lockKey);
    if (existing && existing.expiresAt > now) {
      return {
        acquired: false,
        existingLockId: existing.lockId,
      };
    }

    const lockId = randomUUID();
    this.locks.set(lockKey, {
      lockId,
      expiresAt: now + ttlMs,
    });

    return { acquired: true, lockId };
  }

  async releaseLock(lockKey: string, lockId: string): Promise<boolean> {
    const existing = this.locks.get(lockKey);
    
    if (!existing || existing.lockId !== lockId) {
      return false;
    }

    this.locks.delete(lockKey);
    return true;
  }

  /** Test helper: clear all locks */
  clear(): void {
    this.locks.clear();
  }

  /** Test helper: get lock state */
  getLock(lockKey: string): { lockId: string; expiresAt: number } | undefined {
    return this.locks.get(lockKey);
  }
}
