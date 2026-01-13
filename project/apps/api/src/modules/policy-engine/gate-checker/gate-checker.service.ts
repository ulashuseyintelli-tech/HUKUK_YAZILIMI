/**
 * GateChecker Service
 * 
 * Gate kontrollerini yapar. HARD gate'ler bloklar, SOFT gate'ler uyarır.
 * Pre-compiled gate definitions kullanır.
 * 
 * @see design.md - Section 5: GateChecker
 */

import { Injectable, Logger } from '@nestjs/common';
import { ActionCode } from '../types/action-code.enum';
import { ActionContext } from '../types/policy-decision.interface';
import { FactMap } from '../fact-store';
import {
  GateResult,
  GateWarning,
  CompiledGate,
} from './gate-checker.types';
import {
  COMPILED_GATES,
  getGatesForAction,
  getHardGatesForAction,
  getSoftGatesForAction,
} from './compiled/gates.compiled';

@Injectable()
export class GateCheckerService {
  private readonly logger = new Logger(GateCheckerService.name);

  /**
   * Tüm gate'leri kontrol eder.
   * 
   * @param caseId Dosya ID
   * @param actionCode Aksiyon kodu
   * @param facts Fact map
   * @param context Opsiyonel context
   * @returns GateResult
   */
  async checkGates(
    caseId: string,
    actionCode: ActionCode,
    facts: FactMap,
    context?: ActionContext,
  ): Promise<GateResult> {
    const factsUsed: string[] = [];
    const softWarnings: GateWarning[] = [];

    // Bu aksiyon için geçerli gate'leri al (priority sırasına göre)
    const gates = getGatesForAction(actionCode);

    this.logger.debug(
      `Checking ${gates.length} gates for ${actionCode} on case ${caseId}`,
    );

    for (const gate of gates) {
      try {
        // Gate condition'ı değerlendir
        const triggered = gate.condition(facts, context);

        if (triggered) {
          // Kullanılan fact'leri topla
          this.collectUsedFacts(gate, facts, context, factsUsed);

          if (gate.severity === 'HARD') {
            // HARD gate tetiklendi - blokla
            this.logger.debug(
              `HARD gate ${gate.gateCode} triggered for ${actionCode} on case ${caseId}`,
            );

            return {
              blocked: true,
              gateCode: gate.gateCode,
              reason: gate.reason,
              severity: 'HARD',
              factsUsed: [...new Set(factsUsed)],
            };
          } else {
            // SOFT gate tetiklendi - uyarı ekle
            this.logger.debug(
              `SOFT gate ${gate.gateCode} triggered for ${actionCode} on case ${caseId}`,
            );

            softWarnings.push({
              code: gate.gateCode,
              message: gate.reason,
              severity: 'WARNING',
            });
          }
        }
      } catch (error) {
        // Gate evaluation hatası - loglayıp devam et
        this.logger.error(
          `Error evaluating gate ${gate.gateCode} for ${actionCode}:`,
          error,
        );
        // Hata durumunda güvenli tarafta kal - HARD gate'ler için blokla
        if (gate.severity === 'HARD') {
          return {
            blocked: true,
            gateCode: gate.gateCode,
            reason: `Gate kontrolü sırasında hata: ${gate.name}`,
            severity: 'HARD',
            factsUsed,
          };
        }
      }
    }

    // Hiçbir HARD gate tetiklenmedi
    return {
      blocked: false,
      reason: 'OK',
      factsUsed: [...new Set(factsUsed)],
      softWarnings: softWarnings.length > 0 ? softWarnings : undefined,
    };
  }

