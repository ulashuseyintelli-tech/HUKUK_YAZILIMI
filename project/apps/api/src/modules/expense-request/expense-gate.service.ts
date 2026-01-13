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

@Injectable()
export class ExpenseGateService {
  private readonly logger = new Logger(ExpenseGateService.name);

  constructor(private prisma: PrismaService) {}

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
   */
  async isUyapBlocked(caseId: string): Promise<boolean> {
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
   */
  async canPerformUyapAction(caseId: string, actionType: string): Promise<boolean> {
    // Bazı işlemler gate'den muaf olabilir (örn: dosya görüntüleme)
    const exemptActions = ['VIEW', 'QUERY', 'DOWNLOAD'];
    
    if (exemptActions.includes(actionType.toUpperCase())) {
      return true;
    }

    const isBlocked = await this.isUyapBlocked(caseId);
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
