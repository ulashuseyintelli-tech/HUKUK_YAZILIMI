import { Injectable, Logger, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AccountingJournalWriterService,
  buildAccountingJournal,
  validateJournalDraft,
  type ClientPayoutJournalSource,
  type ValidatedJournalEntryDraft,
} from '../accounting-journal';
import { isOfficeAdminCapacity, capacityFromUser } from '../policy-engine/effective-permission-mapping';
import { Capacity } from '../policy-engine/types/effective-permission.types';
import { ActionCode } from '../policy-engine/types/action-code.enum';
import { AuditService } from '../audit/audit.service';
import { OfficeApprovalService } from '../office-approval/office-approval.service';
import { PayoutApprovalPolicy } from '../office-approval/client-payout-approval.policy';
import { stableJsonHash } from '../permission-diagnostics/guided-edge/canonical-json';
import { CreateClientPayoutDto } from './dto/create-client-payout.dto';
import { ClientSettlementReadService } from './client-settlement-read.service';
import { payoutLockKey } from './payout-lock';

export interface CreatePayoutResult {
  created: boolean;
  payoutId: string;
  idempotentReplay?: boolean;
}

export interface RequestPayoutResult {
  requested: true;
  approvalRequestId: string;
  status: string;
}

/** PAYOUT-APPROVAL-2 (Tasarım B): OfficeApprovalRequest.savedIntent/payloadHash şekli — request/finalize arasında BİREBİR aynı üretilmeli. */
interface PayoutSavedIntent {
  caseId: string;
  caseClientId: string;
  amount: string;
  currency: string;
  note: string | null;
  idempotencyKey: string;
}

/** OfficeApprovalRequest.targetType — payout'un henüz ClientPayout satırı yokken referans aldığı sabit değer. */
const PAYOUT_REQUEST_TARGET_TYPE = 'CLIENT_PAYOUT_REQUEST';

interface AllocationSourceLine {
  id: string;
  dispositionId: string;
  amount: Prisma.Decimal;
  disposition: {
    id: string;
    collectionId: string;
    postedAt: Date | null;
    manualReversalRequiredAt: Date | null;
  };
}

interface PlannedPayoutAllocation {
  collectionId: string;
  collectionDispositionId: string;
  collectionDispositionLineId: string;
  amount: Prisma.Decimal;
}

interface ClientPayoutAllocationCreateManyArgs {
  data: Array<{
    tenantId: string;
    caseId: string;
    caseClientId: string;
    clientPayoutId: string;
    collectionId: string;
    collectionDispositionId: string;
    collectionDispositionLineId: string;
    amount: Prisma.Decimal;
    currency: string;
    allocatedById: string;
  }>;
}

type PayoutAllocationTransaction = Prisma.TransactionClient & {
  clientPayoutAllocation: {
    createMany(args: ClientPayoutAllocationCreateManyArgs): Promise<{ count: number }>;
  };
};

const ZERO = new Prisma.Decimal(0);

function minDecimal(a: Prisma.Decimal, b: Prisma.Decimal): Prisma.Decimal {
  return a.lte(b) ? a : b;
}

function compareAllocationSourceLines(a: AllocationSourceLine, b: AllocationSourceLine): number {
  const postedDelta = (a.disposition.postedAt?.getTime() ?? 0) - (b.disposition.postedAt?.getTime() ?? 0);
  if (postedDelta !== 0) return postedDelta;
  const dispositionDelta = a.dispositionId.localeCompare(b.dispositionId);
  if (dispositionDelta !== 0) return dispositionDelta;
  return a.id.localeCompare(b.id);
}

