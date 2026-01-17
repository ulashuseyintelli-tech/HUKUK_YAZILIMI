/**
 * Phase 4.3 - Calc Preview Circuit Breaker Service
 * 
 * Dependency-based circuit breaker:
 * - Interest Engine
 * - Fee Engine
 * - Rate Provider
 * - Tariff Provider
 * 
 * States: CLOSED → OPEN → HALF_OPEN → CLOSED
 * 
 * HALF_OPEN Davranışı (Guardrails):
 * - Trial count: successThreshold kadar deneme (1 değil, flappy önleme)
 * - Domain-level success: HTTP 200 değil, valid response kontrolü
 * - Deterministic fallback: cached stale veya "unavailable" + guidance
 * 
 * @see docs/single-source-of-truth-architecture.md - Phase 4.3
 */

import { Injectable, Logger } from '@nestjs/common';

// ============================================================================
// CIRCUIT BREAKER TYPES
// ============================================================================

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export type DependencyName = 
  | 'interest_engine'
  | 'fee_engine'
  | 'rate_provider'
  | 'tariff_provider'
  | 'policy_engine'
  | 'cache';

export interface CircuitBreakerConfig {
  // Failure threshold to open circuit
  failureThreshold: number;
  
  // Success threshold to close circuit (in half-open state)
  successThreshold: number;
  
  // Time to wait before trying again (ms)
  resetTimeoutMs: number;
  
  // Sliding window size for failure counting
  windowSizeMs: number;
  
  // Timeout for individual calls (ms)
  callTimeoutMs: number;
  
  // HALF_OPEN trial limit (prevent flapping)
  halfOpenTrialLimit: number;
  
  // Consecutive failures in HALF_OPEN to re-open
  halfOpenFailureThreshold: number;
}

/**
 * Domain-level success validator
 * HTTP 200 yetmez, response içeriği de valid olmalı
 */
export type DomainSuccessValidator<T> = (result: T) => {
  valid: boolean;
  reason?: string;
};

export interface CircuitStatus {
  state: CircuitState;
  failures: number;
  successes: number;
  halfOpenTrials: number;      // HALF_OPEN'da kaç deneme yapıldı
  halfOpenFailures: number;    // HALF_OPEN'da kaç hata oldu
  lastFailure?: string | undefined;
  lastSuccess?: string | undefined;
  nextRetryAt?: string | undefined;
  config: CircuitBreakerConfig;
}

/**
 * Fallback result with evidence
 */
export interface FallbackResult<T> {
  value: T;
  source: 'CACHED_STALE' | 'DEFAULT' | 'UNAVAILABLE';
  evidence: {
    circuitState: CircuitState;
    dependency: DependencyName;
    reason: string;
    timestamp: string;
  };
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,      // 5 failures to open
  successThreshold: 3,      // 3 successes to close
  resetTimeoutMs: 30000,    // 30 seconds before retry
  windowSizeMs: 60000,      // 1 minute sliding window
  callTimeoutMs: 5000,      // 5 second call timeout
  halfOpenTrialLimit: 5,    // Max 5 trials in HALF_OPEN
  halfOpenFailureThreshold: 2, // 2 failures in HALF_OPEN → re-open
};

// Dependency-specific configs
export const DEPENDENCY_CONFIGS: Record<DependencyName, Partial<CircuitBreakerConfig>> = {
  interest_engine: {
    failureThreshold: 5,
    successThreshold: 3,
    resetTimeoutMs: 30000,
    callTimeoutMs: 3000,
    halfOpenTrialLimit: 5,
    halfOpenFailureThreshold: 2,
  },
  fee_engine: {
    failureThreshold: 5,
    successThreshold: 3,
    resetTimeoutMs: 30000,
    callTimeoutMs: 2000,
    halfOpenTrialLimit: 5,
    halfOpenFailureThreshold: 2,
  },
  rate_provider: {
    failureThreshold: 3,      // More sensitive - critical dependency
    successThreshold: 3,
    resetTimeoutMs: 60000,    // Longer wait - external service
    callTimeoutMs: 5000,
    halfOpenTrialLimit: 3,    // Fewer trials for critical
    halfOpenFailureThreshold: 1, // Single failure re-opens
  },
  tariff_provider: {
    failureThreshold: 5,
    successThreshold: 3,
    resetTimeoutMs: 30000,
    callTimeoutMs: 2000,
    halfOpenTrialLimit: 5,
    halfOpenFailureThreshold: 2,
  },
  policy_engine: {
    failureThreshold: 5,
    successThreshold: 3,
    resetTimeoutMs: 30000,
    callTimeoutMs: 3000,
    halfOpenTrialLimit: 5,
    halfOpenFailureThreshold: 2,
  },
  cache: {
    failureThreshold: 10,     // More tolerant - not critical
    successThreshold: 2,      // Quick recovery
    resetTimeoutMs: 10000,    // Quick retry
    callTimeoutMs: 1000,
    halfOpenTrialLimit: 10,
    halfOpenFailureThreshold: 3,
  },
};

