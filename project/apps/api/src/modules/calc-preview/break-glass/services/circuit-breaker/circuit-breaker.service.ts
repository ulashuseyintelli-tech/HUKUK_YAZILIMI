/**
 * BreakGlassCircuitBreakerService
 * 
 * Circuit breaker for break-glass system abuse control.
 * 
 * Behavior:
 * - Tracks grants per hour window
 * - Trips at threshold (default: 10 grants/hour)
 * - When tripped: all new requests/approvals return 503
 * - Reset requires security override
 * 
 * Redis keys (production):
 * - bg:cb:window:{YYYYMMDDHH} - grant count per hour
 * - bg:cb:tripped - boolean flag when tripped
 */

import { Injectable, Logger } from '@nestjs/common';
import { BreakGlassConfigService } from '../../break-glass.config';

/**
 * Circuit breaker state
 */
export interface CircuitBreakerState {
  isTripped: boolean;
  currentWindowCount: number;
  windowKey: string;
  threshold: number;
  trippedAt?: string;
  trippedBy?: string;
  resetAt?: string;
  resetBy?: string;
}

/**
 * Circuit breaker storage interface
 */
export interface ICircuitBreakerStore {
  /**
   * Increment grant count for current window
   * @returns new count after increment
   */
  incrementWindowCount(windowKey: string, ttlSeconds: number): Promise<number>;

  /**
   * Get current window count
   */
  getWindowCount(windowKey: string): Promise<number>;

  /**
   * Check if circuit breaker is tripped
   */
  isTripped(): Promise<boolean>;

  /**
   * Trip the circuit breaker
   */
  trip(trippedBy: string): Promise<void>;

  /**
   * Reset the circuit breaker (security override)
   */
  reset(resetBy: string): Promise<void>;

  /**
   * Get full state
   */
  getState(): Promise<CircuitBreakerState>;
}

/**
 * In-memory circuit breaker store for development/testing
 */
@Injectable()
export class InMemoryCircuitBreakerStore implements ICircuitBreakerStore {
  private windowCounts = new Map<string, number>();
  private tripped = false;
  private trippedAt?: string;
  private trippedBy?: string;
  private resetAt?: string;
  private resetBy?: string;

  async incrementWindowCount(windowKey: string, _ttlSeconds: number): Promise<number> {
    const current = this.windowCounts.get(windowKey) || 0;
    const newCount = current + 1;
    this.windowCounts.set(windowKey, newCount);
    return newCount;
  }

  async getWindowCount(windowKey: string): Promise<number> {
    return this.windowCounts.get(windowKey) || 0;
  }

  async isTripped(): Promise<boolean> {
    return this.tripped;
  }

  async trip(trippedBy: string): Promise<void> {
    this.tripped = true;
    this.trippedAt = new Date().toISOString();
    this.trippedBy = trippedBy;
  }

  async reset(resetBy: string): Promise<void> {
    this.tripped = false;
    this.resetAt = new Date().toISOString();
    this.resetBy = resetBy;
    // Clear window counts on reset
    this.windowCounts.clear();
  }

  async getState(): Promise<CircuitBreakerState> {
    const windowKey = this.getCurrentWindowKey();
    const state: CircuitBreakerState = {
      isTripped: this.tripped,
      currentWindowCount: this.windowCounts.get(windowKey) || 0,
      windowKey,
      threshold: 10, // Will be overridden by service
    };
    
    if (this.trippedAt) state.trippedAt = this.trippedAt;
    if (this.trippedBy) state.trippedBy = this.trippedBy;
    if (this.resetAt) state.resetAt = this.resetAt;
    if (this.resetBy) state.resetBy = this.resetBy;
    
    return state;
  }

