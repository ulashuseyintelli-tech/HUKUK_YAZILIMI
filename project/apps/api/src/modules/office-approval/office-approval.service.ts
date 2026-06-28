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
    const created = await this.prisma.officeApprovalRequest.create({
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

  markExecutionFailed(id: string, byUserId: string): Promise<OfficeApprovalRequest> {
    return this.markExecution(id, OfficeApprovalExecutionStatus.FAILED, 'OFFICE_APPROVAL_EXECUTION_FAILED', byUserId, false);
  }

  /** Bayat-onay: APPROVED ama yürütme anında ön-koşul tutmadı → STALE (otomatik replay YOK). */
  markExecutionStale(id: string, byUserId: string): Promise<OfficeApprovalRequest> {
    return this.markExecution(id, OfficeApprovalExecutionStatus.STALE, 'OFFICE_APPROVAL_EXECUTION_STALE', byUserId, false);
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

  /** Approver yeterliliği: aktif + aynı tenant + linkli Lawyer + (PARTNER veya canApproveOfficeActions). Staff DEĞİL. */
  private async assertApproverEligible(approverUserId: string, tenantId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: approverUserId },
      include: { lawyer: { select: { lawyerRank: true, canApproveOfficeActions: true } } },
    });
    if (!user || !user.isActive) throw new ForbiddenException('Onaylayan kullanıcı bulunamadı veya aktif değil.');
    if (user.tenantId !== tenantId) throw new ForbiddenException('Onaylayan farklı tenant — onay verilemez.');
    const lw = user.lawyer;
    const eligible = !!lw && (lw.lawyerRank === 'PARTNER' || lw.canApproveOfficeActions === true);
    if (!eligible) {
      throw new ForbiddenException('Onay yetkisi yok (PARTNER veya yetkilendirilmiş avukat gerekir).');
    }
  }

  private async commitDecision(
    id: string,
    next: OfficeApprovalStatus,
    approverUserId: string,
    note: string | null,
    auditAction: string,
  ): Promise<OfficeApprovalRequest> {
    const res = await this.prisma.officeApprovalRequest.updateMany({
      where: { id, status: OfficeApprovalStatus.PENDING_APPROVAL },
      data: { status: next, approverUserId, decidedAt: new Date(), decisionNote: note },
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
  ): Promise<OfficeApprovalRequest> {
    const req = await this.requireRequest(id);
    if (req.status !== OfficeApprovalStatus.APPROVED) {
      throw new ConflictException('Yalnız APPROVED talep yürütülebilir/işaretlenebilir.');
    }
    const res = await this.prisma.officeApprovalRequest.updateMany({
      where: {
        id,
        status: OfficeApprovalStatus.APPROVED,
        executionStatus: { in: [OfficeApprovalExecutionStatus.NOT_RUN, OfficeApprovalExecutionStatus.RUNNING] },
      },
      data: { executionStatus: next, ...(setExecutedAt ? { executedAt: new Date() } : {}) },
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
        requesterUserId: req.requesterUserId,
        ...(req.approverUserId ? { approverUserId: req.approverUserId } : {}),
      },
    });
  }
}
