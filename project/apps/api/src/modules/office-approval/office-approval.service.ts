// P4-1 — OfficeApprovalService (kurumsal Approval Engine substrate; salt-veri omurgası).
//
// İÇ kurumsal onay kaydının yaşam döngüsünü yönetir: requester (işlemi başlatan) ≠ approver
// (PARTNER veya canApproveOfficeActions delege avukat). HENÜZ HİÇBİR ROUTE/AKIŞA BAĞLI DEĞİL — yalnız
// bu servis çağrıldığında çalışır; P4-1'de hiçbir controller onu çağırmaz → uygulama davranışı DEĞİŞMEZ.
//
// KESİN KARARLAR (Ulaş kilidi):
//  - EventStore YOK → olgusal kayıt AuditLog'a (OFFICE_APPROVAL_*). Ham savedIntent audit'e YAZILMAZ (yalnız payloadHash).
//  - Self-approval: approver === requester → 400 (SELF_APPROVAL_FORBIDDEN). (PARTNER'ın kendi işlemini doğrudan
//    yapması decide()/resolver katmanında ALLOW ile çözülür [P4-2]; oraya gelirse zaten request oluşmaz.)
//  - Approver yeterliliği: aktif + aynı tenant + linkli Lawyer + (lawyerRank=PARTNER VEYA canApproveOfficeActions=true). Staff ASLA.
//  - Deferred execution P4-3'te; burada yalnız execution durum işaretleyicileri (status=APPROVED ön-koşullu).
//  - Geçişler koşullu-update (updateMany where status=...) ile yarış-güvenli + idempotent.

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import {
  Prisma,
  OfficeApprovalRequest,
  OfficeApprovalStatus,
  OfficeApprovalExecutionStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { stableJsonHash } from '../permission-diagnostics/guided-edge/canonical-json';

export interface CreatePendingRequestInput {
  tenantId: string;
  actionCode: string;
  targetType: string;
  targetRef: string;
  requesterUserId: string;
  savedIntent: unknown; // onaylanınca yürütülecek niyet (ham GİRDİ; kod/closure değil)
  reason?: string;
  expiresAt?: Date;
  idempotencyKey?: string;
}

@Injectable()
export class OfficeApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** PENDING_APPROVAL + NOT_RUN kayıt oluşturur. idempotencyKey verildiyse mevcutu döner (çift-talep engeli). */
  async createPendingRequest(input: CreatePendingRequestInput): Promise<OfficeApprovalRequest> {
    if (input.idempotencyKey) {
      const existing = await this.prisma.officeApprovalRequest.findUnique({
        where: { tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey: input.idempotencyKey } },
      });
      if (existing) return existing; // idempotent: aynı niyet tekrar gelirse mevcut talep
    }
    const payloadHash = stableJsonHash(input.savedIntent);
    let created: OfficeApprovalRequest;
    try {
      created = await this.prisma.officeApprovalRequest.create({
        data: {
          tenantId: input.tenantId,
          actionCode: input.actionCode,
          targetType: input.targetType,
          targetRef: input.targetRef,
          requesterUserId: input.requesterUserId,
          savedIntent: input.savedIntent as object,
          payloadHash,
          reason: input.reason ?? null,
          idempotencyKey: input.idempotencyKey ?? null,
          expiresAt: input.expiresAt ?? null,
          status: OfficeApprovalStatus.PENDING_APPROVAL,
          executionStatus: OfficeApprovalExecutionStatus.NOT_RUN,
        },
      });
    } catch (e) {
      // P4-1A: eşzamanlı çift-talep yarışı → unique(tenantId,idempotencyKey) ihlali (P2002) → mevcut kaydı dön (idempotent).
      if (
        input.idempotencyKey &&
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        const existing = await this.prisma.officeApprovalRequest.findUnique({
          where: { tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey: input.idempotencyKey } },
        });
        if (existing) return existing;
      }
      throw e;
    }
    await this.auditLog('OFFICE_APPROVAL_REQUESTED', created, input.requesterUserId);
    return created;
  }

  /** Approver (≠requester, yetkili) PENDING talebi APPROVED yapar. Dış-etki YÜRÜTÜLMEZ (yalnız karar). */
  async approve(id: string, approverUserId: string, note?: string): Promise<OfficeApprovalRequest> {
    const req = await this.requireRequest(id);
    this.assertStatus(req, OfficeApprovalStatus.PENDING_APPROVAL);
    this.assertNotSelfApproval(req, approverUserId);
    await this.assertApproverEligible(approverUserId, req.tenantId);
    return this.commitDecision(id, OfficeApprovalStatus.APPROVED, approverUserId, note ?? null, 'OFFICE_APPROVAL_APPROVED');
  }

  /** Approver PENDING talebi REJECTED yapar. Gerekçe (note) ZORUNLU. İç taslak silinmez; dış-etki oluşmaz. */
  async reject(id: string, approverUserId: string, note: string): Promise<OfficeApprovalRequest> {
    if (!note || !note.trim()) throw new BadRequestException('Reddetme gerekçesi zorunludur.');
    const req = await this.requireRequest(id);
    this.assertStatus(req, OfficeApprovalStatus.PENDING_APPROVAL);
    this.assertNotSelfApproval(req, approverUserId);
    await this.assertApproverEligible(approverUserId, req.tenantId);
    return this.commitDecision(id, OfficeApprovalStatus.REJECTED, approverUserId, note, 'OFFICE_APPROVAL_REJECTED');
  }

  /**
   * P4-1A — "Değiştirerek onayla": approver requester'ın önerisini DEĞİŞTİREREK kesinleştirir (ör. ACIZ→BATAK).
   * Orijinal savedIntent ASLA ezilmez; approver'ın kararı replacementSavedIntent + replacementPayloadHash olarak
   * AYRI iz bırakır (audit çizgisi korunur). status → APPROVED_WITH_CHANGES.
   */
  async approveWithChanges(
    id: string,
    approverUserId: string,
    replacementSavedIntent: unknown,
    note?: string,
  ): Promise<OfficeApprovalRequest> {
    if (replacementSavedIntent === undefined || replacementSavedIntent === null) {
      throw new BadRequestException('Değiştirilmiş niyet (replacementSavedIntent) zorunludur.');
    }
    const req = await this.requireRequest(id);
    this.assertStatus(req, OfficeApprovalStatus.PENDING_APPROVAL);
    this.assertNotSelfApproval(req, approverUserId);
    await this.assertApproverEligible(approverUserId, req.tenantId);
    const replacementPayloadHash = stableJsonHash(replacementSavedIntent);
    return this.commitDecision(
      id,
      OfficeApprovalStatus.APPROVED_WITH_CHANGES,
      approverUserId,
      note ?? null,
      'OFFICE_APPROVAL_APPROVED_WITH_CHANGES',
      { replacementSavedIntent: replacementSavedIntent as object, replacementPayloadHash },
    );
  }

  /**
   * P4-1A — "Düzelt ve tekrar gönder": REJECTED DEĞİL (farklı kurumsal karar). Revizyon notu ZORUNLU.
   * status → REVISION_REQUESTED. (Resubmit akışı P4-2+; bu substrate yalnız kararı kaydeder.)
   */
  async requestRevision(id: string, approverUserId: string, note: string): Promise<OfficeApprovalRequest> {
    if (!note || !note.trim()) throw new BadRequestException('Revizyon notu zorunludur.');
    const req = await this.requireRequest(id);
    this.assertStatus(req, OfficeApprovalStatus.PENDING_APPROVAL);
    this.assertNotSelfApproval(req, approverUserId);
    await this.assertApproverEligible(approverUserId, req.tenantId);
    return this.commitDecision(id, OfficeApprovalStatus.REVISION_REQUESTED, approverUserId, note, 'OFFICE_APPROVAL_REVISION_REQUESTED');
  }

  /** Talep sahibi (requester) kendi PENDING talebini geri çeker → CANCELLED. */
  async cancel(id: string, byUserId: string): Promise<OfficeApprovalRequest> {
    const req = await this.requireRequest(id);
    this.assertStatus(req, OfficeApprovalStatus.PENDING_APPROVAL);
    if (byUserId !== req.requesterUserId) {
      throw new ForbiddenException('Yalnız talep sahibi iptal edebilir.');
    }
    const res = await this.prisma.officeApprovalRequest.updateMany({
      where: { id, status: OfficeApprovalStatus.PENDING_APPROVAL },
      data: { status: OfficeApprovalStatus.CANCELLED, decidedAt: new Date() },
    });
    if (res.count === 0) throw new ConflictException('Talep eşzamanlı değiştirildi.');
    const updated = await this.requireRequest(id);
    await this.auditLog('OFFICE_APPROVAL_CANCELLED', updated, byUserId);
    return updated;
  }

  /** Deferred execution sonucu: APPROVED talebi yürütme başarılı işaretler. (Yürütmeyi caller yapar — P4-3.) */
  markExecutionSucceeded(id: string, byUserId: string): Promise<OfficeApprovalRequest> {
    return this.markExecution(id, OfficeApprovalExecutionStatus.SUCCEEDED, 'OFFICE_APPROVAL_EXECUTION_SUCCEEDED', byUserId, true);
  }

  /**
   * P4-5C-1: FAILED işaretler + retry metadata yazar (retryCount++ , lastRetryAt=now). Bu metadata 5C-1'de yalnız KAYDEDİLİR
   * (tüketen retry yolu 5C-2'de). reconcile'ın not-applied dalı da buraya gelir → orphan da retryCount'a sayılır (sonsuz-döngü önlenir).
   */
  markExecutionFailed(id: string, byUserId: string): Promise<OfficeApprovalRequest> {
    return this.markExecution(id, OfficeApprovalExecutionStatus.FAILED, 'OFFICE_APPROVAL_EXECUTION_FAILED', byUserId, false, {
      retryCount: { increment: 1 },
      lastRetryAt: new Date(),
    });
  }

  /** Bayat-onay: APPROVED ama yürütme anında ön-koşul tutmadı → STALE (otomatik replay YOK). */
  markExecutionStale(id: string, byUserId: string): Promise<OfficeApprovalRequest> {
    return this.markExecution(id, OfficeApprovalExecutionStatus.STALE, 'OFFICE_APPROVAL_EXECUTION_STALE', byUserId, false);
  }

  /**
   * P4-5A — Yürütme KİLİDİ (compare-and-set): yalnız NOT_RUN → RUNNING. Deferred executor APPLY'dan ÖNCE çağırır;
   * eşzamanlı/ikinci claim (zaten RUNNING ya da terminal) → updateMany count 0 → ConflictException (çift-apply fence).
   * NOT: terminal markExecution* {NOT_RUN,RUNNING} kabul eder; bu marker STRICT NOT_RUN-only — RUNNING re-claim'i de fence'ler.
   * Geçiş tek yerde (compare-and-set otoritesi bu sınıfta); executor kendi updateMany'ini kopyalamaz (K3-3a).
   *
   * /// <remarks>
   * /// Çağrıldığı yerler:
   * ///  - OfficeApprovalExecutorService.execute() → CHANGE_STATUS deferred executor (P4-5A; route/cron YOK).
   * /// </remarks>
   */
  async markExecutionRunning(id: string, byUserId: string): Promise<OfficeApprovalRequest> {
    const req = await this.requireRequest(id);
    const executable =
      req.status === OfficeApprovalStatus.APPROVED || req.status === OfficeApprovalStatus.APPROVED_WITH_CHANGES;
    if (!executable) {
      throw new ConflictException('Yalnız APPROVED/APPROVED_WITH_CHANGES talep yürütülebilir/işaretlenebilir.');
    }
    const res = await this.prisma.officeApprovalRequest.updateMany({
      where: {
        id,
        status: { in: [OfficeApprovalStatus.APPROVED, OfficeApprovalStatus.APPROVED_WITH_CHANGES] },
        executionStatus: OfficeApprovalExecutionStatus.NOT_RUN, // STRICT: yalnız NOT_RUN → RUNNING (çift-claim fence)
      },
      // P4-5C-1: runningStartedAt=claim anı → precise stuck-RUNNING timeout (reconcile yaşa bakar; age-blind değil).
      data: { executionStatus: OfficeApprovalExecutionStatus.RUNNING, runningStartedAt: new Date() },
    });
    if (res.count === 0) throw new ConflictException('Yürütme zaten talep edilmiş veya sonlanmış (RUNNING-lock).');
    const updated = await this.requireRequest(id);
    await this.auditLog('OFFICE_APPROVAL_EXECUTION_STARTED', updated, byUserId);
    return updated;
  }

  // ───────────────────────── P4-4 read (Inbox/Detail; TENANT-SCOPED) ─────────────────────────

  /**
   * P4-4 — Inbox/Mine listesi (tenant-scoped). view='inbox' → tenant'ın PENDING havuzu, requester'ın KENDİ talebi HARİÇ
   * (self-approval paritesi); view='mine' → caller'ın KENDİ talepleri (tüm statüler). status verilirse filtreler.
   * NOT: inbox eligibility KONTROLÜ controller'da (yetkisiz→boş liste); bu metod yalnız tenant+view filtresi uygular.
   *
   * /// <remarks>
   * /// Çağrıldığı yerler:
   * ///  - OfficeApprovalController.inbox()/mine() → GET /office-approvals/inbox · GET /office-approvals/mine.
   * /// </remarks>
   */
  async listForTenant(
    tenantId: string,
    opts: { view: 'inbox' | 'mine'; callerUserId: string; status?: OfficeApprovalStatus },
  ): Promise<OfficeApprovalRequest[]> {
    const where: Prisma.OfficeApprovalRequestWhereInput = { tenantId };
    if (opts.view === 'inbox') {
      where.status = opts.status ?? OfficeApprovalStatus.PENDING_APPROVAL; // default: bekleyenler
      where.requesterUserId = { not: opts.callerUserId }; // KENDİ talebini onaylama paritesi → inbox'ta gösterme
    } else {
      where.requesterUserId = opts.callerUserId; // mine: yalnız kendi talepleri
      if (opts.status) where.status = opts.status;
    }
    return this.prisma.officeApprovalRequest.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  /**
   * P4-4 — DETAIL için TENANT-SCOPED tek kayıt. private requireRequest TENANT-FİLTRESİZ olduğundan HTTP'ye AÇILMAZ;
   * bu metod where:{id,tenantId} ile çapraz-tenant okumayı engeller → mismatch'te 404 (existence-oracle yok).
   * (Görünürlük [requester ∨ eligible-approver] kontrolü controller'da.)
   *
   * /// <remarks>
   * /// Çağrıldığı yerler:
   * ///  - OfficeApprovalController.detail() → GET /office-approvals/:id.
   * /// </remarks>
   */
  async getByIdForTenant(id: string, tenantId: string): Promise<OfficeApprovalRequest> {
    const req = await this.prisma.officeApprovalRequest.findFirst({ where: { id, tenantId } });
    if (!req) throw new NotFoundException('Onay talebi bulunamadı.');
    return req;
  }

  // ───────────────────────── internals ─────────────────────────

  private async requireRequest(id: string): Promise<OfficeApprovalRequest> {
    const req = await this.prisma.officeApprovalRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Onay talebi bulunamadı.');
    return req;
  }

  private assertStatus(req: OfficeApprovalRequest, expected: OfficeApprovalStatus): void {
    if (req.status !== expected) {
      throw new ConflictException(`Onay talebi '${req.status}' durumunda; '${expected}' bekleniyordu.`);
    }
  }

  private assertNotSelfApproval(req: OfficeApprovalRequest, approverUserId: string): void {
    if (approverUserId === req.requesterUserId) {
      throw new BadRequestException('SELF_APPROVAL_FORBIDDEN: Kendi talebinizi onaylayamaz/reddedemezsiniz.');
    }
  }

  /**
   * Approver yeterliliği PREDİKATI (paylaşılan; P4-4 inbox filtresi + assertApproverEligible + shadow service aynı
   * lawyerRank/canApproveOfficeActions kuralını kullansın → drift YOK). aktif + aynı tenant + linkli Lawyer +
   * (PARTNER veya canApproveOfficeActions). Staff DEĞİL (Lawyer linki yok). THROW ETMEZ → bool döner.
   *
   * /// <remarks>
   * /// Çağrıldığı yerler:
   * ///  - OfficeApprovalService.assertApproverEligible() (karar metodları) · OfficeApprovalController (inbox eligibility + detail visibility).
   * /// </remarks>
   */
  async isApproverEligible(userId: string, tenantId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { lawyer: { select: { lawyerRank: true, canApproveOfficeActions: true } } },
    });
    if (!user || !user.isActive || user.tenantId !== tenantId) return false;
    const lw = user.lawyer;
    return !!lw && (lw.lawyerRank === 'PARTNER' || lw.canApproveOfficeActions === true);
  }

  /** Approver yeterliliği — değilse 403. (Predikat isApproverEligible'da; karar metodları bunu çağırır.) */
  private async assertApproverEligible(approverUserId: string, tenantId: string): Promise<void> {
    if (!(await this.isApproverEligible(approverUserId, tenantId))) {
      throw new ForbiddenException('Onay yetkisi yok (aktif, aynı tenant, PARTNER veya yetkilendirilmiş avukat gerekir).');
    }
  }

  private async commitDecision(
    id: string,
    next: OfficeApprovalStatus,
    approverUserId: string,
    note: string | null,
    auditAction: string,
    extra: Record<string, unknown> = {},
  ): Promise<OfficeApprovalRequest> {
    const res = await this.prisma.officeApprovalRequest.updateMany({
      where: { id, status: OfficeApprovalStatus.PENDING_APPROVAL },
      // NOT: savedIntent (orijinal niyet) burada ASLA güncellenmez; approver değişikliği yalnız extra (replacement*) ile gelir.
      data: { status: next, approverUserId, decidedAt: new Date(), decisionNote: note, ...extra },
    });
    if (res.count === 0) throw new ConflictException('Talep eşzamanlı değiştirildi; karar uygulanmadı.');
    const updated = await this.requireRequest(id);
    await this.auditLog(auditAction, updated, approverUserId);
    return updated;
  }

  /** Yürütme işaretleyicisi: yalnız status=APPROVED + executionStatus NOT_RUN/RUNNING → tek-yön geçiş (idempotent). */
  private async markExecution(
    id: string,
    next: OfficeApprovalExecutionStatus,
    auditAction: string,
    byUserId: string,
    setExecutedAt: boolean,
    extraData: Prisma.OfficeApprovalRequestUpdateManyMutationInput = {}, // P4-5C-1: FAILED'de retryCount/lastRetryAt için
  ): Promise<OfficeApprovalRequest> {
    const req = await this.requireRequest(id);
    // APPROVED ve APPROVED_WITH_CHANGES yürütülebilir onay durumlarıdır (ikisi de "onaylandı").
    const executable =
      req.status === OfficeApprovalStatus.APPROVED || req.status === OfficeApprovalStatus.APPROVED_WITH_CHANGES;
    if (!executable) {
      throw new ConflictException('Yalnız APPROVED/APPROVED_WITH_CHANGES talep yürütülebilir/işaretlenebilir.');
    }
    const res = await this.prisma.officeApprovalRequest.updateMany({
      where: {
        id,
        status: { in: [OfficeApprovalStatus.APPROVED, OfficeApprovalStatus.APPROVED_WITH_CHANGES] },
        executionStatus: { in: [OfficeApprovalExecutionStatus.NOT_RUN, OfficeApprovalExecutionStatus.RUNNING] },
      },
      data: { executionStatus: next, ...(setExecutedAt ? { executedAt: new Date() } : {}), ...extraData },
    });
    if (res.count === 0) throw new ConflictException('Yürütme zaten sonlanmış (idempotent guard).');
    const updated = await this.requireRequest(id);
    await this.auditLog(auditAction, updated, byUserId);
    return updated;
  }

  /** Olgusal kayıt AuditLog'a. GİZLİLİK: ham savedIntent YAZILMAZ — yalnız payloadHash + kimlik/durum alanları. */
  private async auditLog(action: string, req: OfficeApprovalRequest, actorUserId: string): Promise<void> {
    await this.audit.log({
      tenantId: req.tenantId,
      action,
      entityType: 'OFFICE_APPROVAL',
      entityId: req.id,
      userId: actorUserId, // truthful actor (system/unknown DEĞİL)
      metadata: {
        actionCode: req.actionCode,
        targetType: req.targetType,
        targetRef: req.targetRef,
        status: req.status,
        executionStatus: req.executionStatus,
        payloadHash: req.payloadHash, // HASH only — ham savedIntent/payload audit'e SIZMAZ
        ...(req.replacementPayloadHash ? { replacementPayloadHash: req.replacementPayloadHash } : {}), // yalnız hash
        requesterUserId: req.requesterUserId,
        ...(req.approverUserId ? { approverUserId: req.approverUserId } : {}),
        // NOT: ham decisionNote/reason/savedIntent/replacementSavedIntent audit metadata'ya YAZILMAZ (yalnız DB alanları).
      },
    });
  }
}
