import { Injectable, BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OfficeApprovalService } from '../office-approval/office-approval.service';
import { PoaExpiryDeliveryService, type PoaExpiryDeliveryRunResult } from '../automation/poa-expiry-delivery.service';
import { buildClientFieldDiff, buildContactsDiff, buildClientRemoveSnapshot } from './client-audit.util';
import { assertCreateIdentityChecksum } from './client-identity-checksum.util';

/** C0-a: audit actor — YALNIZ auth context'ten (req.user.id); body/data'dan ASLA türetilmez. */
export interface AuditActor {
  userId?: string;
}

// ── Operasyonel iletişim eksiği takibi (PR-1, saf yardımcılar) ──

export const CONTACT_TASK_DEDUPE_PREFIX = 'OPCOMP:CONTACT:';

export type ClientTimelineSource = 'client_notification' | 'intake_submission';

export interface ClientTimelineQuery {
  limit?: string;
  cursor?: string;
  sources?: string;
}

export interface ClientTimelineItem {
  id: string;
  source: ClientTimelineSource;
  eventType: string;
  occurredAt: string;
  title: string;
  summary: string;
  status: string;
  caseId?: string | null;
  metadataSafe?: Record<string, string | null>;
}

export interface ClientTimelineResponse {
  data: ClientTimelineItem[];
  pageInfo: {
    nextCursor: string | null;
    hasNextPage: boolean;
    limit: number;
  };
}

export type ClientActionKey =
  | 'contact.update_missing_info'
  | 'intake.link.create'
  | 'intake.link.send'
  | 'poa.reminder.send'
  | 'notification.template.send'
  | 'case.open_related'
  | 'activity.view_timeline';

export type ClientActionCategory = 'intake' | 'poa' | 'notification' | 'document' | 'contact' | 'case' | 'activity';
export type ClientActionVisibility = 'visible' | 'hidden' | 'forbidden';
export type ClientActionDangerLevel = 'low' | 'medium' | 'high';
export type ClientActionRole = 'ADMIN' | 'USER' | 'VIEWER';

export interface ClientActionCatalogItem {
  key: ClientActionKey;
  label: string;
  description: string;
  category: ClientActionCategory;
  enabled: boolean;
  disabledReason?: string;
  visibility: ClientActionVisibility;
  dangerLevel: ClientActionDangerLevel;
  requiredRole?: string;
  requiredState?: string;
  target?: {
    clientId: string;
    caseId?: string;
  };
  href?: string;
  order: number;
}

export interface ClientActionCatalogResponse {
  data: ClientActionCatalogItem[];
}

export type ClientPoaReminderSendStatus = 'sent' | 'partial' | 'failed' | 'skipped';

export interface ClientPoaReminderSendResult extends PoaExpiryDeliveryRunResult {
  clientId: string;
  status: ClientPoaReminderSendStatus;
}

export type ClientOperatingHealth = 'healthy' | 'attention' | 'blocked';
export type ClientOperatingRiskLevel = 'low' | 'medium' | 'high';
export type ClientOperatingSignalSeverity = 'info' | 'warning' | 'critical';
export type ClientOperatingSignalKey =
  | 'contact.missing_info'
  | 'contact.follow_up_overdue'
  | 'poa.missing_or_inactive'
  | 'poa.expiring'
  | 'intake.pending_review'
  | 'intake.delivery_failed'
  | 'intake.delivery_stuck'
  | 'notification.failed';

export interface ClientOperatingSignal {
  key: ClientOperatingSignalKey;
  label: string;
  description: string;
  severity: ClientOperatingSignalSeverity;
  actionKey?: ClientActionKey;
  target: { clientId: string; caseId?: string | null };
}

export interface ClientOperatingSnapshot {
  clientId: string;
  health: ClientOperatingHealth;
  riskLevel: ClientOperatingRiskLevel;
  contact: {
    status: 'complete' | 'missing' | 'waived';
    missingFields: string[];
    followUpStatus: string | null;
    openTaskCount: number;
    overdueTaskCount: number;
    nextFollowUpAt: string | null;
    escalationLevel: string | null;
  };
  poa: {
    status: 'active' | 'missing' | 'expiring' | 'expired_or_inactive';
    activeCount: number;
    nearestValidUntil: string | null;
  };
  intake: {
    status: 'none' | 'link_active' | 'submitted' | 'in_review' | 'completed' | 'rejected';
    latestSubmission: {
      id: string;
      status: string;
      caseId: string | null;
      occurredAt: string;
    } | null;
    latestLink: {
      id: string;
      status: string;
      caseId: string | null;
      expiresAt: string | null;
    } | null;
  };
  notification: {
    status: 'none' | 'healthy' | 'pending' | 'failed';
    latest: {
      id: string;
      status: string;
      type: string | null;
      channel: string | null;
      caseId: string | null;
      occurredAt: string;
    } | null;
  };
  signals: ClientOperatingSignal[];
}

export interface ClientOperatingSnapshotResponse {
  data: ClientOperatingSnapshot;
}

interface ClientTimelineCursor {
  occurredAt: string;
  source: ClientTimelineSource;
  id: string;
}

const CLIENT_TIMELINE_DEFAULT_LIMIT = 25;
const CLIENT_TIMELINE_MAX_LIMIT = 100;
const CLIENT_TIMELINE_DEFAULT_SOURCES: ClientTimelineSource[] = ['client_notification', 'intake_submission'];
const CLIENT_TIMELINE_ALLOWED_SOURCES = new Set<ClientTimelineSource>(CLIENT_TIMELINE_DEFAULT_SOURCES);
const CLIENT_INTAKE_DELIVERY_STALE_MS = 15 * 60 * 1000;

/** Müvekkil için contact-task dedupe anahtarı (tek aktif görev garantisi). */
export function contactTaskDedupeKey(clientId: string): string {
  return `${CONTACT_TASK_DEDUPE_PREFIX}${clientId}`;
}

/**
 * Müvekkilde eksik iletişim alanlarını hesaplar. PR-1: yalnız telefon + e-posta.
 * Generic dizi döner → ileride IBAN/vergi levhası/kimlik aynı makineyle eklenebilir (yeni tablo yok).
 */
export function computeMissingContactFields(client: { phone?: string | null; email?: string | null }): string[] {
  const missing: string[] = [];
  if (!client.phone || !String(client.phone).trim()) missing.push('phone');
  if (!client.email || !String(client.email).trim()) missing.push('email');
  return missing;
}

