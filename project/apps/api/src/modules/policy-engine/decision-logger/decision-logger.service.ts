import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import {
  ActionCode,
  Scope,
  PolicyDecision,
  ActionContext,
  StateInfo,
} from '../types';
import { FactMap } from '../fact-store';

/**
 * DecisionLogger Service
 * 
 * Her CPE kararını loglar.
 * KVKK uyumlu: Fact değerleri değil, sadece key'ler loglanır.
 * 
 * @see docs/high-risk-action-matrix.md
 */

/**
 * PII (Kişisel Veri) pattern'leri
 */
const PII_PATTERNS = {
  TC_KIMLIK: /\b\d{11}\b/g,
  PHONE: /\b(0?\d{3}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}|\+90\d{10})\b/g,
  EMAIL: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi,
  IBAN: /\bTR\d{2}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{2}\b/gi,
};

/**
 * Sensitive field names that should be masked
 */
const SENSITIVE_FIELDS = [
  'tcKimlik', 'tc_kimlik', 'kimlikNo', 'identityNo',
  'telefon', 'phone', 'tel', 'gsm', 'mobile',
  'email', 'eposta', 'e_posta',
  'adres', 'address', 'addr',
  'iban', 'hesapNo', 'accountNo',
  'password', 'sifre', 'parola',
];

/**
 * Log input interface
 */
export interface DecisionLogInput {
  caseId: string;
  actionCode: ActionCode;
  scope: Scope;
  context: ActionContext | undefined;
  allowed: boolean;
  code: string;
  reason?: string;
  blockedBy?: { gateCode: string; severity: string };
  warnings?: string[];
  factsUsed: FactMap | Record<string, unknown>;
  state?: StateInfo;
  traceId?: string;
  ruleVersion?: string;
}

