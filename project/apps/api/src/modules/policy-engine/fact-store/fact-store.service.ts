import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ActionContext, Scope, getScopeChain } from '../types';
import {
  FactMap,
  FactValue,
  FactWriteMetadata,
  CacheEntry,
  buildFactKey,
} from './fact-store.types';

// ComputedMetrics type for backward compatibility
interface ComputedMetrics {
  daysSinceNotification?: number;
  totalDebtAmount?: number;
  collectedAmount?: number;
  collectionRate?: number;
  caseAgeDays?: number;
  riskScore?: number;
}

/**
 * CPE FactStore Service
 * 
 * Merkezi fact depolama ve sorgulama servisi.
 * IcrabotCaseFact ve IcrabotCaseFlag tablolarını kullanır.
 * 
 * Features:
 * - Scope-based fact resolution (ASSET → DEBTOR → CASE)
 * - In-memory cache with TTL
 * - Write-through cache strategy
 * - Computed fact support
 * 
 * @see docs/decision-point-inventory.md
 */
@Injectable()
export class FactStoreService {
  private readonly logger = new Logger(FactStoreService.name);
  
  /** In-memory cache: caseId -> FactMap */
  private cache = new Map<string, CacheEntry<FactMap>>();
  
  /** Cache TTL in milliseconds (default: 30 seconds) */
  private readonly cacheTtlMs = 30_000;

  constructor(private readonly prisma: PrismaService) {}

  // ============================================
  // PUBLIC API
  // ============================================

  /**
   * Dosya için tüm fact'leri döndürür.
   * Scope chain resolution uygular: ASSET → DEBTOR → CASE
   * 
   * @param caseId Dosya ID
   * @param context Opsiyonel context (debtorId, assetId)
   * @returns FactMap
   */
  async getFacts(caseId: string, context?: ActionContext): Promise<FactMap> {
    // Check cache first
    const cached = this.getFromCache(caseId);
    if (cached) {
      this.logger.debug(`Cache hit for case ${caseId}`);
      return this.filterFactsByContext(cached, context);
    }

    // Load from database
    const facts = await this.loadFactsFromDb(caseId);
    
    // Store in cache
    this.setCache(caseId, facts);
    
    return this.filterFactsByContext(facts, context);
  }

  /**
   * Belirli bir fact değerini döndürür.
   * 
   * @param caseId Dosya ID
   * @param factKey Fact key (e.g., "case.has_power_of_attorney")
   * @returns Fact value or null
   */
  async getFact(caseId: string, factKey: string): Promise<FactValue | null> {
    const facts = await this.getFacts(caseId);
    return facts.get(factKey) ?? null;
  }

  /**
   * Fact yazar (write-through cache).
   * 
   * @param caseId Dosya ID
   * @param factKey Fact key
   * @param value Fact value
   * @param metadata Write metadata
   */
  async writeFact(
    caseId: string,
    factKey: string,
    value: FactValue,
    metadata?: FactWriteMetadata,
  ): Promise<void> {
    await this.writeFactToDb(caseId, factKey, value, metadata);
    
    // Invalidate cache (write-through)
    this.invalidateCache(caseId);
    
    this.logger.debug(`Wrote fact ${factKey} for case ${caseId}`);
  }

