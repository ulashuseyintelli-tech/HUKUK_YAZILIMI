/**
 * Phase 5.3 - Fault Injector Service
 * 
 * Dependency'lere fault injection yapar
 * 
 * ⚠️ SADECE TEST ORTAMINDA KULLANILMALI
 * Production'da bu modül devre dışı olmalı
 */

import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { 
  FaultInjectionConfig, 
  ActiveInjection, 
  FaultMode 
} from './chaos.types';
import { DependencyName } from '../circuit-breaker';

// ============================================================================
// FAULT INJECTOR SERVICE
// ============================================================================

@Injectable()
export class FaultInjectorService {
  private readonly logger = new Logger(FaultInjectorService.name);
  
  /** Aktif injection'lar */
  private activeInjections = new Map<string, ActiveInjection>();
  
  /** Dependency bazlı injection lookup */
  private byDependency = new Map<DependencyName, ActiveInjection[]>();
  
  /** Enabled flag - production'da false olmalı */
  private enabled = process.env.ENABLE_CHAOS_ENDPOINTS === 'true';

  // ============================================================================
  // INJECTION MANAGEMENT
  // ============================================================================

  /**
   * Fault injection ekle
   */
  inject(config: FaultInjectionConfig): ActiveInjection | null {
    if (!this.enabled) {
      this.logger.warn('[FaultInjector] Chaos endpoints disabled in this environment');
      return null;
    }
    
    const id = randomUUID().substring(0, 8);
    const now = new Date();
    
    const injection: ActiveInjection = {
      ...config,
      id,
      startedAt: now.toISOString(),
      expiresAt: config.durationMs 
        ? new Date(now.getTime() + config.durationMs).toISOString()
        : undefined,
      triggerCount: 0,
    };
    
    // Store
    this.activeInjections.set(id, injection);
    
    // Index by dependency
    const depInjections = this.byDependency.get(config.dependency) || [];
    depInjections.push(injection);
    this.byDependency.set(config.dependency, depInjections);
    
    this.logger.log(`[FaultInjector] Injection added: ${id} - ${config.dependency} - ${config.mode}`);
    
    return injection;
  }

  /**
   * Injection kaldır
   */
  remove(id: string): boolean {
    const injection = this.activeInjections.get(id);
    if (!injection) return false;
    
    this.activeInjections.delete(id);
    
    // Remove from dependency index
    const depInjections = this.byDependency.get(injection.dependency) || [];
    const filtered = depInjections.filter(i => i.id !== id);
    this.byDependency.set(injection.dependency, filtered);
    
    this.logger.log(`[FaultInjector] Injection removed: ${id}`);
    
    return true;
  }

  /**
   * Tüm injection'ları temizle
   */
  clearAll(): number {
    const count = this.activeInjections.size;
    this.activeInjections.clear();
    this.byDependency.clear();
    
    this.logger.log(`[FaultInjector] Cleared ${count} injections`);
    
    return count;
  }

  /**
   * Aktif injection'ları listele
   */
  getActiveInjections(): ActiveInjection[] {
    this.cleanupExpired();
    return Array.from(this.activeInjections.values());
  }

  /**
   * Dependency için aktif injection var mı?
   */
  hasInjection(dependency: DependencyName): boolean {
    this.cleanupExpired();
    const injections = this.byDependency.get(dependency) || [];
    return injections.length > 0;
  }

  // ============================================================================
  // FAULT APPLICATION
  // ============================================================================

  /**
   * Dependency çağrısına fault uygula
   * 
   * @returns Fault uygulandıysa true, aksi halde false
   */
  async applyFault<T>(
    dependency: DependencyName,
    originalFn: () => Promise<T>,
  ): Promise<{ result: T | null; faultApplied: boolean; faultMode?: FaultMode }> {
    if (!this.enabled) {
      const result = await originalFn();
      return { result, faultApplied: false };
    }
    
    this.cleanupExpired();
    
    const injections = this.byDependency.get(dependency) || [];
    if (injections.length === 0) {
      const result = await originalFn();
      return { result, faultApplied: false };
    }
    
    // İlk aktif injection'ı al
    const injection = injections[0];
    
    // Probability check
    if (injection.probability !== undefined && Math.random() > injection.probability) {
      const result = await originalFn();
      return { result, faultApplied: false };
    }
    
    // Increment trigger count
    injection.triggerCount++;
    
    // Apply fault based on mode
    switch (injection.mode) {
      case 'DELAY':
        return this.applyDelay(originalFn, injection);
      
      case 'TIMEOUT':
        return this.applyTimeout(injection);
      
      case 'ERROR_500':
        return this.applyError(500, injection);
      
      case 'ERROR_503':
        return this.applyError(503, injection);
      
      case 'INVALID_RESPONSE':
        return this.applyInvalidResponse(injection);
      
      case 'PARTIAL_DATA':
        return this.applyPartialData(originalFn, injection);
      
      case 'EMPTY_RESPONSE':
        return this.applyEmptyResponse(injection);
      
      default:
        const result = await originalFn();
        return { result, faultApplied: false };
    }
  }

