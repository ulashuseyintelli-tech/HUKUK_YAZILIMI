import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CostPackageService } from '@/modules/cost-package/cost-package.service';
import { CaseBalanceService } from '@/modules/case-balance/case-balance.service';

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
}

/**
 * CPE Adapter Interface
 * Opsiyonel CPE entegrasyonu için
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

@Injectable()
export class StageTriggerService {
  /**
   * CPE Adapter - opsiyonel, inject edilirse kullanılır
   */
  private cpeAdapter?: CpeAdapter;
  private useCpe = false; // Feature flag

  constructor(
    private prisma: PrismaService,
    private costPackageService: CostPackageService,
    private caseBalanceService: CaseBalanceService,
  ) {}

  /**
   * CPE Adapter'ı set et (opsiyonel)
   */
  setCpeAdapter(adapter: CpeAdapter, enabled: boolean = true): void {
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

    // Event koduna göre işlem yap
    if (eventCode === 'EVT_UYAP_SEND_CLICKED') {
      return this.handleUyapPrepare(tenantId, caseId, caseData, eventParams, userId);
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

  /**
   * UYAP'a gönderim hazırlığı
   */
  private async handleUyapPrepare(
    tenantId: string,
    caseId: string,
    caseData: any,
    eventParams: any,
    userId: string,
  ): Promise<TriggerStageResult> {
    const packageCode = 'UYAP_PRE';

    // Bakiyeyi kontrol et
    const balance = await this.caseBalanceService.getBalance(tenantId, caseId);
    
    // Masraf hesapla
    const computed = await this.costPackageService.computeExpenseRequest({
      caseId,
      packageCode,
      debtorCount: eventParams?.debtorCount || caseData.debtors?.length || 1,
      tebligatCount: eventParams?.tebligatCount || caseData.debtors?.length || 1,
    });

    // Bakiye yeterliyse hazır
    if (Number(balance.balance) >= computed.totalSuggested) {
      return {
        action: 'READY',
        caseStatus: 'READY_FOR_UYAP',
        suggestion: {
          title: 'UYAP\'a gönderime hazır',
          description: `Bakiyeniz yeterli (${balance.balance} TL). Gönderim yapabilirsiniz.`,
          packageCode,
        },
      };
    }

    // Bakiye yetersiz, modal aç
    return {
      action: 'OPEN_EXPENSE_MODAL',
      blockReason: `Yetersiz bakiye. Gerekli: ${computed.totalSuggested} TL, Mevcut: ${balance.balance} TL`,
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
