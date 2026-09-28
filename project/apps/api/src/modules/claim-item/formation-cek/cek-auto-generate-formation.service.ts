import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ClaimItemType, OfficeApprovalRequest, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { DomainEventIngestService } from '../../icrabot/domain-event-ingest';
import { OfficeApprovalDomainSyncService } from '../../office-approval/office-approval-domain-sync.service';
import { throwClaimItemFormationContextRequired } from '../claim-item-formation-containment';
import { ClaimItemWriterRouterService } from '../claim-item-writer-router.service';
import type { AutoGenerateClaimItemsDto } from '../dto/claim-item.dto';
import {
  CLAIM_ITEM_FORMATION_BATCH_APPROVAL_TARGET_TYPE,
  type ClaimItemFormationBatchApprovalRefV1,
  type ClaimItemFormationComponentCategory,
} from '../formation-intent/claim-item-formation-intent.contract';
import {
  ClaimItemFormationOfficeApprovalAdapter,
  type ClaimItemFormationBatchAdmissionResult,
} from '../formation-intent/claim-item-formation-office-approval.adapter';
import { HumanClaimItemFormationAdmissionService } from '../formation-intent/human-claim-item-formation-admission.service';
import { TransactionalClaimItemFormationFinalizerService } from '../formation-finalizer/transactional-claim-item-formation-finalizer.service';
import { CaseInstrumentExactRecordResolverService, type CekRecordCalculationInputsV1 } from './case-instrument-exact-record.resolver';
import { CekLegalBasisReleaseResolverService } from './cek-legal-basis-release.resolver';
import { computeCheckPenaltyMinor } from './cek-penalty';
import { ClaimItemFormationAuthorizationAdapter } from './claim-item-formation-authorization.adapter';

export const CEK_AUTO_GENERATE_FORMATION_ENABLED_ENV = 'RECEIVABLE_CEK_AUTO_GENERATE_FORMATION_ENABLED';
export const CEK_R2_DRAFT_LEGAL_CONTENT_ALLOWED_ENV = 'RECEIVABLE_CEK_R2_DRAFT_CONTENT_ALLOWED';
export const CEK_AUTO_GENERATE_FORMATION_OPTIONS = Symbol('CEK_AUTO_GENERATE_FORMATION_OPTIONS');

export interface CekAutoGenerateFormationOptions {
  /** Uç davranışı; kapalıyken `auto-generate` bugünkü gibi FORMATION_CONTEXT_REQUIRED döner. */
  readonly enabled: boolean;
  /** RCV-LB-R2-CEK taslak hukuki içeriğine izin (owner hukuki onayı öncesi YALNIZ izole geliştirme/test). */
  readonly allowDraftLegalContent: boolean;
  readonly clock?: () => Date;
}

/**
 * Varsayılan KAPALI: iki bayrak da yalnız tam `'true'` metniyle açılır. Canlı ortamda kendiliğinden etkinleşmez.
 *
 * /// <remarks>
 * /// Çağrıldığı yerler:
 * ///  - ClaimItemModule → CEK_AUTO_GENERATE_FORMATION_OPTIONS sağlayıcısı
 * /// </remarks>
 */
export function cekAutoGenerateFormationOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): CekAutoGenerateFormationOptions {
  return {
    enabled: env[CEK_AUTO_GENERATE_FORMATION_ENABLED_ENV] === 'true',
    allowDraftLegalContent: env[CEK_R2_DRAFT_LEGAL_CONTENT_ALLOWED_ENV] === 'true',
  };
}

const CLIENT_IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$/;
const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAX_LIABLE_DEBTORS = 50;
const SUPPORTED_CHECK_PENALTY_RATE_PERCENT = 10;

type CekFormationComponent = {
  readonly itemType: 'PRINCIPAL' | 'CHECK_PENALTY';
  readonly category: ClaimItemFormationComponentCategory;
  readonly subtypeCode: 'CHECK_PRINCIPAL' | 'CHECK_PENALTY';
  readonly legalBasisCode: 'TTK_CEK_BEDELI' | 'TTK_CEK_TAZMINATI';
  readonly amountMinor: bigint;
};

