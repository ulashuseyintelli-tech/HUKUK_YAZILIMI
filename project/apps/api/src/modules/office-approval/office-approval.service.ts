// P4-1 — OfficeApprovalService (kurumsal Approval Engine substrate; salt-veri omurgası).
//
// İÇ kurumsal onay kaydının yaşam döngüsünü yönetir: requester (işlemi başlatan) ≠ approver
// (PARTNER veya canApproveOfficeActions delege avukat). AKTİF TÜKETİCİLERİ VAR: DispositionPostingService
// (recommend/approve) ve ClientPayoutService (requestPayout/finalize, PAYOUT-APPROVAL-2 route'u) bu servisi
// çağırıyor — "hiçbir controller onu çağırmaz" notu ARTIK GEÇERLİ DEĞİL, düzeltildi (OFFICE WS0.3/T0.3.3
// REVISION 2'de tespit edildi).
//
// KESİN KARARLAR (Ulaş kilidi):
//  - EventStore YOK → olgusal kayıt AuditLog'a (OFFICE_APPROVAL_*). Ham savedIntent audit'e YAZILMAZ (yalnız payloadHash).
//  - Self-approval: approver === requester → 400 (SELF_APPROVAL_FORBIDDEN). DBIND §5 gereği yalnız
//    CLIENT_PAYOUT_POST approve() akışında, PayoutApprovalPolicy eligible üst-seviye aktör için dar istisna vardır.
//  - OFFICE SLICE-02 (OFF/OD-11, RATIFIED T0.3.4 REVISION 3): self-approval karşılaştırması UserAccount-eşitliğine
//    EK OLARAK (additive, ASLA yerine değil) Lawyer/StaffMember TCKN candidate-set kesişimini de kapsar —
//    bkz. isSameApprovalIdentity()/resolveSelfApprovalIdentityCandidates(). TCKN yalnız bu resolver İÇİNDE
//    geçici bir correlation signal'dır, canonical identity DEĞİLDİR, başka hiçbir subsystem'e sızmaz.
//  - Approver yeterliliği: aktif + aynı tenant + linkli Lawyer + (lawyerRank=PARTNER VEYA canApproveOfficeActions=true). Staff ASLA.
//  - Deferred execution P4-3'te; burada yalnız execution durum işaretleyicileri (status=APPROVED ön-koşullu).
//  - Geçişler koşullu-update (updateMany where status=...) ile yarış-güvenli + idempotent.
//  - PAYOUT-APPROVAL-2 (2026-07-04): eligibility artık actionCode'a göre dispatch edilir
//    (resolveApproverEligible). CLIENT_PAYOUT_POST izole PayoutApprovalPolicy'ye gider (MANAGER dahil);
//    her başka actionCode (disposition dahil) yukarıdaki kuralı AYNEN kullanır — sıfır regresyon.

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
import { ActionCode } from '../policy-engine/types/action-code.enum';
import { OfficeApprovalDomainSyncService } from './office-approval-domain-sync.service';
import { PayoutApprovalPolicy } from './client-payout-approval.policy';
import { ClientFinancialDisclosureApprovalPolicy } from './client-financial-disclosure-approval.policy';
import { isValidTckn } from '../../common/identity-validation.util';

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
    private readonly domainSync?: OfficeApprovalDomainSyncService,
    // PAYOUT-APPROVAL-2: mevcut 2/3-argümanlı çağıranlar (testler dahil) etkilenmez — prisma'dan
    // kendi kendine kurulur (ClientPayoutService.journalWriter ile AYNI desen).
    private readonly payoutApprovalPolicy: PayoutApprovalPolicy = new PayoutApprovalPolicy(prisma),
    private readonly clientFinancialDisclosureApprovalPolicy: ClientFinancialDisclosureApprovalPolicy = new ClientFinancialDisclosureApprovalPolicy(
      prisma,
    ),
  ) {}

  /**
   * PENDING_APPROVAL + NOT_RUN kayıt oluşturur. idempotencyKey verildiyse VE mevcut kayıt HÂLÂ PENDING_APPROVAL
   * ise onu döner (çift-talep engeli, davranış DEĞİŞMEDİ). H7: mevcut kayıt TERMİNAL (karara bağlanmış —
   * APPROVED/APPROVED_WITH_CHANGES/REJECTED/CANCELLED/REVISION_REQUESTED/EXPIRED) ise ARTIK O KAYIT DÖNDÜRÜLMEZ
   * (önceden: caller'a "PENDING_APPROVAL" yalanı söyletiyordu + aynı niyet bir daha ASLA yeni talep açamıyordu —
   * kalıcı liveness kilidi). Terminal kaydın idempotencyKey'i CAS ile namespace'lenip boşaltılır (kayıt SİLİNMEZ,
   * kendi id'siyle denetim izinde kalır), ardından normal create() akışı devam eder → taze, gerçekten
   * PENDING_APPROVAL bir kayıt oluşur. Eşzamanlı çağrılar: CAS'i kaybeden de create()'e düşer; create P2002 alırsa
   * MEVCUT catch bloğu (aşağıda) taze kaydı bulup döner — race-safe, ekstra kilit gerekmez.
   */
  async createPendingRequest(input: CreatePendingRequestInput): Promise<OfficeApprovalRequest> {
    if (input.idempotencyKey) {
      const existing = await this.prisma.officeApprovalRequest.findUnique({
        where: { tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey: input.idempotencyKey } },
      });
      if (existing) {
        if (existing.status === OfficeApprovalStatus.PENDING_APPROVAL) {
          return existing; // idempotent: aynı niyet, hâlâ karar bekliyor → mevcut talep
        }
        // H7: terminal kayıt bu anahtarı işgal ediyor — canlı bir çakışma DEĞİL. Anahtarı CAS ile boşalt (yalnız
        // hâlâ bu tam değeri taşıyorsa; eşzamanlı ikinci çağrı no-op görür, aşağıda create()'e düşer).
        await this.prisma.officeApprovalRequest.updateMany({
          where: { id: existing.id, idempotencyKey: input.idempotencyKey },
          data: { idempotencyKey: `${input.idempotencyKey}::superseded:${existing.id}` },
        });
      }
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
    await this.assertApproveSelfApprovalPolicy(req, approverUserId);
    await this.assertApproverEligibleForRequest(req, approverUserId);
    return this.commitDecision(id, OfficeApprovalStatus.APPROVED, approverUserId, note ?? null, 'OFFICE_APPROVAL_APPROVED');
  }

  /** Approver PENDING talebi REJECTED yapar. Gerekçe (note) ZORUNLU. İç taslak silinmez; dış-etki oluşmaz. */
  async reject(id: string, approverUserId: string, note: string): Promise<OfficeApprovalRequest> {
    if (!note || !note.trim()) throw new BadRequestException('Reddetme gerekçesi zorunludur.');
    const req = await this.requireRequest(id);
    this.assertStatus(req, OfficeApprovalStatus.PENDING_APPROVAL);
    await this.assertNotSelfApproval(req, approverUserId);
    await this.assertApproverEligibleForRequest(req, approverUserId);
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
    await this.assertNotSelfApproval(req, approverUserId);
    await this.assertApproverEligibleForRequest(req, approverUserId);
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
    await this.assertNotSelfApproval(req, approverUserId);
    await this.assertApproverEligibleForRequest(req, approverUserId);
    return this.commitDecision(id, OfficeApprovalStatus.REVISION_REQUESTED, approverUserId, note, 'OFFICE_APPROVAL_REVISION_REQUESTED');
  }

  /** Talep sahibi (requester) kendi PENDING talebini geri çeker → CANCELLED. */
  async cancel(id: string, byUserId: string): Promise<OfficeApprovalRequest> {
    const req = await this.requireRequest(id);
    this.assertStatus(req, OfficeApprovalStatus.PENDING_APPROVAL);
    if (byUserId !== req.requesterUserId) {
      throw new ForbiddenException('Yalnız talep sahibi iptal edebilir.');
    }
    let updated: OfficeApprovalRequest | null = null;
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.officeApprovalRequest.updateMany({
        where: { id, status: OfficeApprovalStatus.PENDING_APPROVAL },
        data: { status: OfficeApprovalStatus.CANCELLED, decidedAt: new Date() },
      });
      if (res.count === 0) throw new ConflictException('Talep eszamanli degistirildi.');
      updated = await this.requireRequestInTransaction(tx, id);
      await this.domainSync?.syncAfterDecision(tx, updated);
    });
    if (!updated) throw new ConflictException('Talep eszamanli degistirildi.');
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

  /**
   * P4-5C-2 — RETRY KİLİDİ (compare-and-set): FAILED → RUNNING, yalnız retryCount < maxAttempts (BOUNDED). Cron PASS-FAILED
   * (executeRetry) APPLY'dan ÖNCE çağırır. count===0 → ConflictException (FAILED değil / retryCount>=MAX / eşzamanlı claim).
   * runningStartedAt=now (yeni claim anı → precise stuck-timeout retry'da da geçerli). retryCount BURADA artmaz (fail'de artar).
   * markExecutionRunning'den AYRI metod (NOT_RUN-only claim'i bozmaz); markExecution helper'ı da genişletilmez.
   *
   * /// <remarks>
   * /// Çağrıldığı yerler: OfficeApprovalExecutorService.executeRetry() → cron PASS-FAILED bounded retry (P4-5C-2; internal; route YOK).
   * /// </remarks>
   */
  async markExecutionRetrying(id: string, byUserId: string, maxAttempts: number): Promise<OfficeApprovalRequest> {
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
        executionStatus: OfficeApprovalExecutionStatus.FAILED, // STRICT: yalnız FAILED → RUNNING (retry claim)
        retryCount: { lt: maxAttempts }, // BOUNDED: tükenmiş satır (retryCount>=MAX) yarışta bile re-claim edilemez
      },
      data: { executionStatus: OfficeApprovalExecutionStatus.RUNNING, runningStartedAt: new Date() },
    });
    if (res.count === 0) {
      throw new ConflictException('Retry claim alınamadı (FAILED değil / retryCount>=MAX / eşzamanlı claim).');
    }
    const updated = await this.requireRequest(id);
    await this.auditLog('OFFICE_APPROVAL_EXECUTION_RETRYING', updated, byUserId);
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

  private async requireRequestInTransaction(tx: Prisma.TransactionClient, id: string): Promise<OfficeApprovalRequest> {
    const req = await tx.officeApprovalRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Onay talebi bulunamadi.');
    return req;
  }

  private assertStatus(req: OfficeApprovalRequest, expected: OfficeApprovalStatus): void {
    if (req.status !== expected) {
      throw new ConflictException(`Onay talebi '${req.status}' durumunda; '${expected}' bekleniyordu.`);
    }
  }

  /**
   * OFFICE SLICE-02 (OFF/OD-11, RATIFIED T0.3.4 REVISION 3) — bir userId'nin, VERİLEN tenantId kapsamında,
   * self-approval karşılaştırması için geçerli TCKN candidate'larını üretir. TCKN yalnız bu resolver İÇİNDE
   * geçici bir correlation signal'dır — canonical identity DEĞİLDİR, başka hiçbir subsystem bu eşitliği
   * tüketemez.
   *
   * Candidate eklenebilir IFF: profile mevcut AND profile.tenantId === tenantId (User.tenantId'ye
   * BAĞIMSIZ GÜVENİLMEZ — User↔Lawyer/StaffMember tenant tutarlılığı DB-seviyesinde zorlanmıyor) AND
   * normalize edilmiş TCKN isValidTckn() ile geçerli. isValidTckn() yalnız boolean döner; normalize edilmiş
   * karşılaştırma anahtarını BURADA ayrıca üretiyoruz.
   */
  private async resolveSelfApprovalIdentityCandidates(userId: string, tenantId: string): Promise<Set<string>> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        lawyer: { select: { tenantId: true, tckn: true } },
        staffMember: { select: { tenantId: true, tckn: true } },
      },
    });
    const candidates = new Set<string>();
    if (user?.lawyer && user.lawyer.tenantId === tenantId && isValidTckn(user.lawyer.tckn)) {
      candidates.add(String(user.lawyer.tckn).replace(/\D/g, ''));
    }
    if (user?.staffMember && user.staffMember.tenantId === tenantId && isValidTckn(user.staffMember.tckn)) {
      candidates.add(String(user.staffMember.tckn).replace(/\D/g, ''));
    }
    return candidates;
  }

  /**
   * OFFICE SLICE-02 — nihai self-approval eşleşme kuralı: sameUserAccount OR candidate-set kesişimi.
   * ADDITIVE: mevcut UserAccount-eşitlik kontrolü hiçbir dalda kaldırılmaz, yalnız üstüne eklenir —
   * bu resolver'daki bir hata/boş küme EN KÖTÜ İHTİMALLE bugünkü davranışa (UserAccount-only) düşer,
   * asla ondan daha gevşek bir sonuç üretmez.
   */
  private async isSameApprovalIdentity(userIdA: string, userIdB: string, tenantId: string): Promise<boolean> {
    if (userIdA === userIdB) return true;
    const [candidatesA, candidatesB] = await Promise.all([
      this.resolveSelfApprovalIdentityCandidates(userIdA, tenantId),
      this.resolveSelfApprovalIdentityCandidates(userIdB, tenantId),
    ]);
    for (const candidate of candidatesA) {
      if (candidatesB.has(candidate)) return true;
    }
    return false;
  }

  private async assertNotSelfApproval(req: OfficeApprovalRequest, approverUserId: string): Promise<void> {
    if (await this.isSameApprovalIdentity(approverUserId, req.requesterUserId, req.tenantId)) {
      throw new BadRequestException('SELF_APPROVAL_FORBIDDEN: Kendi talebinizi onaylayamaz/reddedemezsiniz.');
    }
  }

  /**
   * DBIND §5 runtime reconciliation: generic self-approval ban korunur; yalnız CLIENT_PAYOUT_POST approve()
   * kararında, PayoutApprovalPolicy eligible üst-seviye aktör kendi payout talebini onaylayabilir.
   * reject/requestRevision/approveWithChanges bu istisnaya dahil değildir — istisna GENİŞLETİLMEDİ.
   */
  private async assertApproveSelfApprovalPolicy(req: OfficeApprovalRequest, approverUserId: string): Promise<void> {
    if (!(await this.isSameApprovalIdentity(approverUserId, req.requesterUserId, req.tenantId))) return;
    if (req.actionCode === ActionCode.CLIENT_PAYOUT_POST) {
      await this.payoutApprovalPolicy.assertEligible(approverUserId, req.tenantId);
      return;
    }
    await this.assertNotSelfApproval(req, approverUserId);
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

  /**
   * PAYOUT-APPROVAL-2 (2026-07-04, owner kararı) — eligibility'yi actionCode'a göre dispatch eder.
   * isApproverEligible() KASITLI OLARAK DEĞİŞTİRİLMEDİ: disposition ve her başka actionCode bu
   * metodun eski davranışını AYNEN kullanmaya devam eder (sıfır regresyon). Yalnız CLIENT_PAYOUT_POST
   * izole PayoutApprovalPolicy'ye yönlendirilir (money-out için MANAGER'ı da kabul eder; bu genişleme
   * disposition'a veya başka bir actionCode'a SIZMAZ). Üçüncü bir action-özel policy gerekirse buraya
   * yeni bir dal eklenir — registry ŞİMDİLİK kurulmuyor (YAGNI, tek dal yeterli).
   */
  private async resolveApproverEligible(req: OfficeApprovalRequest, approverUserId: string): Promise<boolean> {
    if (req.actionCode === ActionCode.CLIENT_PAYOUT_POST) {
      return this.payoutApprovalPolicy.isEligible(approverUserId, req.tenantId);
    }
    // CLIENT-P2-U03-TRACK-B-I03 (charter §41, owner kararı PR #1761) — ÜÇÜNCÜ dal. Aynı izolasyon
    // deseni: yalnız bu actionCode disclosure politikasına gider (MANAGER dahil), diğer hiçbir
    // actionCode etkilenmez ve paylaşılan isApproverEligible() DEĞİŞTİRİLMEZ.
    if (req.actionCode === ActionCode.CLIENT_FINANCIAL_DISCLOSURE_APPROVE) {
      return this.clientFinancialDisclosureApprovalPolicy.isEligible(approverUserId, req.tenantId);
    }
    return this.isApproverEligible(approverUserId, req.tenantId);
  }

  /** Approver yeterliliği — değilse 403. (Predikat resolveApproverEligible'da; karar metodları bunu çağırır.) */
  private async assertApproverEligibleForRequest(req: OfficeApprovalRequest, approverUserId: string): Promise<void> {
    if (!(await this.resolveApproverEligible(req, approverUserId))) {
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
    let updated: OfficeApprovalRequest | null = null;
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.officeApprovalRequest.updateMany({
        where: { id, status: OfficeApprovalStatus.PENDING_APPROVAL },
        // NOT: savedIntent (orijinal niyet) burada ASLA guncellenmez; approver degisikligi yalniz extra (replacement*) ile gelir.
        data: { status: next, approverUserId, decidedAt: new Date(), decisionNote: note, ...extra },
      });
      if (res.count === 0) throw new ConflictException('Talep eszamanli degistirildi; karar uygulanmadi.');
      updated = await this.requireRequestInTransaction(tx, id);
      await this.domainSync?.syncAfterDecision(tx, updated);
    });
    if (!updated) throw new ConflictException('Talep eszamanli degistirildi; karar uygulanmadi.');
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