@Injectable()
export class ClientService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private officeApproval: OfficeApprovalService,
    private poaExpiryDelivery?: PoaExpiryDeliveryService,
  ) {}

  /**
   * Task 8A (owner-locked 2026-07-02) — müvekkil lifecycle (archive/delete) mutasyon yetkisi.
   * case-fee-agreement.service.ts:assertCanManage ile BİREBİR desen (reuse, yeni altyapı YOK):
   * PARTNER veya canApproveOfficeActions=true delege avukat. Staff/normal kullanıcı 403.
   * Reactivate-via-create (dedup yan-etkisi) BU KAPSAM DIŞI — kasıtlı olarak dokunulmadı.
   */
  private async assertCanManageLifecycle(userId: string | undefined, tenantId: string): Promise<void> {
    if (!userId || !(await this.officeApproval.isApproverEligible(userId, tenantId))) {
      throw new ForbiddenException(
        'Müvekkil arşivleme/silme için yetki yok (PARTNER veya yetkilendirilmiş avukat gerekir)',
      );
    }
  }

  // Tüm müvekkilleri listele
  async findAll(tenantId: string, type?: string) {
    const clients = await this.prisma.client.findMany({
      where: { 
        tenantId, 
        isActive: true,
        ...(type && { type: type as any })
      },
      include: {
        contacts: true,
        // FIX B (PR-1): Vekalet sütunu için aktif vekaletleri getir (liste eskiden POA join etmiyordu
        // → sütun daima "+Ekle" gösteriyordu, aktif vekaleti olan müvekkilde bile).
        powerOfAttorneys: { where: { isActive: true }, orderBy: { createdAt: 'desc' } },
        _count: {
          select: { cases: true }
        }
      },
      orderBy: [{ createdAt: 'desc' }],
    });
    console.log(`[ClientService] Found ${clients.length} clients for tenant ${tenantId}`);
    return clients;
  }

  // Tek müvekkil getir
  // Task 4A (owner-locked karar #2): findOne VARSAYILAN olarak soft-deleted (isActive:false)
  // DÖNDÜRMEZ → GET /clients/:id arşivlenmiş müvekkili göstermez (findAll ile tutarlı). İç çağıranlar
  // (create reactivate dönüşü, update dönüşü) mutasyon sonrası kaydı her durumda almak için
  // includeInactive:true geçer → mevcut davranış korunur. Tek dış çağıran = ClientController GET (default).
  async findOne(id: string, tenantId: string, opts: { includeInactive?: boolean } = {}) {
    return this.prisma.client.findFirst({
      where: { id, tenantId, ...(opts.includeInactive ? {} : { isActive: true }) },
      include: {
        contacts: true,
        bankAccounts: true,
        powerOfAttorneys: true,
      },
    });
  }

  /**
   * Client Workspace unified timeline V1 (read-only).
   *
   * <remarks>
   * Cagrildigi yerler:
   * - ClientController.timeline() -> GET /clients/:clientId/timeline (Client Workspace read model)
   * </remarks>
   */
  async getTimeline(id: string, tenantId: string, query: ClientTimelineQuery = {}): Promise<ClientTimelineResponse> {
    const limit = this.parseTimelineLimit(query.limit);
    const sources = this.parseTimelineSources(query.sources);
    const cursor = this.parseTimelineCursor(query.cursor);

    const client = await this.prisma.client.findFirst({
      where: { id, tenantId, isActive: true },
      select: { id: true },
    });
    if (!client) throw new NotFoundException('Client not found');

    const scanTake = Math.min(Math.max(limit * 4, limit + 1), CLIENT_TIMELINE_MAX_LIMIT * 4);
    const groups = await Promise.all([
      sources.includes('client_notification')
        ? this.prisma.clientNotification.findMany({
            where: { tenantId, clientId: id },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: scanTake,
            select: {
              id: true,
              type: true,
              channel: true,
              subject: true,
              status: true,
              sentAt: true,
              deliveredAt: true,
              createdAt: true,
              caseId: true,
            },
          })
        : Promise.resolve([]),
      sources.includes('intake_submission')
        ? this.prisma.clientIntakeSubmission.findMany({
            where: { tenantId, clientId: id },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: scanTake,
            select: {
              id: true,
              status: true,
              submittedAt: true,
              claimedAt: true,
              reviewedAt: true,
              createdAt: true,
              caseId: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const items = [
      ...groups[0].map((row: any) => this.notificationTimelineItem(row)),
      ...groups[1].map((row: any) => this.intakeSubmissionTimelineItem(row)),
    ]
      .sort(compareTimelineItems)
      .filter((item) => !cursor || isAfterCursor(item, cursor));

    const page = items.slice(0, limit);
    const hasNextPage = items.length > limit;

    return {
      data: page,
      pageInfo: {
        nextCursor: hasNextPage ? this.encodeTimelineCursor(page[page.length - 1]) : null,
        hasNextPage,
        limit,
      },
    };
  }

  /**
   * Client Workspace Action Catalog V1 (read-only).
   *
   * <remarks>
   * Cagrildigi yerler:
   * - ClientController.actionCatalog() -> GET /clients/:clientId/action-catalog (Client Workspace read model)
   * </remarks>
   */
  async getActionCatalog(id: string, tenantId: string, actorRole?: string | null): Promise<ClientActionCatalogResponse> {
    const client = await this.prisma.client.findFirst({
      where: { id, tenantId, isActive: true },
      select: {
        id: true,
        phone: true,
        email: true,
        contactFollowUpStatus: true,
        caseClients: {
          where: { case: { tenantId } },
          orderBy: { createdAt: 'desc' },
          take: 2,
          select: { caseId: true },
        },
        powerOfAttorneys: {
          where: { isActive: true },
          orderBy: [{ validUntil: 'asc' }, { createdAt: 'desc' }],
          take: 10,
          select: { status: true, isLimited: true, validUntil: true },
        },
      },
    });
    if (!client) throw new NotFoundException('Client not found');

    return {
      data: buildClientActionCatalog({
        actorRole: normalizeClientActionRole(actorRole),
        client,
      }),
    };
  }

  /**
   * Client Workspace Operating Snapshot V1 (read-only).
   *
   * <remarks>
   * Cagrildigi yerler:
   * - ClientController.operatingSnapshot() -> GET /clients/:clientId/operating-snapshot (Client Workspace health read model)
   * </remarks>
   */
  async getOperatingSnapshot(id: string, tenantId: string): Promise<ClientOperatingSnapshotResponse> {
    const client = await this.prisma.client.findFirst({
      where: { id, tenantId, isActive: true },
      select: {
        id: true,
        phone: true,
        email: true,
        contactFollowUpStatus: true,
      },
    });
    if (!client) throw new NotFoundException('Client not found');

    const deliveryStaleBefore = new Date(Date.now() - CLIENT_INTAKE_DELIVERY_STALE_MS);
    const [poas, latestSubmission, latestLink, latestNotification, latestDeliveryIssue, openTasks] = await Promise.all([
      this.prisma.clientPowerOfAttorney.findMany({
        where: { clientId: id, isActive: true },
        orderBy: [{ validUntil: 'asc' }, { createdAt: 'desc' }],
        take: 10,
        select: { id: true, status: true, validUntil: true },
      }),
      this.prisma.clientIntakeSubmission.findFirst({
        where: { tenantId, clientId: id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          status: true,
          submittedAt: true,
          claimedAt: true,
          reviewedAt: true,
          createdAt: true,
          caseId: true,
        },
      }),
      this.prisma.clientIntakeLink.findFirst({
        where: { tenantId, clientId: id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { id: true, status: true, expiresAt: true, caseId: true },
      }),
      this.prisma.clientNotification.findFirst({
        where: { tenantId, clientId: id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          type: true,
          channel: true,
          status: true,
          sentAt: true,
          deliveredAt: true,
          createdAt: true,
          caseId: true,
        },
      }),
      this.prisma.clientIntakeLinkDelivery.findFirst({
        where: {
          tenantId,
          clientId: id,
          OR: [
            { status: 'FAILED' },
            { status: 'PENDING', updatedAt: { lt: deliveryStaleBefore } },
            { status: 'SENDING', updatedAt: { lt: deliveryStaleBefore } },
          ],
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          status: true,
          channel: true,
          caseId: true,
          updatedAt: true,
        },
      }),
      this.prisma.task.findMany({
        where: {
          tenantId,
          clientId: id,
          taskCategory: 'OPERATIONAL_COMPLETENESS',
          status: { in: ['PENDING', 'IN_PROGRESS'] },
        },
        orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          status: true,
          dueDate: true,
          missingFields: true,
          escalationLevel: true,
          nextFollowUpAt: true,
        },
      }),
    ]);

    return {
      data: buildClientOperatingSnapshot(id, client, poas, latestSubmission, latestLink, latestNotification, latestDeliveryIssue, openTasks),
    };
  }
  /**
   * Client Workspace POA reminder typed command V1.
   *
   * <remarks>
   * Cagrildigi yerler:
   * - ClientController.sendPoaReminder() -> POST /clients/:clientId/poa-reminders/send (manual typed command)
   * </remarks>
   */
  async sendPoaReminder(id: string, tenantId: string): Promise<ClientPoaReminderSendResult> {
    const client = await this.prisma.client.findFirst({
      where: { id, tenantId, isActive: true },
      select: { id: true },
    });
    if (!client) throw new NotFoundException('Client not found');

    if (!this.poaExpiryDelivery) {
      throw new Error('POA expiry delivery service is not configured');
    }

    const result = await this.poaExpiryDelivery.sendExpiringPoaNotificationsForClient(tenantId, client.id);
    return {
      clientId: client.id,
      status: poaReminderCommandStatus(result),
      ...result,
    };
  }


  private parseTimelineLimit(raw?: string): number {
    if (raw === undefined || raw === '') return CLIENT_TIMELINE_DEFAULT_LIMIT;
    if (!/^\d+$/.test(raw)) throw new BadRequestException('Invalid limit');
    const limit = Number(raw);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > CLIENT_TIMELINE_MAX_LIMIT) {
      throw new BadRequestException('Invalid limit');
    }
    return limit;
  }

  private parseTimelineSources(raw?: string): ClientTimelineSource[] {
    if (!raw || !raw.trim()) return CLIENT_TIMELINE_DEFAULT_SOURCES;
    const values = raw.split(',').map((item) => item.trim()).filter(Boolean);
    if (values.length === 0) return CLIENT_TIMELINE_DEFAULT_SOURCES;
    for (const source of values) {
      if (!CLIENT_TIMELINE_ALLOWED_SOURCES.has(source as ClientTimelineSource)) {
        throw new BadRequestException(`Unknown timeline source: ${source}`);
      }
    }
    return Array.from(new Set(values as ClientTimelineSource[]));
  }

  private parseTimelineCursor(raw?: string): ClientTimelineCursor | null {
    if (!raw) return null;
    try {
      const decoded = Buffer.from(raw, 'base64url').toString('utf8');
      const parsed = JSON.parse(decoded) as Partial<ClientTimelineCursor>;
      if (
        typeof parsed.occurredAt !== 'string' ||
        typeof parsed.id !== 'string' ||
        !CLIENT_TIMELINE_ALLOWED_SOURCES.has(parsed.source as ClientTimelineSource) ||
        Number.isNaN(new Date(parsed.occurredAt).getTime())
      ) {
        throw new Error('invalid cursor');
      }
      return parsed as ClientTimelineCursor;
    } catch {
      throw new BadRequestException('Invalid cursor');
    }
  }

  private encodeTimelineCursor(item: ClientTimelineItem): string {
    return Buffer.from(JSON.stringify({ occurredAt: item.occurredAt, source: item.source, id: item.id })).toString('base64url');
  }

  private notificationTimelineItem(row: any): ClientTimelineItem {
    const status = String(row.status ?? 'PENDING').toUpperCase();
    const occurredAt = row.deliveredAt ?? row.sentAt ?? row.createdAt;
    const eventType = `NOTIFICATION_${status}`;
    const title = row.subject || notificationTypeLabel(row.type) || 'Client notification';
    return {
      id: row.id,
      source: 'client_notification',
      eventType,
      occurredAt: toIso(occurredAt),
      title,
      summary: `${notificationChannelLabel(row.channel)} notification: ${notificationStatusLabel(status)}`,
      status,
      caseId: row.caseId ?? null,
      metadataSafe: {
        channel: row.channel ?? null,
        notificationType: row.type ?? null,
      },
    };
  }

  private intakeSubmissionTimelineItem(row: any): ClientTimelineItem {
    const status = String(row.status ?? 'CLIENT_SUBMITTED').toUpperCase();
    const occurredAt = row.reviewedAt ?? row.claimedAt ?? row.submittedAt ?? row.createdAt;
    return {
      id: row.id,
      source: 'intake_submission',
      eventType: intakeEventType(status),
      occurredAt: toIso(occurredAt),
      title: intakeTitle(status),
      summary: intakeSummary(status),
      status,
      caseId: row.caseId ?? null,
    };
  }
  // Create client
  async create(tenantId: string, data: any, actor?: AuditActor) {
    // TCKN veya VKN ile duplicate kontrolü
    const identityNo = data.tckn || data.vkn;
    if (identityNo) {
      const existing = await this.prisma.client.findFirst({
        where: {
          tenantId,
          OR: [
            { tckn: identityNo },
            { vkn: identityNo },
            { identityNo: identityNo },
          ],
        },
      });
      
      if (existing) {
        // FIX A (PR-1): duplicate eşleşme SOFT-DELETED ise GERİ GETİR (reactivate).
        // Silme = soft-delete (isActive=false). Silinmiş müvekkili yeniden ekleme/yeniden tarama
        // eskiden kaydı isActive=false bırakıyordu → findAll (isActive=true) gizliyordu (vekaletleri olsa da).
        const wasReactivated = existing.isActive === false;
        if (wasReactivated) {
          // C0-a: reaktivasyon mutation + audit AYNI transaction; CLIENT_CREATE'ten ayrı action.
          await this.prisma.$transaction(async (tx) => {
            await tx.client.update({ where: { id: existing.id }, data: { isActive: true } });
            await this.audit.logInTransaction(tx, {
              tenantId,
              action: 'CLIENT_REACTIVATE',
              entityType: 'CLIENT',
              entityId: existing.id,
              userId: actor?.userId,
              metadata: { reactivatedFromDedupe: true },
            });
          });
          console.log(`[ClientService] Soft-deleted müvekkil reaktive edildi: ${existing.id} (${existing.displayName})`);
        } else {
          console.log(`[ClientService] Duplicate müvekkil bulundu: ${existing.id} (${existing.displayName})`);
        }
        // PR-AUDIT-1: duplicate'te SESSİZ döndürme yerine UX sinyali (POA deseni). Transient alanlar
        // (persist EDİLMEZ, kontrat bozulmaz) → frontend "zaten kayıtlı / geri getirildi" bildirir.
        // includeInactive: dedup hedefi (reactivate edilmemiş duplicate) soft-deleted olabilir;
        // mutasyon-sonrası dönüş davranışı korunur (Task 4A findOne default-exclude'dan etkilenmez).
        const result = await this.findOne(existing.id, tenantId, { includeInactive: true });
        return { ...(result as any), _existingReturned: true, _reactivated: wasReactivated };
      }
    }

    // Task A/Faz 1 (owner-locked 2026-06-30): GERÇEKTEN YENİ kayıt için TCKN/VKN mod-10/11 checksum zorunlu.
    // Dedup/reactivate'TEN SONRA → legacy (geçersiz-checksum) müvekkilin yeniden-eklenmesi/reactivate'i
    // KİLİTLENMEZ (eski veri dokunulmaz). Domain katmanı → tüm create yolları (modal·cases/new·Excel·seed)
    // tutarlı. update() ETKİLENMEZ (Faz 4). Boş kimlik serbest; identityNo doğrulanmaz (util'e bkz).
    assertCreateIdentityChecksum(data);

    const displayName = data.type === 'COMPANY' || data.type === 'PUBLIC'
      ? data.companyName
      : `${data.firstName || ''} ${data.lastName || ''}`.trim();

    // Birincil telefon ve email (geriye uyumluluk)
    const primaryPhone = data.phones?.find((p: any) => p.isPrimary)?.value || data.phones?.[0]?.value || data.phone;
    const primaryEmail = data.emails?.find((e: any) => e.isPrimary)?.value || data.emails?.[0]?.value || data.email;
    
    // Birincil adres
    const primaryAddress = data.addresses?.find((a: any) => a.isPrimary) || data.addresses?.[0];
    const addressStr = primaryAddress 
      ? [primaryAddress.street, primaryAddress.district, primaryAddress.city].filter(Boolean).join(', ')
      : [data.address, data.district, data.city].filter(Boolean).join(', ') || undefined;

    // C0-a: client + contact yazımı + audit AYNI transaction (audit yazılamazsa create rollback).
    const client = await this.prisma.$transaction(async (tx) => {
      const createdClient = await tx.client.create({
      data: {
        tenantId,
        type: data.type || 'PERSON',
        displayName: displayName,
        name: displayName || data.name,
        firstName: data.firstName,
        lastName: data.lastName,
        tckn: data.tckn,
        companyName: data.companyName,
        vkn: data.vkn,
        identityNo: data.tckn || data.vkn || data.identityNo,
        taxOffice: data.taxOffice,
        email: primaryEmail,
        phone: primaryPhone,
        address: addressStr,
        city: primaryAddress?.city || data.city,
        district: primaryAddress?.district || data.district,
        region: primaryAddress?.region || data.region,
        // RFA-017: mevcut Client kolonları (additive). Önceden map'lenmiyordu → Excel import
        // (ve normal create) bu alanları sessizce DÜŞÜRÜYORDU. Yeni kolon/migration YOK.
        postalCode: data.postalCode,
        isForeigner: data.isForeigner ?? undefined,
        nationality: data.nationality,
        companyType: data.companyType,
        mersisNo: data.mersisNo,
        ticaretSicilNo: data.ticaretSicilNo,
        // P0.7: gender (Excel import row 5 gönderiyor) + detsisNo create'te map'lenmiyordu → sessiz veri kaybı.
        gender: data.gender,
        detsisNo: data.detsisNo,
        canCollect: data.canCollect ?? true,
        canWaive: data.canWaive ?? false,
        canSettle: data.canSettle ?? false,
        canRelease: data.canRelease ?? false,
        notes: data.notes,
        // Tebrik alanları
        birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
        foundingDate: data.foundingDate ? new Date(data.foundingDate) : undefined,
        poaStartDate: data.poaStartDate ? new Date(data.poaStartDate) : undefined,
        sendBirthdayGreeting: data.sendBirthdayGreeting ?? true,
        sendAnniversaryGreeting: data.sendAnniversaryGreeting ?? true,
        sendHolidayGreeting: data.sendHolidayGreeting ?? true,
        greetingChannel: data.greetingChannel || 'EMAIL',
      },
    });

    // Çoklu telefon kaydet
    if (data.phones?.length > 0) {
      await tx.clientContact.createMany({
        data: data.phones.map((p: any, idx: number) => ({
          clientId: createdClient.id,
          type: p.type || 'MOBILE',
          value: p.value,
          label: p.label,
          isPrimary: p.isPrimary || idx === 0,
        })),
      });
    }

    // Çoklu email kaydet
    if (data.emails?.length > 0) {
      await tx.clientContact.createMany({
        data: data.emails.map((e: any, idx: number) => ({
          clientId: createdClient.id,
          type: 'EMAIL',
          value: e.value,
          label: e.label,
          isPrimary: e.isPrimary || idx === 0,
        })),
      });
    }

      await this.audit.logInTransaction(tx, {
        tenantId,
        action: 'CLIENT_CREATE',
        entityType: 'CLIENT',
        entityId: createdClient.id,
        userId: actor?.userId,
        metadata: {
          fieldDiff: buildClientFieldDiff(null, createdClient),
          contactsDiff: buildContactsDiff([], data.phones, data.emails),
        },
      });

      return createdClient;
    });

    // PR-1: operasyonel iletişim eksiği görevini senkronla (YAN ETKİ → transaction DIŞINDA)
    await this.syncContactFollowUpTaskSafe(tenantId, {
      id: client.id,
      phone: primaryPhone,
      email: primaryEmail,
      contactFollowUpStatus: null,
    });

    return this.findOne(client.id, tenantId, { includeInactive: true });
  }

  // Müvekkil güncelle
  async update(id: string, tenantId: string, data: any, actor?: AuditActor) {
    // C0-a (acceptance #2): contacts diff için old snapshot CONTACTS ile alınır.
    const existing = await this.prisma.client.findFirst({
      where: { id, tenantId },
      include: { contacts: true },
    });
    if (!existing) throw new NotFoundException('Müvekkil bulunamadı');

    // PR-U4: UPDATE-PATH kimlik-block (önce guard YOKTU). Müvekkilde TCKN zorunlu/kesin ayrıştırıcı →
    // isim-review YOK (false-positive riski); yalnız kesin kimlik (TCKN/VKN) collision block.
    // Self (id) HARİÇ, yalnız AKTİF kayıtlar, yalnız kimlik GERÇEKTEN değişince.
    const tcknChanged = data.tckn !== undefined && data.tckn !== existing.tckn;
    const vknChanged = data.vkn !== undefined && data.vkn !== existing.vkn;
    if (tcknChanged || vknChanged) {
      const orConds: any[] = [];
      if (data.tckn) orConds.push({ tckn: data.tckn }, { identityNo: data.tckn });
      if (data.vkn) orConds.push({ vkn: data.vkn }, { identityNo: data.vkn });
      if (orConds.length > 0) {
        const dup = await this.prisma.client.findFirst({
          where: { tenantId, isActive: true, id: { not: id }, OR: orConds },
        });
        if (dup) {
          throw new ConflictException({
            code: 'DUPLICATE_IDENTITY',
            message: 'Bu kimlik numarasına sahip başka bir müvekkil mevcut',
            existingClient: { id: dup.id, name: (dup as any).displayName || (dup as any).name },
          });
        }
      }
    }

    const displayName = data.type === 'COMPANY' || data.type === 'PUBLIC'
      ? data.companyName
      : `${data.firstName || ''} ${data.lastName || ''}`.trim();

    // Birincil telefon ve email
    const primaryPhone = data.phones?.find((p: any) => p.isPrimary)?.value || data.phones?.[0]?.value || data.phone;
    const primaryEmail = data.emails?.find((e: any) => e.isPrimary)?.value || data.emails?.[0]?.value || data.email;
    
    // Birincil adres
    const primaryAddress = data.addresses?.find((a: any) => a.isPrimary) || data.addresses?.[0];
    const addressStr = primaryAddress 
      ? [primaryAddress.street, primaryAddress.district, primaryAddress.city].filter(Boolean).join(', ')
      : [data.address, data.district, data.city].filter(Boolean).join(', ') || undefined;

    // C0-a: client + contact yazımı + audit AYNI transaction.
    await this.prisma.$transaction(async (tx) => {
      // P0.5: tenant-scoped write — update() whereUnique tenantId taşıyamaz; updateMany {id,tenantId} guard.
      const { count } = await tx.client.updateMany({
      where: { id, tenantId },
      data: {
        type: data.type,
        displayName: displayName,
        name: displayName || data.name || existing.name,
        firstName: data.firstName,
        lastName: data.lastName,
        tckn: data.tckn,
        companyName: data.companyName,
        vkn: data.vkn,
        identityNo: data.tckn || data.vkn || data.identityNo,
        taxOffice: data.taxOffice,
        email: primaryEmail,
        phone: primaryPhone,
        address: addressStr,
        city: primaryAddress?.city || data.city,
        district: primaryAddress?.district || data.district,
        region: primaryAddress?.region || data.region,
        canCollect: data.canCollect,
        canWaive: data.canWaive,
        canSettle: data.canSettle,
        canRelease: data.canRelease,
        notes: data.notes,
        isActive: data.isActive,
        // P0.7: create paritesi — create'te map'lenip update'te DÜŞEN alanlar (sessiz veri kaybı önlenir).
        postalCode: data.postalCode,
        isForeigner: data.isForeigner ?? undefined,
        nationality: data.nationality,
        companyType: data.companyType,
        mersisNo: data.mersisNo,
        ticaretSicilNo: data.ticaretSicilNo,
        gender: data.gender,
        detsisNo: data.detsisNo,
        // Tebrik alanları
        birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
        foundingDate: data.foundingDate ? new Date(data.foundingDate) : undefined,
        poaStartDate: data.poaStartDate ? new Date(data.poaStartDate) : undefined,
        sendBirthdayGreeting: data.sendBirthdayGreeting,
        sendAnniversaryGreeting: data.sendAnniversaryGreeting,
        sendHolidayGreeting: data.sendHolidayGreeting,
        greetingChannel: data.greetingChannel,
      },
    });
      if (count === 0) throw new NotFoundException('Müvekkil bulunamadı');
      const updated = await tx.client.findFirst({ where: { id, tenantId } });
      if (!updated) throw new NotFoundException('Müvekkil bulunamadı');

    // Contacts güncelle (sil ve yeniden oluştur)
    if (data.phones || data.emails) {
      await tx.clientContact.deleteMany({ where: { clientId: id } });
      
      const contacts: any[] = [];
      if (data.phones?.length > 0) {
        data.phones.forEach((p: any, idx: number) => {
          contacts.push({
            clientId: id,
            type: p.type || 'MOBILE',
            value: p.value,
            label: p.label,
            isPrimary: p.isPrimary || idx === 0,
          });
        });
      }
      if (data.emails?.length > 0) {
        data.emails.forEach((e: any, idx: number) => {
          contacts.push({
            clientId: id,
            type: 'EMAIL',
            value: e.value,
            label: e.label,
            isPrimary: e.isPrimary || idx === 0,
          });
        });
      }
      if (contacts.length > 0) {
        await tx.clientContact.createMany({ data: contacts });
      }
    }

      await this.audit.logInTransaction(tx, {
        tenantId,
        action: 'CLIENT_UPDATE',
        entityType: 'CLIENT',
        entityId: id,
        userId: actor?.userId,
        metadata: {
          fieldDiff: buildClientFieldDiff(existing, updated),
          contactsDiff: (data.phones || data.emails)
            ? buildContactsDiff((existing as any).contacts, data.phones, data.emails)
            : { changed: false },
        },
      });
    });

    // PR-1: operasyonel iletişim eksiği görevini senkronla (WAIVED kararı 'existing'ten gelir)
    await this.syncContactFollowUpTaskSafe(tenantId, {
      id,
      phone: primaryPhone,
      email: primaryEmail,
      contactFollowUpStatus: (existing as any).contactFollowUpStatus ?? null,
    });

    // includeInactive: update isActive:false yapmış olabilir (arşivleme); güncellenen kaydı yine döndür.
    return this.findOne(id, tenantId, { includeInactive: true });
  }

  /**
   * Operasyonel iletişim eksiği görevini müvekkilin GERÇEK alan durumuna göre senkronlar.
   * Hata client akışını BOZMAZ (safe wrapper).
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ClientService.create() → vekalet "Bilgileri Kullan" + Manuel Ekle (POST /clients)
   * - ClientService.update() → müvekkil düzenleme (PUT /clients/:id)
   * NOT: Excel import (prisma.client.create, service bypass) çağırmaz (bilinçli).
   * </remarks>
   */
  private async syncContactFollowUpTaskSafe(
    tenantId: string,
    client: { id: string; phone?: string | null; email?: string | null; contactFollowUpStatus?: string | null }
  ): Promise<void> {
    try {
      await this.syncContactFollowUpTask(tenantId, client);
    } catch (e: any) {
      console.error(`[ClientService] contact follow-up sync hatası (client ${client.id}): ${e?.message}`);
    }
  }

  private async syncContactFollowUpTask(
    tenantId: string,
    client: { id: string; phone?: string | null; email?: string | null; contactFollowUpStatus?: string | null }
  ): Promise<void> {
    const dedupeKey = contactTaskDedupeKey(client.id);
    const existing = await this.prisma.task.findUnique({ where: { dedupeKey } });

    // WAIVED: kalıcı karar → görev üretme; açık görev varsa iptal et.
    if (client.contactFollowUpStatus === 'WAIVED') {
      if (existing && existing.status !== 'CANCELLED' && existing.status !== 'COMPLETED') {
        await this.prisma.task.update({ where: { id: existing.id }, data: { status: 'CANCELLED' } });
      }
      return;
    }

    const missing = computeMissingContactFields(client);

    // Eksik yok → tamamlandı.
    if (missing.length === 0) {
      if (existing && existing.status !== 'COMPLETED' && existing.status !== 'CANCELLED') {
        await this.prisma.task.update({
          where: { id: existing.id },
          // PR-PERF-1: sistem kapanışı → AUTO_SYSTEM + completedByUserId null (insan kapanışından ayrılır).
          data: { status: 'COMPLETED', completedAt: new Date(), resolutionType: 'AUTO_SYSTEM', completedByUserId: null },
        });
      }
      if (client.contactFollowUpStatus === 'ACTIVE') {
        await this.prisma.client.update({
          where: { id: client.id },
          data: { contactFollowUpStatus: 'COMPLETED' },
        });
      }
      return;
    }

    // Eksik var, WAIVED değil → tek satır upsert (dedupe ile tek aktif görev).
    const now = new Date();
    const due = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000); // +3 gün SLA
    const description = `Eksik iletişim bilgisi: ${missing.join(', ')}`;
    const reopening = !!existing && (existing.status === 'COMPLETED' || existing.status === 'CANCELLED');

    if (existing) {
      await this.prisma.task.update({
        where: { id: existing.id },
        data: {
          missingFields: missing,
          description,
          // Kapalı görevi yeniden aç + SLA/eskalasyonu sıfırla; açık görevse sadece eksik listesini güncelle.
          // PR-PERF-1: yeniden açılışta eski kapanış izini de temizle (stale atıf bırakmaz).
          ...(reopening
            ? { status: 'PENDING', completedAt: null, completedByUserId: null, resolutionType: null, dueDate: due, escalationLevel: 'STAFF', nextFollowUpAt: due }
            : {}),
        },
      });
    } else {
      await this.prisma.task.create({
        data: {
          tenantId,
          clientId: client.id,
          title: 'Müvekkil iletişim bilgilerini tamamla',
          description,
          status: 'PENDING',
          priority: 'MEDIUM',
          taskCategory: 'OPERATIONAL_COMPLETENESS',
          dedupeKey,
          missingFields: missing,
          dueDate: due,
          escalationLevel: 'STAFF',
          nextFollowUpAt: due,
        },
      });
    }

    if (client.contactFollowUpStatus !== 'ACTIVE') {
      await this.prisma.client.update({
        where: { id: client.id },
        data: { contactFollowUpStatus: 'ACTIVE' },
      });
    }
  }

  /**
   * TEK SEFERLİK BAKIM: özellik canlıya inmeden ÖNCE oluşmuş, iletişim bilgisi eksik
   * müvekkiller için görev/rozet üretir (yeni kayıtlar sync'ten geçiyor; eskiler geçmedi).
   * - WAIVED'a DOKUNMAZ · ACTIVE zaten var · COMPLETED'ı yeniden aktive ETMEZ (şimdilik)
   * - Yalnız contactFollowUpStatus=null & eksik olanlara görev üretir (dedupeKey ile mükerrer yok)
   * Idempotent: tekrar çalıştırmak güvenli.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ClientController.backfillContactFollowUp() → POST /clients/backfill-contact-followup (admin)
   * </remarks>
   */
  async backfillContactFollowUp(
    tenantId: string
  ): Promise<{ scanned: number; createdOrUpdated: number; skippedWaived: number; alreadyActive: number }> {
    const clients = await this.prisma.client.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, phone: true, email: true, contactFollowUpStatus: true },
    });

    let scanned = 0;
    let createdOrUpdated = 0;
    let skippedWaived = 0;
    let alreadyActive = 0;

    for (const c of clients) {
      scanned++;
      const missing = computeMissingContactFields(c);
      if (missing.length === 0) continue; // tam → dokunma
      if (c.contactFollowUpStatus === 'WAIVED') { skippedWaived++; continue; }
      if (c.contactFollowUpStatus === 'ACTIVE') { alreadyActive++; continue; }
      if (c.contactFollowUpStatus === 'COMPLETED') continue; // şimdilik dokunma
      // status === null & eksik → görev üret + ACTIVE (dedupe'lu)
      await this.syncContactFollowUpTaskSafe(tenantId, {
        id: c.id,
        phone: c.phone,
        email: c.email,
        contactFollowUpStatus: null,
      });
      createdOrUpdated++;
    }

    return { scanned, createdOrUpdated, skippedWaived, alreadyActive };
  }

  // Müvekkil sil (soft delete)
  async remove(id: string, tenantId: string, actor?: AuditActor) {
    const existing = await this.prisma.client.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Müvekkil bulunamadı');
    // Task 8A: lifecycle capability gate — transaction'dan ÖNCE (yetkisiz aktör hiçbir yazma yapmaz).
    await this.assertCanManageLifecycle(actor?.userId, tenantId);
    // C0-a: soft-delete + audit AYNI transaction (old snapshot delete ÖNCESİ alındı).
    return this.prisma.$transaction(async (tx) => {
      // P0.5: tenant-scoped soft-delete (updateMany {id,tenantId}).
      const { count } = await tx.client.updateMany({ where: { id, tenantId }, data: { isActive: false } });
      if (count === 0) throw new NotFoundException('Müvekkil bulunamadı');
      await this.audit.logInTransaction(tx, {
        tenantId,
        action: 'CLIENT_DELETE',
        entityType: 'CLIENT',
        entityId: id,
        userId: actor?.userId,
        metadata: { softDelete: true, oldSnapshot: buildClientRemoveSnapshot(existing) },
      });
      return { ...existing, isActive: false };
    });
  }

  // Arama
  async search(tenantId: string, query: string) {
    return this.prisma.client.findMany({
      where: {
        tenantId,
        isActive: true,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { identityNo: { contains: query } },
          { email: { contains: query, mode: 'insensitive' } },
        ],
      },
      orderBy: { name: 'asc' },
      take: 20,
    });
  }
}