interface CekAutoGenerateCommand {
  readonly caseId: string;
  readonly instrumentId: string;
  readonly idempotencyKey: string;
  readonly liableDebtorIds: readonly string[];
}

export interface CekAutoGenerateFormationResult {
  readonly applied: false;
  readonly approvalRequired: true;
  readonly approvalRequestId: string;
  readonly data: {
    readonly replayed: boolean;
    readonly approvalStatus: string;
    readonly instrumentId: string;
    readonly items: readonly { readonly formationIntentId: string; readonly position: number; readonly sourceSlot: string }[];
  };
}

/**
 * K3 AUTO-GENERATE FORMATION (owner GO 2026-09-28; kararlar "Dar R2 + belge vekili", "çek kaydı kaynak + yalnız
 * tazminat") — `POST /claim-items/auto-generate` için YALNIZ ÇEK (CEK) formation akışı. Yeni bir yazma/onay sistemi
 * DEĞİLDİR; mevcut formation bileşenlerini (admission → OfficeApproval toplu talep → finalizer) bağlar.
 *
 * Talep: kaynak = sunucudaki çek kaydının değişmez sürümü; tutarlar SUNUCUDA hesaplanır (bedel = çek tutarı,
 * tazminat = %10). İstemcinin gönderdiği tutar / para birimi / oran yalnız DOĞRULANIR, kesin kayda taşınmaz. Çek
 * bedeli, çek kaydına bağlı PRINCIPAL yoksa (POST /cases kanonik bedeli) aynı pakete eklenir — mükerrer sayım yok.
 * Onaydan önce kesin ClaimItem OLUŞMAZ.
 *
 * Onay: ikinci avukatın kararı (OfficeApprovalService.approve, K4-1 tx içi yetki) aynı transaction'da bu işleyiciyi
 * çağırır → talep sahibinin güncel yetkisi kilitli yeniden değerlendirilir, çek kaydı ve borçlu satırları FOR SHARE
 * kilitlenir, finalizer kalemlerin TAMAMINI oluşturur; herhangi bir hata kararı da geri alır.
 */
