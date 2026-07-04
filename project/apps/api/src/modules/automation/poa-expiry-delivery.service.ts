import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { maskEmail } from "../../common/pii-mask.util";
import { DispatchResult, TenantNotifier } from "../escalation/tenant-notifier.service";

type RecipientSource = "PRIMARY_ATTORNEY" | "POA_ATTORNEY" | "ESCALATION_MANAGER" | "ADMIN_FALLBACK";
type DeliveryStatus = "PENDING" | "SENT" | "FAILED";

interface PoaRecipient {
  userId: string | null;
  dedupeIdentity: string;
  email: string;
  source: RecipientSource;
  displayName: string;
}

interface ClaimResult {
  row: any;
  action: "CLAIMED" | "SKIPPED";
  reason?: string;
}

interface LawyerRecipientRow {
  id: string;
  tenantId: string;
  name: string | null;
  surname: string | null;
  email: string | null;
  isActive: boolean;
  userId: string | null;
  user?: { id: string; tenantId: string; isActive: boolean; email: string | null } | null;
}

interface AdminRecipientRow {
  id: string;
  tenantId: string;
  email: string | null;
  name: string | null;
  surname: string | null;
  isActive: boolean;
}

export interface PoaExpiryDeliveryRunResult {
  scanned: number;
  recipients: number;
  sent: number;
  failed: number;
  skipped: number;
}

interface PoaExpiryDeliveryScope {
  tenantId?: string;
  clientId?: string;
}

const POA_EXPIRY_WINDOW_KEY = "D30";
const POA_EXPIRY_LOOKAHEAD_DAYS = 30;
const POA_DELIVERY_LOCK_TIMEOUT_MINUTES = 15;
const POA_DELIVERY_MAX_ATTEMPTS = 3;
const POA_DELIVERY_RETRY_MINUTES = 60;

@Injectable()
export class PoaExpiryDeliveryService {
  private readonly logger = new Logger(PoaExpiryDeliveryService.name);

  constructor(
    private prisma: PrismaService,
    private tenantNotifier: TenantNotifier,
  ) {}

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - AutomationService.sendExpiringPoaNotifications() → @Cron EVERY_DAY_AT_9AM (POA expiry gerçek teslimat motoru)
  /// </remarks>
  async sendExpiringPoaNotifications(now: Date = new Date()): Promise<PoaExpiryDeliveryRunResult> {
    return this.sendExpiringPoaNotificationsScoped(now);
  }

  /// <remarks>
  /// Cagrildigi yerler:
  /// - ClientService.sendPoaReminder() -> POST /clients/:clientId/poa-reminders/send (manual typed command)
  /// </remarks>
  async sendExpiringPoaNotificationsForClient(
    tenantId: string,
    clientId: string,
    now: Date = new Date(),
  ): Promise<PoaExpiryDeliveryRunResult> {
    return this.sendExpiringPoaNotificationsScoped(now, { tenantId, clientId });
  }

