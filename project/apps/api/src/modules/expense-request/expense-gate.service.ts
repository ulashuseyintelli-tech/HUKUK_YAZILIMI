import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

export interface GateCheckResult {
  isBlocked: boolean;
  blockingExpenses: Array<{
    id: string;
    stageCode: string | null;
    totalAmount: number;
    paidTotal: number;
    remaining: number;
    status: string;
  }>;
  totalPending: number;
  message?: string;
}

/**
 * CPE Adapter Interface
 * Opsiyonel CPE entegrasyonu için
 */
export interface CpeAdapter {
  canPerformAction(caseId: string, actionCode: string, context?: any): Promise<{
    allowed: boolean;
    code?: string;
    reason?: string;
  }>;
}

@Injectable()
export class ExpenseGateService {
  private readonly logger = new Logger(ExpenseGateService.name);
  
  /**
   * CPE Adapter - opsiyonel, inject edilirse kullanılır
   * Feature flag ile kontrol edilir
   */
  private cpeAdapter?: CpeAdapter;
  private useCpe = false; // Feature flag

  constructor(private prisma: PrismaService) {}

  /**
   * CPE Adapter'ı set et (opsiyonel)
   * PolicyEngineModule'dan inject edilir
   */
  setCpeAdapter(adapter: CpeAdapter, enabled: boolean = true): void {
    this.cpeAdapter = adapter;
    this.useCpe = enabled;
    this.logger.log(`CPE adapter ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Gate kontrolü - BLOCKING expense'ler ödenmemiş mi?
   */
  async checkGate(caseId: string): Promise<GateCheckResult> {
    const blockingExpenses = await this.prisma.expenseRequest.findMany({
      where: {
        caseId,
        gateType: 'BLOCKING',
        status: { in: ['PENDING', 'SENT', 'REMINDED', 'PARTIAL'] },
      },
      select: {
        id: true,
        stageCode: true,
        totalAmount: true,
        paidTotal: true,
        status: true,
      },
    });

    const result: GateCheckResult = {
      isBlocked: blockingExpenses.length > 0,
      blockingExpenses: blockingExpenses.map(exp => ({
        id: exp.id,
        stageCode: exp.stageCode,
        totalAmount: exp.totalAmount.toNumber(),
        paidTotal: exp.paidTotal.toNumber(),
        remaining: exp.totalAmount.toNumber() - exp.paidTotal.toNumber(),
        status: exp.status,
      })),
      totalPending: 0,
    };

    result.totalPending = result.blockingExpenses.reduce(
      (sum, exp) => sum + exp.remaining,
      0
    );

    if (result.isBlocked) {
      result.message = `${result.blockingExpenses.length} adet ödenmemiş masraf talebi var. Toplam: ${result.totalPending.toFixed(2)} TL`;
    }

    return result;
  }

  /**
   * UYAP işlemleri kilitli mi?
   * 
   * @deprecated CPE kullanımına geçilecek - canPerformUyapAction kullanın
   */
  async isUyapBlocked(caseId: string): Promise<boolean> {
    // CPE aktifse, CPE'den kontrol et
    if (this.useCpe && this.cpeAdapter) {
      const decision = await this.cpeAdapter.canPerformAction(caseId, 'UYAP_SEND');
      const legacyResult = await this.isUyapBlockedLegacy(caseId);
      
      // Discrepancy logging
      if (decision.allowed !== !legacyResult) {
        this.logger.warn(
          `CPE/Legacy discrepancy for case ${caseId}: CPE=${decision.allowed}, Legacy=${!legacyResult}`,
          { cpeCode: decision.code, cpeReason: decision.reason }
        );
      }
      
      return !decision.allowed;
    }
    
    return this.isUyapBlockedLegacy(caseId);
  }

  /**
   * Legacy UYAP block kontrolü
   */
  private async isUyapBlockedLegacy(caseId: string): Promise<boolean> {
    const count = await this.prisma.expenseRequest.count({
      where: {
        caseId,
        gateType: 'BLOCKING',
        status: { in: ['PENDING', 'SENT', 'REMINDED', 'PARTIAL'] },
      },
    });

    return count > 0;
  }

  /**
   * Belirli bir UYAP işlemi yapılabilir mi?
   * CPE entegrasyonu ile çalışır
   */
  async canPerformUyapAction(caseId: string, actionType: string): Promise<boolean> {
    // Bazı işlemler gate'den muaf olabilir (örn: dosya görüntüleme)
    const exemptActions = ['VIEW', 'QUERY', 'DOWNLOAD'];
    
    if (exemptActions.includes(actionType.toUpperCase())) {
      return true;
    }

    // CPE aktifse, CPE'den kontrol et
    if (this.useCpe && this.cpeAdapter) {
      // ActionType'ı CPE ActionCode'a map et
      const actionCodeMap: Record<string, string> = {
        'SEND': 'UYAP_SEND',
        'SUBMIT': 'UYAP_SEND',
        'NOTIFICATION': 'SEND_NOTIFICATION',
        'HACIZ': 'TRIGGER_HACIZ',
        'ENFORCEMENT': 'TRIGGER_HACIZ',
      };
      
      const actionCode = actionCodeMap[actionType.toUpperCase()] || 'UYAP_SEND';
      const decision = await this.cpeAdapter.canPerformAction(caseId, actionCode);
      
      // Legacy kontrolü de yap ve karşılaştır
      const legacyResult = await this.canPerformUyapActionLegacy(caseId, actionType);
      
      if (decision.allowed !== legacyResult) {
        this.logger.warn(
          `CPE/Legacy discrepancy for ${actionType} on case ${caseId}: CPE=${decision.allowed}, Legacy=${legacyResult}`,
          { cpeCode: decision.code, cpeReason: decision.reason }
        );
      }
      
      return decision.allowed;
    }

    return this.canPerformUyapActionLegacy(caseId, actionType);
  }

  /**
   * Legacy UYAP action kontrolü
   */
  private async canPerformUyapActionLegacy(caseId: string, actionType: string): Promise<boolean> {
    const isBlocked = await this.isUyapBlockedLegacy(caseId);
    return !isBlocked;
  }

  /**
   * Gate durumunu güncelle (ödeme sonrası)
   * Case status'unu "UYAP'a Gönderilebilir" yap
   */
  async updateGateStatus(caseId: string, tenantId: string): Promise<{ cleared: boolean; message: string }> {
    const gateCheck = await this.checkGate(caseId);

    if (!gateCheck.isBlocked) {
      // Tüm BLOCKING masraflar ödendi - Case'i güncelle
      // Not: Case status güncellemesi için CaseService kullanılabilir
      // Şimdilik sadece log ve sonuç döndürüyoruz
      this.logger.log(`Gate cleared for case ${caseId} - UYAP actions unlocked`);
      
      return {
        cleared: true,
        message: 'Tüm masraflar ödendi. UYAP işlemleri açıldı.',
      };
    }

    return {
      cleared: false,
      message: gateCheck.message || 'Ödenmemiş masraflar mevcut.',
    };
  }

  /**
   * Dosya için gate özeti
   */
  async getGateSummary(caseId: string) {
    const gateCheck = await this.checkGate(caseId);
    
    return {
      isBlocked: gateCheck.isBlocked,
      totalPending: gateCheck.totalPending,
      blockingCount: gateCheck.blockingExpenses.length,
      expenses: gateCheck.blockingExpenses,
      canSubmitToUyap: !gateCheck.isBlocked,
      canSendNotification: !gateCheck.isBlocked,
      message: gateCheck.isBlocked 
        ? `Masraf ödenmeden UYAP işlemi yapılamaz. Bekleyen: ${gateCheck.totalPending.toFixed(2)} TL`
        : 'UYAP işlemleri için hazır.',
    };
  }
}