function compareTimelineItems(a: ClientTimelineItem, b: ClientTimelineItem): number {
  const byDate = new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime();
  if (byDate !== 0) return byDate;
  const bySource = a.source.localeCompare(b.source);
  if (bySource !== 0) return bySource;
  return b.id.localeCompare(a.id);
}

function isAfterCursor(item: ClientTimelineItem, cursor: ClientTimelineCursor): boolean {
  return compareTimelineItems(item, {
    id: cursor.id,
    source: cursor.source,
    occurredAt: cursor.occurredAt,
    eventType: '',
    title: '',
    summary: '',
    status: '',
  }) > 0;
}

function toIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString();
}

function notificationTypeLabel(type?: string | null): string | null {
  const labels: Record<string, string> = {
    CLIENT_INFO: 'Client information',
    INTAKE_LINK: 'Intake link notification',
    MASRAF_ISTEK: 'Expense request',
    GENEL_BILGILENDIRME: 'Information',
    RAPOR: 'Report',
    HATIRLATMA: 'Reminder',
    TEST: 'Test notification',
    DIGER: 'Notification',
  };
  return type ? labels[type] ?? type : null;
}

function notificationChannelLabel(channel?: string | null): string {
  const labels: Record<string, string> = { EMAIL: 'Email', SMS: 'SMS', WHATSAPP: 'WhatsApp' };
  return channel ? labels[channel] ?? channel : 'Notification';
}

function notificationStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    PENDING: 'pending',
    SENT: 'sent',
    DELIVERED: 'delivered',
    FAILED: 'failed',
  };
  return labels[status] ?? status;
}

function intakeEventType(status: string): string {
  const map: Record<string, string> = {
    CLIENT_SUBMITTED: 'INTAKE_SUBMITTED',
    IN_REVIEW: 'INTAKE_CLAIMED',
    PARTIALLY_PROMOTED: 'INTAKE_PARTIALLY_PROMOTED',
    COMPLETED: 'INTAKE_COMPLETED',
    REJECTED: 'INTAKE_REJECTED',
  };
  return map[status] ?? 'INTAKE_UPDATED';
}

function intakeTitle(status: string): string {
  const map: Record<string, string> = {
    CLIENT_SUBMITTED: 'Intake submission received',
    IN_REVIEW: 'Intake review started',
    PARTIALLY_PROMOTED: 'Intake partially processed',
    COMPLETED: 'Intake completed',
    REJECTED: 'Intake rejected',
  };
  return map[status] ?? 'Intake updated';
}

function intakeSummary(status: string): string {
  const map: Record<string, string> = {
    CLIENT_SUBMITTED: 'Client submitted the canonical intake form.',
    IN_REVIEW: 'Intake submission entered review.',
    PARTIALLY_PROMOTED: 'Some intake fields were promoted to canonical records.',
    COMPLETED: 'Intake review completed.',
    REJECTED: 'Intake submission rejected.',
  };
  return map[status] ?? 'Intake lifecycle status changed.';
}