  /**
   * Birden fazla fact yazar (batch).
   */
  async writeFacts(
    caseId: string,
    facts: Record<string, FactValue>,
    metadata?: FactWriteMetadata,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      for (const [key, value] of Object.entries(facts)) {
        await this.writeFactToDbTx(tx, caseId, key, value, metadata);
      }
    });
    
    this.invalidateCache(caseId);
    this.logger.debug(`Wrote ${Object.keys(facts).length} facts for case ${caseId}`);
  }

  /**
   * Cache'i invalidate eder.
   */
  invalidateCache(caseId: string): void {
    this.cache.delete(caseId);
    this.logger.debug(`Cache invalidated for case ${caseId}`);
  }

  /**
   * Computed metrics döndürür.
   */
  async getComputedMetrics(caseId: string, context?: ActionContext): Promise<ComputedMetrics> {
    const facts = await this.getFacts(caseId, context);
    
    // TODO: Implement computed fact providers
    // For now, return basic metrics from case data
    const caseData = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: {
        principalAmount: true,
        createdAt: true,
        riskScore: true,
        collections: {
          select: { amount: true },
        },
      },
    });

    if (!caseData) {
      return {};
    }

    const totalDebt = Number(caseData.principalAmount || 0);
    const collectedAmount = caseData.collections.reduce(
      (sum, c) => sum + Number(c.amount),
      0,
    );
    const caseAgeDays = Math.floor(
      (Date.now() - caseData.createdAt.getTime()) / (1000 * 60 * 60 * 24),
    );

    return {
      totalDebtAmount: totalDebt,
      collectedAmount,
      collectionRate: totalDebt > 0 ? collectedAmount / totalDebt : 0,
      caseAgeDays,
      riskScore: caseData.riskScore ?? undefined,
    };
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /**
   * Database'den fact'leri yükler.
   */
  private async loadFactsFromDb(caseId: string): Promise<FactMap> {
    const [caseFacts, caseFlags] = await Promise.all([
      (this.prisma as any).icrabotCaseFact.findMany({
        where: { caseId },
        select: { key: true, value: true },
      }),
      (this.prisma as any).icrabotCaseFlag.findMany({
        where: { caseId },
        select: { key: true, value: true },
      }),
    ]);

    const factMap: FactMap = new Map();

    // Add facts
    for (const fact of caseFacts as Array<{ key: string; value: unknown }>) {
      factMap.set(fact.key, fact.value as FactValue);
    }

    // Add flags (as boolean facts)
    for (const flag of caseFlags as Array<{ key: string; value: boolean }>) {
      factMap.set(flag.key, flag.value);
    }

    // Add case-level facts from Case table
    await this.addCaseLevelFacts(caseId, factMap);

    this.logger.debug(`Loaded ${factMap.size} facts for case ${caseId}`);
    return factMap;
  }

  /**
   * Case tablosundan temel fact'leri ekler.
   */
  private async addCaseLevelFacts(caseId: string, factMap: FactMap): Promise<void> {
    const caseData = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: {
        caseStatus: true,
        workflowStage: true,
        isAutoMode: true,
        isAutomationEnabled: true,
        allowUyapActions: true,
        hasArticle4Request: true,
        isMtsCase: true,
        type: true,
        subType: true,
        subCategory: true,
        currency: true,
        principalAmount: true,
        createdAt: true,
        nextActionAt: true,
      },
    });

    if (!caseData) return;

    // Map case fields to facts
    factMap.set('case.status', caseData.caseStatus);
    factMap.set('case.workflow_stage', caseData.workflowStage);
    factMap.set('case.is_auto_mode', caseData.isAutoMode);
    factMap.set('case.is_automation_enabled', caseData.isAutomationEnabled);
    factMap.set('case.allow_uyap_actions', caseData.allowUyapActions);
    factMap.set('case.has_article_4_request', caseData.hasArticle4Request);
    factMap.set('case.is_mts_case', caseData.isMtsCase);
    factMap.set('case.type', caseData.type);
    factMap.set('case.sub_type', caseData.subType);
    factMap.set('case.sub_category', caseData.subCategory);
    factMap.set('case.currency', caseData.currency);
    factMap.set('case.principal_amount', Number(caseData.principalAmount || 0));
    factMap.set('case.created_at', caseData.createdAt);
    factMap.set('case.next_action_at', caseData.nextActionAt);

    // Computed: is case closed?
    const closingStatuses = ['HITAM', 'INFAZ', 'MUVEKKILE_IADE', 'ACIZ', 'BATAK', 'MAHSUP', 'TEMLIK', 'AZIL', 'FERAGAT', 'SULH'];
    factMap.set('case.is_closed', closingStatuses.includes(caseData.caseStatus as string));
  }

  /**
   * Fact'i database'e yazar.
   */
  private async writeFactToDb(
    caseId: string,
    factKey: string,
    value: FactValue,
    metadata?: FactWriteMetadata,
  ): Promise<void> {
    // Determine if it's a flag (boolean) or fact
    const isFlag = typeof value === 'boolean';

    if (isFlag) {
      await (this.prisma as any).icrabotCaseFlag.upsert({
        where: { caseId_key: { caseId, key: factKey } },
        create: { caseId, key: factKey, value: value as boolean },
        update: { value: value as boolean },
      });
    } else {
      await (this.prisma as any).icrabotCaseFact.upsert({
        where: { caseId_key: { caseId, key: factKey } },
        create: { caseId, key: factKey, value },
        update: { value },
      });
    }

    // Audit log
    if (metadata) {
      await (this.prisma as any).icrabotFactAudit.create({
        data: {
          caseId,
          key: factKey,
          oldValue: null, // TODO: Get old value
          newValue: value,
          kind: isFlag ? 'flag' : 'fact',
          meta: metadata,
        },
      });
    }
  }

  /**
   * Transaction içinde fact yazar.
   */
  private async writeFactToDbTx(
    tx: any,
    caseId: string,
    factKey: string,
    value: FactValue,
    metadata?: FactWriteMetadata,
  ): Promise<void> {
    const isFlag = typeof value === 'boolean';

    if (isFlag) {
      await tx.icrabotCaseFlag.upsert({
        where: { caseId_key: { caseId, key: factKey } },
        create: { caseId, key: factKey, value: value as boolean },
        update: { value: value as boolean },
      });
    } else {
      await tx.icrabotCaseFact.upsert({
        where: { caseId_key: { caseId, key: factKey } },
        create: { caseId, key: factKey, value },
        update: { value },
      });
    }

    if (metadata) {
      await tx.icrabotFactAudit.create({
        data: {
          caseId,
          key: factKey,
          oldValue: null,
          newValue: value,
          kind: isFlag ? 'flag' : 'fact',
          meta: metadata,
        },
      });
    }
  }

  /**
   * Context'e göre fact'leri filtreler.
   * Scope chain resolution: ASSET → DEBTOR → CASE
   */
  private filterFactsByContext(facts: FactMap, context?: ActionContext): FactMap {
    if (!context) {
      return facts;
    }

    const filtered: FactMap = new Map();

    for (const [key, value] of facts) {
      // Always include case-level facts
      if (key.startsWith('case.')) {
        filtered.set(key, value);
        continue;
      }

      // Include debtor facts if debtorId matches
      if (context.debtorId && key.startsWith(`debtor.${context.debtorId}.`)) {
        filtered.set(key, value);
        continue;
      }

      // Include asset facts if assetId matches
      if (context.assetId && key.startsWith(`asset.${context.assetId}.`)) {
        filtered.set(key, value);
        continue;
      }

      // Include expense facts if expenseId matches
      if (context.expenseId && key.startsWith(`expense.${context.expenseId}.`)) {
        filtered.set(key, value);
        continue;
      }
    }

    return filtered;
  }

  /**
   * Scope chain resolution ile fact arar.
   * ASSET scope'unda aranan fact bulunamazsa DEBTOR, sonra CASE scope'una bakar.
   * 
   * @param caseId Dosya ID
   * @param factKey Fact key (scope prefix'siz, örn: "has_valid_address")
   * @param context Context (scope belirleme için)
   * @returns Fact value veya null
   */
  async getFactWithScopeChain(
    caseId: string,
    factKey: string,
    context?: ActionContext,
  ): Promise<{ value: FactValue | null; resolvedScope: Scope; resolvedKey: string }> {
    const facts = await this.getFacts(caseId);
    const scopeChain = this.getScopeChainForContext(context);

    for (const scope of scopeChain) {
      const fullKey = this.buildScopedKey(scope, factKey, context);
      
      if (facts.has(fullKey)) {
        return {
          value: facts.get(fullKey) ?? null,
          resolvedScope: scope,
          resolvedKey: fullKey,
        };
      }
    }

    return { value: null, resolvedScope: Scope.CASE, resolvedKey: `case.${factKey}` };
  }

  /**
   * Context'e göre scope chain döndürür.
   * ASSET → DEBTOR → CASE
   */
  private getScopeChainForContext(context?: ActionContext): Scope[] {
    if (context?.assetId) {
      return [Scope.ASSET, Scope.DEBTOR, Scope.CASE];
    }
    if (context?.debtorId) {
      return [Scope.DEBTOR, Scope.CASE];
    }
    if (context?.expenseId) {
      return [Scope.EXPENSE, Scope.CASE];
    }
    return [Scope.CASE];
  }

  /**
   * Scope'a göre tam fact key oluşturur.
   */
  private buildScopedKey(scope: Scope, factKey: string, context?: ActionContext): string {
    switch (scope) {
      case Scope.ASSET:
        return context?.assetId ? `asset.${context.assetId}.${factKey}` : `asset.${factKey}`;
      case Scope.DEBTOR:
        return context?.debtorId ? `debtor.${context.debtorId}.${factKey}` : `debtor.${factKey}`;
      case Scope.EXPENSE:
        return context?.expenseId ? `expense.${context.expenseId}.${factKey}` : `expense.${factKey}`;
      case Scope.CASE:
      default:
        return `case.${factKey}`;
    }
  }

  /**
   * Birden fazla fact'i scope chain ile arar.
   */
  async getFactsWithScopeChain(
    caseId: string,
    factKeys: string[],
    context?: ActionContext,
  ): Promise<Map<string, { value: FactValue | null; resolvedScope: Scope }>> {
    const results = new Map<string, { value: FactValue | null; resolvedScope: Scope }>();

    for (const key of factKeys) {
      const result = await this.getFactWithScopeChain(caseId, key, context);
      results.set(key, { value: result.value, resolvedScope: result.resolvedScope });
    }

    return results;
  }

  // ============================================
  // CACHE METHODS
  // ============================================

  private getFromCache(caseId: string): FactMap | null {
    const entry = this.cache.get(caseId);
    if (!entry) return null;
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(caseId);
      return null;
    }
    
    return entry.value;
  }

  private setCache(caseId: string, facts: FactMap): void {
    this.cache.set(caseId, {
      value: facts,
      expiresAt: Date.now() + this.cacheTtlMs,
    });
  }

  /**
   * Tüm cache'i temizler (test için).
   */
  clearAllCache(): void {
    this.cache.clear();
  }
}