@Injectable()
export class DecisionLoggerService {
  private readonly logger = new Logger(DecisionLoggerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Karar loglar.
   * 
   * Overload 1: Object parameter
   */
  async log(input: DecisionLogInput): Promise<string>;
  
  /**
   * Karar loglar.
   * 
   * Overload 2: Individual parameters (legacy)
   */
  async log(
    caseId: string,
    actionCode: ActionCode,
    context: ActionContext | undefined,
    decision: PolicyDecision,
    facts: FactMap,
    state: StateInfo | undefined,
    traceId: string,
    ruleVersion: string,
  ): Promise<string>;

  /**
   * Implementation
   */
  async log(
    inputOrCaseId: DecisionLogInput | string,
    actionCode?: ActionCode,
    context?: ActionContext | undefined,
    decision?: PolicyDecision,
    facts?: FactMap,
    state?: StateInfo | undefined,
    traceId?: string,
    ruleVersion?: string,
  ): Promise<string> {
    // Handle object parameter
    if (typeof inputOrCaseId === 'object') {
      const input = inputOrCaseId;
      const factsMap: FactMap = input.factsUsed instanceof Map 
        ? input.factsUsed as FactMap
        : new Map(Object.entries(input.factsUsed)) as FactMap;
      
      return this.logInternal(
        input.caseId,
        input.actionCode,
        input.context,
        {
          allowed: input.allowed,
          code: input.code,
          reason: input.reason,
          blockedBy: input.blockedBy,
          warnings: input.warnings,
        } as PolicyDecision,
        factsMap,
        input.state,
        input.traceId || this.generateTraceId(),
        input.ruleVersion || 'unknown',
      );
    }

    // Handle individual parameters
    return this.logInternal(
      inputOrCaseId,
      actionCode!,
      context,
      decision!,
      facts!,
      state,
      traceId!,
      ruleVersion!,
    );
  }

  /**
   * Internal log implementation
   */
  private async logInternal(
    caseId: string,
    actionCode: ActionCode,
    context: ActionContext | undefined,
    decision: PolicyDecision,
    facts: FactMap,
    state: StateInfo | undefined,
    traceId: string,
    ruleVersion: string,
  ): Promise<string> {
    // Extract fact keys only (no values for KVKK)
    const factsUsedKeys = this.sanitizeFactKeys(Array.from(facts.keys()));
    
    // Create facts snapshot hash for debugging
    const factsSnapshotHash = this.createFactsHash(facts);

    const log = await this.prisma.cpeDecisionLog.create({
      data: {
        caseId,
        actionCode,
        scope: this.getScopeFromContext(context),
        contextJson: context ? (this.sanitizeContext(context) as Prisma.InputJsonValue) : Prisma.JsonNull,
        allowed: decision.allowed,
        code: decision.code,
        reason: decision.reason,
        factsUsedKeys,
        factsSnapshotHash,
        stateSnapshot: state ? ({
          scope: state.scope,
          currentState: state.currentState,
          contextId: state.contextId,
          version: state.version,
        } as Prisma.InputJsonValue) : Prisma.JsonNull,
        gateCode: decision.blockedBy?.gateCode,
        gateSeverity: decision.blockedBy?.severity,
        warnings: decision.warnings ? (decision.warnings as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        traceId,
        ruleVersion,
      },
    });

    this.logger.debug(
      `Decision logged: ${log.id} - ${actionCode} ${decision.allowed ? 'ALLOWED' : 'DENIED'} for case ${caseId}`,
    );

    return log.id;
  }

  /**
   * Belirli bir dosya için karar geçmişini döndürür.
   */
  async getDecisionHistory(
    caseId: string,
    options?: {
      actionCode?: ActionCode;
      limit?: number;
      offset?: number;
    },
  ): Promise<any[]> {
    return this.prisma.cpeDecisionLog.findMany({
      where: {
        caseId,
        ...(options?.actionCode && { actionCode: options.actionCode }),
      },
      orderBy: { createdAt: 'desc' },
      take: options?.limit ?? 100,
      skip: options?.offset ?? 0,
    });
  }

  /**
   * Belirli bir karar detayını döndürür.
   */
  async getDecision(decisionId: string): Promise<any | null> {
    return this.prisma.cpeDecisionLog.findUnique({
      where: { id: decisionId },
    });
  }

  /**
   * Trace ID ile kararları bulur.
   */
  async getDecisionsByTraceId(traceId: string): Promise<any[]> {
    return this.prisma.cpeDecisionLog.findMany({
      where: { traceId },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /**
   * Context'ten scope belirler.
   */
  private getScopeFromContext(context?: ActionContext): string {
    if (context?.assetId) return Scope.ASSET;
    if (context?.debtorId) return Scope.DEBTOR;
    if (context?.expenseId) return Scope.EXPENSE;
    return Scope.CASE;
  }

  /**
   * Context'i sanitize eder (PII temizliği).
   */
  private sanitizeContext(context: ActionContext): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(context)) {
      // Check if field is sensitive
      if (SENSITIVE_FIELDS.some(f => key.toLowerCase().includes(f.toLowerCase()))) {
        sanitized[key] = '[MASKED]';
        continue;
      }
      
      // Check if value contains PII patterns
      if (typeof value === 'string') {
        let sanitizedValue = value;
        for (const pattern of Object.values(PII_PATTERNS)) {
          sanitizedValue = sanitizedValue.replace(pattern, '[MASKED]');
        }
        sanitized[key] = sanitizedValue;
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }

  /**
   * Fact key'lerini sanitize eder (TC Kimlik No gibi PII içerebilir).
   */
  private sanitizeFactKeys(keys: string[]): string[] {
    return keys.map(key => {
      // Replace TC Kimlik No patterns in keys
      return key.replace(PII_PATTERNS.TC_KIMLIK, '[ID]');
    });
  }

  /**
   * Trace ID oluşturur.
   */
  private generateTraceId(): string {
    return `trace-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Facts için hash oluşturur (debugging için).
   */
  private createFactsHash(facts: FactMap): string {
    const sortedKeys = Array.from(facts.keys()).sort();
    const content = sortedKeys.map(k => `${k}:${JSON.stringify(facts.get(k))}`).join('|');
    return createHash('sha256').update(content).digest('hex').substring(0, 16);
  }
}