@Injectable()
export class CekAutoGenerateFormationService implements OnModuleInit {
  private readonly clock: () => Date;
  private readonly authorization: ClaimItemFormationAuthorizationAdapter;
  private readonly instruments: CaseInstrumentExactRecordResolverService;
  private readonly legalBasis: CekLegalBasisReleaseResolverService;
  private readonly adapter: ClaimItemFormationOfficeApprovalAdapter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly domainEventIngest: DomainEventIngestService,
    private readonly domainSync: OfficeApprovalDomainSyncService,
    router: ClaimItemWriterRouterService,
    @Inject(CEK_AUTO_GENERATE_FORMATION_OPTIONS) private readonly options: CekAutoGenerateFormationOptions,
  ) {
    this.clock = options.clock ?? (() => new Date());
    this.authorization = new ClaimItemFormationAuthorizationAdapter(router);
    this.instruments = new CaseInstrumentExactRecordResolverService(prisma);
    this.legalBasis = new CekLegalBasisReleaseResolverService({ allowDraftContent: options.allowDraftLegalContent });
    this.adapter = new ClaimItemFormationOfficeApprovalAdapter(prisma, audit);
  }

  onModuleInit(): void {
    if (!this.options.enabled) return;
    this.domainSync.registerClaimItemFormationBatchHandler((tx, req) => this.finalizeApprovedBatch(tx, req));
  }

  isEnabled(): boolean {
    return this.options.enabled;
  }

  /**
   * /// <remarks>
   * /// Çağrıldığı yerler:
   * ///  - ClaimItemService.autoGenerateFromUser() → belge türü CEK ve bayrak açıkken
   * /// </remarks>
   */
  async request(tenantId: string, actorUserId: string, dto: AutoGenerateClaimItemsDto): Promise<CekAutoGenerateFormationResult> {
    if (!this.options.enabled) throwClaimItemFormationContextRequired();
    const command = this.readCommand(dto);
    await this.authorization.assertAuthorized({ tenantId, caseId: command.caseId, actorUserId });

    const existing = await this.adapter.findBatch(tenantId, command.idempotencyKey);
    if (existing) return this.replayResult(existing, actorUserId, command);

    if (!this.options.allowDraftLegalContent) {
      throw new ConflictException({
        code: 'FORMATION_LEGAL_AUTHORITY_UNAVAILABLE',
        message: 'Çek için onaylı hukuki dayanak içeriği yayımlanmadı; talep oluşturulamaz.',
      });
    }
    const cek = await this.instruments.readCekRecord(tenantId, command.caseId, command.instrumentId);
    if (!cek) {
      throw new NotFoundException({ code: 'CHECK_RECORD_NOT_FOUND', message: 'Dosyada bu çek kaydı bulunamadı.' });
    }
    if (!cek.isBounced || cek.bounceDate === null) {
      throw new BadRequestException({
        code: 'CHECK_NOT_DISHONOURED',
        message: 'Çek tazminatı için çek kaydında karşılıksız işareti ve tarihi gerekir.',
      });
    }
    this.assertClientFiguresMatch(dto, cek);
    await this.assertCaseDebtors(this.prisma, command.caseId, command.liableDebtorIds);
    await this.assertNoPendingFormation(tenantId, command.instrumentId);
    const components = await this.components(tenantId, command, cek);

    const now = new Date(this.clock());
    const admission = new HumanClaimItemFormationAdmissionService(
      this.authorization,
      this.instruments,
      this.legalBasis,
      this.adapter,
      { enabled: true, clock: () => new Date(now) },
    );
    const context = { tenantId, actorUserId, correlationId: `k3-cek-auto-generate:${command.idempotencyKey}` };
    const prepared = [];
    for (const component of components) {
      prepared.push(
        await admission.prepare(
          context,
          {
            caseId: command.caseId,
            idempotencyKey: `${command.idempotencyKey}:${component.itemType}`,
            source: {
              sourceType: 'CASE_INSTRUMENT',
              documentId: cek.instrumentId,
              requestedVersionId: this.instruments.project(cek).versionId,
            },
            component: { category: component.category, subtypeCode: component.subtypeCode },
            legalBasis: { code: component.legalBasisCode, requestedVersion: '1' },
            money: {
              originalAmountMinor: component.amountMinor.toString(),
              demandedAmountMinor: component.amountMinor.toString(),
              currency: cek.currency,
              minorUnit: cek.minorUnit,
            },
            effectiveAt: cek.bounceDate,
            liabilityContext: { payload: { liabilityType: 'TAM', liableDebtorRefs: [...command.liableDebtorIds] } },
          },
          { sourceSlot: `CASE_INSTRUMENT:${component.itemType}` },
        ),
      );
    }
    const result = await this.adapter.createBatchAtomic({
      batchIdempotencyKey: command.idempotencyKey,
      items: prepared,
      approvalReason: this.approvalReason(cek, components, command.liableDebtorIds.length),
      authorizeInTransaction: (tx) =>
        this.authorization.assertAuthorizedInTransaction(tx, { tenantId, caseId: command.caseId, actorUserId }),
    });
    return this.toResult(result, command.instrumentId);
  }

  /**
   * Karar transaction'ı içinde (OfficeApprovalDomainSyncService) — onaylanan toplu talebi kesin kalemlere çevirir.
   */
  private async finalizeApprovedBatch(tx: Prisma.TransactionClient, req: OfficeApprovalRequest): Promise<void> {
    const reference = req.savedIntent as unknown as ClaimItemFormationBatchApprovalRefV1 | null;
    if (
      req.targetType !== CLAIM_ITEM_FORMATION_BATCH_APPROVAL_TARGET_TYPE ||
      !reference ||
      reference.tenantId !== req.tenantId ||
      typeof reference.caseId !== 'string'
    ) {
      throw new ConflictException({ code: 'FORMATION_APPROVAL_MISMATCH', message: 'Oluşum onay içeriği geçersiz.' });
    }
    // Talep sahibinin GÜNCEL yetkisi (Lawyer → User FOR SHARE + aynı insan yazma kapısı): onay beklerken yetkisi
    // alınmışsa kalem oluşmaz. Onaylayanın yetkisi commitDecision'da (K4-1) zaten kilit altında denetlendi.
    await this.authorization.assertAuthorizedInTransaction(tx, {
      tenantId: req.tenantId,
      caseId: reference.caseId,
      actorUserId: req.requesterUserId,
    });
    const intents = await tx.claimItemFormationIntent.findMany({
      where: { tenantId: req.tenantId, approvalRequestId: req.id },
      select: { sourceType: true, sourceId: true },
    });
    const instrumentIds = [...new Set(intents.filter((i) => i.sourceType === 'CASE_INSTRUMENT').map((i) => i.sourceId))].sort();
    if (instrumentIds.length > 0) {
      // Eşzamanlı çek kaydı değişikliği bu karar bitene kadar bekler; önce commit ettiyse aşağıdaki kesin sürüm
      // karşılaştırması bayat içeriği reddeder.
      await tx.$queryRaw`SELECT "id" FROM "CaseInstrument" WHERE "tenantId" = ${req.tenantId} AND "id" IN (${Prisma.join(instrumentIds)}) ORDER BY "id" FOR SHARE`;
    }
    const finalizer = new TransactionalClaimItemFormationFinalizerService(
      this.prisma,
      this.audit,
      this.domainEventIngest,
      new CaseInstrumentExactRecordResolverService(tx as unknown as PrismaService),
      this.legalBasis,
      { enabled: true, clock: this.clock },
    );
    const formed = await finalizer.finalizeApprovedBatchInTransaction(tx, {
      tenantId: req.tenantId,
      approvalRequestId: req.id,
    });
    const created = await tx.claimItem.findMany({
      where: { tenantId: req.tenantId, id: { in: formed.items.map((item) => item.claimItemId) } },
      select: { liableDebtorIds: true },
    });
    const debtorIds = [...new Set(created.flatMap((item) => item.liableDebtorIds))];
    await this.assertCaseDebtors(tx, reference.caseId, debtorIds, true);
  }

  private readCommand(dto: AutoGenerateClaimItemsDto): CekAutoGenerateCommand {
    const instrumentId = dto.caseInstrumentId ?? dto.documentId;
    if (typeof dto.idempotencyKey !== 'string' || !CLIENT_IDEMPOTENCY_KEY.test(dto.idempotencyKey)) {
      this.badRequest('FORMATION_IDEMPOTENCY_KEY_REQUIRED', 'Çek oluşum talebi için geçerli idempotencyKey zorunludur.');
    }
    if (typeof instrumentId !== 'string' || !OPAQUE_ID.test(instrumentId)) {
      this.badRequest('CHECK_RECORD_REQUIRED', 'Çek kaydı kimliği (caseInstrumentId) zorunludur.');
    }
    if (dto.caseInstrumentId !== undefined && dto.documentId && dto.documentId !== dto.caseInstrumentId) {
      this.badRequest('CHECK_RECORD_REQUIRED', 'documentId ile caseInstrumentId aynı çek kaydını göstermelidir.');
    }
    const debtors = dto.liableDebtorIds;
    if (
      !Array.isArray(debtors) ||
      debtors.length === 0 ||
      debtors.length > MAX_LIABLE_DEBTORS ||
      debtors.some((id) => typeof id !== 'string' || !OPAQUE_ID.test(id)) ||
      new Set(debtors).size !== debtors.length
    ) {
      this.badRequest('LIABLE_DEBTORS_REQUIRED', 'Sorumlu borçlular (liableDebtorIds) tekrarsız ve boş olmayan liste olmalıdır.');
    }
    if (dto.checkPenaltyRate !== undefined && dto.checkPenaltyRate !== SUPPORTED_CHECK_PENALTY_RATE_PERCENT) {
      this.badRequest('CHECK_PENALTY_RATE_UNSUPPORTED', 'Yalnız %10 çek tazminatı desteklenir.');
    }
    return {
      caseId: dto.caseId,
      instrumentId: instrumentId as string,
      idempotencyKey: dto.idempotencyKey as string,
      liableDebtorIds: [...(debtors as string[])].sort(),
    };
  }

  /** İstemci rakamları yalnız doğrulanır; kesin tutar çek kaydından gelir. */
  private assertClientFiguresMatch(dto: AutoGenerateClaimItemsDto, cek: CekRecordCalculationInputsV1): void {
    if (dto.totalAmount !== undefined) {
      const client = new Prisma.Decimal(String(dto.totalAmount));
      if (!client.isFinite() || client.decimalPlaces() > 2 || BigInt(client.mul(100).toFixed(0)) !== cek.amountMinor) {
        this.badRequest('CHECK_AMOUNT_MISMATCH', 'Gönderilen tutar çek kaydındaki tutarla uyuşmuyor.');
      }
    }
    if (dto.currency !== undefined && dto.currency !== cek.currency) {
      this.badRequest('CHECK_CURRENCY_MISMATCH', 'Gönderilen para birimi çek kaydıyla uyuşmuyor.');
    }
  }

  private async assertCaseDebtors(
    db: Prisma.TransactionClient | PrismaService,
    caseId: string,
    debtorIds: readonly string[],
    lock = false,
  ): Promise<void> {
    if (debtorIds.length === 0) {
      throw new ConflictException({ code: 'LIABLE_DEBTORS_REQUIRED', message: 'Sorumlu borçlu bulunamadı.' });
    }
    const sorted = [...debtorIds].sort();
    const rows = lock
      ? await (db as Prisma.TransactionClient).$queryRaw<{ debtorId: string }[]>`SELECT "debtorId" FROM "CaseDebtor" WHERE "caseId" = ${caseId} AND "lifecycleStatus" = 'ACTIVE' AND "debtorId" IN (${Prisma.join(sorted)}) FOR SHARE`
      : await db.caseDebtor.findMany({
          where: { caseId, lifecycleStatus: 'ACTIVE', debtorId: { in: sorted } },
          select: { debtorId: true },
          distinct: ['debtorId'],
        });
    if (new Set(rows.map((row) => row.debtorId)).size !== sorted.length) {
      const body = { code: 'LIABLE_DEBTOR_NOT_IN_CASE', message: 'Sorumlu borçlu bu dosyanın etkin borçlusu değil.' };
      throw lock ? new ConflictException(body) : new BadRequestException(body);
    }
  }

  /** Aynı çek için onay bekleyen oluşum talebi varken ikinci talep açılmaz (kesin güvence finalizer + kaynak kilidi). */
  private async assertNoPendingFormation(tenantId: string, instrumentId: string): Promise<void> {
    const intents = await this.prisma.claimItemFormationIntent.findMany({
      where: { tenantId, sourceType: 'CASE_INSTRUMENT', sourceId: instrumentId },
      select: { approvalRequestId: true },
    });
    if (intents.length === 0) return;
    const pending = await this.prisma.officeApprovalRequest.count({
      where: { tenantId, id: { in: intents.map((i) => i.approvalRequestId) }, status: 'PENDING_APPROVAL' },
    });
    if (pending > 0) {
      throw new ConflictException({
        code: 'CHECK_FORMATION_ALREADY_PENDING',
        message: 'Bu çek için onay bekleyen bir alacak kalemi oluşum talebi var.',
      });
    }
  }

  private async components(
    tenantId: string,
    command: CekAutoGenerateCommand,
    cek: CekRecordCalculationInputsV1,
  ): Promise<CekFormationComponent[]> {
    const bound = await this.prisma.claimItem.findMany({
      where: {
        tenantId,
        caseId: command.caseId,
        instrumentId: command.instrumentId,
        itemType: { in: [ClaimItemType.PRINCIPAL, ClaimItemType.CHECK_PENALTY] },
      },
      select: { itemType: true },
    });
    if (bound.some((item) => item.itemType === ClaimItemType.CHECK_PENALTY)) {
      throw new ConflictException({
        code: 'CHECK_PENALTY_ALREADY_EXISTS',
        message: 'Bu çek için çek tazminatı kalemi zaten var.',
      });
    }
    const penaltyMinor = computeCheckPenaltyMinor(cek.amountMinor, this.legalBasis.penaltyBasisPoints());
    const components: CekFormationComponent[] = [];
    if (!bound.some((item) => item.itemType === ClaimItemType.PRINCIPAL)) {
      components.push({
        itemType: 'PRINCIPAL',
        category: 'PRINCIPAL',
        subtypeCode: 'CHECK_PRINCIPAL',
        legalBasisCode: 'TTK_CEK_BEDELI',
        amountMinor: cek.amountMinor,
      });
    }
    components.push({
      itemType: 'CHECK_PENALTY',
      category: 'ANCILLARY',
      subtypeCode: 'CHECK_PENALTY',
      legalBasisCode: 'TTK_CEK_TAZMINATI',
      amountMinor: penaltyMinor,
    });
    return components;
  }

  private replayResult(
    existing: NonNullable<Awaited<ReturnType<ClaimItemFormationOfficeApprovalAdapter['findBatch']>>>,
    actorUserId: string,
    command: CekAutoGenerateCommand,
  ): CekAutoGenerateFormationResult {
    const { approval, intents } = existing;
    const reference = approval.savedIntent as unknown as ClaimItemFormationBatchApprovalRefV1 | null;
    if (
      approval.requesterUserId !== actorUserId ||
      reference?.caseId !== command.caseId ||
      intents.length === 0 ||
      intents.some((intent) => intent.sourceType !== 'CASE_INSTRUMENT' || intent.sourceId !== command.instrumentId)
    ) {
      throw new ConflictException({
        code: 'DUPLICATE_FORMATION_CONFLICT',
        message: 'Bu idempotencyKey farklı bir oluşum talebi için kullanıldı.',
      });
    }
    return this.toResult({ approval, intents, replayed: true }, command.instrumentId);
  }

  private toResult(result: ClaimItemFormationBatchAdmissionResult, instrumentId: string): CekAutoGenerateFormationResult {
    return {
      applied: false,
      approvalRequired: true,
      approvalRequestId: result.approval.id,
      data: {
        replayed: result.replayed,
        approvalStatus: result.approval.status,
        instrumentId,
        items: result.intents.map((intent) => ({
          formationIntentId: intent.id,
          position: intent.approvalBatchPosition,
          sourceSlot: intent.sourceSlot,
        })),
      },
    };
  }

  /** Onay kutusu için okunur özet (bağlayıcı değil; tutarlar sunucuda hesaplanmış değerlerdir). */
  private approvalReason(
    cek: CekRecordCalculationInputsV1,
    components: readonly CekFormationComponent[],
    debtorCount: number,
  ): string {
    const money = (minor: bigint) => {
      const digits = minor.toString().padStart(3, '0');
      return `${digits.slice(0, -2)}.${digits.slice(-2)} ${cek.currency}`;
    };
    const lines = components.map((component) =>
      component.itemType === 'PRINCIPAL'
        ? `Çek bedeli ${money(component.amountMinor)}`
        : `Çek tazminatı (%${SUPPORTED_CHECK_PENALTY_RATE_PERCENT}) ${money(component.amountMinor)}`,
    );
    return (
      `Çek ${cek.serialNo} (tutar ${money(cek.amountMinor)}, karşılıksız ${String(cek.bounceDate).slice(0, 10)}) için ` +
      `alacak kalemi oluşumu: ${lines.join('; ')}; sorumlu borçlu sayısı ${debtorCount}. ` +
      'Taslak hukuki içerik (RCV-LB-R2-CEK) — owner hukuki onayı bekler.'
    );
  }

  private badRequest(code: string, message: string): never {
    throw new BadRequestException({ code, message });
  }
}
