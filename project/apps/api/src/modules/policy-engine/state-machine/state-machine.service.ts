/**
 * StateMachine Service
 * 
 * State transition yönetimi ve validasyonu.
 * Pre-compiled state flows kullanır (runtime'da YAML parse etmez).
 * 
 * @see design.md - Section 4: StateMachine
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ActionCode } from '../types/action-code.enum';
import { Scope } from '../types/scope.enum';
import { ActionContext } from '../types/policy-decision.interface';
import {
  IcraType,
  TransitionResult,
  ApplyTransitionResult,
  StageDefinition,
  CompiledStateFlow,
} from './state-machine.types';
import { StateInfo } from '../types/policy-decision.interface';
import {
  COMPILED_STATE_FLOWS,
  DEFAULT_STATE_FLOW,
  RULE_VERSION,
  getStateFlow,
  isTerminalStage,
} from './compiled/state-flows.compiled';

@Injectable()
export class StateMachineService {
  private readonly logger = new Logger(StateMachineService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Rule version'ı döndürür (logging için)
   */
  getRuleVersion(): string {
    return RULE_VERSION;
  }

  /**
   * Mevcut state bilgisini getirir.
   * 
   * @param caseId Dosya ID
   * @param context Opsiyonel context (debtorId, assetId)
   * @returns StateInfo
   */
  async getCurrentState(caseId: string, context?: ActionContext): Promise<StateInfo> {
    const caseData = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: {
        id: true,
        workflowStage: true,
        type: true,
        subType: true,
        // Version için updatedAt kullanıyoruz (optimistic locking)
        updatedAt: true,
      },
    });

    if (!caseData) {
      throw new Error(`Case not found: ${caseId}`);
    }

    // Scope belirleme
    const scope = this.getScopeFromContext(context);
    const contextId = context?.debtorId || context?.assetId || context?.expenseId;

    // Version: updatedAt timestamp'ini number'a çevir
    const version = caseData.updatedAt.getTime();

    return {
      scope,
      currentState: caseData.workflowStage,
      contextId,
      version,
    };
  }

  /**
   * Bir transition'ın geçerli olup olmadığını kontrol eder.
   * 
   * @param currentState Mevcut state
   * @param actionCode Yapılmak istenen aksiyon
   * @param icraType Opsiyonel icra türü (yoksa default kullanılır)
   * @returns TransitionResult
   */
  canTransition(
    currentState: StateInfo,
    actionCode: ActionCode,
    icraType?: IcraType,
  ): TransitionResult {
    const flow = icraType ? getStateFlow(icraType) : DEFAULT_STATE_FLOW;
    const stageCode = currentState.currentState;

    // Stage var mı kontrol et
    const stage = flow.stages.get(stageCode);
    if (!stage) {
      return {
        allowed: false,
        reason: `Geçersiz aşama: ${stageCode}`,
      };
    }

    // Terminal stage kontrolü
    if (stage.isTerminal && actionCode !== ActionCode.REOPEN_CASE) {
      return {
        allowed: false,
        reason: `Dosya kapalı. Sadece yeniden açma işlemi yapılabilir.`,
      };
    }

    // Transition var mı kontrol et
    const stageTransitions = flow.transitions.get(stageCode);
    if (!stageTransitions) {
      return {
        allowed: false,
        reason: `Bu aşamadan transition tanımlı değil: ${stageCode}`,
      };
    }

    const targetState = stageTransitions.get(actionCode);
    if (!targetState) {
      // Aksiyon bu aşamada izinli mi kontrol et (state değiştirmeyen aksiyonlar)
      if (stage.allowedActions.includes(actionCode)) {
        return {
          allowed: true,
          reason: 'OK - State değişikliği yok',
          targetState: stageCode, // Aynı state'te kal
        };
      }

      return {
        allowed: false,
        reason: `Bu aşamada ${actionCode} aksiyonu yapılamaz.`,
      };
    }

    return {
      allowed: true,
      reason: 'OK',
      targetState,
    };
  }

  /**
   * State transition uygular (optimistic locking ile).
   * 
   * @param caseId Dosya ID
   * @param actionCode Aksiyon kodu
   * @param context Opsiyonel context
   * @param expectedVersion Beklenen version (CAS check)
   * @returns ApplyTransitionResult
   */
  async applyTransition(
    caseId: string,
    actionCode: ActionCode,
    context?: ActionContext,
    expectedVersion?: number,
  ): Promise<ApplyTransitionResult> {
    try {
      // Mevcut state'i al
      const currentState = await this.getCurrentState(caseId, context);
      
      // İcra türünü al
      const caseData = await this.prisma.case.findUnique({
        where: { id: caseId },
        select: { type: true, subType: true },
      });
      
      const icraType = this.mapCaseTypeToIcraType(caseData?.type, caseData?.subType ?? undefined);

      // Transition kontrolü
      const transitionResult = this.canTransition(currentState, actionCode, icraType);
      if (!transitionResult.allowed) {
        return {
          success: false,
          code: 'INVALID_TRANSITION',
          errorMessage: transitionResult.reason,
          previousState: currentState.currentState,
        };
      }

      // State değişikliği yoksa başarılı dön
      if (transitionResult.targetState === currentState.currentState) {
        return {
          success: true,
          code: 'OK',
          newVersion: currentState.version,
          previousState: currentState.currentState,
          newState: currentState.currentState,
        };
      }

      // Optimistic locking: expectedVersion kontrolü
      if (expectedVersion !== undefined && expectedVersion !== currentState.version) {
        this.logger.warn(
          `Version mismatch for case ${caseId}: expected ${expectedVersion}, got ${currentState.version}`,
        );
        return {
          success: false,
          code: 'VERSION_MISMATCH',
          errorMessage: 'Dosya başka bir işlem tarafından güncellendi. Lütfen tekrar deneyin.',
          previousState: currentState.currentState,
        };
      }

      // State güncelle
      const updated = await this.prisma.case.update({
        where: { id: caseId },
        data: {
          workflowStage: transitionResult.targetState as any,
          updatedAt: new Date(),
        },
        select: {
          workflowStage: true,
          updatedAt: true,
        },
      });

      // Stage history kaydı
      await this.recordStageHistory(caseId, currentState.currentState, transitionResult.targetState!);

      this.logger.log(
        `State transition: ${caseId} ${currentState.currentState} → ${transitionResult.targetState} (${actionCode})`,
      );

      return {
        success: true,
        code: 'OK',
        newVersion: updated.updatedAt.getTime(),
        previousState: currentState.currentState,
        newState: transitionResult.targetState,
      };

    } catch (error) {
      this.logger.error(`Error applying transition for case ${caseId}:`, error);
      return {
        success: false,
        code: 'ERROR',
        errorMessage: (error as Error).message,
      };
    }
  }

  /**
   * Bir aşamada izin verilen aksiyonları döndürür.
   */
  getAllowedActions(stageCode: string, icraType?: IcraType): ActionCode[] {
    const flow = icraType ? getStateFlow(icraType) : DEFAULT_STATE_FLOW;
    const stage = flow.stages.get(stageCode);
    return stage?.allowedActions || [];
  }

  /**
   * Bir aşamanın terminal olup olmadığını kontrol eder.
   */
  isTerminal(stageCode: string, icraType?: IcraType): boolean {
    return isTerminalStage(icraType || IcraType.ILAMSIZ_GENEL, stageCode);
  }

  /**
   * Tüm aşamaları döndürür.
   */
  getAllStages(icraType?: IcraType): StageDefinition[] {
    const flow = icraType ? getStateFlow(icraType) : DEFAULT_STATE_FLOW;
    return Array.from(flow.stages.values());
  }

  /**
   * Bir aşamadan geçilebilecek hedef aşamaları döndürür.
   */
  getPossibleTransitions(stageCode: string, icraType?: IcraType): Map<ActionCode, string> {
    const flow = icraType ? getStateFlow(icraType) : DEFAULT_STATE_FLOW;
    return flow.transitions.get(stageCode) || new Map();
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private getScopeFromContext(context?: ActionContext): Scope {
    if (context?.assetId) return Scope.ASSET;
    if (context?.debtorId) return Scope.DEBTOR;
    if (context?.expenseId) return Scope.EXPENSE;
    return Scope.CASE;
  }

  private mapCaseTypeToIcraType(caseType?: string, subType?: string): IcraType {
    // CaseType enum'dan IcraType'a mapping
    if (caseType === 'ILAMSIZ') {
      if (subType === 'KAMBIYO') return IcraType.ILAMSIZ_KAMBIYO;
      return IcraType.ILAMSIZ_GENEL;
    }
    if (caseType === 'ILAMLI') return IcraType.ILAMLI;
    if (caseType === 'NAFAKA') return IcraType.NAFAKA;
    if (caseType === 'KIRA') return IcraType.KIRA;
    if (caseType === 'REHIN') return IcraType.REHIN;
    if (caseType === 'IFLAS') return IcraType.IFLAS;
    
    return IcraType.ILAMSIZ_GENEL; // Default
  }

  private async recordStageHistory(
    caseId: string,
    fromStage: string,
    toStage: string,
  ): Promise<void> {
    try {
      // Önceki aşamayı kapat
      await this.prisma.caseStageHistory.updateMany({
        where: {
          caseId,
          endedAt: null,
        },
        data: {
          endedAt: new Date(),
        },
      });

      // Yeni aşama kaydı oluştur
      // Not: asamaId için lookup tablosundan ID almak gerekir
      // Şimdilik sadece log tutuyoruz
      this.logger.debug(`Stage history: ${caseId} ${fromStage} → ${toStage}`);

    } catch (error) {
      // Stage history hatası kritik değil, sadece logla
      this.logger.warn(`Failed to record stage history: ${error}`);
    }
  }
}