interface ClientActionCatalogClientState {
  id: string;
  phone?: string | null;
  email?: string | null;
  contactFollowUpStatus?: string | null;
  caseClients?: Array<{ caseId: string | null }> | null;
  powerOfAttorneys?: Array<{ status?: string | null; isLimited?: boolean | null; validUntil?: Date | string | null }> | null;
}

interface ClientActionCatalogContext {
  actorRole: ClientActionRole;
  client: ClientActionCatalogClientState;
}

const CLIENT_ACTION_ROLE_RANK: Record<ClientActionRole, number> = {
  VIEWER: 0,
  USER: 1,
  ADMIN: 2,
};

function normalizeClientActionRole(rawRole?: string | null): ClientActionRole {
  const role = String(rawRole ?? 'USER').toUpperCase();
  if (role === 'ADMIN' || role === 'USER' || role === 'VIEWER') return role;
  return 'USER';
}

function buildClientActionCatalog(context: ClientActionCatalogContext): ClientActionCatalogItem[] {
  const clientId = context.client.id;
  const target = { clientId };
  const relatedCaseIds = (context.client.caseClients ?? [])
    .map((caseClient) => caseClient.caseId)
    .filter((caseId): caseId is string => !!caseId);
  const hasRelatedCase = relatedCaseIds.length > 0;
  const singleRelatedCaseId = relatedCaseIds.length === 1 ? relatedCaseIds[0] : undefined;
  const intakeCreateEnabled = !!singleRelatedCaseId;
  const intakeCreateDisabledReason = intakeCreateEnabled
    ? undefined
    : hasRelatedCase
      ? 'Select a related case before creating an intake link.'
      : 'No related cases are linked to this client yet.';
  const missingContactFields = computeMissingContactFields(context.client);
  const poaReminderEnabled = hasPoaReminderEligiblePowerOfAttorney(context.client.powerOfAttorneys);
  const poaReminderDisabledReason = poaReminderEnabled
    ? undefined
    : 'POA reminder is available only for active limited powers of attorney expiring within 30 days.';
  const contactState = context.client.contactFollowUpStatus === 'WAIVED'
    ? 'CONTACT_FOLLOW_UP_WAIVED'
    : missingContactFields.length > 0
      ? 'CONTACT_INFO_MISSING'
      : 'CONTACT_INFO_COMPLETE';

  const candidates: ClientActionCatalogItem[] = [
    {
      key: 'contact.update_missing_info',
      label: 'Update contact information',
      description: 'Open the client identity and contact information screen.',
      category: 'contact',
      enabled: true,
      visibility: 'visible',
      dangerLevel: 'low',
      requiredRole: 'USER',
      requiredState: contactState,
      target,
      href: `/clients/${clientId}`,
      order: 10,
    },
    {
      key: 'case.open_related',
      label: 'Open related cases',
      description: 'Open the cases tab for this client.',
      category: 'case',
      enabled: hasRelatedCase,
      disabledReason: hasRelatedCase ? undefined : 'No related cases are linked to this client yet.',
      visibility: 'visible',
      dangerLevel: 'low',
      requiredRole: 'VIEWER',
      requiredState: hasRelatedCase ? 'RELATED_CASE_AVAILABLE' : 'RELATED_CASE_EMPTY',
      target,
      href: hasRelatedCase ? `/clients/${clientId}` : undefined,
      order: 20,
    },
    {
      key: 'activity.view_timeline',
      label: 'View activity timeline',
      description: 'Open the safe client activity timeline.',
      category: 'activity',
      enabled: true,
      visibility: 'visible',
      dangerLevel: 'low',
      requiredRole: 'VIEWER',
      requiredState: 'TIMELINE_READ_AVAILABLE',
      target,
      href: `/clients/${clientId}`,
      order: 30,
    },
    {
      key: 'intake.link.create',
      label: 'Create intake link',
      description: 'Create a client intake link for the selected related case.',
      category: 'intake',
      enabled: intakeCreateEnabled,
      disabledReason: intakeCreateDisabledReason,
      visibility: 'visible',
      dangerLevel: 'medium',
      requiredRole: 'USER',
      requiredState: intakeCreateEnabled
        ? 'INTAKE_CREATE_AVAILABLE'
        : hasRelatedCase
          ? 'INTAKE_CASE_SELECTION_REQUIRED'
          : 'RELATED_CASE_EMPTY',
      target: singleRelatedCaseId ? { ...target, caseId: singleRelatedCaseId } : target,
      order: 40,
    },
    {
      key: 'intake.link.send',
      label: 'Send intake link',
      description: 'Future typed command; real dispatch is outside V1 catalog scope.',
      category: 'intake',
      enabled: false,
      disabledReason: 'Intake link sending requires dispatch and idempotency contracts.',
      visibility: 'visible',
      dangerLevel: 'medium',
      requiredRole: 'USER',
      requiredState: 'INTAKE_DISPATCH_CONTRACT_READY',
      target,
      order: 50,
    },
    {
      key: 'poa.reminder.send',
      label: 'Send POA reminder',
      description: 'Send a dedupe-aware internal POA expiry reminder for active expiring powers of attorney.',
      category: 'poa',
      enabled: poaReminderEnabled,
      disabledReason: poaReminderDisabledReason,
      visibility: 'visible',
      dangerLevel: 'medium',
      requiredRole: 'USER',
      requiredState: poaReminderEnabled ? 'POA_EXPIRING_ACTIVE' : 'POA_REMINDER_NOT_ELIGIBLE',
      target,
      order: 60,
    },
    {
      key: 'notification.template.send',
      label: 'Send template notification',
      description: 'Future typed command; V1 catalog does not create or send notifications.',
      category: 'notification',
      enabled: false,
      disabledReason: 'Template notification requires a notification dispatch contract.',
      visibility: 'visible',
      dangerLevel: 'medium',
      requiredRole: 'USER',
      requiredState: 'NOTIFICATION_DISPATCH_CONTRACT_READY',
      target,
      order: 70,
    },
  ];

  return candidates
    .map((item) => applyClientActionPolicy(item, context.actorRole))
    .filter((item): item is ClientActionCatalogItem => item !== null)
    .sort((a, b) => a.order - b.order);
}

