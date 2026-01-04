import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LegalCaseStatus } from '@prisma/client';

// Statü -> Otomasyon davranışı mapping (B.15)
const STATUS_AUTOMATION_CONFIG: Record<LegalCaseStatus, 'ON' | 'OFF' | 'CONDITIONAL'> = {
  DERDEST: 'ON',
  ISLEMDE: 'ON',
  DERKENAR: 'ON',
  HITAM: 'OFF',
  INFAZ: 'OFF',
  MUVEKKILE_IADE: 'OFF',
  ACIZ: 'OFF',
  BATAK: 'OFF',
  MAHSUP: 'OFF',
  TEMLIK: 'OFF',
  AZIL: 'OFF',
  FERAGAT: 'OFF',
  SULH: 'OFF',
};

// Statü açıklamaları
export const STATUS_DESCRIPTIONS: Record<LegalCaseStatus, string> = {
  DERDEST: 'Aktif takip, otomasyon açık',
  ISLEMDE: 'İşlem yapılıyor, otomasyon açık',
  DERKENAR: 'Beklemede, otomasyon açık',
  HITAM: 'Sonuçlandı, otomasyon kapalı',
  INFAZ: 'İnfaz edildi, otomasyon kapalı',
  MUVEKKILE_IADE: 'Müvekkile iade, otomasyon kapalı',
  ACIZ: 'Aciz vesikası, otomasyon kapalı',
  BATAK: 'Tahsil imkansız, otomasyon kapalı',
  MAHSUP: 'Mahsup edildi, otomasyon kapalı',
  TEMLIK: 'Temlik edildi, otomasyon kapalı',
  AZIL: 'Azil - vekalet sona erdi, otomasyon kapalı',
  FERAGAT: 'Feragat - alacaklı vazgeçti, otomasyon kapalı',
  SULH: 'Sulh - taraflar anlaştı, otomasyon kapalı',
};

// Statü grupları (G.33)
export const STATUS_GROUPS = {
  ACTIVE: ['DERDEST', 'ISLEMDE', 'DERKENAR'] as LegalCaseStatus[],
  COMPLETED: ['HITAM', 'INFAZ', 'MUVEKKILE_IADE'] as LegalCaseStatus[],
  IMPOSSIBLE: ['ACIZ', 'BATAK', 'MAHSUP', 'TEMLIK'] as LegalCaseStatus[],
};

// Başlangıç statüleri - sadece bunlar takip oluştururken seçilebilir (B.5)
export const INITIAL_STATUSES: LegalCaseStatus[] = ['DERDEST', 'ISLEMDE', 'DERKENAR'];

// Kapanış statüleri - sadece aktif dosyalardan geçilebilir (B.6)
export const CLOSING_STATUSES: LegalCaseStatus[] = ['HITAM', 'INFAZ', 'MUVEKKILE_IADE', 'ACIZ', 'BATAK', 'MAHSUP', 'TEMLIK'];

// Başlangıç statüsü mü kontrol et
export function isInitialStatus(status: LegalCaseStatus): boolean {
  return INITIAL_STATUSES.includes(status);
}

// Kapanış statüsü mü kontrol et
export function isClosingStatus(status: LegalCaseStatus): boolean {
  return CLOSING_STATUSES.includes(status);
}

@Injectable()
export class CaseStatusService {
  private readonly logger = new Logger(CaseStatusService.name);

  constructor(private prisma: PrismaService) {}

  // Başlangıç statüsü doğrula (B.5)
  validateInitialStatus(status: LegalCaseStatus): void {
    if (!isInitialStatus(status)) {
      throw new Error(`Geçersiz başlangıç statüsü: ${status}. Sadece DERDEST, ISLEMDE veya DERKENAR seçilebilir.`);
    }
  }

  // Statü geçişi doğrula (B.6)
  validateStatusTransition(fromStatus: LegalCaseStatus, toStatus: LegalCaseStatus): void {
    // Kapanış statüsüne geçiş sadece aktif statülerden yapılabilir
    if (isClosingStatus(toStatus) && isClosingStatus(fromStatus)) {
      throw new Error(`Kapanış statüsünden (${fromStatus}) başka bir kapanış statüsüne (${toStatus}) geçilemez.`);
    }
  }

  // Statü değiştir (B.17)
  async changeStatus(
    caseId: string,
    newStatus: LegalCaseStatus,
    userId?: string,
    reason?: string,
  ): Promise<any> {
    const caseData = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: { caseStatus: true, isAutomationEnabled: true },
    });

    if (!caseData) {
      throw new Error('Case not found');
    }

    const oldStatus = caseData.caseStatus;
    
    // Statü geçişini doğrula (B.6)
    this.validateStatusTransition(oldStatus, newStatus);
    const automationMode = STATUS_AUTOMATION_CONFIG[newStatus];
    const shouldEnableAutomation = automationMode === 'ON';
    const automationChanged = caseData.isAutomationEnabled !== shouldEnableAutomation;

    // Transaction ile güncelle
    const result = await this.prisma.$transaction(async (tx) => {
      // Case'i güncelle
      const updatedCase = await tx.case.update({
        where: { id: caseId },
        data: {
          caseStatus: newStatus,
          isAutomationEnabled: shouldEnableAutomation,
          // Otomasyon kapatılıyorsa nextActionAt'ı temizle
          nextActionAt: shouldEnableAutomation ? undefined : null,
        },
      });

      // Statü geçmişine kaydet (B.18)
      await tx.caseStatusHistory.create({
        data: {
          caseId,
          fromStatus: oldStatus,
          toStatus: newStatus,
          reason,
          changedById: userId,
          automationWasEnabled: automationChanged ? shouldEnableAutomation : null,
        },
      });

      // DecisionLog'a kaydet
      await tx.decisionLog.create({
        data: {
          caseId,
          decisionType: 'STATUS_CHANGE',
          decision: `Statü değiştirildi: ${oldStatus} -> ${newStatus}`,
          reasoning: reason,
          isAutomatic: false,
          executedAt: new Date(),
        },
      });

      return updatedCase;
    });

    this.logger.log(`Case ${caseId} status changed: ${oldStatus} -> ${newStatus}`);
    return result;
  }

  // Statü listesi al
  getStatusList(): any[] {
    return Object.entries(STATUS_DESCRIPTIONS).map(([status, description]) => ({
      status,
      description,
      automationMode: STATUS_AUTOMATION_CONFIG[status as LegalCaseStatus],
      group: STATUS_GROUPS.ACTIVE.includes(status as LegalCaseStatus)
        ? 'ACTIVE'
        : STATUS_GROUPS.COMPLETED.includes(status as LegalCaseStatus)
        ? 'COMPLETED'
        : 'IMPOSSIBLE',
    }));
  }

  // Statü geçmişi al
  async getStatusHistory(caseId: string): Promise<any[]> {
    return this.prisma.caseStatusHistory.findMany({
      where: { caseId },
      include: {
        changedBy: { select: { name: true, surname: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Otomasyon durumunu kontrol et
  shouldAutomationRun(status: LegalCaseStatus): boolean {
    return STATUS_AUTOMATION_CONFIG[status] === 'ON';
  }
}