/**
 * TM3 M3 — Müvekkile Ödeme (ClientPayout).
 *
 * CLIENT_PAYABLE (proceeds) borcunun fiili kapatılması. `ClientPayout` LEDGER DEĞİLDİR —
 * proceeds settlement kaydıdır. D1: payout `ClientPayout` + ekstre `CLIENT_PAYOUT_SENT` (debit);
 * `BalanceLedger`'a YAZILMAZ (BalanceLedgerType.PAYOUT YOK).
 *
 * Outstanding (per caseClientId, scoped tenant+case+caseClientId+currency):
 *   Σ POSTED CollectionDispositionLine.CLIENT_PAYABLE (underlying Collection CONFIRMED)
 *   − Σ RECORDED ClientPayout
 *
 * Güvenlik: caseClientId tenant+case+role (ALACAKLI/ORTAK_ALACAKLI) doğrulanır; idempotencyKey
 * tenant-scoped @@unique; concurrency advisory-lock (pg_advisory_xact_lock, scope=tenant+case+
 * caseClientId+currency) → eşzamanlı over-payout engellenir (outstanding lock altında re-hesaplanır).
 *
 * CBND-3 (H3): create() PARTNER/MANAGER (office-admin) capability gate ile korunur — ClientOffsetService
 * (assertOfficeAdmin) ve ClientPayoutManualReversalService (assertOfficeAdmin) ile AYNI desen (canonical
 * capacity = Lawyer.lawyerRank ?? StaffMember.staffType, isOfficeAdminCapacity). Önceden yalnız JwtAuthGuard
 * vardı; net-sıfır olan mahsup (offset) PARTNER/MANAGER isterken gerçek para çıkışı kaydı (payout) her
 * authenticated kullanıcıya açıktı — bu asimetri kapatıldı.
 *
 * CBND-5 (H2): lock key `payoutLockKey()` (payout-lock.ts) ile üretilir — ClientOffsetService de
 * (payable leg için, mevcut expense-remaining kilidinden SONRA) AYNI fonksiyonu çağırır; iki servis
 * artık aynı caseClientId'nin payable outstanding'i için serialize olur. Bu servis client-offset
 * kilidini ASLA almaz (deadlock'suz sabit sıra: client-offset → payout, yalnız offset tarafında).
 *
 * PAYOUT-APPROVAL-1 (audit hardening, ilk PR — 2026-07-04): create() artık ClientOffsetService
 * (CLIENT_OFFSET_CREATED) ve ClientPayoutManualReversalService (CLIENT_PAYOUT_MANUAL_REVERSAL_CLOSED)
 * ile AYNI desende, aynı $transaction içinde AuditService.logInTransaction ile CLIENT_PAYOUT_CREATED
 * yazar (fail-closed: audit yazılamazsa payout de rollback olur). Bu değişiklik yalnız audit izidir —
 * approval binding / self-approval engeli / yeni ActionCode DEĞİLDİR (owner kararı ikinci faza bırakıldı).
 *
 * PAYOUT-APPROVAL-2 PR-2a (Tasarım B: deferred-gated-finalize — 2026-07-04): requestPayout()/finalize()
 * eklendi. `create()` (POST /client-payouts) BİREBİR AYNI davranışıyla DOKUNULMADI — bilinçli, GEÇİCİ
 * governance-gap: eski route hâlâ self-approval'a gated DEĞİL, PR-2b (FE cutover + eski route kapatma)
 * ile kapanacak. requestPayout(): yalnız OfficeApprovalRequest oluşturur (actionCode=CLIENT_PAYOUT_POST,
 * targetType=CLIENT_PAYOUT_REQUEST), ClientPayout satırı YARATMAZ. finalize(): yalnız APPROVED talep +
 * payload-hash eşleşmesi (drift guard) + PayoutApprovalPolicy re-check sonrası, create()'in AYNI
 * transaction gövdesini (artık runPayoutCreationTransaction'da paylaşılan) çalıştırır — advisory lock +
 * taze outstanding recheck finalize'da da AYNEN geçerli (iki payout arasında double-spend engeli korunur).
 * ClientPayoutStatus/migration DOKUNULMADI (Tasarım B'nin kazancı — bkz. design-gate notu).
 */
@Injectable()
export class ClientPayoutService {
  private readonly logger = new Logger(ClientPayoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly readService: ClientSettlementReadService,
    private readonly audit: AuditService,
    private readonly officeApproval: OfficeApprovalService,
    private readonly payoutApprovalPolicy: PayoutApprovalPolicy,
    private readonly journalWriter: AccountingJournalWriterService = new AccountingJournalWriterService(prisma),
  ) {}

