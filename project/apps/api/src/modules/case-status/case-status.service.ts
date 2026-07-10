import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
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

const KNOWN_STATUSES: ReadonlySet<string> = new Set([
  ...STATUS_GROUPS.ACTIVE,
  ...STATUS_GROUPS.COMPLETED,
  ...STATUS_GROUPS.IMPOSSIBLE,
  'AZIL',
  'FERAGAT',
  'SULH',
]);

export async function applyCaseStatusChange(
  prisma: any,
  tenantId: string,
  caseId: string,
  newStatus: LegalCaseStatus,
  actorUserId: string,
  reason?: string,
): Promise<any> {
  if (!newStatus || !KNOWN_STATUSES.has(newStatus)) {
    throw new BadRequestException(`Geçersiz statü değeri: ${String(newStatus)}`);
  }

  const caseData = await prisma.case.findFirst({
    where: { id: caseId, tenantId },
    select: { caseStatus: true, isAutomationEnabled: true },
  });

  if (!caseData) {
    throw new NotFoundException('Dosya bulunamadı');
  }

  const oldStatus = caseData.caseStatus;
  const automationMode = STATUS_AUTOMATION_CONFIG[newStatus];
  const nextAutomationEnabled = automationMode === 'OFF' ? false : caseData.isAutomationEnabled;
  const automationChanged = caseData.isAutomationEnabled !== nextAutomationEnabled;

  const applyInTransaction = async (tx: any) => {
    const updatedCase = await tx.case.update({
      where: { id: caseId },
      data: {
        caseStatus: newStatus,
        isAutomationEnabled: nextAutomationEnabled,
        nextActionAt: nextAutomationEnabled ? undefined : null,
      },
    });

    await tx.caseStatusHistory.create({
      data: {
        caseId,
        fromStatus: oldStatus,
        toStatus: newStatus,
        reason,
        changedById: actorUserId,
        automationWasEnabled: automationChanged ? nextAutomationEnabled : null,
      },
    });

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
  };

  if (typeof prisma.$transaction === 'function') {
    return prisma.$transaction(applyInTransaction);
  }

  return applyInTransaction(prisma);
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

  // P3-2B-1: Statü GEÇİŞ kuralı GEVŞETİLDİ — hiçbir statü çifti yasak değildir (kapanış→kapanış dahil).
  // Düzeltme / yeniden-sınıflandırma / dosya sonucu netleşmesi gerçek büro ihtiyacı; geçiş YASAKLANMAZ,
  // reason + caseStatusHistory + decisionLog + CHANGE_STATUS observe ile İZLENİR (Guided-Open: blok değil, audit+gerekçe).

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - CaseStatusController.changeStatus() → POST /case-status/:caseId/change
  /// P2b-2c-1 hardening: tenant-scoped lookup (cross-tenant/missing → NotFound 404) + truthful actorUserId = changedById.
  /// </remarks>
  // Statü değiştir (B.17)
  async changeStatus(
    tenantId: string,
    caseId: string,
    newStatus: LegalCaseStatus,
    actorUserId: string,
    reason?: string,
  ): Promise<any> {
    const result = await applyCaseStatusChange(this.prisma, tenantId, caseId, newStatus, actorUserId, reason);

    this.logger.log(`Case ${caseId} status changed to ${newStatus}`);
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

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - CaseStatusController.getStatusHistory() → GET /case-status/:caseId/history
  /// H5 hardening: changeStatus (P2b-2c-1) ile AYNI tenant-scoped lookup deseni;
  /// cross-tenant veya yok → NotFound (404; varlık sızdırma yok).
  /// </remarks>
  // Statü geçmişi al
  async getStatusHistory(tenantId: string, caseId: string): Promise<any[]> {
    const caseExists = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
      select: { id: true },
    });

    if (!caseExists) {
      throw new NotFoundException('Dosya bulunamadı');
    }

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
