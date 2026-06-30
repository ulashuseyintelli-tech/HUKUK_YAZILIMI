import { Injectable, BadRequestException, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  AccountingJournalWriterService,
  adaptClientOffsetSourceSnapshot,
  buildAccountingJournal,
  validateJournalDraft,
  type ClientOffsetSourceSnapshot,
} from '../accounting-journal';
import { isOfficeAdminCapacity } from '../policy-engine/effective-permission-mapping';
import { Capacity } from '../policy-engine/types/effective-permission.types';
import { ClientSettlementReadService } from './client-settlement-read.service';
import { CreateClientOffsetDto, ReverseClientOffsetDto, PreviewClientOffsetDto } from './dto/client-offset.dto';

const ZERO = new Prisma.Decimal(0);
const ELIGIBLE_ROLES = ['ALACAKLI', 'ORTAK_ALACAKLI'];

/** createOffset + previewOffset ORTAK leg seçimi (idempotencyKey/amount hariç). Cross-* doğrulaması bu alanlardan. */
interface OffsetLegSelection {
  clientId: string;
  currency: string;
  payableCaseId: string;
  payableCaseClientId: string;
  expenseCaseId: string;
  expenseRequestId: string;
}

export interface EligiblePayableBucket {
  payableCaseId: string;
  payableCaseClientId: string;
  clientId: string;
  currency: string;
  availableOutstanding: string;
  caseNumber: string;
  role: string;
}
export interface EligibleExpenseRequest {
  expenseCaseId: string;
  expenseRequestId: string;
  clientId: string;
  currency: string;
  unpaidAmount: string;
  caseNumber: string;
  requestStatus: string;
}
export interface OffsetEligibility {
  clientId: string;
  currency: string;
  /** C-2a: actor mahsup uygulayabilir mi (isOfficeAdminCapacity). YALNIZ UX (drawer read-only); GÜVENLİK DEĞİL. */
  canApply: boolean;
  eligiblePayableBuckets: EligiblePayableBucket[];
  eligibleExpenseRequests: EligibleExpenseRequest[];
}

/** C-2a non-persistent önizleme sonucu. Hesap BACKEND'de yapılır; FE yalnız render eder. */
export interface OffsetPreview {
  payableBefore: string;
  payableAfter: string;
  expenseBefore: string;
  expenseAfter: string;
  netBefore: string;
  netAfter: string;
  maxAmount: string;
  netUnchanged: boolean;
}
export interface OffsetActorProjection {
  id: string | null;
  displayName: string;
}

export interface ClientOffsetAuditEventProjection {
  action: string;
  actor: OffsetActorProjection;
  createdAt: Date;
  safeSummary: string;
}

export interface ClientOffsetDetailProjection {
  offset: {
    id: string;
    clientId: string;
    kind: string;
    amount: string;
    currency: string;
    reason: string | null;
    createdAt: Date;
    createdBy: OffsetActorProjection;
    reversesOffsetId: string | null;
    reversedByOffsetId: string | null;
  };
  sourceSummary: {
    payable: {
      caseId: string;
      caseNumber: string | null;
      caseLabel: string;
      caseClientId: string;
      role: string | null;
      label: string;
    };
    expense: {
      caseId: string;
      caseNumber: string | null;
      caseLabel: string;
      expenseRequestId: string;
      status: string | null;
      label: string;
    };
  };
  auditEvents: ClientOffsetAuditEventProjection[];
}

/**
 * TM3 Faz C C-1 — Müvekkil Mahsubu (ClientOffset) service. ADR: docs/finance/adr-client-offset-cross-ledger-settlement.md
 *
 * Mahsup = müvekkile-özgü İKİ KARŞIT brüt bakiyeyi (payable proceeds + masraf borcu) AYNI tutarda,
 * nakit-hareketsiz, IMMUTABLE event ile kapatır. Net pozisyon DEĞİŞMEZ. 1 offset = 1 payable + 1 expense + 1 amount.
 *
 * GÜVENLİK (C-1 v1 = explicit PARTNER/MANAGER): @CpeRequired/CpeRequiredGuard DORMANT olduğundan ona
 * GÜVENİLMEZ; yetki BURADA explicit enforce edilir (canonical capacity = Lawyer.lawyerRank/StaffMember.staffType
 * + isOfficeAdminCapacity). JWT geçerli olsa bile PARTNER/MANAGER değilse 403. approvalRef (confirm-gate) v1'de
 * yetki SAĞLAMAZ → authorizationMode='DIRECT_CAPABILITY'. Confirm-gate entegrasyonu ayrı faz (ertelendi).
 */