  private async sendExpiringPoaNotificationsScoped(
    now: Date = new Date(),
    scope: PoaExpiryDeliveryScope = {},
  ): Promise<PoaExpiryDeliveryRunResult> {
    const until = new Date(now);
    until.setDate(until.getDate() + POA_EXPIRY_LOOKAHEAD_DAYS);

    const poas = await (this.prisma as any).clientPowerOfAttorney.findMany({
      where: {
        ...(scope.clientId ? { clientId: scope.clientId } : {}),
        isLimited: true,
        isActive: true,
        status: "ACTIVE",
        validUntil: { gte: now, lte: until },
        ...(scope.tenantId ? { client: { tenantId: scope.tenantId } } : {}),
      },
      include: {
        client: { select: { id: true, displayName: true, tenantId: true } },
        lawyers: {
          include: {
            lawyer: {
              select: {
                id: true,
                tenantId: true,
                name: true,
                surname: true,
                email: true,
                isActive: true,
                userId: true,
                user: { select: { id: true, tenantId: true, isActive: true, email: true } },
              },
            },
          },
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }, { id: "asc" }],
        },
      },
      orderBy: [{ validUntil: "asc" }, { id: "asc" }],
    });

    const result: PoaExpiryDeliveryRunResult = {
      scanned: poas.length,
      recipients: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
    };

    for (const poa of poas) {
      const tenantId = poa?.client?.tenantId;
      if (!tenantId || !poa?.validUntil) {
        result.skipped += 1;
        continue;
      }

      const recipients = await this.resolveRecipientsForPoa(poa, tenantId);
      result.recipients += recipients.length;

      for (const recipient of recipients) {
        const claim = await this.claimDeliveryReservation(poa, recipient, now);
        if (claim.action !== "CLAIMED") {
          result.skipped += 1;
          continue;
        }

        const dispatch = await this.dispatchEmail(poa, recipient, now);
        if (dispatch === "SENT") {
          await this.markSent(claim.row.id, now);
          result.sent += 1;
        } else {
          await this.markFailed(claim.row.id, claim.row.attempts, dispatch, now);
          result.failed += 1;
        }
      }
    }

    return result;
  }

  private async resolveRecipientsForPoa(poa: any, tenantId: string): Promise<PoaRecipient[]> {
    const primary = this.validPoaLawyerRecipients(poa, tenantId, "PRIMARY_ATTORNEY", true);
    if (primary.length > 0) return this.uniqueRecipients([primary[0]]);

    const poaLawyers = this.validPoaLawyerRecipients(poa, tenantId, "POA_ATTORNEY", false);
    if (poaLawyers.length > 0) return this.uniqueRecipients(poaLawyers);

    const managers = await this.resolveEscalationManagers(tenantId);
    if (managers.length > 0) return this.uniqueRecipients(managers);

    return this.uniqueRecipients(await this.resolveAdminFallback(tenantId));
  }

  private validPoaLawyerRecipients(
    poa: any,
    tenantId: string,
    source: Extract<RecipientSource, "PRIMARY_ATTORNEY" | "POA_ATTORNEY">,
    primaryOnly: boolean,
  ): PoaRecipient[] {
    const links = [...(poa?.lawyers || [])].sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      const at = new Date(a.createdAt || 0).getTime();
      const bt = new Date(b.createdAt || 0).getTime();
      if (at !== bt) return at - bt;
      return String(a.id || "").localeCompare(String(b.id || ""));
    });

    return links
      .filter((link) => !primaryOnly || link.isPrimary === true)
      .map((link) => link.lawyer)
      .filter((lawyer) => this.isValidLawyerRecipient(lawyer, tenantId))
      .map((lawyer) => this.toRecipient({
        id: lawyer.userId || null,
        email: lawyer.email,
        source,
        displayName: [lawyer.name, lawyer.surname].filter(Boolean).join(" ").trim() || "Avukat",
      }))
      .filter((r): r is PoaRecipient => !!r);
  }

  private async resolveEscalationManagers(tenantId: string): Promise<PoaRecipient[]> {
    const office = await (this.prisma as any).office.findUnique({
      where: { tenantId },
      select: { escalationManagerLawyerIds: true },
    });
    const ids: string[] = office?.escalationManagerLawyerIds || [];
    if (ids.length === 0) return [];

    const lawyers: LawyerRecipientRow[] = await (this.prisma as any).lawyer.findMany({
      where: { tenantId, id: { in: ids }, isActive: true },
      select: {
        id: true,
        tenantId: true,
        name: true,
        surname: true,
        email: true,
        isActive: true,
        userId: true,
        user: { select: { id: true, tenantId: true, isActive: true, email: true } },
      },
    });
    const byId = new Map<string, LawyerRecipientRow>(lawyers.map((l): [string, LawyerRecipientRow] => [l.id, l]));

    return ids
      .map((id) => byId.get(id))
      .filter((lawyer) => this.isValidLawyerRecipient(lawyer, tenantId))
      .map((lawyer) => this.toRecipient({
        id: lawyer.userId || null,
        email: lawyer.email,
        source: "ESCALATION_MANAGER",
        displayName: [lawyer.name, lawyer.surname].filter(Boolean).join(" ").trim() || "Yönetici avukat",
      }))
      .filter((r): r is PoaRecipient => !!r);
  }

  private async resolveAdminFallback(tenantId: string): Promise<PoaRecipient[]> {
    const admins: AdminRecipientRow[] = await (this.prisma as any).user.findMany({
      where: { tenantId, role: "ADMIN", isActive: true, email: { not: "" } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, tenantId: true, email: true, name: true, surname: true, isActive: true },
    });

    return admins
      .filter((admin) => admin.tenantId === tenantId && admin.isActive === true)
      .map((admin) => this.toRecipient({
        id: admin.id,
        email: admin.email,
        source: "ADMIN_FALLBACK",
        displayName: [admin.name, admin.surname].filter(Boolean).join(" ").trim() || "Tenant admin",
      }))
      .filter((r): r is PoaRecipient => !!r);
  }

  private isValidLawyerRecipient(lawyer: LawyerRecipientRow | null | undefined, tenantId: string): lawyer is LawyerRecipientRow {
    if (!lawyer || lawyer.tenantId !== tenantId || lawyer.isActive !== true) return false;
    if (lawyer.userId && lawyer.user?.isActive === false) return false;
    return !!this.normalizeEmail(lawyer.email);
  }

  private toRecipient(input: { id: string | null; email: string | null | undefined; source: RecipientSource; displayName: string }): PoaRecipient | null {
    const email = this.normalizeEmail(input.email);
    if (!email) return null;
    return {
      userId: input.id,
      email,
      source: input.source,
      displayName: input.displayName,
      dedupeIdentity: input.id || email,
    };
  }

  private uniqueRecipients(recipients: PoaRecipient[]): PoaRecipient[] {
    const seen = new Set<string>();
    const out: PoaRecipient[] = [];
    for (const recipient of recipients) {
      if (seen.has(recipient.dedupeIdentity)) continue;
      seen.add(recipient.dedupeIdentity);
      out.push(recipient);
    }
    return out;
  }

  private async claimDeliveryReservation(poa: any, recipient: PoaRecipient, now: Date): Promise<ClaimResult> {
    const dedupeKey = this.buildDedupeKey(poa, recipient);
    const data = {
      tenantId: poa.client.tenantId,
      poaId: poa.id,
      clientId: poa.client.id,
      recipientUserId: recipient.userId,
      recipientEmail: recipient.email,
      recipientSource: recipient.source,
      dedupeKey,
      windowKey: POA_EXPIRY_WINDOW_KEY,
      status: "PENDING" as DeliveryStatus,
      attempts: 1,
      reservedAt: now,
      lastAttemptAt: now,
      nextRetryAt: null,
      lastError: null,
    };

    try {
      const row = await (this.prisma as any).$transaction((tx: any) =>
        tx.poaExpiryNotificationDelivery.create({ data }),
      );
      return { action: "CLAIMED", row };
    } catch (error) {
      if (!this.isUniqueConflict(error)) throw error;
      return this.claimExistingReservation(dedupeKey, now);
    }
  }

  private async claimExistingReservation(dedupeKey: string, now: Date): Promise<ClaimResult> {
    const existing = await (this.prisma as any).poaExpiryNotificationDelivery.findUnique({ where: { dedupeKey } });
    if (!existing) return { action: "SKIPPED", row: null, reason: "missing-after-p2002" };
    if (existing.status === "SENT") return { action: "SKIPPED", row: existing, reason: "already-sent" };
    if (existing.attempts >= POA_DELIVERY_MAX_ATTEMPTS) {
      return { action: "SKIPPED", row: existing, reason: "max-attempts" };
    }

    if (existing.status === "PENDING") {
      const staleCutoff = new Date(now.getTime() - POA_DELIVERY_LOCK_TIMEOUT_MINUTES * 60 * 1000);
      if (existing.reservedAt && existing.reservedAt >= staleCutoff) {
        return { action: "SKIPPED", row: existing, reason: "fresh-pending" };
      }
      const update = await (this.prisma as any).poaExpiryNotificationDelivery.updateMany({
        where: {
          id: existing.id,
          dedupeKey,
          status: "PENDING",
          attempts: { lt: POA_DELIVERY_MAX_ATTEMPTS },
          OR: [{ reservedAt: null }, { reservedAt: { lt: staleCutoff } }],
        },
        data: {
          attempts: { increment: 1 },
          reservedAt: now,
          lastAttemptAt: now,
          nextRetryAt: null,
          lastError: null,
        },
      });
      if (update.count !== 1) return { action: "SKIPPED", row: existing, reason: "pending-claim-lost" };
      const row = await (this.prisma as any).poaExpiryNotificationDelivery.findUnique({ where: { dedupeKey } });
      return { action: "CLAIMED", row };
    }

    if (existing.status === "FAILED") {
      if (existing.nextRetryAt && existing.nextRetryAt > now) {
        return { action: "SKIPPED", row: existing, reason: "retry-not-due" };
      }
      const update = await (this.prisma as any).poaExpiryNotificationDelivery.updateMany({
        where: {
          id: existing.id,
          dedupeKey,
          status: "FAILED",
          attempts: { lt: POA_DELIVERY_MAX_ATTEMPTS },
          OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
        },
        data: {
          status: "PENDING",
          attempts: { increment: 1 },
          reservedAt: now,
          lastAttemptAt: now,
          nextRetryAt: null,
          lastError: null,
        },
      });
      if (update.count !== 1) return { action: "SKIPPED", row: existing, reason: "failed-claim-lost" };
      const row = await (this.prisma as any).poaExpiryNotificationDelivery.findUnique({ where: { dedupeKey } });
      return { action: "CLAIMED", row };
    }

    return { action: "SKIPPED", row: existing, reason: "unknown-status" };
  }

  private async dispatchEmail(poa: any, recipient: PoaRecipient, now: Date): Promise<DispatchResult> {
    try {
      return await this.tenantNotifier.sendEmail(
        poa.client.tenantId,
        recipient.email,
        this.buildSubject(poa),
        this.buildEmailBody(poa, recipient, now),
      );
    } catch (error: any) {
      this.logger.error(`POA expiry e-posta hatası (${maskEmail(recipient.email)}): ${error?.message || error}`);
      return "FAILED";
    }
  }

  private async markSent(id: string, now: Date): Promise<void> {
    await (this.prisma as any).poaExpiryNotificationDelivery.update({
      where: { id },
      data: { status: "SENT", sentAt: now, nextRetryAt: null, lastError: null },
    });
  }

  private async markFailed(id: string, attempts: number, result: DispatchResult, now: Date): Promise<void> {
    const terminal = attempts >= POA_DELIVERY_MAX_ATTEMPTS;
    const nextRetryAt = terminal ? null : new Date(now.getTime() + POA_DELIVERY_RETRY_MINUTES * 60 * 1000);
    await (this.prisma as any).poaExpiryNotificationDelivery.update({
      where: { id },
      data: {
        status: "FAILED",
        nextRetryAt,
        lastError: this.truncateError(result === "SKIPPED" ? "Delivery skipped by TenantNotifier" : "Delivery failed by TenantNotifier"),
      },
    });
  }

  private buildDedupeKey(poa: any, recipient: PoaRecipient): string {
    const expiry = this.dateKey(new Date(poa.validUntil));
    return ["poa-expiry", poa.client.tenantId, poa.id, recipient.dedupeIdentity, expiry, POA_EXPIRY_WINDOW_KEY].join(":");
  }

  private buildSubject(poa: any): string {
    const clientName = poa?.client?.displayName || "Müvekkil";
    return `Vekalet süresi uyarısı - ${clientName}`;
  }

  private buildEmailBody(poa: any, recipient: PoaRecipient, now: Date): string {
    const validUntil = new Date(poa.validUntil);
    const daysLeft = Math.max(0, Math.ceil((validUntil.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    const clientName = this.escapeHtml(poa?.client?.displayName || "Müvekkil");
    const recipientName = this.escapeHtml(recipient.displayName);
    const date = validUntil.toLocaleDateString("tr-TR");
    return `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; line-height: 1.5; color: #111827;">
        <h2 style="color: #b45309;">Vekalet süresi uyarısı</h2>
        <p>Sayın ${recipientName},</p>
        <p><strong>${clientName}</strong> için kayıtlı vekaletin süresi <strong>${date}</strong> tarihinde dolacaktır.</p>
        <p>Kalan süre: <strong>${daysLeft} gün</strong>.</p>
        <p>Gerekli yenileme veya kontrol işlemlerini başlatmanız önerilir.</p>
        <p style="margin-top: 24px; color: #6b7280; font-size: 12px;">Bu bildirim otomatik olarak gönderilmiştir.</p>
      </div>
    `;
  }

  private normalizeEmail(email: string | null | undefined): string | null {
    const normalized = (email || "").trim().toLowerCase();
    return normalized.includes("@") ? normalized : null;
  }

  private dateKey(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private truncateError(message: string): string {
    return (message || "Bilinmeyen hata").slice(0, 500);
  }

  private isUniqueConflict(error: any): boolean {
    return (
      error?.code === "P2002" ||
      (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
    );
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}