function hasPoaReminderEligiblePowerOfAttorney(
  poas?: Array<{ status?: string | null; isLimited?: boolean | null; validUntil?: Date | string | null }> | null,
  now: Date = new Date(),
): boolean {
  const until = new Date(now);
  until.setDate(until.getDate() + 30);
  return (poas ?? []).some((poa) => {
    if (String(poa.status ?? '').toUpperCase() !== 'ACTIVE') return false;
    if (poa.isLimited !== true || !poa.validUntil) return false;
    const validUntil = new Date(poa.validUntil);
    if (Number.isNaN(validUntil.getTime())) return false;
    return validUntil >= now && validUntil <= until;
  });
}

function poaReminderCommandStatus(result: PoaExpiryDeliveryRunResult): ClientPoaReminderSendStatus {
  if (result.sent > 0 && result.failed === 0) return 'sent';
  if (result.sent > 0 && result.failed > 0) return 'partial';
  if (result.sent === 0 && result.failed > 0) return 'failed';
  return 'skipped';
}

function applyClientActionPolicy(item: ClientActionCatalogItem, actorRole: ClientActionRole): ClientActionCatalogItem | null {
  if (item.visibility !== 'visible') return null;
  const requiredRole = normalizeClientActionRole(item.requiredRole);
  if (CLIENT_ACTION_ROLE_RANK[actorRole] < CLIENT_ACTION_ROLE_RANK[requiredRole]) return null;

  if (item.enabled) {
    const { disabledReason, ...enabledItem } = item;
    return enabledItem;
  }

  return {
    ...item,
    disabledReason: item.disabledReason?.trim() || 'Action is disabled by current client workspace policy.',
    href: undefined,
  };
}
function buildClientOperatingSnapshot(
  clientId: string,
  client: { phone?: string | null; email?: string | null; contactFollowUpStatus?: string | null },
  poas: Array<{ status?: string | null; validUntil?: Date | string | null }>,
  latestSubmission: any | null,
  latestLink: any | null,
  latestNotification: any | null,
  latestDeliveryIssue: any | null,
  openTasks: Array<{ dueDate?: Date | string | null; escalationLevel?: string | null; nextFollowUpAt?: Date | string | null }>,
): ClientOperatingSnapshot {
  const now = new Date();
  const target = { clientId };
  const signals: ClientOperatingSignal[] = [];
  const missingContactFields = computeMissingContactFields(client);
  const overdueTasks = openTasks.filter((task) => isPastDate(task.dueDate, now));
  const nextFollowUpAt = earliestDate(openTasks.map((task) => task.nextFollowUpAt ?? task.dueDate));
  const escalationLevel = openTasks.find((task) => task.escalationLevel)?.escalationLevel ?? null;
  const contactStatus = client.contactFollowUpStatus === 'WAIVED'
    ? 'waived'
    : missingContactFields.length > 0
      ? 'missing'
      : 'complete';

  if (contactStatus === 'missing') {
    signals.push({
      key: 'contact.missing_info',
      label: 'Contact information is incomplete',
      description: `Missing contact fields: ${missingContactFields.join(', ')}`,
      severity: 'warning',
      actionKey: 'contact.update_missing_info',
      target,
    });
  }
  if (overdueTasks.length > 0) {
    signals.push({
      key: 'contact.follow_up_overdue',
      label: 'Contact follow-up is overdue',
      description: 'At least one operational completeness task is past due.',
      severity: 'critical',
      actionKey: 'contact.update_missing_info',
      target,
    });
  }

  const activePoas = poas.filter((poa) => String(poa.status ?? '').toUpperCase() === 'ACTIVE' && !isPastDate(poa.validUntil, now));
  const nearestValidUntil = earliestDate(activePoas.map((poa) => poa.validUntil));
  const poaExpiring = !!nearestValidUntil && new Date(nearestValidUntil).getTime() <= now.getTime() + 30 * 24 * 60 * 60 * 1000;
  const poaStatus = activePoas.length === 0
    ? poas.length > 0
      ? 'expired_or_inactive'
      : 'missing'
    : poaExpiring
      ? 'expiring'
      : 'active';

  if (poaStatus === 'missing' || poaStatus === 'expired_or_inactive') {
    signals.push({
      key: 'poa.missing_or_inactive',
      label: 'Active POA is missing',
      description: 'No active power of attorney is available for this client.',
      severity: 'warning',
      actionKey: 'poa.reminder.send',
      target,
    });
  } else if (poaStatus === 'expiring') {
    signals.push({
      key: 'poa.expiring',
      label: 'POA is expiring soon',
      description: 'The nearest active power of attorney expires within 30 days.',
      severity: 'warning',
      actionKey: 'poa.reminder.send',
      target,
    });
  }

  const intakeStatus = computeIntakeStatus(latestSubmission, latestLink);
  if (intakeStatus === 'submitted' || intakeStatus === 'in_review') {
    signals.push({
      key: 'intake.pending_review',
      label: 'Intake needs review',
      description: 'Latest intake submission is not completed yet.',
      severity: 'warning',
      target: { clientId, caseId: latestSubmission?.caseId ?? null },
    });
  }

  const deliveryIssueStatus = String(latestDeliveryIssue?.status ?? '').toUpperCase();
  if (deliveryIssueStatus === 'FAILED') {
    signals.push({
      key: 'intake.delivery_failed',
      label: 'Intake link delivery failed',
      description: 'Latest intake link delivery failed and needs manual attention.',
      severity: 'warning',
      actionKey: 'intake.link.create',
      target: { clientId, caseId: latestDeliveryIssue?.caseId ?? null },
    });
  } else if (deliveryIssueStatus === 'PENDING' || deliveryIssueStatus === 'SENDING') {
    signals.push({
      key: 'intake.delivery_stuck',
      label: 'Intake link delivery is stuck',
      description: 'Latest intake link delivery is not finalized after the safe processing window.',
      severity: 'warning',
      actionKey: 'intake.link.create',
      target: { clientId, caseId: latestDeliveryIssue?.caseId ?? null },
    });
  }

  const notificationStatus = computeNotificationStatus(latestNotification);
  if (notificationStatus === 'failed') {
    signals.push({
      key: 'notification.failed',
      label: 'Latest notification failed',
      description: 'The latest client notification has failed status.',
      severity: 'warning',
      actionKey: 'notification.template.send',
      target: { clientId, caseId: latestNotification?.caseId ?? null },
    });
  }

  const riskLevel = signals.some((signal) => signal.severity === 'critical')
    ? 'high'
    : signals.some((signal) => signal.severity === 'warning')
      ? 'medium'
      : 'low';
  const health = riskLevel === 'high' ? 'blocked' : riskLevel === 'medium' ? 'attention' : 'healthy';

  return {
    clientId,
    health,
    riskLevel,
    contact: {
      status: contactStatus,
      missingFields: contactStatus === 'missing' ? missingContactFields : [],
      followUpStatus: client.contactFollowUpStatus ?? null,
      openTaskCount: openTasks.length,
      overdueTaskCount: overdueTasks.length,
      nextFollowUpAt,
      escalationLevel,
    },
    poa: {
      status: poaStatus,
      activeCount: activePoas.length,
      nearestValidUntil,
    },
    intake: {
      status: intakeStatus,
      latestSubmission: latestSubmission
        ? {
            id: latestSubmission.id,
            status: latestSubmission.status,
            caseId: latestSubmission.caseId ?? null,
            occurredAt: toIso(latestSubmission.reviewedAt ?? latestSubmission.claimedAt ?? latestSubmission.submittedAt ?? latestSubmission.createdAt),
          }
        : null,
      latestLink: latestLink
        ? {
            id: latestLink.id,
            status: latestLink.status,
            caseId: latestLink.caseId ?? null,
            expiresAt: toIsoOrNull(latestLink.expiresAt),
          }
        : null,
    },
    notification: {
      status: notificationStatus,
      latest: latestNotification
        ? {
            id: latestNotification.id,
            status: latestNotification.status,
            type: latestNotification.type ?? null,
            channel: latestNotification.channel ?? null,
            caseId: latestNotification.caseId ?? null,
            occurredAt: toIso(latestNotification.deliveredAt ?? latestNotification.sentAt ?? latestNotification.createdAt),
          }
        : null,
    },
    signals,
  };
}