// ============================================================================
// CIRCUIT STATE
// ============================================================================

interface CircuitRecord {
  state: CircuitState;
  failures: { timestamp: number }[];
  successes: number;  // Only counted in HALF_OPEN
  halfOpenTrials: number;    // Trial count in HALF_OPEN
  halfOpenFailures: number;  // Failure count in HALF_OPEN
  lastFailure?: number | undefined;
  lastSuccess?: number | undefined;
  openedAt?: number | undefined;
  config: CircuitBreakerConfig;
}

// ============================================================================
// CIRCUIT BREAKER SERVICE
// ============================================================================

@Injectable()
export class CalcPreviewCircuitBreakerService {
  private readonly logger = new Logger(CalcPreviewCircuitBreakerService.name);
  
  // Circuit states per dependency
  private circuits = new Map<DependencyName, CircuitRecord>();

  constructor() {
    // Initialize circuits for all dependencies
    this.initializeCircuits();
  }

  /**
   * Check if a call is allowed
   * HALF_OPEN: trial limit kontrolü
   */
  isCallAllowed(dependency: DependencyName): boolean {
    const circuit = this.getCircuit(dependency);
    
    switch (circuit.state) {
      case 'CLOSED':
        return true;
        
      case 'OPEN':
        // Check if reset timeout has passed
        if (circuit.openedAt && Date.now() >= circuit.openedAt + circuit.config.resetTimeoutMs) {
          this.transitionToHalfOpen(dependency);
          return true;
        }
        return false;
        
      case 'HALF_OPEN':
        // Check trial limit (prevent flapping)
        if (circuit.halfOpenTrials >= circuit.config.halfOpenTrialLimit) {
          this.logger.warn(`[CircuitBreaker] ${dependency} HALF_OPEN trial limit reached`);
          // Trial limit reached without enough successes → re-open
          this.transitionToOpen(dependency, 'HALF_OPEN trial limit reached without recovery');
          return false;
        }
        circuit.halfOpenTrials++;
        return true;
        
      default:
        return true;
    }
  }

  /**
   * Record a successful call
   * Domain-level success: validator ile kontrol edilebilir
   */
  recordSuccess(dependency: DependencyName): void {
    const circuit = this.getCircuit(dependency);
    circuit.lastSuccess = Date.now();
    
    if (circuit.state === 'HALF_OPEN') {
      circuit.successes += 1;
      
      this.logger.debug(`[CircuitBreaker] ${dependency} HALF_OPEN success`, {
        successes: circuit.successes,
        threshold: circuit.config.successThreshold,
        trials: circuit.halfOpenTrials,
      });
      
      if (circuit.successes >= circuit.config.successThreshold) {
        this.transitionToClosed(dependency);
      }
    }
  }

  /**
   * Record a domain-level success with validation
   * HTTP 200 yetmez, response içeriği de valid olmalı
   */
  recordDomainSuccess<T>(
    dependency: DependencyName,
    result: T,
    validator: DomainSuccessValidator<T>,
  ): boolean {
    const validation = validator(result);
    
    if (validation.valid) {
      this.recordSuccess(dependency);
      return true;
    } else {
      // Domain-level failure (e.g., empty coverage, invalid response)
      this.recordFailure(dependency, new Error(`Domain validation failed: ${validation.reason}`));
      return false;
    }
  }