  /**
   * Sadece HARD gate'leri kontrol eder (hızlı kontrol için).
   */
  async checkHardGates(
    caseId: string,
    actionCode: ActionCode,
    facts: FactMap,
    context?: ActionContext,
  ): Promise<GateResult> {
    const factsUsed: string[] = [];
    const hardGates = getHardGatesForAction(actionCode);

    for (const gate of hardGates) {
      try {
        const triggered = gate.condition(facts, context);

        if (triggered) {
          this.collectUsedFacts(gate, facts, context, factsUsed);

          return {
            blocked: true,
            gateCode: gate.gateCode,
            reason: gate.reason,
            severity: 'HARD',
            factsUsed: [...new Set(factsUsed)],
          };
        }
      } catch (error) {
        this.logger.error(`Error in hard gate ${gate.gateCode}:`, error);
        return {
          blocked: true,
          gateCode: gate.gateCode,
          reason: `Gate kontrolü sırasında hata: ${gate.name}`,
          severity: 'HARD',
          factsUsed,
        };
      }
    }

    return {
      blocked: false,
      reason: 'OK',
      factsUsed: [...new Set(factsUsed)],
    };
  }

  /**
   * Sadece SOFT gate'leri kontrol eder (uyarı toplamak için).
   */
  async checkSoftGates(
    caseId: string,
    actionCode: ActionCode,
    facts: FactMap,
    context?: ActionContext,
  ): Promise<GateWarning[]> {
    const warnings: GateWarning[] = [];
    const softGates = getSoftGatesForAction(actionCode);

    for (const gate of softGates) {
      try {
        const triggered = gate.condition(facts, context);

        if (triggered) {
          warnings.push({
            code: gate.gateCode,
            message: gate.reason,
            severity: 'WARNING',
          });
        }
      } catch (error) {
        this.logger.warn(`Error in soft gate ${gate.gateCode}:`, error);
        // Soft gate hatası kritik değil, devam et
      }
    }

    return warnings;
  }

  /**
   * Belirli bir gate'in tetiklenip tetiklenmediğini kontrol eder.
   */
  isGateTriggered(
    gateCode: string,
    facts: FactMap,
    context?: ActionContext,
  ): boolean {
    const gate = COMPILED_GATES.find(g => g.gateCode === gateCode);
    if (!gate) {
      this.logger.warn(`Unknown gate code: ${gateCode}`);
      return false;
    }

    try {
      return gate.condition(facts, context);
    } catch (error) {
      this.logger.error(`Error checking gate ${gateCode}:`, error);
      return gate.severity === 'HARD'; // Hata durumunda HARD gate'ler için true
    }
  }

  /**
   * Tüm gate tanımlarını döndürür.
   */
  getAllGates(): CompiledGate[] {
    return [...COMPILED_GATES];
  }

  /**
   * Bir aksiyon için geçerli gate'leri döndürür.
   */
  getGatesForAction(actionCode: ActionCode): CompiledGate[] {
    return getGatesForAction(actionCode);
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  /**
   * Gate'in kullandığı fact key'lerini toplar.
   */
  private collectUsedFacts(
    gate: CompiledGate,
    facts: FactMap,
    context: ActionContext | undefined,
    factsUsed: string[],
  ): void {
    // Gate'in kontrol ettiği fact key'lerini tahmin et
    // Bu basit bir heuristic - gerçek implementasyonda
    // gate condition'dan extract edilebilir

    const commonFactKeys = [
      'case.is_closed',
      'case.is_archived',
      'case.has_unpaid_blocking_expense',
      'case.allow_uyap_actions',
      'case.has_article_4_request',
      'case.has_power_of_attorney',
      'case.is_automation_enabled',
      'case.total_debt_amount',
      'case.debtor_count',
      'case.has_pending_expense_request',
    ];

    // Context-specific keys
    if (context?.debtorId) {
      commonFactKeys.push(
        `debtor.${context.debtorId}.has_valid_address`,
        `debtor.${context.debtorId}.notification_delivered`,
        `debtor.${context.debtorId}.days_since_notification`,
        `debtor.${context.debtorId}.risk_level`,
      );
    }

    if (context?.assetId) {
      commonFactKeys.push(`asset.${context.assetId}.haciz_applied`);
    }

    // Var olan fact'leri ekle
    for (const key of commonFactKeys) {
      if (facts.has(key)) {
        factsUsed.push(key);
      }
    }
  }
}