  /**
   * Delay fault
   */
  private async applyDelay<T>(
    originalFn: () => Promise<T>,
    injection: ActiveInjection,
  ): Promise<{ result: T; faultApplied: boolean; faultMode: FaultMode }> {
    const delayMs = injection.delayMs || 1000;
    
    this.logger.debug(`[FaultInjector] Applying DELAY: ${delayMs}ms to ${injection.dependency}`);
    
    await this.sleep(delayMs);
    const result = await originalFn();
    
    return { result, faultApplied: true, faultMode: 'DELAY' };
  }

  /**
   * Timeout fault
   */
  private async applyTimeout(
    injection: ActiveInjection,
  ): Promise<{ result: null; faultApplied: boolean; faultMode: FaultMode }> {
    const timeoutMs = injection.timeoutMs || 30000;
    
    this.logger.debug(`[FaultInjector] Applying TIMEOUT: ${timeoutMs}ms to ${injection.dependency}`);
    
    // Simulate timeout by waiting and then throwing
    await this.sleep(timeoutMs);
    throw new Error(`Timeout: ${injection.dependency} did not respond within ${timeoutMs}ms`);
  }

  /**
   * Error fault
   */
  private async applyError(
    statusCode: number,
    injection: ActiveInjection,
  ): Promise<{ result: null; faultApplied: boolean; faultMode: FaultMode }> {
    this.logger.debug(`[FaultInjector] Applying ERROR_${statusCode} to ${injection.dependency}`);
    
    const error = new Error(injection.errorMessage || `Service error: ${statusCode}`);
    (error as Error & { statusCode: number }).statusCode = statusCode;
    throw error;
  }

  /**
   * Invalid response fault
   */
  private async applyInvalidResponse(
    injection: ActiveInjection,
  ): Promise<{ result: null; faultApplied: boolean; faultMode: FaultMode }> {
    this.logger.debug(`[FaultInjector] Applying INVALID_RESPONSE to ${injection.dependency}`);
    
    // Return null to simulate invalid/unparseable response
    return { result: null, faultApplied: true, faultMode: 'INVALID_RESPONSE' };
  }

  /**
   * Partial data fault
   */
  private async applyPartialData<T>(
    originalFn: () => Promise<T>,
    injection: ActiveInjection,
  ): Promise<{ result: Partial<T>; faultApplied: boolean; faultMode: FaultMode }> {
    this.logger.debug(`[FaultInjector] Applying PARTIAL_DATA to ${injection.dependency}`);
    
    const result = await originalFn();
    
    // Remove some fields to simulate partial data
    if (result && typeof result === 'object') {
      const partial = { ...result } as Record<string, unknown>;
      const keys = Object.keys(partial);
      
      // Remove ~30% of fields
      const removeCount = Math.ceil(keys.length * 0.3);
      for (let i = 0; i < removeCount; i++) {
        const randomKey = keys[Math.floor(Math.random() * keys.length)];
        delete partial[randomKey];
      }
      
      return { result: partial as Partial<T>, faultApplied: true, faultMode: 'PARTIAL_DATA' };
    }
    
    return { result: result as Partial<T>, faultApplied: true, faultMode: 'PARTIAL_DATA' };
  }

  /**
   * Empty response fault
   */
  private async applyEmptyResponse(
    injection: ActiveInjection,
  ): Promise<{ result: null; faultApplied: boolean; faultMode: FaultMode }> {
    this.logger.debug(`[FaultInjector] Applying EMPTY_RESPONSE to ${injection.dependency}`);
    
    return { result: null, faultApplied: true, faultMode: 'EMPTY_RESPONSE' };
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Expired injection'ları temizle
   */
  private cleanupExpired(): void {
    const now = Date.now();
    
    for (const [id, injection] of this.activeInjections) {
      if (injection.expiresAt && new Date(injection.expiresAt).getTime() < now) {
        this.remove(id);
      }
    }
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Enabled durumunu kontrol et
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}