  /**
   * CBND-3 (H3) hard gate: actor PARTNER/MANAGER (office-admin) DEĞİLSE 403. ClientOffsetService.
   * assertOfficeAdmin / ClientPayoutManualReversalService.assertOfficeAdmin ile BİREBİR aynı desen
   * (canonical capacity okuması; CpeRequiredGuard dormant olduğundan ona güvenilmez, yetki BURADA
   * explicit enforce edilir). PAYOUT-APPROVAL-1: yetkilendirmeyi sağlayan capacity, audit izinde
   * görünür olsun diye çağırana döndürülür (davranış değişmez, yalnız dönüş tipi void → Capacity).
   */
  private async assertOfficeAdmin(actorUserId: string): Promise<Capacity> {
    const user = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      include: { lawyer: { select: { lawyerRank: true } }, staffMember: { select: { staffType: true } } },
    });
    const capacity = capacityFromUser(user);
    if (!isOfficeAdminCapacity(capacity)) {
      throw new ForbiddenException({
        code: 'CLIENT_PAYOUT_FORBIDDEN',
        message: 'Müvekkile ödeme (payout) kaydı için PARTNER/MANAGER (office-admin) yetkisi gerekir',
        requiredCapability: 'CLIENT_PAYOUT_CREATE',
      });
    }
    return capacity;
  }

  /**
   * Çağrıldığı yerler:
   *  - ClientPayoutController.create() → POST /client-payouts (müvekkile payout kaydı ve allocation source-link yazımı)
   */
  async create(tenantId: string, dto: CreateClientPayoutDto, actor?: { userId?: string }): Promise<CreatePayoutResult> {
    const userId = actor?.userId;
    if (!userId) throw new BadRequestException('actor (req.user.id) yok — payout kaydedilemez');
    const authorizedCapacity = await this.assertOfficeAdmin(userId);
    if (!dto?.idempotencyKey) throw new BadRequestException('idempotencyKey zorunlu');
    const amount = this.parseAmount(dto.amount);
    const currency = dto.currency || 'TRY';

    // caseClientId doğrulama (ortak read-service): tenant+case+role. clientId ile authz YOK.
    await this.readService.assertEligibleCaseClient(tenantId, dto.caseId, dto.caseClientId);

    return this.runPayoutCreationTransaction(tenantId, dto, amount, currency, userId, authorizedCapacity, 'DIRECT_OFFICE_ADMIN_CAPABILITY');
  }

  /**
   * PAYOUT-APPROVAL-2 PR-2a (Tasarım B, adım 1/2): yalnız OfficeApprovalRequest oluşturur.
   * ClientPayout satırı HENÜZ YARATILMAZ — finansal etki tamamen finalize()'a ertelenir.
   *
   * Çağrıldığı yerler:
   *  - ClientPayoutController.request() → POST /client-payouts/request
   */
  async requestPayout(tenantId: string, dto: CreateClientPayoutDto, actor?: { userId?: string }): Promise<RequestPayoutResult> {
    const userId = actor?.userId;
    if (!userId) throw new BadRequestException('actor (req.user.id) yok — payout talebi oluşturulamaz');
    if (!dto?.idempotencyKey) throw new BadRequestException('idempotencyKey zorunlu');
    const amount = this.parseAmount(dto.amount);
    const currency = dto.currency || 'TRY';

    // caseClientId doğrulama create() ile AYNI (ortak read-service): tenant+case+role.
    await this.readService.assertEligibleCaseClient(tenantId, dto.caseId, dto.caseClientId);

    const savedIntent = this.buildPayoutIntent(dto, amount, currency);
    const approval = await this.officeApproval.createPendingRequest({
      tenantId,
      actionCode: ActionCode.CLIENT_PAYOUT_POST,
      targetType: PAYOUT_REQUEST_TARGET_TYPE,
      targetRef: dto.idempotencyKey,
      requesterUserId: userId,
      savedIntent,
      idempotencyKey: `client-payout-request:${dto.idempotencyKey}`,
    });
    return { requested: true, approvalRequestId: approval.id, status: approval.status };
  }

  /**
   * PAYOUT-APPROVAL-2 PR-2a (Tasarım B, adım 2/2): yalnız APPROVED + payload-hash eşleşen bir
   * CLIENT_PAYOUT_POST talebi için create()'in AYNI transaction mantığını (runPayoutCreationTransaction)
   * çalıştırır. Payload-drift guard: onaylanan savedIntent ile buradaki dto FARKLIYSA reddedilir
   * (onaylanan tutar ile kesinleştirilen tutar asla ayrışmaz). Advisory lock + taze outstanding recheck
   * runPayoutCreationTransaction içinde, create() ile BİREBİR aynı — double-spend engeli korunur.
   *
   * Çağrıldığı yerler:
   *  - ClientPayoutController.finalize() → POST /client-payouts/:approvalRequestId/finalize
   */
  async finalize(
    tenantId: string,
    approvalRequestId: string,
    dto: CreateClientPayoutDto,
    actor?: { userId?: string },
  ): Promise<CreatePayoutResult> {
    const userId = actor?.userId;
    if (!userId) throw new BadRequestException('actor (req.user.id) yok — payout kesinleştirilemez');
    if (!dto?.idempotencyKey) throw new BadRequestException('idempotencyKey zorunlu');

    const approval = await this.officeApproval.getByIdForTenant(approvalRequestId, tenantId);
    if (approval.actionCode !== ActionCode.CLIENT_PAYOUT_POST || approval.targetType !== PAYOUT_REQUEST_TARGET_TYPE) {
      throw new ConflictException('Onay talebi bu payout finalize akışına ait değil');
    }
    if (approval.status !== 'APPROVED') {
      throw new BadRequestException(`Yalnız APPROVED payout talebi kesinleştirilebilir (durum: ${approval.status})`);
    }

    const amount = this.parseAmount(dto.amount);
    const currency = dto.currency || 'TRY';

    // Payload-drift guard: onaylanan savedIntent ile finalize'a gelen dto AYNI hash'i üretmeli.
    const expectedIntent = this.buildPayoutIntent(dto, amount, currency);
    if (stableJsonHash(expectedIntent) !== approval.payloadHash) {
      throw new ConflictException({
        code: 'PAYOUT_FINALIZE_PAYLOAD_DRIFT',
        message: 'Finalize payload, onaylanan talep ile eşleşmiyor',
      });
    }

    // Defense-in-depth: generic approve() zaten PayoutApprovalPolicy ile geçmiş olmalı; finalize
    // AYRICA re-check eder (disposition'ın post()'ta isApproverEligible'ı yeniden çağırmasıyla AYNI desen).
    const authorizedCapacity = await this.payoutApprovalPolicy.assertEligible(userId, tenantId);
    await this.readService.assertEligibleCaseClient(tenantId, dto.caseId, dto.caseClientId);

    const result = await this.runPayoutCreationTransaction(
      tenantId,
      dto,
      amount,
      currency,
      userId,
      authorizedCapacity,
      'OFFICE_APPROVAL_BINDING',
      approval.id,
    );

    // Best-effort execution marker (disposition-posting.service.ts'nin post()'u ile AYNI desen):
    // finansal truth zaten commit edildi, marker hatası finalize sonucunu ETKİLEMEZ.
    try {
      await this.officeApproval.markExecutionSucceeded(approval.id, userId);
    } catch (e) {
      this.logger.warn(`markExecutionSucceeded başarısız (finalize commit edildi): ${approval.id} — ${(e as Error).message}`);
    }

    return result;
  }

  private parseAmount(raw: string | number): Prisma.Decimal {
    let amount: Prisma.Decimal;
    try {
      amount = new Prisma.Decimal(raw as Prisma.Decimal.Value);
    } catch {
      throw new BadRequestException('geçersiz tutar');
    }
    if (amount.lte(0)) throw new BadRequestException('tutar pozitif olmalı');
    return amount;
  }

  /** request() ve finalize() BİREBİR aynı şekli üretmeli — payload-hash karşılaştırması buna dayanır. */
  private buildPayoutIntent(dto: CreateClientPayoutDto, amount: Prisma.Decimal, currency: string): PayoutSavedIntent {
    return {
      caseId: dto.caseId,
      caseClientId: dto.caseClientId,
      amount: amount.toString(),
      currency,
      note: dto.note ?? null,
      idempotencyKey: dto.idempotencyKey,
    };
  }

  /**
   * create() ve finalize() arasında PAYLAŞILAN, davranışı DEĞİŞMEYEN transaction gövdesi (PAYOUT-APPROVAL-1'deki
   * create() ile birebir aynı mantık — yalnız authorizationMode/approvalRequestId çağırana göre parametrize).
   */
  private async runPayoutCreationTransaction(
    tenantId: string,
    dto: CreateClientPayoutDto,
    amount: Prisma.Decimal,
    currency: string,
    userId: string,
    authorizedCapacity: Capacity,
    authorizationMode: string,
    approvalRequestId?: string,
  ): Promise<CreatePayoutResult> {
    // Idempotent replay (lock öncesi hızlı yol): aynı (tenant, idempotencyKey).
    // AYNI payload → replay; FARKLI payload → ConflictException (sessiz eski-payout dönme YOK).
    const existing = await this.prisma.clientPayout.findUnique({
      where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: dto.idempotencyKey } },
      select: { id: true, caseId: true, caseClientId: true, amount: true, currency: true },
    });
    if (existing) return this.replayOrConflict(existing, dto, amount, currency);

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Concurrency guard: advisory xact lock (scope tenant+case+caseClientId+currency) → aynı
        // alacaklı için eşzamanlı payout'lar SERIALIZE olur; outstanding lock altında tekrar hesaplanır.
        // CBND-5 (H2): payoutLockKey paylaşılan fonksiyon — ClientOffsetService payable leg için AYNI
        // key'i üretir, iki servis birbirine karşı da serialize olur.
        const lockKey = payoutLockKey(tenantId, dto.caseId, dto.caseClientId, currency);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

        // Idempotent re-check (lock altında, race) — payload-conflict guard ile.
        const dup = await tx.clientPayout.findUnique({
          where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: dto.idempotencyKey } },
          select: { id: true, caseId: true, caseClientId: true, amount: true, currency: true },
        });
        if (dup) return this.replayOrConflict(dup, dto, amount, currency);

        const outstanding = await this.readService.computeOutstanding(tx, tenantId, dto.caseId, dto.caseClientId, currency);
        if (amount.gt(outstanding)) {
          throw new BadRequestException(`payout (${amount.toString()}) outstanding'i (${outstanding.toString()}) aşamaz`);
        }

        const allocationPlan = await this.planPayoutAllocations(tx, tenantId, dto.caseId, dto.caseClientId, currency, amount);

        const payout = await tx.clientPayout.create({
          data: {
            tenantId,
            caseId: dto.caseId,
            caseClientId: dto.caseClientId,
            amount,
            currency,
            status: 'RECORDED',
            idempotencyKey: dto.idempotencyKey,
            paidById: userId,
            note: dto.note ?? null,
          },
          select: { id: true, paidAt: true },
        });
        const allocationResult = await (tx as PayoutAllocationTransaction).clientPayoutAllocation.createMany({
          data: allocationPlan.map((allocation) => ({
            tenantId,
            caseId: dto.caseId,
            caseClientId: dto.caseClientId,
            clientPayoutId: payout.id,
            collectionId: allocation.collectionId,
            collectionDispositionId: allocation.collectionDispositionId,
            collectionDispositionLineId: allocation.collectionDispositionLineId,
            amount: allocation.amount,
            currency,
            allocatedById: userId,
          })),
        });
        if (allocationResult.count !== allocationPlan.length) {
          throw new ConflictException({
            code: 'PAYOUT_ALLOCATION_WRITE_MISMATCH',
            message: 'Payout allocation source-link yazımı beklenen satır sayısıyla eşleşmedi',
          });
        }

        const journalDraft = this.buildClientPayoutJournalDraft(
          tenantId,
          dto.caseId,
          dto.caseClientId,
          currency,
          amount,
          payout.id,
          payout.paidAt,
          userId,
        );
        const journalWrite = await this.journalWriter.write({ draft: journalDraft }, tx);
        if (!journalWrite.ok) {
          throw new ConflictException('Accounting journal write failed: ' + journalWrite.errors.map((error) => error.code).join(', '));
        }

        // PAYOUT-APPROVAL-1 (audit hardening, ilk-PR): ClientOffsetService/ClientPayoutManualReversalService
        // ile AYNI desen — aynı $transaction içinde, fail-closed (logInTransaction hata yutmaz, throw ederse
        // payout kaydı da rollback olur). authorizedCapacity: hangi capacity ile (PARTNER/MANAGER) geçtiğini
        // audit izinde görünür kılar. authorizationMode: create() (DIRECT_OFFICE_ADMIN_CAPABILITY) mi yoksa
        // finalize() (OFFICE_APPROVAL_BINDING) üzerinden mi geldiğini ayırt eder — PR-2a geçiş döneminde
        // iki yol da canlı kalırken audit izinde hangisinin kullanıldığı görünür olsun diye.
        await this.audit.logInTransaction(tx, {
          tenantId,
          action: 'CLIENT_PAYOUT_CREATED',
          entityType: 'ClientPayout',
          entityId: payout.id,
          userId,
          description: `Müvekkile ödeme kaydedildi (${amount.toString()} ${currency})`,
          metadata: {
            authorizationMode,
            authorizedCapacity,
            ...(approvalRequestId ? { approvalRequestId } : {}),
            caseId: dto.caseId,
            caseClientId: dto.caseClientId,
            amount: amount.toString(),
            currency,
            idempotencyKey: dto.idempotencyKey,
            allocationCount: allocationPlan.length,
          },
        });

        this.logger.log(`ClientPayout RECORDED: ${payout.id} (caseClient=${dto.caseClientId}, amount=${amount.toString()})`);
        return { created: true, payoutId: payout.id };
      });
    } catch (e: unknown) {
      // idempotencyKey race → unique violation → idempotent replay
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const row = await this.prisma.clientPayout.findUnique({
          where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: dto.idempotencyKey } },
          select: { id: true, caseId: true, caseClientId: true, amount: true, currency: true },
        });
        if (row) return this.replayOrConflict(row, dto, amount, currency);
      }
      throw e;
    }
  }

  /// <remarks>
  /// Cagrildigi yerler:
  /// - ClientPayoutService.create() -> POST /client-payouts (RECORDED payout live AccountingJournal draft uretimi)
  /// </remarks>
  private buildClientPayoutJournalDraft(
    tenantId: string,
    caseId: string,
    caseClientId: string,
    currency: string,
    amount: Prisma.Decimal,
    payoutId: string,
    paidAt: Date,
    actorUserId: string,
  ): ValidatedJournalEntryDraft {
    const paidAtIso = paidAt.toISOString();
    const source: ClientPayoutJournalSource = {
      tenantId,
      sourceType: 'CLIENT_PAYOUT',
      sourceId: payoutId,
      sourceVersion: `${paidAtIso}:${payoutId}`,
      sourceAction: 'recorded',
      occurredAt: paidAtIso,
      effectiveDate: paidAtIso.slice(0, 10),
      actorId: actorUserId,
      currency,
      sourceHash: null,
      metadata: { status: 'RECORDED' },
      payload: {
        amount: amount.toString(),
        caseId,
        caseClientId,
        clientId: null,
        payoutId,
      },
    };

    const built = buildAccountingJournal(source);
    if (!built.ok) {
      throw new ConflictException(`Accounting journal mapping failed: ${built.errors.map((error) => error.code).join(', ')}`);
    }

    const validated = validateJournalDraft(built.draft);
    if (!validated.ok) {
      throw new ConflictException(`Accounting journal validation failed: ${validated.errors.map((error) => error.code).join(', ')}`);
    }

    return validated.draft;
  }
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - ClientPayoutService.create() → POST /client-payouts allocation source-link planı
  /// </remarks>
  private async planPayoutAllocations(
    tx: Prisma.TransactionClient,
    tenantId: string,
    caseId: string,
    caseClientId: string,
    currency: string,
    payoutAmount: Prisma.Decimal,
  ): Promise<PlannedPayoutAllocation[]> {
    const sourceLines = await tx.collectionDispositionLine.findMany({
      where: {
        type: 'CLIENT_PAYABLE',
        caseClientId,
        disposition: {
          tenantId,
          caseId,
          currency,
          status: 'POSTED',
          manualReversalRequiredAt: null,
        },
      },
      select: {
        id: true,
        dispositionId: true,
        amount: true,
        disposition: {
          select: {
            id: true,
            collectionId: true,
            postedAt: true,
            manualReversalRequiredAt: true,
          },
        },
      },
      orderBy: [{ disposition: { postedAt: 'asc' } }, { dispositionId: 'asc' }, { id: 'asc' }],
    });

    const collectionIds = Array.from(new Set(sourceLines.map((line) => line.disposition.collectionId)));
    const confirmedCollections = collectionIds.length
      ? await tx.collection.findMany({
          where: { id: { in: collectionIds }, tenantId, caseId, status: 'CONFIRMED' },
          select: { id: true },
        })
      : [];
    const confirmedCollectionIds = new Set(confirmedCollections.map((collection) => collection.id));
    const eligibleLines = (sourceLines as AllocationSourceLine[])
      .filter((line) => confirmedCollectionIds.has(line.disposition.collectionId))
      .sort(compareAllocationSourceLines);

    const paidAgg = await tx.clientPayout.aggregate({
      _sum: { amount: true },
      where: { tenantId, caseId, caseClientId, currency, status: 'RECORDED' },
    });

    let remainingPriorPaid = paidAgg._sum.amount ?? ZERO;
    let remainingPayout = payoutAmount;
    const allocations: PlannedPayoutAllocation[] = [];

    for (const line of eligibleLines) {
      let remainingLineCapacity = line.amount;

      if (remainingPriorPaid.gt(ZERO)) {
        const consumedPrior = minDecimal(remainingLineCapacity, remainingPriorPaid);
        remainingLineCapacity = remainingLineCapacity.minus(consumedPrior);
        remainingPriorPaid = remainingPriorPaid.minus(consumedPrior);
      }

      if (remainingPayout.lte(ZERO) || remainingLineCapacity.lte(ZERO)) continue;

      const allocated = minDecimal(remainingLineCapacity, remainingPayout);
      allocations.push({
        collectionId: line.disposition.collectionId,
        collectionDispositionId: line.dispositionId,
        collectionDispositionLineId: line.id,
        amount: allocated,
      });
      remainingPayout = remainingPayout.minus(allocated);
    }

    if (remainingPayout.gt(ZERO)) {
      throw new ConflictException({
        code: 'PAYOUT_ALLOCATION_PLAN_MISMATCH',
        message: 'Payout allocation planı payout tutarıyla eşleşmedi',
      });
    }

    return allocations;
  }

  /**
   * Aynı (tenant, idempotencyKey): payload (caseId/caseClientId/amount/currency) eşleşiyorsa
   * idempotent replay (existing payout); FARKLIYSA ConflictException — sessiz eski-payout dönme YOK
   * (finansal güvenlik: çağıran 500 ödediğini sanıp 300'lük eski kaydı almasın).
   */
  private replayOrConflict(
    existing: { id: string; caseId: string; caseClientId: string; amount: Prisma.Decimal; currency: string },
    dto: CreateClientPayoutDto,
    amount: Prisma.Decimal,
    currency: string,
  ): CreatePayoutResult {
    const same =
      existing.caseId === dto.caseId &&
      existing.caseClientId === dto.caseClientId &&
      existing.currency === currency &&
      existing.amount.equals(amount);
    if (!same) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_CONFLICT',
        message: 'Aynı idempotencyKey farklı payload ile kullanıldı (amount/caseId/caseClientId/currency)',
      });
    }
    return { created: false, payoutId: existing.id, idempotentReplay: true };
  }

}
