import { Injectable, NotFoundException, BadRequestException, Logger, Inject, Optional } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CostPackageService } from '@/modules/cost-package/cost-package.service';
import { CaseBalanceService } from '@/modules/case-balance/case-balance.service';
import { ExpenseGateService } from '@/modules/expense-request/expense-gate.service';
import type { OpeningExpenseNotDetermined, OpeningExpenseRequirement } from '@/modules/expense-request/opening-expense-requirement';
import { CasePolicyEngine } from '@/modules/policy-engine/case-policy-engine.service';
import { ActionCode } from '@/modules/policy-engine/types/action-code.enum';

export interface TriggerStageParams {
  eventCode: string;
  params?: {
    estimatedAmount?: number;
    tebligatCount?: number;
    debtorCount?: number;
    notes?: string;
  };
}

export interface TriggerStageResult {
  action: 'OPEN_EXPENSE_MODAL' | 'READY' | 'OFFER_DEBIT_OR_REQUEST' | 'DEBIT_FROM_BALANCE' | 'SUGGEST_ONLY' | 'BLOCKED';
  expenseRequestId?: string;
  caseStatus?: string;
  debitedAmount?: number;
  newBalance?: number;
  suggestion?: {
    title: string;
    description: string;
    packageCode?: string;
  };
  blockReason?: string;
  /** CPE decision trace ID for audit */
  cpeTraceId?: string;
  /** Açılış masrafı belirlenmediği için engellendiyse: neden, gereken bilgi ve düzeltme yolu (tutar YOKTUR). */
  openingExpense?: OpeningExpenseNotDetermined;
}

/** UYAP gönderim hazırlığı olayı: açılış masrafı şartına bağlı tek olay (paket UYAP_PRE). */
const UYAP_SEND_PREPARE_EVENT = 'EVT_UYAP_SEND_CLICKED';

/** Politika motorunun masraf kapısı (gates.compiled.ts: "Ödenmemiş masraf talebi var. UYAP işlemi yapılamaz."). */
const EXPENSE_GATE_CODE = 'EXPENSE_BLOCKING';

/**
 * CPE Adapter Interface
 * @deprecated Use CasePolicyEngine directly instead
 */
export interface CpeAdapter {
  getNextActions(caseId: string, context?: any): Promise<Array<{
    actionCode: string;
    priority: number;
    reason: string;
    deadline?: Date;
  }>>;
  canPerformAction(caseId: string, actionCode: string, context?: any): Promise<{
    allowed: boolean;
    code?: string;
    reason?: string;
  }>;
}

/**
 * Event code → ActionCode mapping
 */
const EVENT_TO_ACTION_MAP: Record<string, ActionCode> = {
  'EVT_UYAP_SEND_CLICKED': ActionCode.UYAP_SEND,
  'EVT_TEBLIGAT_SEND': ActionCode.SEND_NOTIFICATION,
  'EVT_HACIZ_TRIGGER': ActionCode.TRIGGER_HACIZ,
  'EVT_EXPENSE_REQUEST': ActionCode.REQUEST_EXPENSE,
  'EVT_EXPENSE_APPROVE': ActionCode.APPROVE_EXPENSE,
  'EVT_PAYMENT_RECORD': ActionCode.RECORD_PAYMENT,
  'EVT_CASE_CLOSE': ActionCode.CLOSE_CASE,
};

@Injectable()
export class StageTriggerService {
  private readonly logger = new Logger(StageTriggerService.name);

  /**
   * @deprecated Use CasePolicyEngine directly
   */
  private cpeAdapter?: CpeAdapter;
  private useCpe = true; // Feature flag - artık varsayılan olarak açık