function computeIntakeStatus(latestSubmission: any | null, latestLink: any | null): ClientOperatingSnapshot['intake']['status'] {
  if (latestSubmission) {
    const status = String(latestSubmission.status ?? '').toUpperCase();
    if (status === 'CLIENT_SUBMITTED') return 'submitted';
    if (status === 'IN_REVIEW' || status === 'PARTIALLY_PROMOTED') return 'in_review';
    if (status === 'COMPLETED') return 'completed';
    if (status === 'REJECTED') return 'rejected';
  }
  if (String(latestLink?.status ?? '').toUpperCase() === 'ACTIVE') return 'link_active';
  return 'none';
}

function computeNotificationStatus(latestNotification: any | null): ClientOperatingSnapshot['notification']['status'] {
  if (!latestNotification) return 'none';
  const status = String(latestNotification.status ?? '').toUpperCase();
  if (status === 'FAILED') return 'failed';
  if (status === 'PENDING') return 'pending';
  return 'healthy';
}

function earliestDate(values: Array<Date | string | null | undefined>): string | null {
  const dates = values
    .filter((value): value is Date | string => !!value)
    .map((value) => new Date(value))
    .filter((value) => !Number.isNaN(value.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  return dates[0] ? dates[0].toISOString() : null;
}

function isPastDate(value: Date | string | null | undefined, now: Date): boolean {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() < now.getTime();
}

function toIsoOrNull(value: Date | string | null | undefined): string | null {
  return value ? toIso(value) : null;
}