  /**
   * Record a failed call
   * HALF_OPEN: failure threshold kontrolü
   */
  recordFailure(dependency: DependencyName, error?: Error): void {
    const circuit = this.getCircuit(dependency);
    const now = Date.now();
    
    circuit.lastFailure = now;
    circuit.failures.push({ timestamp: now });
    
    // Cleanup old failures outside window
    const windowStart = now - circuit.config.windowSizeMs;
    circuit.failures = circuit.failures.filter(f => f.timestamp > windowStart);
    
    if (circuit.state === 'HALF_OPEN') {
      circuit.halfOpenFailures++;
      
      this.logger.warn(`[CircuitBreaker] ${dependency} HALF_OPEN failure`, {
        halfOpenFailures: circuit.halfOpenFailures,
        threshold: circuit.config.halfOpenFailureThreshold,
        trials: circuit.halfOpenTrials,
      });
      
      // Check HALF_OPEN failure threshold
      if (circuit.halfOpenFailures >= circuit.config.halfOpenFailureThreshold) {
        this.transitionToOpen(dependency, `HALF_OPEN failure threshold reached: ${circuit.halfOpenFailures}`);
      }
    } else if (circuit.state === 'CLOSED') {
      // Check if threshold reached
      if (circuit.failures.length >= circuit.config.failureThreshold) {
        this.transitionToOpen(dependency, `Failure threshold reached: ${circuit.failures.length}`);
      }
    }
    
    this.logger.warn(`[CircuitBreaker] ${dependency} failure recorded`, {
      state: circuit.state,
      failures: circuit.failures.length,
      threshold: circuit.config.failureThreshold,
      error: error?.message,
    });
  }

  /**
   * Get circuit status
   */
  getStatus(dependency: DependencyName): CircuitStatus {
    const circuit = this.getCircuit(dependency);
    
    return {
      state: circuit.state,
      failures: circuit.failures.length,
      successes: circuit.successes,
      halfOpenTrials: circuit.halfOpenTrials,
      halfOpenFailures: circuit.halfOpenFailures,
      lastFailure: circuit.lastFailure ? new Date(circuit.lastFailure).toISOString() : undefined,
      lastSuccess: circuit.lastSuccess ? new Date(circuit.lastSuccess).toISOString() : undefined,
      nextRetryAt: circuit.openedAt 
        ? new Date(circuit.openedAt + circuit.config.resetTimeoutMs).toISOString() 
        : undefined,
      config: circuit.config,
    };
  }

  /**
   * Get all circuit statuses
   */
  getAllStatuses(): Record<DependencyName, CircuitStatus> {
    const result: Partial<Record<DependencyName, CircuitStatus>> = {};
    
    for (const [name] of this.circuits) {
      result[name] = this.getStatus(name);
    }
    
    return result as Record<DependencyName, CircuitStatus>;
  }

  /**
   * Force circuit state (for ops/testing)
   */
  forceState(dependency: DependencyName, state: CircuitState): void {
    const circuit = this.getCircuit(dependency);
    const oldState = circuit.state;
    
    circuit.state = state;
    circuit.failures = [];
    circuit.successes = 0;
    
    if (state === 'OPEN') {
      circuit.openedAt = Date.now();
    } else {
      circuit.openedAt = undefined;
    }
    
    this.logger.warn(`[CircuitBreaker] ${dependency} forced: ${oldState} → ${state}`);
  }

  /**
   * Reset a circuit
   */
  reset(dependency: DependencyName): void {
    this.circuits.set(dependency, this.createCircuit(dependency));
    this.logger.log(`[CircuitBreaker] ${dependency} reset`);
  }

  /**
   * Reset all circuits
   */
  resetAll(): void {
    this.initializeCircuits();
    this.logger.log('[CircuitBreaker] All circuits reset');
  }