  constructor(
    private prisma: PrismaService,
    private costPackageService: CostPackageService,
    private caseBalanceService: CaseBalanceService,
    private expenseGateService: ExpenseGateService,
    @Optional() @Inject(CasePolicyEngine) private casePolicyEngine?: CasePolicyEngine,
  ) {
    if (this.casePolicyEngine) {
      this.logger.log('StageTriggerService: CasePolicyEngine entegrasyonu aktif');
    } else {
      this.logger.warn('StageTriggerService: CasePolicyEngine inject edilemedi, fallback moda geçiliyor');
      this.useCpe = false;
    }
  }

  /**
   * @deprecated Use CasePolicyEngine directly
   * CPE Adapter'ı set et (opsiyonel)
   */
  setCpeAdapter(adapter: CpeAdapter, enabled: boolean = true): void {
    this.logger.warn('setCpeAdapter is deprecated. Use CasePolicyEngine injection instead.');
    this.cpeAdapter = adapter;
    this.useCpe = enabled;
  }

  /**
   * CPE'den sonraki aksiyonları al
   * getNextActions kullanarak öneriler sunar
   */
  async getRecommendedActions(
    tenantId: string,
    caseId: string,
  ): Promise<TriggerStageResult> {
    // CasePolicyEngine varsa onu kullan
    if (this.casePolicyEngine) {
      try {
        const recommendations = await this.casePolicyEngine.getNextActions(tenantId, caseId);
        
        if (recommendations.length === 0) {
          return {
            action: 'SUGGEST_ONLY',
            suggestion: {
              title: 'Bekleyen işlem yok',
              description: 'Şu an için önerilen bir aksiyon bulunmuyor.',
            },
          };
        }

        const topRecommendation = recommendations[0];
        
        // ActionCode'a göre UI action'a map et
        const actionMap: Record<string, TriggerStageResult['action']> = {
          [ActionCode.UYAP_SEND]: 'READY',
          [ActionCode.SEND_NOTIFICATION]: 'READY',
          [ActionCode.TRIGGER_HACIZ]: 'READY',
          [ActionCode.REQUEST_EXPENSE]: 'OPEN_EXPENSE_MODAL',
          [ActionCode.APPROVE_EXPENSE]: 'OPEN_EXPENSE_MODAL',
          [ActionCode.RECORD_PAYMENT]: 'READY',
        };

        return {
          action: actionMap[topRecommendation.actionCode] || 'SUGGEST_ONLY',
          suggestion: {
            title: `Önerilen: ${topRecommendation.actionCode}`,
            description: topRecommendation.reason,
          },
        };
      } catch (error) {
        this.logger.error('CPE getNextActions hatası:', error);
        // Fallback to legacy behavior
      }
    }

    // Legacy fallback (deprecated adapter)
    if (!this.useCpe || !this.cpeAdapter) {
      return {
        action: 'SUGGEST_ONLY',
        suggestion: {
          title: 'CPE aktif değil',
          description: 'Öneri sistemi için CPE etkinleştirilmeli.',
        },
      };
    }

    const recommendations = await this.cpeAdapter.getNextActions(caseId);
    
    if (recommendations.length === 0) {
      return {
        action: 'SUGGEST_ONLY',
        suggestion: {
          title: 'Bekleyen işlem yok',
          description: 'Şu an için önerilen bir aksiyon bulunmuyor.',
        },
      };
    }

    const topRecommendation = recommendations[0];
    
    // ActionCode'a göre UI action'a map et
    const actionMap: Record<string, TriggerStageResult['action']> = {
      'UYAP_SEND': 'READY',
      'SEND_NOTIFICATION': 'READY',
      'TRIGGER_HACIZ': 'READY',
      'REQUEST_EXPENSE': 'OPEN_EXPENSE_MODAL',
      'APPROVE_EXPENSE': 'OPEN_EXPENSE_MODAL',
    };

    return {
      action: actionMap[topRecommendation.actionCode] || 'SUGGEST_ONLY',
      suggestion: {
        title: `Önerilen: ${topRecommendation.actionCode}`,
        description: topRecommendation.reason,
      },
    };
  }

