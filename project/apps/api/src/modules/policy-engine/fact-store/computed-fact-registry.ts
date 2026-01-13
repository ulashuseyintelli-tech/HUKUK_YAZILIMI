import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ActionContext } from '../types';
import { FactMap, FactValue } from './fact-store.types';
import { ComputedFactProvider, ProviderMetadata } from './computed-fact-provider.interface';

/**
 * ComputedFactRegistry
 * 
 * Computed fact provider'ları yönetir.
 * - Topological sort ile bağımlılık sırası
 * - Cycle detection
 * - Lazy computation
 */
@Injectable()
export class ComputedFactRegistry implements OnModuleInit {
  private readonly logger = new Logger(ComputedFactRegistry.name);
  
  /** Registered providers */
  private providers = new Map<string, ProviderMetadata>();
  
  /** Computed order (topologically sorted) */
  private computeOrder: string[] = [];

  onModuleInit() {
    // Register built-in providers
    this.registerBuiltInProviders();
  }

  /**
   * Provider kaydeder.
   * Cycle detection yapar.
   */
  register(provider: ComputedFactProvider): void {
    if (this.providers.has(provider.factKey)) {
      this.logger.warn(`Provider for ${provider.factKey} already registered, overwriting`);
    }

    this.providers.set(provider.factKey, {
      provider,
      order: 0, // Will be computed
    });

    // Recompute order
    this.recomputeOrder();
    
    this.logger.debug(`Registered provider for ${provider.factKey}`);
  }

  /**
   * Tüm computed fact'leri hesaplar.
   */
  async computeAll(
    caseId: string,
    context?: ActionContext,
    baseFacts?: FactMap,
  ): Promise<FactMap> {
    const facts = new Map(baseFacts);

    for (const factKey of this.computeOrder) {
      const metadata = this.providers.get(factKey);
      if (!metadata) continue;

      try {
        const value = await metadata.provider.compute(caseId, context, facts);
        facts.set(factKey, value);
      } catch (error) {
        this.logger.error(`Error computing ${factKey}:`, error);
        // Continue with other providers
      }
    }

    return facts;
  }

  /**
   * Belirli bir fact'i hesaplar.
   */
  async compute(
    factKey: string,
    caseId: string,
    context?: ActionContext,
    facts?: FactMap,
  ): Promise<FactValue | null> {
    const metadata = this.providers.get(factKey);
    if (!metadata) {
      return null;
    }

    return metadata.provider.compute(caseId, context, facts);
  }

  /**
   * Provider var mı kontrol eder.
   */
  hasProvider(factKey: string): boolean {
    return this.providers.has(factKey);
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /**
   * Topological sort ile hesaplama sırasını belirler.
   * Cycle detection yapar.
   */
  private recomputeOrder(): void {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const order: string[] = [];

    const visit = (factKey: string): void => {
      if (visited.has(factKey)) return;
      
      if (visiting.has(factKey)) {
        throw new Error(`Circular dependency detected: ${factKey}`);
      }

      visiting.add(factKey);

      const metadata = this.providers.get(factKey);
      if (metadata) {
        for (const dep of metadata.provider.dependsOn) {
          // Only visit if we have a provider for this dependency
          if (this.providers.has(dep)) {
            visit(dep);
          }
        }
      }

      visiting.delete(factKey);
      visited.add(factKey);
      order.push(factKey);
    };

    try {
      for (const factKey of this.providers.keys()) {
        visit(factKey);
      }
      this.computeOrder = order;
      
      // Update order numbers
      order.forEach((key, index) => {
        const metadata = this.providers.get(key);
        if (metadata) {
          metadata.order = index;
        }
      });
      
      this.logger.debug(`Compute order: ${order.join(' -> ')}`);
    } catch (error) {
      this.logger.error('Failed to compute order:', error);
      throw error;
    }
  }

  /**
   * Built-in provider'ları kaydeder.
   */
  private registerBuiltInProviders(): void {
    // Days since notification
    this.register(new DaysSinceNotificationProvider());
    
    // Has valid address
    this.register(new HasValidAddressProvider());
    
    // Has unpaid blocking expense
    this.register(new HasUnpaidBlockingExpenseProvider());
    
    this.logger.log(`Registered ${this.providers.size} built-in providers`);
  }
}

// ============================================
// BUILT-IN PROVIDERS
// ============================================

/**
 * Tebligattan bu yana geçen gün sayısı
 */
class DaysSinceNotificationProvider implements ComputedFactProvider {
  readonly factKey = 'debtor.*.days_since_notification';
  readonly dependsOn = ['debtor.*.notification_date'];

  async compute(
    caseId: string,
    context?: ActionContext,
    facts?: FactMap,
  ): Promise<number> {
    if (!context?.debtorId) return -1;

    const notificationDate = facts?.get(`debtor.${context.debtorId}.notification_date`);
    if (!notificationDate) return -1;

    const date = notificationDate instanceof Date 
      ? notificationDate 
      : new Date(notificationDate as string);
    
    const days = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
    return days;
  }
}

/**
 * Geçerli adres var mı
 */
class HasValidAddressProvider implements ComputedFactProvider {
  readonly factKey = 'debtor.*.has_valid_address';
  readonly dependsOn: string[] = [];

  async compute(
    caseId: string,
    context?: ActionContext,
    facts?: FactMap,
  ): Promise<boolean> {
    if (!context?.debtorId) return false;

    // Check if debtor has any address
    const addressCount = facts?.get(`debtor.${context.debtorId}.address_count`);
    return typeof addressCount === 'number' && addressCount > 0;
  }
}

/**
 * Ödenmemiş blocking masraf var mı
 */
class HasUnpaidBlockingExpenseProvider implements ComputedFactProvider {
  readonly factKey = 'case.has_unpaid_blocking_expense';
  readonly dependsOn: string[] = [];

  async compute(
    caseId: string,
    context?: ActionContext,
    facts?: FactMap,
  ): Promise<boolean> {
    // This will be computed from ExpenseRequest table
    // For now, check if there's a flag
    return facts?.get('case.expense_gate_blocked') === true;
  }
}