  /**
   * Execute a call with circuit breaker protection
   * Deterministic fallback with evidence
   */
  async execute<T>(
    dependency: DependencyName,
    fn: () => Promise<T>,
    fallback?: () => T,
    validator?: DomainSuccessValidator<T>,
  ): Promise<{ success: boolean; data?: T; fallback?: FallbackResult<T>; error?: string }> {
    // Check if call is allowed
    if (!this.isCallAllowed(dependency)) {
      this.logger.warn(`[CircuitBreaker] ${dependency} call blocked (circuit OPEN)`);
      
      if (fallback) {
        const fallbackValue = fallback();
        return { 
          success: true, 
          fallback: {
            value: fallbackValue,
            source: 'UNAVAILABLE',
            evidence: {
              circuitState: this.getCircuit(dependency).state,
              dependency,
              reason: 'Circuit breaker OPEN',
              timestamp: new Date().toISOString(),
            },
          },
        };
      }
      
      return { 
        success: false, 
        error: `Circuit breaker OPEN for ${dependency}`,
      };
    }
    
    const circuit = this.getCircuit(dependency);
    
    try {
      // Execute with timeout
      const result = await this.withTimeout(fn(), circuit.config.callTimeoutMs);
      
      // Domain-level validation if provided
      if (validator) {
        const isValid = this.recordDomainSuccess(dependency, result, validator);
        if (!isValid && fallback) {
          const fallbackValue = fallback();
          return {
            success: true,
            fallback: {
              value: fallbackValue,
              source: 'DEFAULT',
              evidence: {
                circuitState: circuit.state,
                dependency,
                reason: 'Domain validation failed',
                timestamp: new Date().toISOString(),
              },
            },
          };
        }
      } else {
        this.recordSuccess(dependency);
      }
      
      return { success: true, data: result };
    } catch (error) {
      this.recordFailure(dependency, error as Error);
      
      if (fallback) {
        const fallbackValue = fallback();
        return { 
          success: true, 
          fallback: {
            value: fallbackValue,
            source: 'DEFAULT',
            evidence: {
              circuitState: circuit.state,
              dependency,
              reason: (error as Error).message,
              timestamp: new Date().toISOString(),
            },
          },
        };
      }
      
      return { 
        success: false, 
        error: (error as Error).message,
      };
    }
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private initializeCircuits(): void {
    const dependencies: DependencyName[] = [
      'interest_engine',
      'fee_engine',
      'rate_provider',
      'tariff_provider',
      'policy_engine',
      'cache',
    ];
    
    for (const dep of dependencies) {
      this.circuits.set(dep, this.createCircuit(dep));
    }
  }

  private createCircuit(dependency: DependencyName): CircuitRecord {
    const depConfig = DEPENDENCY_CONFIGS[dependency] || {};
    
    return {
      state: 'CLOSED',
      failures: [],
      successes: 0,
      halfOpenTrials: 0,
      halfOpenFailures: 0,
      config: { ...DEFAULT_CIRCUIT_CONFIG, ...depConfig },
    };
  }

  private getCircuit(dependency: DependencyName): CircuitRecord {
    let circuit = this.circuits.get(dependency);
    
    if (!circuit) {
      circuit = this.createCircuit(dependency);
      this.circuits.set(dependency, circuit);
    }
    
    return circuit;
  }

  private transitionToOpen(dependency: DependencyName, reason: string): void {
    const circuit = this.getCircuit(dependency);
    const oldState = circuit.state;
    
    circuit.state = 'OPEN';
    circuit.openedAt = Date.now();
    circuit.successes = 0;
    
    this.logger.error(`[CircuitBreaker] ${dependency}: ${oldState} → OPEN`, {
      reason,
      failures: circuit.failures.length,
      nextRetryAt: new Date(circuit.openedAt + circuit.config.resetTimeoutMs).toISOString(),
    });
    
    // Emit alert
    this.emitAlert(dependency, 'CIRCUIT_OPENED', reason);
  }

  private transitionToHalfOpen(dependency: DependencyName): void {
    const circuit = this.getCircuit(dependency);
    const oldState = circuit.state;
    
    circuit.state = 'HALF_OPEN';
    circuit.successes = 0;
    circuit.halfOpenTrials = 0;
    circuit.halfOpenFailures = 0;
    
    this.logger.log(`[CircuitBreaker] ${dependency}: ${oldState} → HALF_OPEN`);
  }

  private transitionToClosed(dependency: DependencyName): void {
    const circuit = this.getCircuit(dependency);
    const oldState = circuit.state;
    
    circuit.state = 'CLOSED';
    circuit.failures = [];
    circuit.successes = 0;
    circuit.halfOpenTrials = 0;
    circuit.halfOpenFailures = 0;
    circuit.openedAt = undefined;
    
    this.logger.log(`[CircuitBreaker] ${dependency}: ${oldState} → CLOSED (recovered)`);
    
    // Emit recovery alert
    this.emitAlert(dependency, 'CIRCUIT_RECOVERED', 'Service recovered');
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
  }

  private emitAlert(dependency: DependencyName, type: string, message: string): void {
    // TODO: Integrate with Sentry, Datadog, Slack, PagerDuty
    this.logger.error(`[ALERT] ${type}: ${dependency} - ${message}`);
  }
}