  /**
   * Stage event tetikle
   * CPE gate kontrolü ile
   */
  async triggerStage(
    tenantId: string,
    caseId: string,
    params: TriggerStageParams,
    userId: string,
  ): Promise<TriggerStageResult> {
    const { eventCode, params: eventParams } = params;

    // Case'i kontrol et
    const caseData = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
      include: {
        debtors: true,
        client: true,
      },
    });

    if (!caseData) {
      throw new NotFoundException('Takip bulunamadı');
    }

    // Açılış masrafı şartı (yalnız UYAP gönderim hazırlığı): tutarı BELİRLENEMEMİŞ açılış masrafı "sağlandı" sayılmaz.
    // Salt okuma — ret yolunda masraf, muhasebe ya da bakiye kaydı yazılmaz.
    const openingRequirement: OpeningExpenseRequirement | undefined =
      eventCode === UYAP_SEND_PREPARE_EVENT ? await this.expenseGateService.getOpeningExpenseRequirement(tenantId, caseId) : undefined;
    const openingExpenseBlock = openingRequirement?.status === 'NOT_DETERMINED' ? this.buildOpeningExpenseBlock(openingRequirement) : undefined;

    // Event code'u ActionCode'a çevir
    const actionCode = EVENT_TO_ACTION_MAP[eventCode];

    // CPE gate kontrolü (varsa)
    if (this.casePolicyEngine && actionCode) {
      try {
        const decision = await this.casePolicyEngine.canPerformAction(tenantId, caseId, actionCode, {
          userId,
          debtorId: eventParams?.debtorCount ? undefined : caseData.debtors[0]?.id,
        });

        if (!decision.allowed) {
          this.logger.warn(`CPE blocked action ${actionCode} for case ${caseId}: ${decision.reason}`);
          // Politika motorunun MASRAF kapısı gerekçesi ("ödenmemiş masraf talebi var") açılış masrafı belirlenmemiş dosyada
          // gerçek nedeni söylemez (dosyada talep olmayabilir): neden, gereken bilgi ve düzeltme yolu döner. Diğer kapıların
          // (dosya kapalı, arşivde, UYAP kapalı, vekalet ...) gerekçesi aynen korunur.
          if (openingExpenseBlock && decision.blockedBy?.gateCode === EXPENSE_GATE_CODE) {
            return { ...openingExpenseBlock, cpeTraceId: decision.traceId };
          }
          return {
            action: 'BLOCKED',
            blockReason: decision.reason,
            cpeTraceId: decision.traceId,
            suggestion: {
              title: 'İşlem engellenmiş',
              description: decision.reason,
            },
          };
        }

        // Soft warnings varsa logla
        if (decision.warnings && decision.warnings.length > 0) {
          this.logger.warn(`CPE warnings for ${actionCode}:`, decision.warnings);
        }
      } catch (error) {
        this.logger.error('CPE canPerformAction hatası:', error);
        // Fail-open: CPE hatası durumunda devam et ama logla
      }
    }

    // Politika motoru izin verse de (ya da değerlendiremese de) belirlenmemiş açılış masrafı sağlanmış sayılmaz
    if (openingExpenseBlock) {
      return openingExpenseBlock;
    }

    // Event koduna göre işlem yap
    if (eventCode === UYAP_SEND_PREPARE_EVENT) {
      return this.handleUyapPrepare(tenantId, caseId, caseData, eventParams, userId, openingRequirement);
    }

    // Diğer eventler için basit öneri dön
    return {
      action: 'SUGGEST_ONLY',
      suggestion: {
        title: 'İşlem önerisi',
        description: 'Bu işlem için masraf gerekebilir.',
      },
    };
  }

  /** Açılış masrafı belirlenmediği için ret: gerçek neden + gereken bilgi + düzeltmenin mevcut geçerli yolu (tutar yok). */
  private buildOpeningExpenseBlock(requirement: OpeningExpenseNotDetermined): TriggerStageResult {
    return {
      action: 'BLOCKED',
      blockReason: `UYAP'a gönderim hazırlığı yapılamaz. ${requirement.message} ${requirement.completionPath}`,
      openingExpense: requirement,
      suggestion: {
        title: 'Açılış masrafı belirlenmedi',
        description: `Gereken bilgi: ${requirement.requiredInfo.join('; ')}`,
      },
    };
  }

  /**
   * UYAP'a gönderim hazırlığı
   */
  private async handleUyapPrepare(
    tenantId: string,
    caseId: string,
    caseData: any,
    eventParams: any,
    userId: string,
    openingRequirement?: OpeningExpenseRequirement,
  ): Promise<TriggerStageResult> {
    const packageCode = 'UYAP_PRE';

    // Dövizli / karma dosyada paket toplamı HESAPLANAMAZ (peşin harç oranı TL matraha uygulanır): bakiye bu toplamla
    // karşılaştırılmaz. Peşin harç bir talepte tutarıyla kayıtlıysa şart mevcut masraf kapısıdır — talep karşılanmış olmalı.
    if (openingRequirement?.status === 'RATE_ITEMS_RECORDED') {
      const gate = await this.expenseGateService.checkGateForCase(tenantId, caseId);
      if (gate.isBlocked) {
        return {
          action: 'BLOCKED',
          blockReason: gate.message,
          suggestion: {
            title: 'Masraf karşılanmadı',
            description: gate.message || 'Ödenmemiş masraf talebi var.',
          },
        };
      }
      return {
        action: 'READY',
        caseStatus: 'READY_FOR_UYAP',
        suggestion: {
          title: 'UYAP\'a gönderime hazır',
          description: 'Kayıtlı açılış masrafı karşılandı. Gönderim yapabilirsiniz.',
          packageCode,
        },
      };
    }

    // Bakiyeyi kontrol et
    const balance = await this.caseBalanceService.getBalance(tenantId, caseId);
    
    // Masraf hesapla
    const computed = await this.costPackageService.computeExpenseRequest(tenantId, {
      caseId,
      packageCode,
      debtorCount: eventParams?.debtorCount || caseData.debtors?.length || 1,
      tebligatCount: eventParams?.tebligatCount || caseData.debtors?.length || 1,
    });

    // Avans kaydı yoksa (okuma artık satır oluşturmaz) kullanılabilir avans yoktur → karşılaştırma ve mesaj bugünkü sıfır bakiyeyle aynı.
    const availableAdvance = balance.exists ? String(balance.balance) : '0';

    // Bakiye yeterliyse hazır
    if (Number(availableAdvance) >= computed.totalSuggested) {
      return {
        action: 'READY',
        caseStatus: 'READY_FOR_UYAP',
        suggestion: {
          title: 'UYAP\'a gönderime hazır',
          description: `Bakiyeniz yeterli (${availableAdvance} TL). Gönderim yapabilirsiniz.`,
          packageCode,
        },
      };
    }

    // Bakiye yetersiz, modal aç
    return {
      action: 'OPEN_EXPENSE_MODAL',
      blockReason: `Yetersiz bakiye. Gerekli: ${computed.totalSuggested} TL, Mevcut: ${availableAdvance} TL`,
      suggestion: {
        title: `${computed.packageName} için masraf gerekiyor`,
        description: `Toplam: ${computed.totalSuggested.toLocaleString('tr-TR')} TL`,
        packageCode,
      },
    };
  }

  /**
   * UYAP'a gönderim hazırlığı - public endpoint
   */
  async prepareForUyap(tenantId: string, caseId: string, userId: string): Promise<TriggerStageResult> {
    return this.triggerStage(tenantId, caseId, {
      eventCode: 'EVT_UYAP_SEND_CLICKED',
    }, userId);
  }
}