@Injectable()
export class ClientOffsetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly readService: ClientSettlementReadService,
    private readonly journalWriter: AccountingJournalWriterService = new AccountingJournalWriterService(prisma),
  ) {}

  // ==================== authorization (explicit; dormant decorator'a güvenilmez) ====================

  /**
   * C-1 v1 hard gate: actor PARTNER/MANAGER (office-admin) DEĞİLSE 403. apply+reverse+cross-case+same-case HEPSİ
   * bu gate'e tabi. Canonical capacity okuması (EffectivePermissionResolver.readCapacity ile aynı mantık;
   * resolve() observe-only/enforce-etmez olduğu için BURADA enforce edilir).
   */
  /** Canonical capacity okuması (Lawyer.lawyerRank ?? StaffMember.staffType ?? UNKNOWN). EffectivePermissionResolver ile aynı. */
  private async readActorCapacity(actorUserId: string): Promise<Capacity> {
    const user = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      include: { lawyer: { select: { lawyerRank: true } }, staffMember: { select: { staffType: true } } },
    });
    return (user?.lawyer?.lawyerRank ?? user?.staffMember?.staffType ?? 'UNKNOWN') as Capacity;
  }

  /**
   * C-2a: capability'nin read-only sonucu (canApply UX flag kaynağı). GÜVENLİK DEĞİL — gerçek enforcement
   * assertOfficeAdmin'de. canApply=true spoof'lansa bile createOffset/reverseOffset yine assertOfficeAdmin'den geçer.
   */
  private async isActorOfficeAdmin(actorUserId: string): Promise<boolean> {
    return isOfficeAdminCapacity(await this.readActorCapacity(actorUserId));
  }

  /**
   * C-1 v1 hard gate: actor PARTNER/MANAGER (office-admin) DEĞİLSE 403. apply+reverse+cross-case+same-case HEPSİ
   * bu gate'e tabi. resolve() observe-only/enforce-etmez olduğu için yetki BURADA explicit enforce edilir.
   */
  private async assertOfficeAdmin(actorUserId: string, action: 'CLIENT_OFFSET_APPLY' | 'CLIENT_OFFSET_REVERSE'): Promise<void> {
    if (!(await this.isActorOfficeAdmin(actorUserId))) {
      throw new ForbiddenException({
        code: 'CLIENT_OFFSET_FORBIDDEN',
        message: `Mahsup işlemi için PARTNER/MANAGER (office-admin) yetkisi gerekir (${action})`,
        requiredCapability: action,
      });
    }
  }

  // ==================== eligibility ====================

  /**
   * Mahsup için uygun payable bucket'lar + ödenmemiş ExpenseRequest'ler. OTOMATİK EŞLEME YOK — yalnız
   * iki liste + max bilgisi (kullanıcı manuel seçer). Same tenant/client/currency; availableOutstanding>0 / unpaid>0.
   * <remarks>ClientOffsetController.eligibility() → GET /client-offsets/client/:clientId/eligibility</remarks>
   */
  async getEligibility(tenantId: string, actorUserId: string, clientId: string, currency = 'TRY'): Promise<OffsetEligibility> {
    const canApply = await this.isActorOfficeAdmin(actorUserId); // C-2a UX flag (güvenlik DEĞİL)
    const ccRows = await this.prisma.caseClient.findMany({
      where: { clientId, role: { in: ELIGIBLE_ROLES }, client: { tenantId } },
      select: { id: true, caseId: true, role: true, case: { select: { fileNumber: true } } },
    });

    const eligiblePayableBuckets: EligiblePayableBucket[] = [];
    for (const cc of ccRows) {
      // computeOutstanding ZATEN offset terimlerini içerir (extension) → kalan uygun payable.
      const available = await this.readService.computeOutstanding(this.prisma, tenantId, cc.caseId, cc.id, currency);
      if (available.gt(ZERO)) {
        eligiblePayableBuckets.push({
          payableCaseId: cc.caseId,
          payableCaseClientId: cc.id,
          clientId,
          currency,
          availableOutstanding: available.toString(),
          caseNumber: cc.case?.fileNumber ?? '',
          role: cc.role,
        });
      }
    }

    const ers = await this.prisma.expenseRequest.findMany({
      where: { tenantId, clientId, status: { not: 'CANCELLED' } },
      select: { id: true, caseId: true, totalAmount: true, paidTotal: true, currency: true, status: true, case: { select: { fileNumber: true } } },
    });
    const eligibleExpenseRequests: EligibleExpenseRequest[] = [];
    for (const e of ers) {
      if ((e.currency ?? 'TRY') !== currency) continue;
      const unpaid = await this.readService.computeExpenseRemaining(this.prisma, tenantId, e.id, e.totalAmount, e.paidTotal);
      if (unpaid.gt(ZERO)) {
        eligibleExpenseRequests.push({
          expenseCaseId: e.caseId,
          expenseRequestId: e.id,
          clientId,
          currency,
          unpaidAmount: unpaid.toString(),
          caseNumber: e.case?.fileNumber ?? '',
          requestStatus: e.status,
        });
      }
    }

    return { clientId, currency, canApply, eligiblePayableBuckets, eligibleExpenseRequests };
  }

  /**
   * Leg sahipliği + same tenant/client/currency doğrula (createOffset + previewOffset ORTAK; duplicate logic yok).
   * Cross-tenant/client/currency YASAK. expense leg total/paid döner (availability için).
   */
  private async validateLegs(
    db: Prisma.TransactionClient,
    tenantId: string,
    dto: OffsetLegSelection,
  ): Promise<{ totalAmount: Prisma.Decimal; paidTotal: Prisma.Decimal }> {
    const cc = await db.caseClient.findFirst({
      where: { id: dto.payableCaseClientId, caseId: dto.payableCaseId, clientId: dto.clientId, role: { in: ELIGIBLE_ROLES }, client: { tenantId } },
      select: { id: true },
    });
    if (!cc) throw new BadRequestException('payable leg geçersiz/yabancı (caseClientId/case/client/tenant/rol uyuşmuyor)');
    const er = await db.expenseRequest.findFirst({
      where: { id: dto.expenseRequestId, caseId: dto.expenseCaseId, clientId: dto.clientId, tenantId, status: { not: 'CANCELLED' } },
      select: { totalAmount: true, paidTotal: true, currency: true },
    });
    if (!er) throw new BadRequestException('expense leg geçersiz/yabancı veya CANCELLED (expenseRequestId/case/client/tenant uyuşmuyor)');
    if ((er.currency ?? 'TRY') !== dto.currency) throw new BadRequestException('Cross-currency mahsup yasak (expense leg currency uyuşmuyor)');
    return { totalAmount: er.totalAmount, paidTotal: er.paidTotal };
  }

  /**
   * payableAvailable / expenseUnpaid / max — createOffset re-validate + previewOffset ORTAK canonical hesap reuse.
   * payableAvailable = computeOutstanding (−ΣAPPLY+ΣREVERSAL dahil); expenseUnpaid = computeExpenseRequestUnpaid.
   */
  private async computeAvailability(
    db: Prisma.TransactionClient,
    tenantId: string,
    dto: OffsetLegSelection,
    er: { totalAmount: Prisma.Decimal; paidTotal: Prisma.Decimal },
  ): Promise<{ payableAvailable: Prisma.Decimal; expenseUnpaid: Prisma.Decimal; max: Prisma.Decimal }> {
    const payableAvailable = await this.readService.computeOutstanding(db, tenantId, dto.payableCaseId, dto.payableCaseClientId, dto.currency);
    const expenseUnpaid = await this.readService.computeExpenseRemaining(db, tenantId, dto.expenseRequestId, er.totalAmount, er.paidTotal);
    const max = payableAvailable.lt(expenseUnpaid) ? payableAvailable : expenseUnpaid;
    return { payableAvailable, expenseUnpaid, max };
  }

  // ==================== preview (C-2a, non-persistent) ====================

  /**
   * Non-persistent mahsup önizlemesi (D3+D4). MUTATE/CREATE/AUDIT/IDEMPOTENCY/LOCK YOK. JWT-only read
   * (apply yetkisi GEREKMEZ — eligibility gibi; gerçek apply yine PARTNER/MANAGER). createOffset ile AYNI
   * validateLegs + computeAvailability (duplicate business logic yok). amount>max → OFFSET_EXCEEDS_AVAILABLE.
   * HESAP BACKEND'de: after=before−amount · net=payable−expense · netUnchanged. FE yalnız RENDER eder (D3).
   * <remarks>ClientOffsetController.preview() → POST /client-offsets/preview</remarks>
   */
  async previewOffset(tenantId: string, _actorUserId: string, dto: PreviewClientOffsetDto): Promise<OffsetPreview> {
    const amount = this.parsePositiveAmount(dto.amount);
    const er = await this.validateLegs(this.prisma, tenantId, dto);
    const { payableAvailable, expenseUnpaid, max } = await this.computeAvailability(this.prisma, tenantId, dto, er);
    if (amount.gt(max)) {
      throw new BadRequestException({
        code: 'OFFSET_EXCEEDS_AVAILABLE',
        message: `Mahsup tutarı uygun bakiyeyi aşıyor (amount=${amount}, payableAvailable=${payableAvailable}, expenseUnpaid=${expenseUnpaid})`,
      });
    }
    const payableBefore = payableAvailable;
    const expenseBefore = expenseUnpaid;
    const payableAfter = payableBefore.minus(amount);
    const expenseAfter = expenseBefore.minus(amount);
    const netBefore = payableBefore.minus(expenseBefore);
    const netAfter = payableAfter.minus(expenseAfter);
    return {
      payableBefore: payableBefore.toString(),
      payableAfter: payableAfter.toString(),
      expenseBefore: expenseBefore.toString(),
      expenseAfter: expenseAfter.toString(),
      netBefore: netBefore.toString(),
      netAfter: netAfter.toString(),
      maxAmount: max.toString(),
      netUnchanged: netBefore.equals(netAfter),
    };
  }

  // ==================== create (APPLY) ====================

  /**
   * Mahsup uygula (kind=APPLY). PARTNER/MANAGER-only. tx içinde re-validate (advisory-lock altında yeniden hesap;
   * approval anındaki hesap BAYAT olabilir). amount <= min(payableOutstanding, expenseUnpaid). Idempotent.
   * ACCT-1B: ClientOffset source row ve AccountingJournalEntry aynı transaction içinde fail-closed yazılır.
   * <remarks>ClientOffsetController.create() → POST /client-offsets</remarks>
   */
  async createOffset(tenantId: string, actorUserId: string, dto: CreateClientOffsetDto) {
    await this.assertOfficeAdmin(actorUserId, 'CLIENT_OFFSET_APPLY');
    const amount = this.parsePositiveAmount(dto.amount);

    // Idempotency fast-path (lock öncesi). Gerçek replay → dünya değişse bile validasyondan ÖNCE aynı yanıt.
    const pre = await this.prisma.clientOffset.findUnique({
      where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: dto.idempotencyKey } },
      select: this.idemSelect(),
    });
    if (pre) return this.replayOrConflict(pre, { tenantId, dto, amount, kind: 'APPLY', reversesOffsetId: null });

    // Leg sahipliği + same tenant/client/currency (cross-tenant/client/currency YASAK). previewOffset ile ORTAK.
    const er = await this.validateLegs(this.prisma, tenantId, dto);

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${this.lockKey(tenantId, dto.clientId, dto.currency)}))`;

      const dup = await tx.clientOffset.findUnique({
        where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: dto.idempotencyKey } },
        select: this.idemSelect(),
      });
      if (dup) return this.replayOrConflict(dup, { tenantId, dto, amount, kind: 'APPLY', reversesOffsetId: null });

      // RE-VALIDATE (lock altında; bayat-approval reddi). computeOutstanding offset terimlerini içerir. previewOffset ile ORTAK.
      const { payableAvailable, expenseUnpaid, max } = await this.computeAvailability(tx, tenantId, dto, er);
      if (amount.gt(max)) {
        throw new BadRequestException({
          code: 'OFFSET_EXCEEDS_AVAILABLE',
          message: `Mahsup tutarı uygun bakiyeyi aşıyor (amount=${amount}, payableAvailable=${payableAvailable}, expenseUnpaid=${expenseUnpaid})`,
        });
      }

      const offset = await tx.clientOffset.create({
        data: {
          tenantId,
          clientId: dto.clientId,
          amount,
          currency: dto.currency,
          kind: 'APPLY',
          payableCaseId: dto.payableCaseId,
          payableCaseClientId: dto.payableCaseClientId,
          expenseCaseId: dto.expenseCaseId,
          expenseRequestId: dto.expenseRequestId,
          idempotencyKey: dto.idempotencyKey,
          approvalRef: null, // v1: confirm-gate yok → DIRECT_CAPABILITY
          createdById: actorUserId,
          reversesOffsetId: null,
        },
        select: { id: true, createdAt: true },
      });

      await this.writeClientOffsetJournal(tx, {
        tenantId,
        actorUserId,
        offset: {
          id: offset.id,
          kind: 'APPLY',
          amount,
          currency: dto.currency,
          clientId: dto.clientId,
          payableCaseId: dto.payableCaseId,
          payableCaseClientId: dto.payableCaseClientId,
          expenseCaseId: dto.expenseCaseId,
          expenseRequestId: dto.expenseRequestId,
          reversesOffsetId: null,
          createdAt: offset.createdAt,
        },
      });

      await this.audit.logInTransaction(tx, {
        tenantId,
        action: 'CLIENT_OFFSET_CREATED',
        entityType: 'ClientOffset',
        entityId: offset.id,
        userId: actorUserId,
        description: `Müvekkil mahsubu uygulandı (${amount} ${dto.currency})`,
        metadata: {
          authorizationMode: 'DIRECT_CAPABILITY',
          clientId: dto.clientId,
          amount: amount.toString(),
          currency: dto.currency,
          payableCaseId: dto.payableCaseId,
          payableCaseClientId: dto.payableCaseClientId,
          expenseCaseId: dto.expenseCaseId,
          expenseRequestId: dto.expenseRequestId,
        },
      });

      return { created: true as const, offsetId: offset.id };
    });

    return created;
  }

  // ==================== reverse (REVERSAL) ====================

  /**
   * Mahsup iptali (kind=REVERSAL). PARTNER/MANAGER-only + reason≥10. Orijinal APPLY UPDATE EDİLMEZ; AYRI immutable
   * kayıt (aynı amount/currency/legs, reversesOffsetId=orijinal). Double-reversal yasak (@@unique + explicit kontrol).
   * ACCT-1B: reversal ClientOffset source row ve AccountingJournalEntry aynı transaction içinde fail-closed yazılır.
   * <remarks>ClientOffsetController.reverse() → POST /client-offsets/:offsetId/reverse</remarks>
   */
  async reverseOffset(tenantId: string, actorUserId: string, offsetId: string, dto: ReverseClientOffsetDto) {
    await this.assertOfficeAdmin(actorUserId, 'CLIENT_OFFSET_REVERSE');
    const reason = (dto.reason ?? '').trim();
    if (reason.length < 10) throw new BadRequestException('Mahsup iptali gerekçesi en az 10 karakter olmalı');

    const original = await this.prisma.clientOffset.findFirst({
      where: { id: offsetId, tenantId },
      select: { id: true, kind: true, clientId: true, amount: true, currency: true, payableCaseId: true, payableCaseClientId: true, expenseCaseId: true, expenseRequestId: true },
    });
    if (!original) throw new NotFoundException('Mahsup kaydı bulunamadı');
    if (original.kind !== 'APPLY') throw new BadRequestException('Yalnız APPLY mahsubu reverse edilebilir (REVERSAL reverse edilemez)');

    // Idempotency fast-path.
    const pre = await this.prisma.clientOffset.findUnique({
      where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: dto.idempotencyKey } },
      select: this.idemSelect(),
    });
    if (pre) {
      return this.replayOrConflict(pre, {
        tenantId,
        dto: { clientId: original.clientId, currency: original.currency, payableCaseId: original.payableCaseId, payableCaseClientId: original.payableCaseClientId, expenseCaseId: original.expenseCaseId, expenseRequestId: original.expenseRequestId },
        amount: original.amount,
        kind: 'REVERSAL',
        reversesOffsetId: original.id,
      });
    }

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${this.lockKey(tenantId, original.clientId, original.currency)}))`;

      // double-reversal guard (explicit; ayrıca @@unique[tenantId,reversesOffsetId] DB seviyesinde).
      const already = await tx.clientOffset.findFirst({ where: { tenantId, kind: 'REVERSAL', reversesOffsetId: original.id }, select: { id: true } });
      if (already) throw new ConflictException({ code: 'OFFSET_ALREADY_REVERSED', message: 'Bu mahsup zaten iptal edilmiş (double-reversal yasak)' });

      const dup = await tx.clientOffset.findUnique({
        where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: dto.idempotencyKey } },
        select: this.idemSelect(),
      });
      if (dup) {
        return this.replayOrConflict(dup, {
          tenantId,
          dto: { clientId: original.clientId, currency: original.currency, payableCaseId: original.payableCaseId, payableCaseClientId: original.payableCaseClientId, expenseCaseId: original.expenseCaseId, expenseRequestId: original.expenseRequestId },
          amount: original.amount,
          kind: 'REVERSAL',
          reversesOffsetId: original.id,
        });
      }

      const reversal = await tx.clientOffset.create({
        data: {
          tenantId,
          clientId: original.clientId,
          amount: original.amount, // AYNI tutar
          currency: original.currency,
          kind: 'REVERSAL',
          payableCaseId: original.payableCaseId,
          payableCaseClientId: original.payableCaseClientId,
          expenseCaseId: original.expenseCaseId,
          expenseRequestId: original.expenseRequestId,
          idempotencyKey: dto.idempotencyKey,
          approvalRef: null,
          createdById: actorUserId,
          reason,
          reversesOffsetId: original.id,
        },
        select: { id: true, createdAt: true },
      });

      await this.writeClientOffsetJournal(tx, {
        tenantId,
        actorUserId,
        offset: {
          id: reversal.id,
          kind: 'REVERSAL',
          amount: original.amount,
          currency: original.currency,
          clientId: original.clientId,
          payableCaseId: original.payableCaseId,
          payableCaseClientId: original.payableCaseClientId,
          expenseCaseId: original.expenseCaseId,
          expenseRequestId: original.expenseRequestId,
          reversesOffsetId: original.id,
          createdAt: reversal.createdAt,

        },
      });

      await this.audit.logInTransaction(tx, {
        tenantId,
        action: 'CLIENT_OFFSET_REVERSED',
        entityType: 'ClientOffset',
        entityId: reversal.id,
        userId: actorUserId,
        description: `Müvekkil mahsubu iptal edildi (orijinal ${original.id})`,
        metadata: {
          authorizationMode: 'DIRECT_CAPABILITY',
          reversesOffsetId: original.id,
          clientId: original.clientId,
          amount: original.amount.toString(),
          currency: original.currency,
          payableCaseId: original.payableCaseId,
          payableCaseClientId: original.payableCaseClientId,
          expenseCaseId: original.expenseCaseId,
          expenseRequestId: original.expenseRequestId,
          reason,
        },
      });

      return { created: true as const, offsetId: reversal.id, reversesOffsetId: original.id };
    });

    return created;
  }

  // ==================== list ====================

  /** Müvekkilin mahsupları (APPLY+REVERSAL). tenant+client scope. <remarks>GET /client-offsets/client/:clientId</remarks> */
  async listOffsets(tenantId: string, clientId: string, filters: { currency?: string; kind?: 'APPLY' | 'REVERSAL' } = {}) {
    return this.prisma.clientOffset.findMany({
      where: { tenantId, clientId, ...(filters.currency ? { currency: filters.currency } : {}), ...(filters.kind ? { kind: filters.kind } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }


  /// <remarks>
  /// Çağrıldığı yerler:
  /// - ClientOffsetController.detail() → GET /client-offsets/:offsetId/detail (read-only offset source/audit projection)
  /// </remarks>
  async getOffsetDetail(tenantId: string, offsetId: string): Promise<ClientOffsetDetailProjection> {
    const offset = await this.prisma.clientOffset.findFirst({
      where: { id: offsetId, tenantId },
      select: {
        id: true,
        clientId: true,
        amount: true,
        currency: true,
        kind: true,
        payableCaseId: true,
        payableCaseClientId: true,
        expenseCaseId: true,
        expenseRequestId: true,
        createdById: true,
        reason: true,
        reversesOffsetId: true,
        createdAt: true,
      },
    });
    if (!offset) throw new NotFoundException('Mahsup kaydı bulunamadı');

    const [
      createdBy,
      payableCase,
      expenseCase,
      payableCaseClient,
      expenseRequest,
      reversedBy,
      auditRows,
    ] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: offset.createdById, tenantId },
        select: { id: true, name: true, surname: true },
      }),
      this.prisma.case.findFirst({
        where: { id: offset.payableCaseId, tenantId },
        select: { id: true, fileNumber: true, executionFileNumber: true },
      }),
      this.prisma.case.findFirst({
        where: { id: offset.expenseCaseId, tenantId },
        select: { id: true, fileNumber: true, executionFileNumber: true },
      }),
      this.prisma.caseClient.findFirst({
        where: {
          id: offset.payableCaseClientId,
          caseId: offset.payableCaseId,
          clientId: offset.clientId,
          case: { tenantId },
          client: { tenantId },
        },
        select: { id: true, role: true },
      }),
      this.prisma.expenseRequest.findFirst({
        where: {
          id: offset.expenseRequestId,
          tenantId,
          clientId: offset.clientId,
          caseId: offset.expenseCaseId,
        },
        select: {
          id: true,
          status: true,
          packageCode: true,
          stageCode: true,
          requestItems: {
            orderBy: { sortOrder: 'asc' },
            take: 1,
            select: { label: true },
          },
        },
      }),
      offset.kind === 'APPLY'
        ? this.prisma.clientOffset.findFirst({
            where: { tenantId, kind: 'REVERSAL', reversesOffsetId: offset.id },
            select: { id: true },
          })
        : Promise.resolve(null),
      this.prisma.auditLog.findMany({
        where: { tenantId, entityType: 'ClientOffset', entityId: offset.id },
        orderBy: { createdAt: 'desc' },
        select: {
          action: true,
          userId: true,
          userName: true,
          description: true,
          createdAt: true,
        },
      }),
    ]);

    const auditUserIds = Array.from(
      new Set(auditRows.map((row) => row.userId).filter((id): id is string => !!id)),
    );
    const auditUsers = auditUserIds.length
      ? await this.prisma.user.findMany({
          where: { tenantId, id: { in: auditUserIds } },
          select: { id: true, name: true, surname: true },
        })
      : [];
    const auditUserMap = new Map(auditUsers.map((user) => [user.id, user]));

    const payableCaseLabel = this.caseLabel(payableCase, offset.payableCaseId);
    const expenseCaseLabel = this.caseLabel(expenseCase, offset.expenseCaseId);
    const expenseFirstItemLabel = expenseRequest?.requestItems?.[0]?.label ?? null;
    const expenseLabel =
      expenseFirstItemLabel ??
      expenseRequest?.packageCode ??
      expenseRequest?.stageCode ??
      `Masraf talebi ${this.shortId(offset.expenseRequestId)}`;

    return {
      offset: {
        id: offset.id,
        clientId: offset.clientId,
        kind: offset.kind,
        amount: offset.amount.toString(),
        currency: offset.currency,
        reason: offset.reason,
        createdAt: offset.createdAt,
        createdBy: {
          id: offset.createdById,
          displayName: this.userDisplay(createdBy, null, offset.createdById),
        },
        reversesOffsetId: offset.reversesOffsetId,
        reversedByOffsetId: reversedBy?.id ?? null,
      },
      sourceSummary: {
        payable: {
          caseId: offset.payableCaseId,
          caseNumber: payableCase?.fileNumber ?? null,
          caseLabel: payableCaseLabel,
          caseClientId: offset.payableCaseClientId,
          role: payableCaseClient?.role ?? null,
          label: `${payableCaseLabel} · ${payableCaseClient?.role ?? 'payable'}`,
        },
        expense: {
          caseId: offset.expenseCaseId,
          caseNumber: expenseCase?.fileNumber ?? null,
          caseLabel: expenseCaseLabel,
          expenseRequestId: offset.expenseRequestId,
          status: expenseRequest?.status ?? null,
          label: `${expenseCaseLabel} · ${expenseLabel}`,
        },
      },
      auditEvents: auditRows.map((row) => ({
        action: row.action,
        actor: {
          id: row.userId ?? null,
          displayName: this.userDisplay(row.userId ? auditUserMap.get(row.userId) : null, row.userName, row.userId ?? null),
        },
        createdAt: row.createdAt,
        safeSummary: this.offsetAuditSummary(row.action, row.description),
      })),
    };
  }

  // ==================== helpers ====================

  private caseLabel(row: { fileNumber: string | null; executionFileNumber?: string | null } | null, fallbackId: string): string {
    return row?.fileNumber || row?.executionFileNumber || `Dosya ${this.shortId(fallbackId)}`;
  }

  private userDisplay(
    row: { name?: string | null; surname?: string | null } | null | undefined,
    fallbackName: string | null | undefined,
    fallbackId: string | null | undefined,
  ): string {
    const fullName = [row?.name, row?.surname].filter(Boolean).join(' ').trim();
    if (fullName) return fullName;
    if (fallbackName?.trim()) return fallbackName.trim();
    return fallbackId ? `Kullanıcı ${this.shortId(fallbackId)}` : 'Bilinmeyen kullanıcı';
  }

  private shortId(value: string): string {
    return value.slice(0, 8);
  }

  private offsetAuditSummary(action: string, description: string | null): string {
    if (description?.trim()) return description.trim();
    if (action === 'CLIENT_OFFSET_CREATED') return 'Müvekkil mahsubu uygulandı';
    if (action === 'CLIENT_OFFSET_REVERSED') return 'Müvekkil mahsubu iptal edildi';
    return action;
  }

  /// <remarks>
  /// �a�r�ld��� yerler:
  /// - ClientOffsetService.createOffset() -> POST /client-offsets (APPLY source row journal write)
  /// - ClientOffsetService.reverseOffset() -> POST /client-offsets/:offsetId/reverse (REVERSAL source row journal write)
  /// </remarks>
  private async writeClientOffsetJournal(
    tx: Prisma.TransactionClient,
    params: {
      tenantId: string;
      actorUserId: string;
      offset: {
        id: string;
        kind: 'APPLY' | 'REVERSAL';
        amount: Prisma.Decimal;
        currency: string;
        clientId: string;
        payableCaseId: string;
        payableCaseClientId: string;
        expenseCaseId: string;
        expenseRequestId: string;
        reversesOffsetId: string | null;
        createdAt: Date;
      };
    },
  ): Promise<void> {
    const sourceVersion = this.clientOffsetJournalSourceVersion(params.offset.id, params.offset.createdAt);
    const snapshot: ClientOffsetSourceSnapshot = {
      identity: {
        tenantId: params.tenantId,
        sourceType: 'CLIENT_OFFSET',
        sourceId: params.offset.id,
        sourceAction: params.offset.kind === 'APPLY' ? 'apply' : 'reversal',
        sourceVersion,
      },
      tenantId: params.tenantId,
      occurredAt: params.offset.createdAt,
      effectiveDate: params.offset.createdAt,
      actorId: params.actorUserId,
      currency: params.offset.currency,
      metadata: {
        authorizationMode: 'DIRECT_CAPABILITY',
      },
      payload: {
        id: params.offset.id,
        kind: params.offset.kind,
        amount: params.offset.amount,
        clientId: params.offset.clientId,
        payableCaseId: params.offset.payableCaseId,
        payableCaseClientId: params.offset.payableCaseClientId,
        expenseCaseId: params.offset.expenseCaseId,
        expenseRequestId: params.offset.expenseRequestId,
        reversesOffsetId: params.offset.reversesOffsetId,
      },
    };

    const adapted = adaptClientOffsetSourceSnapshot(snapshot);
    if (!adapted.ok) {
      throw new ConflictException(`ClientOffset journal source adapter failed: ${adapted.errors.map((error) => error.code).join(', ')}`);
    }

    const built = buildAccountingJournal(adapted.source);
    if (!built.ok) {
      throw new ConflictException(`ClientOffset journal mapping failed: ${built.errors.map((error) => error.code).join(', ')}`);
    }

    const validated = validateJournalDraft(built.draft);
    if (!validated.ok) {
      throw new ConflictException(`ClientOffset journal validation failed: ${validated.errors.map((error) => error.code).join(', ')}`);
    }

    const write = await this.journalWriter.write({ draft: validated.draft }, tx);
    if (!write.ok) {
      throw new ConflictException(`ClientOffset journal write failed: ${write.errors.map((error) => error.code).join(', ')}`);
    }
  }

  private clientOffsetJournalSourceVersion(offsetId: string, createdAt: Date): string {
    return `${createdAt.toISOString()}:${offsetId}`;
  }
  private lockKey(tenantId: string, clientId: string, currency: string): string {
    return `client-offset:${tenantId}:${clientId}:${currency}`;
  }

  private parsePositiveAmount(raw: string): Prisma.Decimal {
    let d: Prisma.Decimal;
    try {
      d = new Prisma.Decimal(raw);
    } catch {
      throw new BadRequestException('amount geçersiz');
    }
    if (!d.gt(ZERO)) throw new BadRequestException('amount > 0 olmalı');
    return d;
  }

  private idemSelect() {
    return { id: true, clientId: true, currency: true, payableCaseId: true, payableCaseClientId: true, expenseCaseId: true, expenseRequestId: true, amount: true, kind: true, reversesOffsetId: true } as const;
  }

  /** Aynı idempotencyKey + AYNI payload → replay (mevcut). Farklı payload → 409 IDEMPOTENCY_KEY_CONFLICT. */
  private replayOrConflict(
    existing: { id: string; clientId: string; currency: string; payableCaseId: string; payableCaseClientId: string; expenseCaseId: string; expenseRequestId: string; amount: Prisma.Decimal; kind: string; reversesOffsetId: string | null },
    candidate: { tenantId: string; dto: { clientId: string; currency: string; payableCaseId: string; payableCaseClientId: string; expenseCaseId: string; expenseRequestId: string }; amount: Prisma.Decimal; kind: 'APPLY' | 'REVERSAL'; reversesOffsetId: string | null },
  ) {
    const same =
      existing.clientId === candidate.dto.clientId &&
      existing.currency === candidate.dto.currency &&
      existing.payableCaseId === candidate.dto.payableCaseId &&
      existing.payableCaseClientId === candidate.dto.payableCaseClientId &&
      existing.expenseCaseId === candidate.dto.expenseCaseId &&
      existing.expenseRequestId === candidate.dto.expenseRequestId &&
      existing.amount.equals(candidate.amount) &&
      existing.kind === candidate.kind &&
      (existing.reversesOffsetId ?? null) === (candidate.reversesOffsetId ?? null);
    if (!same) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_CONFLICT',
        message: 'Aynı idempotencyKey farklı payload ile kullanıldı',
      });
    }
    return { created: false as const, offsetId: existing.id, idempotentReplay: true as const };
  }
}
