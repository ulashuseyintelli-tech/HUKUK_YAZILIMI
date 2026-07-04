import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";

/**
 * DBND-D6-TASK-LINK (owner-locked, bkz `docs/design/d6-legal-semantics-triage.md` Q6):
 * Bir D6A-2 bildirimine bağlı, KULLANICI-TETİKLİ, idempotent bir Task oluşturur. Bu servis
 * D6A-2 çekirdeğine (`DebtorCrossCaseNotificationService`) HİÇBİR YAZMA yapmaz — yalnız
 * salt-okuma olarak notification'ı doğrular, sonra `Task` tablosuna yazar. `acknowledge`
 * semantiği DEĞİŞMEZ ("yalnız gördüm"); bu servis "gördüm"den SONRA isteğe bağlı bir
 * "işlem takip et" adımıdır — otomatik değildir, D6A-2'nin üretim/lifecycle akışına
 * BAĞLANMAZ.
 *
 * Dedupe: `Task.dedupeKey = "D6-TASK-LINK:" + notification.id` — aynı bildirim için ikinci
 * kez çağrılırsa (veya eşzamanlı çift-tık) YENİ bir Task OLUŞMAZ, mevcut olan döner.
 *
 * Kapsam dışı (owner-locked): dueDate/eskalasyon (ilk fazda dueDate=NULL, mevcut
 * CaseTaskEscalationService zincirine bu fazda GİRMEZ — ayrı owner kararı gerekir),
 * taskSubType (NULL, yeni enum değeri YOK, migration YOK), D6A-2 DTO genişletmesi
 * (`hasLinkedTask` gibi bir alan D6A-2-SURFACE listesine EKLENMEDİ).
 */
@Injectable()
export class DebtorCrossCaseNotificationTaskLinkService {
  constructor(private readonly prisma: PrismaService) {}

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - DebtorController.createTaskForCrossCaseNotification() → POST /debtors/cross-case-notifications/:id/create-task
  /// </remarks>
  async createTaskForNotification(tenantId: string, notificationId: string, recipientUserId: string) {
    const notification = await this.prisma.debtorCrossCaseNotification.findFirst({
      where: { id: notificationId, tenantId, recipientUserId },
      select: { id: true, debtorId: true, changeSummary: true, severity: true },
    });
    if (!notification) {
      throw new NotFoundException("Bildirim bulunamadı");
    }

    const dedupeKey = `D6-TASK-LINK:${notification.id}`;
    const existing = await this.prisma.task.findUnique({ where: { dedupeKey } });
    if (existing) {
      return existing;
    }

    try {
      return await this.prisma.task.create({
        data: {
          tenantId,
          debtorId: notification.debtorId,
          title: `D6 bildirimi takibi: ${notification.changeSummary}`,
          taskCategory: "LEGAL_WORKFLOW",
          status: "PENDING",
          priority: notification.severity === "CRITICAL" ? "HIGH" : "MEDIUM",
          assigneeId: recipientUserId,
          createdById: recipientUserId,
          dedupeKey,
          // Owner kararı: ilk fazda dueDate=NULL — CaseTaskEscalationService zincirine
          // (owner-first STAFF→TEAM_LEAD→MANAGER→FOUNDER) bu fazda GİRMEZ. Eskalasyon
          // ayrı bir owner kararı/backlog maddesidir.
          dueDate: null,
        },
      });
    } catch (e: any) {
      if (e?.code === "P2002") {
        // Eşzamanlı çift-tık / retry — dedupeKey unique constraint'i ikinci create'i reddetti.
        const created = await this.prisma.task.findUnique({ where: { dedupeKey } });
        if (created) return created;
      }
      throw e;
    }
  }
}