  private getCurrentWindowKey(): string {
    const now = new Date();
    return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}${String(now.getUTCHours()).padStart(2, '0')}`;
  }

  /**
   * For testing only
   * @internal
   */
  _clearForTesting(): void {
    this.windowCounts.clear();
    this.tripped = false;
    delete this.trippedAt;
    delete this.trippedBy;
    delete this.resetAt;
    delete this.resetBy;
  }
}

/**
 * Circuit breaker service
 */
@Injectable()
export class BreakGlassCircuitBreakerService {
  private readonly logger = new Logger(BreakGlassCircuitBreakerService.name);

  constructor(
    private readonly config: BreakGlassConfigService,
    private readonly store: InMemoryCircuitBreakerStore,
  ) {}

  /**
   * Check if circuit breaker allows new grants
   * @throws ServiceUnavailableException if tripped
   */
  async checkBeforeGrant(): Promise<void> {
    const isTripped = await this.store.isTripped();
    if (isTripped) {
      this.logger.warn('Circuit breaker is tripped - blocking grant');
      throw new CircuitBreakerTrippedException();
    }
  }

  /**
   * Record a grant and check threshold
   * Call this AFTER a grant is issued
   * @returns true if circuit breaker tripped as a result
   */
  async recordGrant(grantedBy: string): Promise<boolean> {
    const cbConfig = this.config.getCircuitBreakerConfig();
    const windowKey = this.getCurrentWindowKey();
    const ttlSeconds = cbConfig.windowMinutes * 60;

    const newCount = await this.store.incrementWindowCount(windowKey, ttlSeconds);

    this.logger.debug('Grant recorded', {
      windowKey,
      count: newCount,
      threshold: cbConfig.maxGrantsPerWindow,
    });

    // Check if we should trip
    if (newCount >= cbConfig.maxGrantsPerWindow) {
      await this.trip(grantedBy);
      return true;
    }

    return false;
  }

  /**
   * Trip the circuit breaker
   */
  async trip(trippedBy: string): Promise<void> {
    await this.store.trip(trippedBy);
    
    this.logger.error('CIRCUIT BREAKER TRIPPED', {
      trippedBy,
      timestamp: new Date().toISOString(),
    });

    // TODO: Alert security team
    // await this.alertService.alertSecurityTeam({
    //   type: 'BREAK_GLASS_CIRCUIT_BREAKER_TRIPPED',
    //   trippedBy,
    //   timestamp: new Date().toISOString(),
    // });
  }

  /**
   * Reset the circuit breaker (security override)
   */
  async reset(resetBy: string, securityOverrideToken: string): Promise<void> {
    // Validate security override token
    if (!this.validateSecurityOverride(securityOverrideToken)) {
      this.logger.warn('Invalid security override token for circuit breaker reset', {
        attemptedBy: resetBy,
      });
      throw new InvalidSecurityOverrideException();
    }

    await this.store.reset(resetBy);
    
    this.logger.warn('CIRCUIT BREAKER RESET', {
      resetBy,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get current circuit breaker state
   */
  async getState(): Promise<CircuitBreakerState> {
    const state = await this.store.getState();
    const cbConfig = this.config.getCircuitBreakerConfig();
    return {
      ...state,
      threshold: cbConfig.maxGrantsPerWindow,
    };
  }

  /**
   * Check if circuit breaker is currently tripped
   */
  async isTripped(): Promise<boolean> {
    return this.store.isTripped();
  }

  /**
   * Get current window key (YYYYMMDDHH format)
   */
  private getCurrentWindowKey(): string {
    const now = new Date();
    return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}${String(now.getUTCHours()).padStart(2, '0')}`;
  }

  /**
   * Validate security override token
   * In production, this would verify against a secure token store
   */
  private validateSecurityOverride(token: string): boolean {
    // Simple validation for now - in production use proper token validation
    const expectedToken = process.env.BREAK_GLASS_SECURITY_OVERRIDE_TOKEN;
    if (!expectedToken) {
      this.logger.error('BREAK_GLASS_SECURITY_OVERRIDE_TOKEN not configured');
      return false;
    }
    return token === expectedToken;
  }
}

/**
 * Exception thrown when circuit breaker is tripped
 */
export class CircuitBreakerTrippedException extends Error {
  constructor() {
    super('Break-glass circuit breaker is tripped');
    this.name = 'CircuitBreakerTrippedException';
  }
}

/**
 * Exception thrown when security override is invalid
 */
export class InvalidSecurityOverrideException extends Error {
  constructor() {
    super('Invalid security override token');
    this.name = 'InvalidSecurityOverrideException';
  }
}

/**
 * DI token for circuit breaker store
 */
export const CIRCUIT_BREAKER_STORE = 'CIRCUIT_BREAKER_STORE';
