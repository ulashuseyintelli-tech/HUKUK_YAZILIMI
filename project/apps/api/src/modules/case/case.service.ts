import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger, Inject, forwardRef, Optional } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { CreateCaseDto, UpdateCaseDto, CaseSubCategory, Currency, DueDto, DueType, InterestType, CaseInstrumentInputDto, CaseInstrumentSource, CaseStaffInputDto } from "./dto/case.dto";
import { Prisma, LegalCaseStatus, InterestType as PrismaInterestType, DocumentSourceType } from "@prisma/client";
import { mapDueTypeToClaimItemType, buildClaimItemData } from "./due-to-claim-item.mapper";
import {
  resolveCaseInstrumentType,
  buildCaseInstrumentData,
  buildInstrumentPrincipalClaimItemData,
} from "./ocr-instrument-to-case-instrument.mapper";
import { randomUUID } from "crypto";
import { isInitialStatus } from "../case-status/case-status.service";
import { AuditService } from "../audit/audit.service";
import { ClientInfoRequestService } from "../address-discovery/client-info-request.service";
import { InterestEngineService } from "../interest-engine/interest-engine.service";
import { CaseBalanceService } from "../interest-engine/orchestration/case-balance.service";
import type { CaseBalanceResult } from "../interest-engine/orchestration/case-balance.service";
import { resolveInitialPolicy } from "../interest-engine/interest-strategy.config";
import { mapDtoCaseTypeToInterestCaseType } from "./case-type-mapping";
import { validateResponsibleSelection } from "./responsible-candidates.service"; // M2-A3a: create'te ortak Dosya Sorumlusu validator
import { ExpenseRequestService } from "../expense-request/expense-request.service";
import { DomainEventIngestService } from "../icrabot/domain-event-ingest";
import { CollectionService } from "../collection/collection.service";
// RFA-016: case.create içindeki inline taraf oluşturma artık bu guard'lı servislere devredilir
// (tx.client/lawyer/debtor.create duplicate guard'ı atlıyordu → Şükrü-deseninin dış-kapı hali).
import { ClientService } from "../client/client.service";
import { LawyerService } from "../lawyer/lawyer.service";
import { DebtorService } from "../debtor/debtor.service";
import { DebtorType } from "@prisma/client";

// ASSIGN-4b sorumlu-avukat invariant'ının SAF karar fonksiyonları
// (pickResponsibleFallbackIndex / resolveResponsiblePromotion / planResponsible)
// ./case-responsible.helpers'a taşındı: tek-seferlik drift onarım scripti
// (fix-case-lawyer-responsible-drift.ts, tsx ile NestJS-dışı) bunları REUSE edebilsin diye
// (case.service.ts'in @/ path-alias grafiği tsx'te çözülmez). Davranış DEĞİŞMEDİ.
// İç kullanım (create/removeCaseLawyer) için import + geriye-uyum için re-export
// (mevcut `from '../case.service'` import'ları, ör. invariant spec, korunur).
import {
  pickResponsibleFallbackIndex,
  resolveResponsiblePromotion,
  planResponsible,
} from "./case-responsible.helpers";
export { pickResponsibleFallbackIndex, resolveResponsiblePromotion, planResponsible };

type CalculationSummaryCanonicalShadowMatchStatus =
  | "MATCH"
  | "MINOR_DELTA"
  | "MAJOR_DELTA"
  | "LEGACY_ZERO"
  | "CURRENCY_MISMATCH"
  | "ERROR"
  | "UNAVAILABLE";

type CalculationSummaryCanonicalShadowErrorCode =
  | "CASE_BALANCE_SERVICE_UNAVAILABLE"
  | "CANONICAL_SHADOW_COMPUTE_FAILED";

type CalculationSummaryCanonicalShadowAlignmentStatus =
  | "SCOPE_MISMATCH"
  | "ALIGNED"
  | "UNKNOWN";

type CalculationSummaryCanonicalShadowComparisonScope =
  | "RAW_LEGACY_SON_BORC_VS_CANONICAL_TOTAL_DUE";

type CalculationSummaryCanonicalShadowProjectionCurrencyScope =
  | "UNSCOPED_CASE_CURRENCY_ASSUMED";

type CalculationSummaryCanonicalShadowMatchStatusInterpretation =
  | "RAW_DELTA_DIAGNOSTIC_ONLY";

type CalculationSummaryCanonicalShadowLegacyField =
  | "toplamBorc"
  | "sonBorc"
  | "kalanBorc";

type CalculationSummaryCanonicalShadowCanonicalScope =
  | "CLAIM_ONLY"
  | "PROJECTED_WITH_COSTS"
  | "PROJECTED_WITH_COSTS_AND_ANCILLARIES";

type CalculationSummaryCanonicalShadowScopeStatus =
  | "CANDIDATE_ONLY"
  | "UNAVAILABLE";

type CalculationSummaryCanonicalShadowPaymentScope =
  | "NET_OF_PAYMENTS"
  | "GROSS_INTEREST"
  | "GROSS_OF_COLLECTIONS"
  | "NET_OF_COLLECTIONS";

type CalculationSummaryCanonicalShadowPaymentScopeAlignment =
  | "MATCH_NET_TO_NET"
  | "POSSIBLE_NET_TO_NET"
  | "MISMATCH_NET_TO_GROSS"
  | "UNKNOWN";

type CalculationSummaryCanonicalShadowLegacyPaymentSource =
  | "COLLECTIONS_STATUS_NOT_CANCELLED";

type CalculationSummaryCanonicalShadowCanonicalPaymentSource =
  | "LEDGER_CONFIRMED_OR_CONFIRMED_COLLECTION_FALLBACK";

type CalculationSummaryCanonicalShadowPaymentSourceParity =
  | "NOT_PROVEN";

type CalculationSummaryCanonicalShadowPaymentSourceParityReason =
  | "LEGACY_COLLECTION_FILTER_DIFFERS_FROM_CANONICAL_PAYMENT_MAPPER";

type CalculationSummaryCanonicalShadowScopeComparison = {
  legacyField: CalculationSummaryCanonicalShadowLegacyField;
  canonicalScope: CalculationSummaryCanonicalShadowCanonicalScope;
  legacyValue: number;
  canonicalValue: number | null;
  delta: number | null;
  deltaPercent: number | null;
  scopeStatus: CalculationSummaryCanonicalShadowScopeStatus;
  paymentScopeAlignment: CalculationSummaryCanonicalShadowPaymentScopeAlignment;
  paymentSourceParity: CalculationSummaryCanonicalShadowPaymentSourceParity;
};

type CalculationSummaryCanonicalShadow = {
  status: "OK" | "ERROR" | "UNAVAILABLE";
  source: "computeCaseBalance";
  asOfDate: string;
  alignmentStatus: CalculationSummaryCanonicalShadowAlignmentStatus;
  comparisonScope: CalculationSummaryCanonicalShadowComparisonScope;
  canonicalProjectionCurrencyScope: CalculationSummaryCanonicalShadowProjectionCurrencyScope;
  canonicalProjectionCurrency: string;
  matchStatusInterpretation: CalculationSummaryCanonicalShadowMatchStatusInterpretation;
  canonicalTotalDuePaymentScope: "NET_OF_PAYMENTS";
  canonicalInterestPaymentScope: "GROSS_INTEREST";
  legacyToplamBorcPaymentScope: "GROSS_OF_COLLECTIONS";
  legacySonBorcPaymentScope: "GROSS_OF_COLLECTIONS";
  legacyKalanBorcPaymentScope: "NET_OF_COLLECTIONS";
  legacyPaymentSource: CalculationSummaryCanonicalShadowLegacyPaymentSource;
  canonicalPaymentSource: CalculationSummaryCanonicalShadowCanonicalPaymentSource;
  paymentSourceParity: CalculationSummaryCanonicalShadowPaymentSourceParity;
  paymentSourceParityReason: CalculationSummaryCanonicalShadowPaymentSourceParityReason;
  legacyToplamBorc: number;
  legacySonBorc: number;
  legacyToplamTahsilat: number;
  legacyKalanBorc: number;
  legacyTahsilHarci: number;
  legacyIcraMasraflari: number;
  legacyVekaletUcreti: number;
  legacyCurrency: string;
  canonicalTotalDue?: number | null;
  canonicalProjectionCostsTotal?: number | null;
  canonicalProjectionAncillariesTotal?: number | null;
  canonicalProjectedTotalDue?: number | null;
  canonicalClaimOnlyTotal?: number | null;
  canonicalProjectedWithCosts?: number | null;
  canonicalProjectedWithCostsAndAncillaries?: number | null;
  scopeComparisonMatrix: CalculationSummaryCanonicalShadowScopeComparison[];
  rawDelta?: number | null;
  engineSource?: CaseBalanceResult["source"];
  matchStatus?: CalculationSummaryCanonicalShadowMatchStatus;
  currencyResults?: Array<{
    currency: string;
    totalDue: number | null;
    canonicalTotalDue: number | null;
    totalInterest: number | null;
    preEnforcementInterest: number | null;
    postEnforcementInterest: number | null;
    skippedReason: string | null;
    delta: number | null;
    deltaPercent: number | null;
    rawDelta: number | null;
    alignmentStatus: CalculationSummaryCanonicalShadowAlignmentStatus;
    comparisonScope: CalculationSummaryCanonicalShadowComparisonScope;
    canonicalProjectionCurrencyScope: CalculationSummaryCanonicalShadowProjectionCurrencyScope;
    canonicalProjectionCurrency: string;
    matchStatusInterpretation: CalculationSummaryCanonicalShadowMatchStatusInterpretation;
    matchStatus: CalculationSummaryCanonicalShadowMatchStatus;
  }>;
  diagnostics?: CaseBalanceResult["diagnostics"];
  errorCode?: CalculationSummaryCanonicalShadowErrorCode;
};

const CANONICAL_SHADOW_MATCH_EPSILON = 0.01;
const CANONICAL_SHADOW_MINOR_DELTA_PERCENT = 1;
const CANONICAL_SHADOW_COMPARISON_SCOPE: CalculationSummaryCanonicalShadowComparisonScope =
  "RAW_LEGACY_SON_BORC_VS_CANONICAL_TOTAL_DUE";
const CANONICAL_SHADOW_PROJECTION_CURRENCY_SCOPE: CalculationSummaryCanonicalShadowProjectionCurrencyScope =
  "UNSCOPED_CASE_CURRENCY_ASSUMED";
const CANONICAL_SHADOW_MATCH_STATUS_INTERPRETATION: CalculationSummaryCanonicalShadowMatchStatusInterpretation =
  "RAW_DELTA_DIAGNOSTIC_ONLY";
const CANONICAL_TOTAL_DUE_PAYMENT_SCOPE: Extract<
  CalculationSummaryCanonicalShadowPaymentScope,
  "NET_OF_PAYMENTS"
> = "NET_OF_PAYMENTS";
const CANONICAL_INTEREST_PAYMENT_SCOPE: Extract<
  CalculationSummaryCanonicalShadowPaymentScope,
  "GROSS_INTEREST"
> = "GROSS_INTEREST";
const LEGACY_TOPLAM_BORC_PAYMENT_SCOPE: Extract<
  CalculationSummaryCanonicalShadowPaymentScope,
  "GROSS_OF_COLLECTIONS"
> = "GROSS_OF_COLLECTIONS";
const LEGACY_SON_BORC_PAYMENT_SCOPE: Extract<
  CalculationSummaryCanonicalShadowPaymentScope,
  "GROSS_OF_COLLECTIONS"
> = "GROSS_OF_COLLECTIONS";
const LEGACY_KALAN_BORC_PAYMENT_SCOPE: Extract<
  CalculationSummaryCanonicalShadowPaymentScope,
  "NET_OF_COLLECTIONS"
> = "NET_OF_COLLECTIONS";
const LEGACY_PAYMENT_SOURCE: CalculationSummaryCanonicalShadowLegacyPaymentSource =
  "COLLECTIONS_STATUS_NOT_CANCELLED";
const CANONICAL_PAYMENT_SOURCE: CalculationSummaryCanonicalShadowCanonicalPaymentSource =
  "LEDGER_CONFIRMED_OR_CONFIRMED_COLLECTION_FALLBACK";
const PAYMENT_SOURCE_PARITY: CalculationSummaryCanonicalShadowPaymentSourceParity =
  "NOT_PROVEN";
const PAYMENT_SOURCE_PARITY_REASON: CalculationSummaryCanonicalShadowPaymentSourceParityReason =
  "LEGACY_COLLECTION_FILTER_DIFFERS_FROM_CANONICAL_PAYMENT_MAPPER";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function sumCanonicalProjectionTotal(values: Partial<Record<string, unknown>> | null | undefined): number {
  if (!values) return 0;
  let total = 0;
  for (const value of Object.values(values)) {
    total += Number(value ?? 0);
  }
  return round2(total);
}

function paymentScopeAlignmentForLegacyField(
  legacyField: CalculationSummaryCanonicalShadowLegacyField,
): CalculationSummaryCanonicalShadowPaymentScopeAlignment {
  if (legacyField === "kalanBorc") return "POSSIBLE_NET_TO_NET";
  if (legacyField === "toplamBorc" || legacyField === "sonBorc") return "MISMATCH_NET_TO_GROSS";
  return "UNKNOWN";
}

function buildCanonicalShadowScopeComparisonMatrix(
  legacy: {
    legacyToplamBorc: number;
    legacySonBorc: number;
    legacyKalanBorc: number;
  },
  canonical: {
    canonicalClaimOnlyTotal: number | null;
    canonicalProjectedWithCosts: number | null;
    canonicalProjectedWithCostsAndAncillaries: number | null;
  },
): CalculationSummaryCanonicalShadowScopeComparison[] {
  const legacyFields: Array<{
    legacyField: CalculationSummaryCanonicalShadowLegacyField;
    legacyValue: number;
  }> = [
    { legacyField: "toplamBorc", legacyValue: legacy.legacyToplamBorc },
    { legacyField: "sonBorc", legacyValue: legacy.legacySonBorc },
    { legacyField: "kalanBorc", legacyValue: legacy.legacyKalanBorc },
  ];

  const canonicalScopes: Array<{
    canonicalScope: CalculationSummaryCanonicalShadowCanonicalScope;
    canonicalValue: number | null;
  }> = [
    { canonicalScope: "CLAIM_ONLY", canonicalValue: canonical.canonicalClaimOnlyTotal },
    { canonicalScope: "PROJECTED_WITH_COSTS", canonicalValue: canonical.canonicalProjectedWithCosts },
    {
      canonicalScope: "PROJECTED_WITH_COSTS_AND_ANCILLARIES",
      canonicalValue: canonical.canonicalProjectedWithCostsAndAncillaries,
    },
  ];

  return legacyFields.flatMap(({ legacyField, legacyValue }) =>
    canonicalScopes.map(({ canonicalScope, canonicalValue }) => {
      const delta = canonicalValue != null ? round2(canonicalValue - legacyValue) : null;
      const deltaPercent =
        delta != null && legacyValue !== 0 ? round2((delta / legacyValue) * 100) : null;

      return {
        legacyField,
        canonicalScope,
        legacyValue,
        canonicalValue,
        delta,
        deltaPercent,
        scopeStatus: canonicalValue == null ? "UNAVAILABLE" : "CANDIDATE_ONLY",
        paymentScopeAlignment: paymentScopeAlignmentForLegacyField(legacyField),
        paymentSourceParity: PAYMENT_SOURCE_PARITY,
      };
    }),
  );
}

function classifyCanonicalShadowDelta(
  legacyCurrency: string,
  currency: string,
  legacySonBorc: number,
  canonicalTotalDue: number | null,
  delta: number | null,
  deltaPercent: number | null,
): CalculationSummaryCanonicalShadowMatchStatus {
  if (currency !== legacyCurrency) return "CURRENCY_MISMATCH";
  if (legacySonBorc === 0) return "LEGACY_ZERO";
  if (canonicalTotalDue == null || delta == null) return "MAJOR_DELTA";
  if (Math.abs(delta) < CANONICAL_SHADOW_MATCH_EPSILON) return "MATCH";
  if (deltaPercent != null && Math.abs(deltaPercent) < CANONICAL_SHADOW_MINOR_DELTA_PERCENT) {
    return "MINOR_DELTA";
  }
  return "MAJOR_DELTA";
}

export type DueForClaimItemSync = {
  id: string;
  type: string;
  description?: string | null;
  amount: unknown;
  dueDate: Date | string;
  currency?: string | null;
  sortOrder?: number | null;
  interestType?: string | null;
  interestRate?: unknown;
  interestStartDate?: Date | string | null;
  interestEndDate?: Date | string | null;
  interestAmount?: number | null;
  // FATURA (G2-wire) — belge/KDV alanları (sourceDocumentNo/hasKdv/kdvRate Due'da; sourceDocumentType/kdvAmount in-memory)
  sourceDocumentNo?: string | null;
  sourceDocumentType?: DocumentSourceType | null;
  hasKdv?: boolean | null;
  kdvRate?: unknown;
  kdvAmount?: number | null;
  // PR-2c — İLAM/KİRA belge alanları (hiçbiri Due kolonu değil; in-memory taşınır → ClaimItem metadata/referenceNo/issueDate)
  ilamMahkeme?: string | null;
  ilamEsasNo?: string | null;
  ilamKararNo?: string | null;
  davaTarihi?: string | null;
  issueDate?: string | null;
  kiraDonemBaslangic?: string | null;
  kiraDonemBitis?: string | null;
};

function normalizeDueInterestRate(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  return Number(value);
}

function normalizeClaimItemInterestRate(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return Number(value);
}

function serializeDueInterestDate(value?: Date | string | null): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : value;
}

/**
 * FATURA (G2-wire) — DB Due'sundan ClaimItem köprüsü için DueDto kurar (SAF, test edilebilir).
 * G2a mapper'ın (buildClaimItemData) okuduğu belge/KDV alanlarını dahil eder → DORMANT G2a CANLI olur.
 *
 * Çağrıldığı yerler:
 * - CaseService.buildDueSyncClaimItemData() → POST /cases (dosya açılışı) + POST /cases/:id/dues (Due→ClaimItem sync)
 */
export function buildSyncDueDto(due: DueForClaimItemSync): DueDto {
  return {
    type: due.type as DueType,
    description: due.description ?? undefined,
    amount: Number(due.amount),
    dueDate: due.dueDate instanceof Date ? due.dueDate.toISOString() : due.dueDate,
    interestType: due.interestType ? (due.interestType as InterestType) : undefined,
    interestRate: normalizeDueInterestRate(due.interestRate),
    interestStartDate: serializeDueInterestDate(due.interestStartDate),
    interestEndDate: serializeDueInterestDate(due.interestEndDate),
    interestAmount: due.interestAmount ?? undefined,
    // FATURA (G2-wire): belge/KDV → DueDto → buildClaimItemData ClaimItem.referenceNo/sourceDocumentType/metadata.kdv
    sourceDocumentNo: due.sourceDocumentNo ?? undefined,
    sourceDocumentType: due.sourceDocumentType ?? undefined,
    hasKdv: due.hasKdv ?? undefined,
    kdvRate: normalizeDueInterestRate(due.kdvRate),
    kdvAmount: due.kdvAmount ?? undefined,
    // PR-2c (G2-wire deseni): İLAM/KİRA belge alanları → DueDto → buildClaimItemData (metadata.ilam/kira · referenceNo · issueDate)
    ilamMahkeme: due.ilamMahkeme ?? undefined,
    ilamEsasNo: due.ilamEsasNo ?? undefined,
    ilamKararNo: due.ilamKararNo ?? undefined,
    davaTarihi: due.davaTarihi ?? undefined,
    issueDate: due.issueDate ?? undefined,
    kiraDonemBaslangic: due.kiraDonemBaslangic ?? undefined,
    kiraDonemBitis: due.kiraDonemBitis ?? undefined,
  };
}

function normalizeClaimItemInterestDate(value?: Date | string | null): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return value instanceof Date ? value : new Date(value);
}

function mergeDueSyncMetadata(
  metadata: Prisma.ClaimItemUncheckedCreateInput["metadata"],
  dueId: string,
): Prisma.InputJsonObject {
  const base =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? { ...(metadata as Prisma.InputJsonObject) }
      : {};

  return {
    ...base,
    dueSync: {
      sourceDueId: dueId,
      mappedFrom: "Due",
    },
  };
}

@Injectable()
export class CaseService {
  private readonly logger = new Logger(CaseService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    @Inject(forwardRef(() => ClientInfoRequestService))
    private clientInfoRequestService: ClientInfoRequestService,
    @Inject(forwardRef(() => InterestEngineService))
    private interestEngineService: InterestEngineService,
    @Inject(forwardRef(() => ExpenseRequestService))
    private expenseRequestService: ExpenseRequestService,
    private domainEventIngestService: DomainEventIngestService,
    // G3d: tahsilat create/cancel tek otorite = CollectionService (kanonik yol:
    // closed/duplicate guard + PAYMENT_RECEIVED event + G3a ledger + CollectionAllocation).
    private collectionService: CollectionService,
    // RFA-016: inline taraf (id YOK) resolve/create için guard'lı servisler.
    private clientService: ClientService,
    private lawyerService: LawyerService,
    private debtorService: DebtorService,
    @Optional()
    private canonicalCaseBalance?: CaseBalanceService,
  ) {}

  /**
   * RFA-016: case.create içindeki inline-yeni taraflar (id YOK) için guard'lı resolve/create.
   * Transaction ÖNCESİ çağrılır (Tasarım A): guard mantığı tek-kaynak kalır (replike edilmez),
   * exact/identity eşleşmesi mevcut kaydı reuse eder → silent duplicate önlenir. dto party'lerin
   * `.id` alanı yerinde set edilir; tx içindeki döngüler artık yalnız id kullanır (tx.X.create YOK).
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - CaseService.create() → POST /cases (Yeni Takip sihirbazı: inline-yeni müvekkil/avukat/borçlu)
   * </remarks>
   */
  private async resolveInlinePartiesBeforeTx(tenantId: string, dto: CreateCaseDto): Promise<void> {
    // 1) Müvekkil (creditor) — ClientService.create: identity (tckn/vkn) eşleşmesi → mevcut döndür
    //    (reactivate dahil). Kimliksizde fuzzy YOK (Müvekkil=TCKN kontratı). Throw etmez.
    if (dto.creditors?.length) {
      for (const c of dto.creditors) {
        if (c.id || !c.name) continue;
        const isCompany = c.type === "COMPANY";
        const parts = c.name.trim().split(/\s+/);
        const resolved: any = await this.clientService.create(tenantId, {
          type: c.type,
          name: c.name,
          firstName: !isCompany ? (parts.length > 1 ? parts.slice(0, -1).join(" ") : c.name.trim()) : undefined,
          lastName: !isCompany && parts.length > 1 ? parts[parts.length - 1] : undefined,
          companyName: isCompany ? c.name : undefined,
          tckn: !isCompany ? c.identityNo : undefined,
          vkn: isCompany ? c.identityNo : undefined,
          taxOffice: c.taxOffice,
          phone: c.phone,
          email: c.email,
          address: c.address,
        });
        c.id = resolved.id;
      }
    }

    // 2) Avukat — LawyerService.create: bar/tckn VEYA isim eşleşmesi → mevcut döndür (reactivate). Throw etmez.
    if (dto.lawyers?.length) {
      for (const l of dto.lawyers) {
        if (l.id || !l.name || !l.surname) continue;
        const resolved: any = await this.lawyerService.create(tenantId, {
          name: l.name, surname: l.surname, tckn: l.tckn, gender: l.gender,
          barNumber: l.barNumber, barCity: l.barCity, tbbNo: l.tbbNo,
          vergiDairesi: l.vergiDairesi, vergiNo: l.vergiNo,
          phone: l.phone, email: l.email, bankName: l.bankName, iban: l.iban,
          isInHouseCounsel: l.isInHouseCounsel, isEmployee: l.isEmployee, canSign: l.canSign,
        });
        l.id = resolved.id;
      }
    }

    // 3) Legacy borçlu (yalnız caseDebtors yoksa kullanılır; UI=NO ama API kapısı açık → guard'a çevrildi).
    //    DebtorService.create THROW eder: DUPLICATE_IDENTITY → mevcut reuse (client ile tutarlı);
    //    SIMILAR_NAME_REVIEW (kimliksiz isim) → case-create'te interaktif review yok → forceCreate
    //    (iki gerçek aynı-isimli borçlu meşru, IR-0). NOT: legacy `address` (deprecated JSON) artık
    //    taşınmaz; kanonik adres = DebtorAddress (legacy yol UI=NO).
    if (!dto.caseDebtors?.length && dto.debtors?.length) {
      for (const d of dto.debtors) {
        if (d.id || !d.name) continue;
        const isCompany = d.type === "COMPANY";
        const parts = d.name.trim().split(/\s+/);
        const mapped: any = {
          type: isCompany ? DebtorType.COMPANY : DebtorType.INDIVIDUAL,
          ...(isCompany
            ? { companyName: d.name, vkn: d.identityNo, taxOffice: d.taxOffice }
            : {
                firstName: parts.length > 1 ? parts.slice(0, -1).join(" ") : d.name.trim(),
                lastName: parts.length > 1 ? parts[parts.length - 1] : "",
                tckn: d.identityNo,
              }),
          phone: d.phone,
          email: d.email,
        };
        try {
          const resolved: any = await this.debtorService.create(tenantId, mapped);
          d.id = resolved.id;
        } catch (e: any) {
          const body = e?.response ?? e;
          if (body?.code === "DUPLICATE_IDENTITY" && body?.existingDebtor?.id) {
            d.id = body.existingDebtor.id; // kimlik eşleşmesi → mevcut reuse
          } else if (body?.code === "SIMILAR_NAME_REVIEW") {
            const forced: any = await this.debtorService.create(tenantId, { ...mapped, forceCreate: true });
            d.id = forced.id;
          } else {
            throw e;
          }
        }
      }
    }
  }

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - CaseService.create() → POST /cases (transaction öncesi mevcut borçlu/adres ownership guard)
  /// </remarks>
  private async validateDebtorOwnershipBeforeCreate(tenantId: string, dto: CreateCaseDto): Promise<void> {
    const caseDebtorLinks = (dto.caseDebtors || [])
      .filter((caseDebtor) => !!caseDebtor.debtorId)
      .map((caseDebtor) => ({
        debtorId: caseDebtor.debtorId,
        selectedAddressId: caseDebtor.selectedAddressId,
      }));

    const legacyDebtorLinks = !dto.caseDebtors?.length
      ? (dto.debtors || [])
          .filter((debtor) => !!debtor.id)
          .map((debtor) => ({
            debtorId: debtor.id!,
            selectedAddressId: undefined,
          }))
      : [];

    const debtorLinks = [...caseDebtorLinks, ...legacyDebtorLinks];
    if (debtorLinks.length === 0) return;

    const debtorIds = Array.from(new Set(debtorLinks.map((link) => link.debtorId)));
    const ownedDebtors = await this.prisma.debtor.findMany({
      where: { id: { in: debtorIds }, tenantId },
      select: { id: true },
    });
    const ownedDebtorIds = new Set(ownedDebtors.map((debtor) => debtor.id));
    const missingDebtorId = debtorIds.find((debtorId) => !ownedDebtorIds.has(debtorId));

    if (missingDebtorId) {
      throw new NotFoundException("Borçlu bulunamadı");
    }

    const addressLinks = debtorLinks.filter((link) => !!link.selectedAddressId);
    if (addressLinks.length === 0) return;

    const selectedAddressIds = Array.from(new Set(addressLinks.map((link) => link.selectedAddressId!)));
    const addresses = await this.prisma.debtorAddress.findMany({
      where: { id: { in: selectedAddressIds } },
      select: { id: true, debtorId: true },
    });
    const addressOwnerById = new Map(addresses.map((address) => [address.id, address.debtorId]));

    for (const link of addressLinks) {
      if (addressOwnerById.get(link.selectedAddressId!) !== link.debtorId) {
        throw new NotFoundException("Adres bulunamadı veya bu borçluya ait değil");
      }
    }
  }

  /**
   * Vekalet kontrolü - müvekkil ve avukat arasında geçerli vekalet var mı?
   */
  private async checkPoaValidity(clientId: string, lawyerId: string): Promise<{ valid: boolean; message?: string }> {
    const now = new Date();
    
    const validPoa = await this.prisma.clientPowerOfAttorney.findFirst({
      where: {
        clientId,
        status: "ACTIVE",
        isActive: true,
        lawyers: {
          some: { lawyerId },
        },
        OR: [
          { isLimited: false },
          { isLimited: true, validUntil: { gte: now } },
        ],
      },
      include: {
        client: { select: { displayName: true } },
        lawyers: {
          where: { lawyerId },
          include: { lawyer: { select: { name: true, surname: true } } },
        },
      },
    });

    if (!validPoa) {
      return { valid: false, message: "Geçerli vekalet bulunamadı" };
    }

    // Süresi dolmak üzere mi kontrol et (30 gün)
    if (validPoa.isLimited && validPoa.validUntil) {
      const daysLeft = Math.ceil((validPoa.validUntil.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysLeft <= 30) {
        return { valid: true, message: `Vekalet ${daysLeft} gün içinde sona erecek` };
      }
    }

    return { valid: true };
  }

  /**
   * İlamlı Alt Kategori Validasyonları
   * - Nafaka + Döviz aynı anda seçilemez
   * - Döviz seçildiğinde kur tarihi zorunlu
   * - Nafaka seçildiğinde aylık tutar önerilir
   */
  private validateSubCategoryRules(dto: CreateCaseDto) {
    const { subCategory, currency, exchangeDate, nafakaStartDate, monthlyNafakaAmount } = dto;

    // Kural 1: Nafaka + Döviz aynı anda olamaz
    if (subCategory === CaseSubCategory.NAFAKA && currency && currency !== Currency.TRY) {
      throw new BadRequestException(
        "Nafaka alacağı sadece TL cinsinden olabilir. Döviz ve nafaka aynı anda seçilemez."
      );
    }

    // Kural 2: Döviz alacağı seçildiğinde para birimi TRY olamaz
    if (subCategory === CaseSubCategory.DOVIZ && (!currency || currency === Currency.TRY)) {
      throw new BadRequestException(
        "Döviz alacağı seçildiğinde para birimi (USD, EUR, GBP, CHF) belirtilmelidir."
      );
    }

    // Kural 3: Döviz alacağı için kur tarihi zorunlu (uyarı seviyesinde)
    if (subCategory === CaseSubCategory.DOVIZ && !exchangeDate) {
      // Uyarı: Kur tarihi belirtilmedi, fiili ödeme tarihi kullanılacak
      // Bu bir hata değil, sadece bilgi
    }

    // Kural 4: Nafaka için başlangıç tarihi ve aylık tutar önerilir
    if (subCategory === CaseSubCategory.NAFAKA) {
      if (!nafakaStartDate) {
        // Uyarı seviyesinde - zorunlu değil
      }
      if (!monthlyNafakaAmount) {
        // Uyarı seviyesinde - zorunlu değil
      }
    }

    // Kural 5: Alt kategori otomatik belirleme (currency'ye göre)
    // Bu frontend'de yapılacak, backend sadece validasyon yapar
  }

  /**
   * Alt kategoriye göre faiz açıklaması otomatik oluştur
   */
  private generateInterestDescription(subCategory: CaseSubCategory, currency?: Currency): string {
    switch (subCategory) {
      case CaseSubCategory.NAFAKA:
        return "devam eden aylarla birlikte tahsili talebidir.";
      case CaseSubCategory.DOVIZ:
        // Currency parametresini kullanarak daha spesifik açıklama
        const currencyName = currency ? this.getCurrencyName(currency) : 'döviz';
        return `fiili ödeme tarihindeki T.C. Merkez Bankası ${currencyName} efektif satış kuru üzerinden Türk Lirası karşılığının tahsili talebidir.`;
      case CaseSubCategory.GENEL:
      default:
        return "değişen oranlarda yasal faizi ile birlikte tahsili talebidir.";
    }
  }

  /**
   * Currency enum'ını Türkçe isme çevir
   */
  private getCurrencyName(currency: Currency): string {
    const names: Record<Currency, string> = {
      [Currency.TRY]: 'TL',
      [Currency.USD]: 'ABD Doları',
      [Currency.EUR]: 'Euro',
      [Currency.GBP]: 'İngiliz Sterlini',
      [Currency.CHF]: 'İsviçre Frangı',
    };
    return names[currency] || currency;
  }

  /**
   * Lookup ID'lerinin doğru tenant'a ait olduğunu kontrol et
   * Güvenlik: Başka tenant'ın lookup değerlerinin kullanılmasını engeller
   */
  private async validateLookupIds(
    tenantId: string,
    lookupIds: {
      takipTuruId?: string | null;
      asamaId?: string | null;
      riskId?: string | null;
      durumEtiketiId?: string | null;
      mahiyetTipiId?: string | null;
    }
  ): Promise<void> {
    const validations: Promise<boolean>[] = [];

    if (lookupIds.takipTuruId) {
      validations.push(
        this.prisma.lookupTakipTuru.findFirst({
          where: { id: lookupIds.takipTuruId, tenantId },
        }).then(r => !!r)
      );
    }

    if (lookupIds.asamaId) {
      validations.push(
        this.prisma.lookupAsama.findFirst({
          where: { id: lookupIds.asamaId, tenantId },
        }).then(r => !!r)
      );
    }

    if (lookupIds.riskId) {
      validations.push(
        this.prisma.lookupRisk.findFirst({
          where: { id: lookupIds.riskId, tenantId },
        }).then(r => !!r)
      );
    }

    if (lookupIds.durumEtiketiId) {
      validations.push(
        this.prisma.lookupDurumEtiketi.findFirst({
          where: { id: lookupIds.durumEtiketiId, tenantId },
        }).then(r => !!r)
      );
    }

    if (lookupIds.mahiyetTipiId) {
      validations.push(
        this.prisma.lookupMahiyetTipi.findFirst({
          where: { id: lookupIds.mahiyetTipiId, tenantId },
        }).then(r => !!r)
      );
    }

    const results = await Promise.all(validations);
    if (results.some(r => r === false)) {
      throw new BadRequestException('Geçersiz lookup ID: Belirtilen değer bu büroya ait değil');
    }
  }

  /**
   * CASE-UPDATE-FK-TENANT: Case'e bağlanan tenant-scoped FK'lerin (Client/Court/ExecutionOffice)
   * bu tenant'a ait olduğunu doğrular. `validateLookupIds` yalnız lookup tablolarını kapsar; bu
   * üç FK dışarıda kalıyordu → tekil update()/patchFlags() cross-tenant id'yi guard'sız persist
   * ediyor, sonra `findOne` FK-join'i (client/court/executionOffice: true) başka tenant'ın tam
   * kaydını döndürüyordu (cross-tenant veri sızıntısı). Cross-tenant/geçersiz id → BadRequest.
   * null/undefined → atla (mevcut semantik korunur; "" çağıran tarafça undefined'a çevrilir).
   *
   * @remarks Çağrıldığı yerler:
   * - CaseService.create() → POST /cases (her creditor.id → clientId + courtId + executionOfficeId, tx öncesi)
   * - CaseService.update() → PUT /cases/:id (clientId, courtId)
   * - CaseService.patchFlags() → PATCH /cases/:id (executionOfficeId)
   */
  private async validateCaseFkOwnership(
    tenantId: string,
    fks: { clientId?: string | null; courtId?: string | null; executionOfficeId?: string | null },
  ): Promise<void> {
    if (fks.clientId) {
      const client = await this.prisma.client.findFirst({
        where: { id: fks.clientId, tenantId },
        select: { id: true },
      });
      if (!client) {
        throw new BadRequestException('Geçersiz müvekkil: Belirtilen müvekkil bu büroya ait değil');
      }
    }
    if (fks.courtId) {
      const court = await this.prisma.court.findFirst({
        where: { id: fks.courtId, tenantId },
        select: { id: true },
      });
      if (!court) {
        throw new BadRequestException('Geçersiz mahkeme: Belirtilen mahkeme bu büroya ait değil');
      }
    }
    if (fks.executionOfficeId) {
      const office = await this.prisma.executionOffice.findFirst({
        where: { id: fks.executionOfficeId, tenantId },
        select: { id: true },
      });
      if (!office) {
        throw new BadRequestException('Geçersiz icra dairesi: Belirtilen icra dairesi bu büroya ait değil');
      }
    }
  }

  async findAll(tenantId: string, params?: { status?: string; expenseRequestStatus?: string; clientId?: string; noOwner?: boolean; legalResponsibleMissing?: boolean; responsibleLawyerId?: string; responsibleStaffId?: string; page?: number; limit?: number }) {
    const { status, expenseRequestStatus, clientId, noOwner, legalResponsibleMissing, responsibleLawyerId, responsibleStaffId, page = 1, limit = 20 } = params || {};

    const where: any = { tenantId };
    if (status) where.status = status;
    if (clientId) where.clientId = clientId;
    // M2-G5c: Sahipsiz/noOwner = gerçek-kişi owner YOKLUĞU (responsibleLawyer/Staff İKİSİ de null).
    // Legacy sorumluPersonelId dolu olsa BİLE real-person owner yoksa SAHİPSİZ (eski sorumluPersonelId=null tanımı kaldırıldı).
    if (noOwner) {
      where.responsibleLawyerId = null;
      where.responsibleStaffId = null;
    }
    // G5a: açık person owner filtreleri — her param KENDİ kolonuna (K1 bridge yok → cross-fallback yok).
    if (responsibleLawyerId) where.responsibleLawyerId = responsibleLawyerId;
    if (responsibleStaffId) where.responsibleStaffId = responsibleStaffId;
    // WP-3a: LEGAL_RESPONSIBLE_MISSING filtresi — aktif hukuki dosyada operasyon owner personel ama
    // hukuki sorumlu avukat yok. getStats sayacıyla AYNI koşul. Warn/report; status'u ACTIVE'e sabitler.
    if (legalResponsibleMissing) {
      where.status = "ACTIVE";
      where.responsibleStaffId = { not: null };
      where.lawyers = { none: { isResponsible: true } };
    }
    
    // Masraf talebi durumuna göre filtreleme
    if (expenseRequestStatus) {
      where.expenseRequests = {
        some: {
          status: expenseRequestStatus,
        },
      };
    }

    const [cases, total] = await Promise.all([
      this.prisma.case.findMany({
        where,
        include: {
          client: { select: { id: true, name: true } },
          debtors: {
            include: { 
              debtor: { 
                select: { 
                  id: true, 
                  name: true, 
                  identityNo: true,
                  phone: true,
                  email: true,
                  addresses: true,
                } 
              },
              selectedAddress: {
                select: { id: true, street: true, city: true }
              }
            },
          },
          lawyers: {
            include: { lawyer: { select: { id: true, name: true, surname: true } } },
          },
          executionOffice: { select: { id: true, name: true, city: true, uyapCode: true } },
          risk: { select: { id: true, name: true, color: true } },
          asama: { select: { id: true, name: true, code: true } },
          takipTuru: { select: { id: true, name: true } },
          sorumluPersonel: { select: { id: true, name: true, surname: true } },
          lifecycleEvents: {
            where: { action: { in: ['ICRA_ISLEMI', 'TEBLIGAT', 'HACIZ', 'TAHSILAT', 'STATUS_CHANGE'] } },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { createdAt: true },
          },
          collections: {
            orderBy: { date: 'desc' },
            take: 1,
            select: { date: true },
          },
          expenseRequests: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { id: true, status: true, totalAmount: true, dueDate: true, sentAt: true },
          },
          _count: { select: { tasks: true } },
        },
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.case.count({ where }),
    ]);

    // Her case için ek bilgileri hesapla
    const now = new Date();
    const casesWithExtras = await Promise.all(
      cases.map(async (c) => {
        // Vekalet kontrolü
        let hasValidPoa = true;
        if (c.clientId && c.lawyers && c.lawyers.length > 0) {
          const lawyerIds = c.lawyers.map((l: any) => l.lawyerId);
          const validPoa = await this.prisma.clientPowerOfAttorney.findFirst({
            where: {
              clientId: c.clientId,
              status: "ACTIVE",
              isActive: true,
              lawyers: { some: { lawyerId: { in: lawyerIds } } },
              OR: [
                { isLimited: false },
                { isLimited: true, validUntil: { gte: now } },
              ],
            },
          });
          hasValidPoa = !!validPoa;
        }
        
        // Son işlem tarihi
        const lastActionDate = c.lifecycleEvents?.[0]?.createdAt || null;
        
        // Son tahsilat tarihi
        const lastCollectionDate = c.collections?.[0]?.date || null;
        
        // Kalan gün hesabı (pasifleşmeye)
        let daysUntilPassive: number | null = null;
        if (lastActionDate) {
          const daysSinceLastAction = Math.floor((now.getTime() - new Date(lastActionDate).getTime()) / (1000 * 60 * 60 * 24));
          daysUntilPassive = Math.max(0, 365 - daysSinceLastAction); // 1 yıl pasifleşme süresi varsayımı
        }
        
        // Finansal özet hesapla
        const [collectionAgg, expenseAgg, claimAgg] = await Promise.all([
          // Tahsilat toplamı
          this.prisma.collection.aggregate({
            where: { caseId: c.id },
            _sum: { amount: true },
          }),
          // Masraf toplamı (tüm masraf talepleri)
          this.prisma.expenseRequest.aggregate({
            where: { caseId: c.id },
            _sum: { totalAmount: true, paidAmount: true },
          }),
          // Toplam alacak (ClaimItem'lardan - demandedAmount toplamı)
          this.prisma.claimItem.aggregate({
            where: { caseId: c.id },
            _sum: { demandedAmount: true },
          }),
        ]);
        
        const totalCollected = Number(collectionAgg._sum?.amount || 0);
        const totalExpense = Number(expenseAgg._sum?.totalAmount || 0);
        const expenseCollected = Number(expenseAgg._sum?.paidAmount || 0);
        // Toplam alacak: ClaimItem varsa oradan, yoksa principalAmount'tan
        const totalClaim = Number(claimAgg._sum?.demandedAmount || 0) || Number(c.principalAmount || 0);
        
        // Borçu adresleriyle birlikte döndür
        const debtorsWithAddress = c.debtors.map((d: any) => ({
          ...d,
          debtor: {
            ...d.debtor,
            address: d.debtor.addresses?.primary || d.debtor.addresses?.notification || null,
          },
        }));
        
        return {
          ...c,
          debtors: debtorsWithAddress,
          hasValidPoa,
          lastActionDate: lastActionDate?.toISOString() || null,
          lastCollectionDate: lastCollectionDate?.toISOString() || null,
          daysUntilPassive,
          // Finansal özet
          totalClaim,
          totalCollected,
          totalExpense,
          expenseCollected,
          // Masraf talebi durumu
          latestExpenseRequest: c.expenseRequests?.[0] || null,
          expenseRequestStatus: c.expenseRequests?.[0]?.status || null,
          // lifecycleEvents ve collections'ı response'dan çıkar (gereksiz)
          lifecycleEvents: undefined,
          collections: undefined,
          expenseRequests: undefined,
        };
      })
    );

    return {
      data: casesWithExtras,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(tenantId: string, id: string) {
    const caseItem = await this.prisma.case.findFirst({
      where: { id, tenantId },
      include: {
        client: true,
        court: true,
        formType: { select: { id: true, name: true, code: true } },
        executionOffice: true,
        debtors: { include: { debtor: true } },
        lawyers: { 
          include: { 
            lawyer: {
              select: {
                id: true,
                name: true,
                surname: true,
                barNumber: true,
                phone: true,
                email: true,
                address: true,
                bankName: true,
                branchName: true,
                iban: true,
                lawyerRank: true,
                defaultPermissions: true,
                // RFA-010: pasif avukat gizlenmez; detayda [Pasif] etiketi için bayrak taşınır.
                isActive: true,
              }
            }
          }
        },
        staff: {
          include: {
            staffMember: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                staffType: true,
                phone: true,
                email: true,
                // RFA-010: pasif personel gizlenmez; detayda [Pasif] etiketi için bayrak taşınır.
                isActive: true,
              }
            }
          }
        },
        caseClients: {
          include: {
            client: {
              select: {
                id: true,
                name: true,
                displayName: true,
                type: true,
                tckn: true,
                vkn: true,
                taxOffice: true,
                phone: true,
                email: true,
                address: true,
                city: true,
                district: true,
                // RFA-010: pasif müvekkil gizlenmez; detayda [Pasif] etiketi için bayrak taşınır.
                isActive: true,
                bankAccounts: {
                  select: {
                    id: true,
                    bankName: true,
                    branchName: true,
                    iban: true,
                    accountHolder: true,
                    isPrimary: true,
                  }
                },
              }
            } 
          } 
        },
        tasks: { orderBy: { createdAt: "desc" }, take: 10 },
        collections: { orderBy: { date: "desc" } },
        dues: true,
        claimItems: { orderBy: { sortOrder: "asc" } },
        lifecycleEvents: { orderBy: { createdAt: "desc" }, take: 20 },
        statusHistory: { 
          orderBy: { createdAt: "desc" }, 
          take: 10,
          include: { changedBy: { select: { name: true, surname: true } } }
        },
        riskReports: { orderBy: { createdAt: "desc" }, take: 1 },
        // Lookup ilişkileri
        takipTuru: { select: { id: true, code: true, name: true } },
        asama: { select: { id: true, code: true, name: true } },
        risk: { select: { id: true, code: true, name: true, color: true } },
        durumEtiketi: { select: { id: true, code: true, name: true, color: true } },
        mahiyetTipi: { select: { id: true, code: true, name: true, uyapCode: true } },
        sorumluPersonel: { select: { id: true, name: true, surname: true } },
        groups: { include: { group: { select: { id: true, name: true, color: true } } } },
      },
    });

    if (!caseItem) {
      throw new NotFoundException("Takip bulunamadı");
    }

    // Çek/Senet bilgilerini ayrı sorgula (CaseInstrument tablosu)
    const instruments = await this.prisma.caseInstrument.findMany({
      where: { caseId: id },
      select: {
        id: true,
        instrumentType: true,
        serialNo: true,
        amount: true,
        issueDate: true,
        maturityDate: true,
        presentmentDate: true,
        isBounced: true,
        bounceDate: true,
        bankName: true,
        bankBranch: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Raporlama özeti oluştur
    const reportingSummary = this.buildReportingSummary(caseItem);

    return {
      ...caseItem,
      instruments,
      reportingSummary,
    };
  }

  /**
   * Raporlama özeti oluştur
   * Format: "Mahiyet / Takip Türü / Risk: X / Durum: Y"
   */
  private buildReportingSummary(caseItem: any): string {
    const parts: string[] = [];

    // Mahiyet Tipi
    if (caseItem.mahiyetTipi?.name) {
      parts.push(caseItem.mahiyetTipi.name);
    }

    // Takip Türü (kısa)
    if (caseItem.takipTuru?.name) {
      // Kısa versiyon: "İlamsız Genel Haciz" -> "İlamsız"
      const shortName = caseItem.takipTuru.name.split(' ')[0];
      parts.push(shortName);
    }

    // Risk
    if (caseItem.risk?.name) {
      parts.push(`Risk: ${caseItem.risk.name}`);
    }

    // Durum Etiketi
    if (caseItem.durumEtiketi?.name) {
      parts.push(`Durum: ${caseItem.durumEtiketi.name}`);
    }

    // Grup sayısı
    const groupCount = caseItem.groups?.length || 0;
    if (groupCount > 0) {
      parts.push(`${groupCount} grup`);
    }

    return parts.length > 0 ? parts.join(' / ') : 'Sınıflandırılmamış';
  }

  /**
   * G1 KÖPRÜSÜ — dosya açılışındaki dues'tan kanonik ClaimItem üretir.
   *
   * Kanonik alacak modeli = ClaimItem; bakiye/TBK100 motoru yalnız ClaimItem okur.
   * Due satırları korunur (legacy/transition + nafaka taksit takvimi). NAFAKA için
   * ClaimItem üretilmez (mapper null döner). tenantId zorunlu set edilir (multitenant;
   * Due'da tenantId yok, ClaimItem tenant-scoped). Çağıranın transaction'ı kullanılır.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - CaseService.create() → POST /cases (create $transaction içi, dues sonrası)
   * </remarks>
   */
  private async createClaimItemsFromDues(
    tx: Prisma.TransactionClient,
    tenantId: string,
    caseId: string,
    dues: Array<DueDto & { id?: string; currency?: string | null; sortOrder?: number | null }>,
  ): Promise<void> {
    for (const due of dues) {
      const itemType = mapDueTypeToClaimItemType(due.type);
      if (itemType === null) continue; // NAFAKA → yalnız Due (taksit takvimi)
      const claimItemData = due.id
        ? this.buildDueSyncClaimItemData(tenantId, caseId, { ...due, id: due.id })
        : buildClaimItemData(tenantId, caseId, due, itemType);
      if (!claimItemData) continue;

      await tx.claimItem.create({
        data: claimItemData,
      });
    }
  }

  /**
   * PR-ALACAK-1 — post-create Due kayıtlarını marker'lı kanonik ClaimItem'a çevirir.
   * Eski unmarked kayıtlar için eşleştirme tahmini yapılmaz.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - CaseService.createClaimItemsFromDues() → POST /cases (dosya açılışında persisted Due→ClaimItem marker)
   * - CaseService.createDue() → POST /cases/:id/dues (dosya açıldıktan sonra Due→ClaimItem sync)
   * </remarks>
   */
  private buildDueSyncClaimItemData(
    tenantId: string,
    caseId: string,
    due: DueForClaimItemSync,
  ): Prisma.ClaimItemUncheckedCreateInput | null {
    const itemType = mapDueTypeToClaimItemType(due.type as DueType);
    if (itemType === null) return null;

    const dueDto = buildSyncDueDto(due);
    const base = buildClaimItemData(tenantId, caseId, dueDto, itemType);

    return {
      ...base,
      currency: due.currency || "TRY",
      sortOrder: due.sortOrder ?? 0,
      metadata: mergeDueSyncMetadata(base.metadata, due.id),
    };
  }

  /**
   * PR-ALACAK-1 — yalnız marker ile güvenli eşleşen ClaimItem'ı bulur.
   * Birden fazla marker bulunursa sync durdurulur; heuristic yoktur.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - CaseService.updateDue() → PATCH /cases/:id/dues/:dueId (marker'lı ClaimItem sync)
   * - CaseService.deleteDue() → DELETE /cases/:id/dues/:dueId (marker'lı ClaimItem cancel)
   * </remarks>
   */
  private async findDueSyncClaimItem(
    tx: Prisma.TransactionClient,
    tenantId: string,
    caseId: string,
    dueId: string,
  ) {
    const claimItems = await tx.claimItem.findMany({
      where: {
        tenantId,
        caseId,
        metadata: { path: ["dueSync", "sourceDueId"], equals: dueId },
      },
      take: 2,
    });

    if (claimItems.length > 1) {
      throw new BadRequestException("Due senkronu için birden fazla ClaimItem bulundu");
    }

    return claimItems[0] ?? null;
  }

  /**
   * PR-ALACAK-1 — güncel Due değerlerini marker'lı ClaimItem alanlarına yansıtır.
   * Mapper null dönerse mevcut marker'lı ClaimItem iptal edilir.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - CaseService.updateDue() → PATCH /cases/:id/dues/:dueId (marker'lı ClaimItem sync)
   * </remarks>
   */
  private async syncMarkedClaimItemFromDue(
    tx: Prisma.TransactionClient,
    tenantId: string,
    caseId: string,
    due: DueForClaimItemSync,
  ): Promise<void> {
    const claimItem = await this.findDueSyncClaimItem(tx, tenantId, caseId, due.id);
    if (!claimItem) return;

    const itemType = mapDueTypeToClaimItemType(due.type as DueType);
    if (itemType === null) {
      await tx.claimItem.update({
        where: { id: claimItem.id },
        data: { status: "CANCELLED" },
      });
      return;
    }

    const amount = Number(due.amount);
    await tx.claimItem.update({
      where: { id: claimItem.id },
      data: {
        itemType,
        originalAmount: amount,
        demandedAmount: amount,
        amount,
        currency: due.currency || "TRY",
        description: due.description,
        dueDate: due.dueDate instanceof Date ? due.dueDate : new Date(due.dueDate),
        interestType: due.interestType ? (due.interestType as PrismaInterestType) : null,
        interestRate: normalizeClaimItemInterestRate(due.interestRate),
        interestStartDate: normalizeClaimItemInterestDate(due.interestStartDate),
        interestEndDate: normalizeClaimItemInterestDate(due.interestEndDate),
        sortOrder: due.sortOrder ?? 0,
      },
    });
  }

  /**
   * PR-N3-wire: çoklu-enstrüman pipeline AÇIK mı (env flag; varsayılan KAPALI).
   * ocr.service.isMultiInstrumentEnabled ile AYNI anahtar/semantik (ConfigModule .env'i
   * process.env'e yükler). KAPALIYKEN createCase legacy BİREBİR (instruments[] yok sayılır).
   *
   * @remarks Çağrıldığı yerler:
   * - CaseService.create() → POST /cases (instrument işleme kapısı; AS1 kapsam sınırı).
   */
  private multiInstrumentEnabled(): boolean {
    return process.env.OCR_MULTI_INSTRUMENT === "true";
  }

  /**
   * PR-2b-1: manuel case instrument girişi AÇIK mı (env flag; varsayılan KAPALI).
   * OCR_MULTI_INSTRUMENT'ten BAĞIMSIZ — manuel kambiyo, OCR pipeline'ı açılmadan geçebilir (O-1).
   * @remarks Çağrıldığı yer: CaseService.create() → createInstrumentsAndClaims per-source MANUAL gate.
   */
  private manualCaseInstrumentsEnabled(): boolean {
    return process.env.MANUAL_CASE_INSTRUMENTS === "true";
  }

  /**
   * PR-N3-wire: OCR kambiyo enstrümanlarını createCase tx içinde kanonik kayda çevirir —
   * her GEÇERLİ instrument için: CaseInstrument (hukuki evrak) + bağlı PRINCIPAL ClaimItem
   * (parasal yansıma, instrumentId BAĞ). Toplam instrument PRINCIPAL tutarını döndürür
   * (caller principalAmount'a ekler).
   *
   * INVARIANT (resolveCaseInstrumentType): kambiyo-değil (FATURA/DIGER) / documentNo boş /
   * amount≤0 / currency yok / issueDate yok → ATLA (sessiz create YOK).
   * K1: PRINCIPAL YALNIZ buradan; dues[]'da tekrarlanmaz → çift-sayım yok.
   * Flag KAPALI veya instruments boş → hiçbir şey üretmez, 0 döner (legacy).
   *
   * @remarks Çağrıldığı yerler:
   * - CaseService.create() → POST /cases (dues/ClaimItem sonrası 6c adımı; flag-gated AS1).
   */
  private async createInstrumentsAndClaims(
    tx: Prisma.TransactionClient,
    tenantId: string,
    caseId: string,
    instruments: CaseInstrumentInputDto[],
    ocrEnabled: boolean,
    manualEnabled = false,
  ): Promise<number> {
    if (instruments.length === 0) return 0;
    let totalPrincipal = 0;
    for (const input of instruments) {
      // PR-2b-1: per-source gate. source yok → OCR (geri uyum). OCR/MANUAL flag'leri BAĞIMSIZ;
      // kapalı kaynak güvenle ATLANIR (karışık payload → yalnız açık-kaynak alt kümesi işlenir).
      const isManual = input.source === CaseInstrumentSource.MANUAL;
      if (isManual ? !manualEnabled : !ocrEnabled) continue;
      const instrumentType = resolveCaseInstrumentType(input);
      if (instrumentType === null) continue; // kambiyo değil / eksik → sessiz create YOK
      const created = await tx.caseInstrument.create({
        data: buildCaseInstrumentData(tenantId, caseId, input, instrumentType),
      });
      await tx.claimItem.create({
        data: buildInstrumentPrincipalClaimItemData(tenantId, caseId, created.id, input),
      });
      totalPrincipal += input.amount;
    }
    return totalPrincipal;
  }

  /**
   * Dosyaya personel ata — createCase tx step-8 (ASSIGN-2a / PR-ASSIGN-2a).
   * - dtoStaff DİZİ ise (Array.isArray; null/undefined DEĞİL) SEÇİM KANONİK OTORİTEDİR: yalnız bu
   *   liste yazılır; isDefaultForNewCases ile MERGE YOK (kullanıcı default'u çıkardıysa eklenmez).
   *   Boş dizi → hiç personel (deselection'a saygı). staffMemberId dedupe edilir; tenant ownership
   *   doğrulanır (cross-tenant/nonexistent → BadRequestException, hiç create yapılmaz).
   * - dtoStaff DİZİ DEĞİLse (undefined VEYA null) mevcut davranış AYNEN korunur: isDefaultForNewCases
   *   personelleri eklenir. (ASSIGN-2a-FU: `Array.isArray` guard → `staff: null` payload'ı crash
   *   etmez, undefined gibi güvenli default'a düşer; @IsOptional null'a izin verdiği için gerekli.)
   * Saf: yalnız verilen tx üzerinde çalışır → izole test edilebilir (case-create-instruments deseni).
   * @remarks Çağrıldığı yer: CaseService.create() → POST /cases (createCase tx step-8).
   */
  private async assignCaseStaff(
    tx: Prisma.TransactionClient,
    tenantId: string,
    caseId: string,
    dtoStaff?: CaseStaffInputDto[],
  ): Promise<{ selectionProvided: boolean; assigned: { staffMemberId: string; roleOnCase: string }[] }> {
    const assigned: { staffMemberId: string; roleOnCase: string }[] = [];

    if (Array.isArray(dtoStaff)) {
      // Seçim otoritesi: yalnız gönderilen personel (dedupe).
      const requestedIds = Array.from(new Set(dtoStaff.map((s) => s.staffMemberId).filter(Boolean)));
      if (requestedIds.length > 0) {
        // Tenant ownership: tüm id'ler bu tenant'a ait olmalı.
        const owned = await tx.staffMember.findMany({
          where: { tenantId, id: { in: requestedIds } },
          select: { id: true, staffType: true },
        });
        if (owned.length !== requestedIds.length) {
          const ownedIds = new Set(owned.map((s) => s.id));
          const invalid = requestedIds.filter((id) => !ownedIds.has(id));
          throw new BadRequestException(
            `Geçersiz veya başka tenant'a ait personel: ${invalid.join(', ')}`,
          );
        }
        const roleByDto = new Map(dtoStaff.map((s) => [s.staffMemberId, s.roleOnCase]));
        const typeById = new Map(owned.map((s) => [s.id, s.staffType]));
        for (const id of requestedIds) {
          const roleOnCase = roleByDto.get(id) || typeById.get(id) || 'PERSONEL';
          await tx.caseStaff.create({ data: { caseId, staffMemberId: id, roleOnCase } });
          assigned.push({ staffMemberId: id, roleOnCase });
        }
      }
      return { selectionProvided: true, assigned };
    }

    // dtoStaff undefined → eski davranış AYNEN: isDefaultForNewCases personelleri ekle.
    const defaultStaffMembers = await tx.staffMember.findMany({
      where: { tenantId, isDefaultForNewCases: true, isActive: true },
      select: { id: true, staffType: true },
    });
    for (const staff of defaultStaffMembers) {
      await tx.caseStaff.create({
        data: { caseId, staffMemberId: staff.id, roleOnCase: staff.staffType || 'PERSONEL' },
      });
      assigned.push({ staffMemberId: staff.id, roleOnCase: staff.staffType || 'PERSONEL' });
    }
    return { selectionProvided: false, assigned };
  }

  /**
   * Personel atamasını audit'le (ASSIGN-0: "dosyaya personel ekleme"). Yalnız seçim yoluyla
   * (dtoStaff verildiğinde) ve ≥1 personel atandığında anlamlı; default yol mevcut davranışı
   * AYNEN korur (ek audit üretmez). Tx DIŞINDA (commit sonrası) çağrılmalı.
   * @remarks Çağrıldığı yer: CaseService.create() → POST /cases (tx commit sonrası).
   */
  private async auditStaffAssignment(
    tenantId: string,
    caseId: string,
    assigned: { staffMemberId: string; roleOnCase: string }[],
    userId: string, // WP-1c-1: user-driven create-path → actor zorunlu
  ): Promise<void> {
    if (assigned.length === 0) return;
    await this.auditService.log({
      tenantId,
      action: 'CREATE',
      entityType: 'CASE_STAFF',
      entityId: caseId,
      userId, // WP-1c-1
      newValues: { staff: assigned },
      description: `Dosyaya ${assigned.length} personel atandı`,
    });
  }

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - CaseController.create() → POST /cases (Yeni takip oluşturma)
  /// </remarks>
  async create(tenantId: string, dto: CreateCaseDto, userId?: string) {
    // INTEREST_POLICY_ASSIGNED (HR-26: HUMAN actor zorunlu) için userId şart.
    // "Bu faiz politikasını kim atadı?" sorusunun cevabı olmadan event hukuken zayıf.
    // Fail-fast: tx başlamadan reddet ('unknown' actor kabul edilmez).
    if (!userId) {
      throw new BadRequestException(
        "Case oluşturmak için kullanıcı kimliği (userId) zorunludur (faiz politikası ataması audit'i)."
      );
    }

    // B.5: Başlangıç statüsü validasyonu
    if (dto.caseStatus && !isInitialStatus(dto.caseStatus as LegalCaseStatus)) {
      throw new BadRequestException(
        `Geçersiz başlangıç statüsü: ${dto.caseStatus}. Sadece DERDEST, ISLEMDE veya DERKENAR seçilebilir.`
      );
    }

    // İlamlı Alt Kategori Validasyonları
    this.validateSubCategoryRules(dto);

    // PR-1 (F1): operasyonel sorumlu / bildirim hedefi (Case.sorumluPersonelId → User) create'te
    // persist edilir. Frontend zorunlu "Sorumlu" alanını gönderiyor, DTO kabul ediyordu, ama
    // create() data bloğu YAZMIYORDU → wizard'dan açılan her dosyada sessizce null kalıyordu (veri
    // kaybı). Tenant guard: batchUpdate ile AYNI kural — verilen User bu tenant'a ait değilse 400
    // (cross-tenant/geçersiz id sessizce yazılmaz). Boş/undefined → A2: write-site'ta oluşturan
    // kullanıcıya (userId) düşer; tenant kontrolü yalnız dto-provided id için çalışır.
    // tx ÖNCESİ (fail-fast): geçersiz sorumlu personelde hiçbir taraf/dosya yaratılmaz.
    if (dto.sorumluPersonelId) {
      const personel = await this.prisma.user.findFirst({
        where: { id: dto.sorumluPersonelId, tenantId },
        select: { id: true },
      });
      if (!personel) {
        throw new BadRequestException(
          'Geçersiz sorumlu personel: Belirtilen kullanıcı bu büroya ait değil'
        );
      }
    }

    // M2-A3a: Dosya Sorumlusu (gerçek kişi) tx-ÖNCESİ doğrula (fail-fast; allowNone=true=create'te
    // sahipsiz meşru). both → 400; pasif/cross-tenant aday → 400 → geçersizse HİÇ dosya/taraf yaratılmaz
    // (atomik). Sonuç tx.case.create data'sına yazılır = tek-adım atama (ayrı PATCH footgun'u kapanır).
    const resolvedResponsible = await validateResponsibleSelection(
      this.prisma,
      tenantId,
      { responsibleLawyerId: dto.responsibleLawyerId, responsibleStaffId: dto.responsibleStaffId },
      { allowNone: true }
    );

    try {
      // B4/D: fileNumber ön-benzersizlik kontrolü — tx-öncesi taraf yaratımından
      // (resolveInlinePartiesBeforeTx) HEMEN ÖNCE. Mükerrer dosya no'da Case tx zaten
      // aşağıdaki P2002 ile patlardı; fakat o ana dek inline-yeni müvekkil/borçlu/avukat
      // KALICI yaratılmış olurdu (orphan yan-etki). Erken 409 → hiç taraf yaratılmaz.
      // where TENANT-SCOPED: @@unique([tenantId, fileNumber]) constraint'i ile birebir.
      // NOT: Bu, atomiklik garantisi DEĞİL; eşzamanlı çift submit (TOCTOU) için aşağıdaki
      // P2002 catch backstop olarak KORUNUR.
      if (dto.fileNumber) {
        const duplicate = await this.prisma.case.findFirst({
          where: { tenantId, fileNumber: dto.fileNumber },
          select: { id: true },
        });
        if (duplicate) {
          throw new ConflictException(
            `Bu dosya numarası (${dto.fileNumber}) zaten kullanılıyor`
          );
        }
      }

      // CASE-CREATE-FK-TENANT: Case'e bağlanacak tenant-scoped FK'ler (Client/Court/ExecutionOffice)
      // bu büroya ait mi? ValidationPipe yalnız SHAPE doğrular; caller'ın doğrudan verdiği MEVCUT id'ler
      // cross-tenant olabilir → guard'sız persist (clientId + caseClient creditorIds + courtId +
      // executionOfficeId) + findOne FK-join'i (client/court/executionOffice: true) başka tenant'ın TAM
      // kaydını döndürür (#246 update path ile AYNI sızıntı vektörü). tx ÖNCESİ (resolveInlinePartiesBeforeTx'ten
      // ÖNCE) fail-fast: cross-tenant/geçersiz id'de hiçbir taraf/dosya yaratılmadan reddedilir.
      // Inline-YENİ müvekkiller (id YOK) burada ATLANIR; resolve içinde tenant-scoped ClientService.create
      // ile yaratıldıklarından zaten bu tenant'a aittir. caseClient TÜM creditor id'lerini persist ettiğinden
      // (ortak alacaklılar dahil, yalnız primary değil) hepsi tek tek doğrulanır.
      for (const creditor of dto.creditors ?? []) {
        if (creditor.id) {
          await this.validateCaseFkOwnership(tenantId, { clientId: creditor.id });
        }
      }
      await this.validateCaseFkOwnership(tenantId, {
        courtId: dto.courtId,
        executionOfficeId: dto.executionOfficeId,
      });

      // RFA-016: inline-yeni taraflar (id YOK) tx ÖNCESİ guard'lı servislerle resolve edilir
      // (Tasarım A). Böylece tx içinde duplicate guard bypass'lı tx.client/lawyer/debtor.create kalmaz.
      await this.resolveInlinePartiesBeforeTx(tenantId, dto);
      await this.validateDebtorOwnershipBeforeCreate(tenantId, dto);

      const result = await this.prisma.$transaction(async (tx) => {
        // 1. Alacaklıları (Clients) hazırla - tüm creditors'ları kaydet
        const clientIds: string[] = [];
        let primaryClientId: string | undefined;
        
        if (dto.creditors && dto.creditors.length > 0) {
          for (const creditor of dto.creditors) {
            // RFA-016: inline-yeni müvekkil id'si tx ÖNCESİ guard'lı ClientService.create ile
            // resolve edildi (reuse/reactivate dahil). Burada tx.client.create YOK; yalnız id kullanılır.
            if (!creditor.id) continue; // isimsiz/çözülemeyen → atla
            clientIds.push(creditor.id);
            if (!primaryClientId) primaryClientId = creditor.id;
          }
        }

        // İcra dairesinin UYAP kodunu al (eğer DTO'da yoksa)
        let uyapBirimKodu = dto.uyapBirimKodu;
        if (!uyapBirimKodu && dto.executionOfficeId) {
          const executionOffice = await tx.executionOffice.findUnique({
            where: { id: dto.executionOfficeId },
            select: { uyapCode: true },
          });
          uyapBirimKodu = executionOffice?.uyapCode || undefined;
        }

        // 2. Case oluştur
        const newCase = await tx.case.create({
          data: {
            tenantId,
            fileNumber: dto.fileNumber,
            executionFileNumber: dto.executionFileNumber,
            type: dto.type,
            subType: dto.subType,
            status: dto.status || "ACTIVE",
            // Yeni alanlar
            executionPath: dto.executionPath || "HACIZ",
            caseStatus: dto.caseStatus || "DERDEST",
            caseDate: dto.startDate ? new Date(dto.startDate) : new Date(),
            executionOfficeId: dto.executionOfficeId,
            uyapBirimKodu: uyapBirimKodu,
            hasUyapWarning: !uyapBirimKodu,
            hasArticle4Request: dto.hasArticle4Request || false,
            isAutomationEnabled: true,
            // Alt Kategori ve Para Birimi (UYAP Uyumlu)
            subCategory: dto.subCategory || "GENEL",
            currency: dto.currency || "TRY",
            // MTS Bilgileri
            isMtsCase: dto.isMtsCase || false,
            mtsReferenceNo: dto.mtsReferenceNo,
            // Faiz Bilgileri
            interestType: dto.interestType || "YASAL",
            interestStartDate: dto.interestStartDate ? new Date(dto.interestStartDate) : undefined,
            interestDescription: dto.interestDescription || this.generateInterestDescription(
              (dto.subCategory as CaseSubCategory) || CaseSubCategory.GENEL,
              dto.currency as Currency
            ),
            // Döviz Bilgileri (Prisma generate sonrası aktif olacak)
            ...(dto.exchangeDate && { exchangeDate: new Date(dto.exchangeDate) }),
            ...(dto.exchangeRateType && { exchangeRateType: dto.exchangeRateType }),
            ...(!dto.exchangeRateType && dto.subCategory === "DOVIZ" && { exchangeRateType: "ODEME_TARIHI" }),
            // Nafaka Bilgileri
            ...(dto.nafakaStartDate && { nafakaStartDate: new Date(dto.nafakaStartDate) }),
            ...(dto.monthlyNafakaAmount && { monthlyNafakaAmount: dto.monthlyNafakaAmount }),
            // OCR / Belge Tarama Bilgileri
            ...(dto.preDetectedCaseType && { preDetectedCaseType: dto.preDetectedCaseType }),
            ...(dto.preDetectedSubCategory && { preDetectedSubCategory: dto.preDetectedSubCategory }),
            ...(dto.ocrText && { ocrText: dto.ocrText.substring(0, 2000) }), // İlk 2000 karakter
            ...(dto.isAutoDetected !== undefined && { isAutoDetected: dto.isAutoDetected }),
            ...(dto.confidenceScore !== undefined && { confidenceScore: dto.confidenceScore }),
            ...(dto.sourceDocumentId && { sourceDocumentId: dto.sourceDocumentId }),
            ...(dto.detectionKeywords && { detectionKeywords: dto.detectionKeywords }),
            // Eski alanlar
            clientId: primaryClientId,
            courtId: dto.courtId,
            principalAmount: dto.principalAmount,
            interestRate: dto.interestRate,
            startDate: dto.startDate ? new Date(dto.startDate) : undefined,
            notes: dto.notes,
            // PR-1 (F1): operasyonel sorumlu / bildirim hedefi (User) — tx öncesi tenant-doğrulandı.
            // A2: sorumlu boşsa oluşturan kullanıcıya (userId; yukarıda zorunlu) düşer — yeni dosya
            // sahipsiz kalamaz. Eski null kayıtlar için backfill YOK (ayrı PR).
            sorumluPersonelId: dto.sorumluPersonelId || userId,
            // M2-A3a: gerçek kişi Dosya Sorumlusu — tx-öncesi validate edildi (resolvedResponsible).
            // none → ikisi de null (sahipsiz, meşru); DB CHECK both-set'i ayrıca engeller.
            responsibleLawyerId: resolvedResponsible.responsibleLawyerId,
            responsibleStaffId: resolvedResponsible.responsibleStaffId,
            // WP-1b: dosyayı oluşturan kullanıcı (creator attribution). userId yukarıda zorunlu;
            // eski null kayıtlar için backfill YOK (ayrı/yok). Operasyon owner'dan AYRI kavram.
            createdById: userId,
          },
        });

        // 3. CaseClient ilişkilerini oluştur (tüm alacaklılar için)
        if (clientIds.length > 0) {
          for (let i = 0; i < clientIds.length; i++) {
            await tx.caseClient.create({
              data: {
                caseId: newCase.id,
                clientId: clientIds[i],
                role: i === 0 ? "ALACAKLI" : "ORTAK_ALACAKLI",
              },
            });
          }
        }

        // 4. Avukatları - mevcut veya yeni
        // B5/D: oluşturulan CaseLawyer'ları izle (post-loop "≥1 sorumlu" invariant'ı için).
        const createdCaseLawyers: { id: string; lawyerRank: string | null; isResponsible: boolean }[] = [];
        if (dto.lawyers && dto.lawyers.length > 0) {
          for (const lawyerDto of dto.lawyers) {
            let lawyerId: string;
            let lawyerRank: string | null = null;
            
            // RFA-016: inline-yeni avukat id'si tx ÖNCESİ guard'lı LawyerService.create ile resolve
            // edildi (reuse/reactivate dahil). Burada tx.lawyer.create YOK; yalnız id kullanılır.
            if (!lawyerDto.id) continue; // isimsiz/çözülemeyen → atla
            lawyerId = lawyerDto.id;
            const existingLawyer = await tx.lawyer.findUnique({
              where: { id: lawyerId },
              select: { lawyerRank: true },
            });
            lawyerRank = existingLawyer?.lawyerRank || null;

            // LawyerRank'e göre CaseLawyerRole belirle
            let caseRole: 'RESPONSIBLE' | 'ASSIGNED' | 'ASSISTANT' | 'INTERN' = 'ASSIGNED';
            if (lawyerDto.isResponsible) {
              caseRole = 'RESPONSIBLE';
            } else if (lawyerRank) {
              // Büro ayarlarındaki rank'e göre dosya rolü
              switch (lawyerRank) {
                case 'PARTNER':
                case 'MANAGER':
                  caseRole = 'RESPONSIBLE'; // Ortak/Yönetici → Sorumlu
                  break;
                case 'AUTHORIZED':
                  caseRole = 'ASSIGNED'; // Yetkili → Atanmış
                  break;
                case 'LAWYER':
                  caseRole = 'ASSISTANT'; // Avukat → Yardımcı
                  break;
                case 'INTERN':
                  caseRole = 'INTERN'; // Stajyer → Stajyer
                  break;
                default:
                  caseRole = 'ASSIGNED';
              }
            }

            const createdLawyer = await tx.caseLawyer.create({
              data: {
                caseId: newCase.id,
                lawyerId,
                canSign: lawyerDto.canSign || false,
                // ASSIGN-4b/index-safety: loop HİÇBİR satırı isResponsible=true yazmaz; "tam 1"
                // sorumlu post-loop planResponsible ile promote edilir → tx içinde geçici >1 YOK
                // (PR-C kısmi tekil index ile uyumlu). createdCaseLawyers izi GERÇEK niyeti taşır.
                isResponsible: false,
                hasSignatureAuthority: lawyerDto.hasSignatureAuthority || false,
                role: caseRole,
              },
            });
            createdCaseLawyers.push({ id: createdLawyer.id, lawyerRank, isResponsible: caseRole === 'RESPONSIBLE' });
          }
        }

        // 5. Borçluları - Yeni CaseDebtor formatı (öncelikli)
        if (dto.caseDebtors && dto.caseDebtors.length > 0) {
          for (const caseDebtorDto of dto.caseDebtors) {
            await tx.caseDebtor.create({
              data: {
                caseId: newCase.id,
                debtorId: caseDebtorDto.debtorId,
                role: (caseDebtorDto.role as any) || "ASIL_BORCLU",
                liabilityAmount: caseDebtorDto.liabilityAmount,
                liabilityType: caseDebtorDto.liabilityType,
                notificationMode: (caseDebtorDto.notificationMode as any) || "NORMAL",
                selectedAddressId: caseDebtorDto.selectedAddressId,
                prepareNotification: caseDebtorDto.prepareNotification ?? true,
                ilanenJustification: caseDebtorDto.ilanenJustification,
                caseNote: caseDebtorDto.caseNote,
              } as any,
            });
          }
        }
        // Eski format (geriye uyumluluk) - sadece caseDebtors yoksa kullan
        else if (dto.debtors && dto.debtors.length > 0) {
          for (const debtorDto of dto.debtors) {
            // RFA-016: inline-yeni borçlu id'si tx ÖNCESİ guard'lı DebtorService.create ile resolve
            // edildi (kimlik eşleşmesi → reuse). Burada tx.debtor.create YOK; yalnız id kullanılır.
            if (!debtorDto.id) continue; // isimsiz/çözülemeyen → atla
            await tx.caseDebtor.create({
              data: {
                caseId: newCase.id,
                debtorId: debtorDto.id,
                role: "ASIL_BORCLU",
              },
            });
          }
        }

        // 6. Alacak Kalemleri (Dues)
        let duesPrincipal = 0;
        if (dto.dues && dto.dues.length > 0) {
          const createdDues: Array<DueDto & { id: string; currency?: string | null; sortOrder?: number | null }> = [];
          for (const dueDto of dto.dues) {
            const due = await tx.due.create({
              data: {
                caseId: newCase.id,
                type: dueDto.type,
                description: dueDto.description,
                amount: dueDto.amount,
                dueDate: new Date(dueDto.dueDate),
                interestType: dueDto.interestType,
                interestRate: dueDto.interestRate,
                interestStartDate: dueDto.interestStartDate ? new Date(dueDto.interestStartDate) : undefined,
                interestEndDate: dueDto.interestEndDate ? new Date(dueDto.interestEndDate) : undefined,
                // FATURA (G2-wire): belge/KDV alanlarını Due'ya yaz (sourceDocumentType+kdvAmount Due alanı DEĞİL)
                sourceDocumentNo: dueDto.sourceDocumentNo,
                hasKdv: dueDto.hasKdv ?? false,
                kdvRate: dueDto.kdvRate,
              },
            });
            createdDues.push({
              id: due.id,
              type: due.type as DueType,
              description: due.description ?? undefined,
              amount: Number(due.amount),
              dueDate: due.dueDate.toISOString(),
              currency: due.currency,
              sortOrder: due.sortOrder,
              interestType: due.interestType ? (due.interestType as InterestType) : undefined,
              interestRate: normalizeDueInterestRate(due.interestRate),
              interestStartDate: serializeDueInterestDate(due.interestStartDate),
              interestEndDate: serializeDueInterestDate(due.interestEndDate),
              interestAmount: dueDto.interestAmount,
              // FATURA (G2-wire): Due-alanları due'dan · sourceDocumentType+kdvAmount dueDto'dan (in-memory)
              sourceDocumentNo: due.sourceDocumentNo ?? undefined,
              sourceDocumentType: dueDto.sourceDocumentType,
              hasKdv: due.hasKdv ?? undefined,
              kdvRate: normalizeDueInterestRate(due.kdvRate),
              kdvAmount: dueDto.kdvAmount,
              // PR-2c: İLAM/KİRA belge alanları dueDto'dan (in-memory; Due kolonu değil → round-trip'te kaybolmaz)
              ilamMahkeme: dueDto.ilamMahkeme,
              ilamEsasNo: dueDto.ilamEsasNo,
              ilamKararNo: dueDto.ilamKararNo,
              davaTarihi: dueDto.davaTarihi,
              issueDate: dueDto.issueDate,
              kiraDonemBaslangic: dueDto.kiraDonemBaslangic,
              kiraDonemBitis: dueDto.kiraDonemBitis,
            });
          }

          // 6b. G1 KÖPRÜSÜ — kanonik ClaimItem'lar üret (bakiye motoru bunları okur).
          // Due satırları korunur (legacy/transition + nafaka takvimi); NAFAKA için
          // ClaimItem üretilmez. Aynı tx içinde, tenantId zorunlu.
          await this.createClaimItemsFromDues(tx, tenantId, newCase.id, createdDues);

          // Ana para (dues PRINCIPAL); case.update aşağıda instrument ile birleştirilir.
          duesPrincipal = dto.dues
            .filter(d => d.type === 'PRINCIPAL')
            .reduce((sum, d) => sum + d.amount, 0);
        }

        // 6c. PR-N3-wire: kambiyo enstrümanları → CaseInstrument + bağlı PRINCIPAL ClaimItem
        // (flag-gated AS1; K1: PRINCIPAL tek kaynak = instrument, dues'da tekrarlanmaz → çift-sayım yok).
        const instrumentPrincipal = await this.createInstrumentsAndClaims(
          tx,
          tenantId,
          newCase.id,
          dto.instruments ?? [],
          this.multiInstrumentEnabled(),
          this.manualCaseInstrumentsEnabled(),
        );

        // Ana para toplamı = dues PRINCIPAL + instrument PRINCIPAL → case.principalAmount (G5 @deprecated).
        const totalPrincipal = duesPrincipal + instrumentPrincipal;
        if (totalPrincipal > 0) {
          await tx.case.update({
            where: { id: newCase.id },
            data: { principalAmount: totalPrincipal },
          });
        }

        // 7. Varsayılan stajyer avukatları ekle (isDefaultForNewCases = true)
        const existingLawyerIds = dto.lawyers?.map(l => l.id).filter(Boolean) || [];
        const defaultInternLawyers = await tx.lawyer.findMany({
          where: {
            tenantId,
            isDefaultForNewCases: true,
            isActive: true,
            id: { notIn: existingLawyerIds as string[] }, // Zaten eklenmişleri hariç tut
          },
          select: { id: true, lawyerRank: true },
        });

        for (const lawyer of defaultInternLawyers) {
          const createdIntern = await tx.caseLawyer.create({
            data: {
              caseId: newCase.id,
              lawyerId: lawyer.id,
              canSign: false,
              isResponsible: false,
              hasSignatureAuthority: false,
              role: lawyer.lawyerRank === 'INTERN' ? 'INTERN' : 'ASSISTANT',
            },
          });
          createdCaseLawyers.push({ id: createdIntern.id, lawyerRank: lawyer.lawyerRank, isResponsible: false });
        }

        // B5/D + ASSIGN-4b: "TAM OLARAK 1 sorumlu avukat" invariant'ı. Loop artık HİÇBİR satırı
        // isResponsible=true yazmaz (index-safety) → bu noktada DB'de sorumlu sayısı 0; niyet
        // (explicit isResponsible / PARTNER-MANAGER) createdCaseLawyers izinde taşınır. planResponsible
        // önceliğe göre BİR satır seçer; aşağıda yalnız o promote edilir (0→1, asla geçici >1) →
        // avukatsız dosya hariç tam 1. demote demoteIds'i isResponsible=false + role=ASSIGNED'a çeker
        // (loop'ta role=RESPONSIBLE yazılmış olabilen niyet-satırlarının rol temizliği).
        // (isResponsible ⇔ role===RESPONSIBLE tutarlılığı korunur.)
        const { keepId: responsibleKeptId, demoteIds: responsibleDemotedIds } =
          planResponsible(createdCaseLawyers, null);
        if (responsibleKeptId) {
          await tx.caseLawyer.update({
            where: { id: responsibleKeptId },
            data: { isResponsible: true, role: 'RESPONSIBLE' },
          });
        }
        for (const demoteId of responsibleDemotedIds) {
          await tx.caseLawyer.update({
            where: { id: demoteId },
            data: { isResponsible: false, role: 'ASSIGNED' },
          });
        }

        // 8. Personel ata (ASSIGN-2a). dto.staff verilmişse SEÇİM kanonik otorite (default ile
        //    MERGE YOK); verilmemişse mevcut isDefaultForNewCases davranışı AYNEN. Detay: assignCaseStaff.
        const staffResult = await this.assignCaseStaff(tx, tenantId, newCase.id, dto.staff);

        // 8.5. CASE_OPENED domain event (HR-39: same-tx append)
        await this.domainEventIngestService.appendInTransaction(tx, {
          header: {
            eventId: randomUUID(),
            aggregateType: 'Case',
            aggregateId: newCase.id,
            eventType: 'CASE_OPENED',
            occurredAt: new Date().toISOString(),
            occurredAtConfidence: 'SYSTEM_VERIFIED',
            actor: { type: 'HUMAN', userId: userId || 'unknown' },
            tenantId,
          },
          payload: {
            fileNumber: newCase.fileNumber,
            type: newCase.type,
            subType: newCase.subType,
            executionPath: newCase.executionPath,
            caseStatus: newCase.caseStatus,
            currency: newCase.currency,
            caseDate: newCase.caseDate?.toISOString(),
          },
        });

        // 8.6. INTEREST_POLICY_ASSIGNED domain event (doc 14, Sprint 2C)
        // Legal computation contract: CASE_OPENED'dan sonra aynı tx'te → aggregateVersion 2 (otomatik).
        // Payload hesap KURALIDIR, sonucu değil (Anayasa D); değer alanları taşımaz.
        await this.domainEventIngestService.appendInTransaction(tx, {
          header: {
            eventId: randomUUID(),
            aggregateType: 'Case',
            aggregateId: newCase.id,
            eventType: 'INTEREST_POLICY_ASSIGNED',
            occurredAt: new Date().toISOString(),
            occurredAtConfidence: 'SYSTEM_VERIFIED',
            actor: { type: 'HUMAN', userId },
            tenantId,
          },
          payload: ((): Record<string, unknown> => {
            // doc 24: dto.CaseType → interest config.CaseType (explicit, exhaustive mapping).
            // resolveInitialPolicy imzası değişmez; audit alanları (sourceCaseType/mappingReasoning)
            // additive olarak payload'a eklenir.
            const policyMapping = mapDtoCaseTypeToInterestCaseType(dto.type);
            return {
              ...resolveInitialPolicy(policyMapping.configType, {
                interestStartDate: dto.interestStartDate,
                startDate: dto.startDate,
              }),
              sourceCaseType: policyMapping.sourceCaseType,
              mappingReasoning: policyMapping.reasoning,
            };
          })(),
        });

        // 9. Tam case'i döndür
        const createdCase = await tx.case.findUnique({
          where: { id: newCase.id },
          include: {
            client: { select: { id: true, name: true } },
            debtors: {
              include: { debtor: { select: { id: true, name: true } } },
            },
            lawyers: {
              include: { lawyer: { select: { id: true, name: true, surname: true } } },
            },
            dues: true,
          },
        });

        return { case: createdCase, clientIds, lawyerIds: dto.lawyers?.map(l => l.id).filter(Boolean) || [], staffResult, responsibleKeptId, responsibleDemotedIds };
      });

      // ASSIGN-2a: seçimle atanan personel için audit (yalnız dto.staff verildiğinde; default
      // yol mevcut davranışı AYNEN korur → ek audit üretmez). Tx commit sonrası.
      if (result.staffResult.selectionProvided) {
        await this.auditStaffAssignment(tenantId, result.case?.id ?? '', result.staffResult.assigned, userId);
      }

      // 7. Vekalet kontrolü (transaction dışında)
      const poaWarnings: string[] = [];
      if (result.clientIds.length > 0 && result.lawyerIds.length > 0) {
        for (const clientId of result.clientIds) {
          for (const lawyerId of result.lawyerIds) {
            const poaCheck = await this.checkPoaValidity(clientId, lawyerId as string);
            if (!poaCheck.valid) {
              // Müvekkil ve avukat isimlerini al
              const client = await this.prisma.client.findUnique({ where: { id: clientId }, select: { displayName: true } });
              const lawyer = await this.prisma.lawyer.findUnique({ where: { id: lawyerId as string }, select: { name: true, surname: true } });
              poaWarnings.push(`${lawyer?.name} ${lawyer?.surname} → ${client?.displayName}: ${poaCheck.message}`);
            } else if (poaCheck.message) {
              // Süresi dolmak üzere uyarısı
              const client = await this.prisma.client.findUnique({ where: { id: clientId }, select: { displayName: true } });
              const lawyer = await this.prisma.lawyer.findUnique({ where: { id: lawyerId as string }, select: { name: true, surname: true } });
              poaWarnings.push(`${lawyer?.name} ${lawyer?.surname} → ${client?.displayName}: ${poaCheck.message}`);
            }
          }
        }
      }

      if (poaWarnings.length > 0) {
        this.logger.warn(`Takip oluşturuldu ancak vekalet uyarıları var: ${poaWarnings.join(', ')}`);
      }

      // Audit log
      if (result.case) {
        await this.auditService.log({
          tenantId,
          action: 'CREATE',
          entityType: 'CASE',
          entityId: result.case.id,
          userId, // WP-1c-1: create user-driven → actor zorunlu
          newValues: { fileNumber: result.case.fileNumber, type: result.case.type },
          description: `Yeni takip oluşturuldu: ${result.case.fileNumber}`,
        });

        // WP-1d-pre: creation-anı canonical operasyon owner audit (sorumluluk yaşam-döngüsünün
        // BAŞLANGIÇ event'i; WP-1a değişim + WP-1b createdById ile temporal sorgunun ön-koşulu).
        // YALNIZ create payload'ında gerçek-kişi owner (responsibleLawyer/Staff) SET edildiyse yazılır;
        // legacy sorumluPersonelId BAŞKA kavram, buraya GİRMEZ (karıştırma yasağı). tx commit SONRASI →
        // create başarısızsa yazılmaz. AuditLog tek otorite (yeni tablo/migration YOK).
        if (resolvedResponsible.responsibleLawyerId || resolvedResponsible.responsibleStaffId) {
          await this.auditService.log({
            tenantId,
            action: 'CREATE',
            entityType: 'CASE',
            entityId: result.case.id,
            userId,
            oldValues: { responsibleLawyerId: null, responsibleStaffId: null },
            newValues: {
              responsibleLawyerId: resolvedResponsible.responsibleLawyerId,
              responsibleStaffId: resolvedResponsible.responsibleStaffId,
            },
            metadata: {
              changeType: 'OPERATION_OWNER_INITIALIZED',
              source: 'CaseService.create',
              createdById: userId,
              temporalOrigin: true,
            },
          });
        }

        // ASSIGN-4b: create dedupe fazla sorumlu düşürdüyse CASE_LAWYER UPDATE olarak audit'le
        // (avukat CREATE/DELETE audit'i 4c kapsamında; burada YALNIZ otomatik demote loglanır).
        if (result.responsibleKeptId && result.responsibleDemotedIds.length > 0) {
          await this.auditService.log({
            tenantId,
            action: 'UPDATE',
            entityType: 'CASE_LAWYER',
            entityId: result.responsibleKeptId,
            userId, // WP-1c-1: create içi oto-dedupe yine user-driven create → actor zorunlu
            metadata: { caseId: result.case.id }, // WP-1d-2-pre: legal-responsible temporal için caseId
            newValues: { isResponsible: true, role: 'RESPONSIBLE', demotedCaseLawyerIds: result.responsibleDemotedIds, reason: 'CREATE_DEDUPE' },
            description: `Takip oluşturulurken fazla sorumlu avukat düşürüldü (${result.responsibleDemotedIds.length})`,
          });
        }

        // Otomatik müvekkil bilgi talebi gönder (arka planda)
        this.clientInfoRequestService
          .sendAutoRequestOnCaseCreate(tenantId, result.case.id)
          .catch((err) => {
            this.logger.warn(`Otomatik bilgi talebi gönderilemedi: ${err.message}`);
          });

        // Otomatik açılış masraf seti oluştur (arka planda)
        // Case oluşturulduğunda OPENING masrafları otomatik oluşturulur
        if (result.case.clientId) {
          const shouldSendEmail = dto.sendExpenseEmail === true;
          
          this.expenseRequestService
            .createOpeningExpenseSet(result.case.id, tenantId, 'system')
            .then(async (expenseResult) => {
              this.logger.log(`Otomatik açılış masrafları oluşturuldu: ${result.case!.fileNumber}`);
              
              // Masraf oluşturulduysa ve kullanıcı mail gönderilmesini istediyse
              if (expenseResult?.id && shouldSendEmail) {
                try {
                  await this.expenseRequestService.sendExpenseEmail(tenantId, expenseResult.id, 'system');
                  this.logger.log(`Masraf talebi maili gönderildi: ${result.case!.fileNumber}`);
                } catch (emailErr: any) {
                  this.logger.warn(`Masraf maili gönderilemedi: ${emailErr.message}`);
                }
              }
            })
            .catch((err) => {
              this.logger.warn(`Otomatik masraf seti oluşturulamadı: ${err.message}`);
            });
        }
      }

      return {
        ...result.case,
        poaWarnings: poaWarnings.length > 0 ? poaWarnings : undefined,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
          throw new ConflictException(`Bu dosya numarası (${dto.fileNumber}) zaten kullanılıyor`);
        }
      }
      throw error;
    }
  }

  async update(tenantId: string, id: string, dto: UpdateCaseDto, userId: string) {
    await this.findOne(tenantId, id);

    // Boş string'leri undefined'a çevir
    const data: any = { ...dto };
    if (data.startDate === "" || data.startDate === null) {
      data.startDate = undefined;
    } else if (data.startDate) {
      data.startDate = new Date(data.startDate);
    }

    // caseDate için de aynı işlem
    if (data.caseDate === "" || data.caseDate === null) {
      data.caseDate = undefined;
    } else if (data.caseDate) {
      data.caseDate = new Date(data.caseDate);
    }

    // Boş string'leri temizle
    Object.keys(data).forEach((key) => {
      if (data[key] === "") {
        data[key] = undefined;
      }
    });

    // İcra dairesi değiştiyse ve UYAP kodu yoksa, icra dairesinden al
    if (data.executionOfficeId && !data.uyapBirimKodu) {
      const executionOffice = await this.prisma.executionOffice.findUnique({
        where: { id: data.executionOfficeId },
        select: { uyapCode: true },
      });
      if (executionOffice?.uyapCode) {
        data.uyapBirimKodu = executionOffice.uyapCode;
        data.hasUyapWarning = false;
      }
    }

    // CASE-UPDATE-FK-TENANT: clientId/courtId tenant ownership guard (cross-tenant/geçersiz → 400;
    // null/undefined → atla — "" yukarıda undefined'a çevrildi). executionOfficeId UpdateCaseDto'da
    // YOK (forbidNonWhitelisted PUT'ta bloklar) → burada doğrulanmaz; o yol patchFlags()'te ele alınır.
    await this.validateCaseFkOwnership(tenantId, { clientId: data.clientId, courtId: data.courtId });

    const updated = await this.prisma.case.update({
      where: { id },
      data,
    });

    // Audit log
    await this.auditService.log({
      tenantId,
      action: 'UPDATE',
      entityType: 'CASE',
      entityId: id,
      userId, // WP-1c-2: user-driven CASE update → actor zorunlu
      newValues: data,
      description: `Takip güncellendi: ${updated.fileNumber}`,
    });

    return updated;
  }

  async delete(tenantId: string, id: string, userId: string) {
    const existing = await this.findOne(tenantId, id);

    // Transaction içinde silme ve audit log (veri bütünlüğü için)
    await this.prisma.$transaction(async (tx) => {
      await tx.case.delete({
        where: { id },
      });

      // Audit log - transaction içinde
      await this.auditService.log({
        tenantId,
        action: 'DELETE',
        entityType: 'CASE',
        entityId: id,
        userId, // WP-1c-2: user-driven CASE delete → actor zorunlu
        oldValues: { fileNumber: existing.fileNumber },
        description: `Takip silindi: ${existing.fileNumber}`,
      });
    });

    return { success: true };
  }

  async getStats(tenantId: string) {
    const [total, active, closed, thisMonth, ownerless, legalResponsibleMissing] = await Promise.all([
      this.prisma.case.count({ where: { tenantId } }),
      this.prisma.case.count({ where: { tenantId, status: "ACTIVE" } }),
      this.prisma.case.count({ where: { tenantId, status: "CLOSED" } }),
      this.prisma.case.count({
        where: {
          tenantId,
          createdAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
      }),
      // M2-G5c: Sahipsiz = gerçek-kişi owner yok (responsibleLawyer/Staff ikisi de null); legacy sorumluPersonelId sayılmaz.
      this.prisma.case.count({ where: { tenantId, responsibleLawyerId: null, responsibleStaffId: null } }),
      // WP-3a: LEGAL_RESPONSIBLE_MISSING — aktif (status=ACTIVE) hukuki dosyada operasyon owner PERSONEL
      // (responsibleStaffId dolu) AMA hukuki sorumlu avukat YOK (CaseLawyer.isResponsible=true hiç yok).
      // Warn/report sinyali (kırmızı bayrak); BLOCK YOK. Legacy sorumluPersonelId bu sayıma girmez.
      this.prisma.case.count({
        where: {
          tenantId,
          status: "ACTIVE",
          responsibleStaffId: { not: null },
          lawyers: { none: { isResponsible: true } },
        },
      }),
    ]);

    return { total, active, closed, thisMonth, ownerless, legalResponsibleMissing };
  }

  // Sıradaki dosya numarasını al
  async getNextFileNumber(tenantId: string): Promise<string> {
    const currentYear = new Date().getFullYear();
    
    // Bu yıla ait tüm dosya numaralarını bul ve en büyük numarayı hesapla
    const casesThisYear = await this.prisma.case.findMany({
      where: {
        tenantId,
        fileNumber: {
          startsWith: `${currentYear}/`,
        },
      },
      select: { fileNumber: true },
    });

    let maxNumber = 0;
    for (const c of casesThisYear) {
      if (c.fileNumber) {
        const parts = c.fileNumber.split('/');
        if (parts.length === 2) {
          const num = parseInt(parts[1], 10);
          if (!isNaN(num) && num > maxNumber) {
            maxNumber = num;
          }
        }
      }
    }

    return `${currentYear}/${maxNumber + 1}`;
  }

  // Dosya flag'lerini güncelle (K.47-50)
  async patchFlags(tenantId: string, id: string, dto: Partial<UpdateCaseDto>) {
    await this.findOne(tenantId, id);

    // Sadece izin verilen flag'leri güncelle
    const allowedFlags = [
      'isArchived',
      'showToClient',
      'allowUyapActions',
      'hasArticle4Request',
      'isAutomationEnabled',
      'automationConfig',
      // Düzenlenebilir alanlar
      'executionFileNumber',
      'caseStatus',
      'executionPath',
      'subCategory',
      'notes',
      'executionOfficeId',
    ];

    const data: any = {};
    for (const key of allowedFlags) {
      if (dto[key as keyof typeof dto] !== undefined) {
        data[key] = dto[key as keyof typeof dto];
      }
    }

    this.logger.log(`patchFlags called with dto: ${JSON.stringify(dto)}, filtered data: ${JSON.stringify(data)}`);

    if (Object.keys(data).length === 0) {
      this.logger.warn(`patchFlags: No allowed fields found in dto`);
      return this.findOne(tenantId, id);
    }

    // CASE-UPDATE-FK-TENANT: executionOfficeId tenant ownership guard (cross-tenant/geçersiz → 400).
    // patchFlags body'si Partial<UpdateCaseDto> → metatype Object → ValidationPipe ATLAR; dolayısıyla
    // tenant koruması yalnız bu service-level guard'dan gelir (allowedFlags'teki tek tenant-scoped FK).
    await this.validateCaseFkOwnership(tenantId, { executionOfficeId: data.executionOfficeId });

    return this.prisma.case.update({
      where: { id },
      data,
    });
  }

  /**
   * Toplu dosya güncelleme (Batch Update).
   *
   * ASSIGN-4c: `sorumluPersonelId` (User) tenant'a ait mi doğrulanır (yoksa BadRequest);
   * updateMany sonrası tek özet `CASE` UPDATE audit'i üretilir (dosya-başına audit YOK).
   *
   * @remarks Çağrıldığı yerler:
   * - CaseController.batchUpdate() → POST /cases/batch-update
   *   ← apps/web reports/page.tsx (toplu güncelle paneli) · cases/page.tsx#handleBulkAssign (toplu sorumlu personel)
   */
  async batchUpdate(
    tenantId: string,
    caseIds: string[],
    updates: {
      riskId?: string | null;
      durumEtiketiId?: string | null;
      sorumluPersonelId?: string | null;
      takipTuruId?: string | null;
      mahiyetTipiId?: string | null;
    },
    userId: string, // WP-1c-2: user-driven toplu güncelleme → actor zorunlu
  ) {
    // Lookup ID'lerinin bu tenant'a ait olduğunu kontrol et
    await this.validateLookupIds(tenantId, {
      riskId: updates.riskId,
      durumEtiketiId: updates.durumEtiketiId,
      takipTuruId: updates.takipTuruId,
      mahiyetTipiId: updates.mahiyetTipiId,
    });

    // ASSIGN-4c: sorumluPersonelId (User) bu tenant'a ait mi? (validateLookupIds yalnız lookup
    // tablolarını kapsar.) null=atamayı temizleme → doğrulama gerekmez; dolu id → tenant kontrolü.
    if (updates.sorumluPersonelId) {
      const personel = await this.prisma.user.findFirst({
        where: { id: updates.sorumluPersonelId, tenantId },
      });
      if (!personel) {
        throw new BadRequestException('Geçersiz sorumlu personel: Belirtilen kullanıcı bu büroya ait değil');
      }
    }

    // Sadece bu tenant'a ait dosyaları güncelle
    const result = await this.prisma.case.updateMany({
      where: {
        id: { in: caseIds },
        tenantId,
      },
      data: {
        ...(updates.riskId !== undefined && { riskId: updates.riskId }),
        ...(updates.durumEtiketiId !== undefined && { durumEtiketiId: updates.durumEtiketiId }),
        ...(updates.sorumluPersonelId !== undefined && { sorumluPersonelId: updates.sorumluPersonelId }),
        ...(updates.takipTuruId !== undefined && { takipTuruId: updates.takipTuruId }),
        ...(updates.mahiyetTipiId !== undefined && { mahiyetTipiId: updates.mahiyetTipiId }),
      },
    });

    // ASSIGN-4c: toplu güncellemeyi tek özet CASE UPDATE olarak audit'le (dosya-başına audit YOK).
    await this.auditService.log({
      tenantId,
      action: 'UPDATE',
      entityType: 'CASE',
      entityId: caseIds[0] ?? 'BATCH',
      userId, // WP-1c-2: user-driven toplu güncelleme → actor zorunlu
      newValues: { caseIds, updates, updatedCount: result.count },
      description: 'Toplu dosya güncellemesi',
    });

    return { updatedCount: result.count };
  }

  // Eksik UYAP kodlarını düzelt
  async fixMissingUyapCodes(tenantId: string) {
    // UYAP kodu olmayan ama icra dairesi olan takipleri bul
    const casesWithoutUyap = await this.prisma.case.findMany({
      where: {
        tenantId,
        executionOfficeId: { not: null },
        OR: [
          { uyapBirimKodu: null },
          { uyapBirimKodu: '' },
        ],
      },
      include: {
        executionOffice: {
          select: { id: true, uyapCode: true, name: true },
        },
      },
    });

    let fixedCount = 0;
    for (const c of casesWithoutUyap) {
      if (c.executionOffice?.uyapCode) {
        await this.prisma.case.update({
          where: { id: c.id },
          data: {
            uyapBirimKodu: c.executionOffice.uyapCode,
            hasUyapWarning: false,
          },
        });
        fixedCount++;
      }
    }

    return {
      totalChecked: casesWithoutUyap.length,
      fixedCount,
      message: `${fixedCount} takibin UYAP kodu güncellendi`,
    };
  }

  // ==================== DOSYA NOTLARI ====================

  async getNotes(tenantId: string, caseId: string) {
    // Dosyanın bu tenant'a ait olduğunu kontrol et
    const caseExists = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
    });
    if (!caseExists) throw new NotFoundException("Dosya bulunamadı");

    // CaseLifecycle tablosundan notları çek
    const events = await this.prisma.caseLifecycle.findMany({
      where: {
        caseId,
        action: "NOTE_ADDED",
      },
      orderBy: { createdAt: "desc" },
    });

    return events.map((e) => ({
      id: e.id,
      content: e.description || "",
      createdAt: e.createdAt,
      createdBy: null,
      isPrivate: (e.metadata as any)?.isPrivate || false,
    }));
  }

  async addNote(tenantId: string, caseId: string, _userId: string, content: string, isPrivate = false) {
    // Dosyanın bu tenant'a ait olduğunu kontrol et
    const caseExists = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
    });
    if (!caseExists) throw new NotFoundException("Dosya bulunamadı");

    // CaseLifecycle olarak kaydet
    const note = await this.prisma.caseLifecycle.create({
      data: {
        caseId,
        stage: "INITIAL",
        action: "NOTE_ADDED",
        description: content,
        triggeredBy: "MANUAL",
        metadata: { isPrivate },
      },
    });

    return {
      id: note.id,
      content: note.description,
      createdAt: note.createdAt,
      createdBy: null,
      isPrivate,
    };
  }

  async deleteNote(tenantId: string, caseId: string, noteId: string) {
    // Dosyanın bu tenant'a ait olduğunu kontrol et
    const caseExists = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
    });
    if (!caseExists) throw new NotFoundException("Dosya bulunamadı");

    // Notun bu dosyaya ait olduğunu kontrol et (güvenlik düzeltmesi)
    const note = await this.prisma.caseLifecycle.findFirst({
      where: { id: noteId, caseId, action: "NOTE_ADDED" },
    });
    if (!note) throw new NotFoundException("Not bulunamadı");

    await this.prisma.caseLifecycle.delete({
      where: { id: noteId },
    });

    return { success: true };
  }

  // ==================== DOSYA ZAMAN ÇİZELGESİ ====================

  async getTimeline(tenantId: string, caseId: string) {
    // Dosyanın bu tenant'a ait olduğunu kontrol et
    const caseExists = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
    });
    if (!caseExists) throw new NotFoundException("Dosya bulunamadı");

    const events = await this.prisma.caseLifecycle.findMany({
      where: { caseId },
      orderBy: { createdAt: "desc" },
    });

    return events.map((e) => ({
      id: e.id,
      type: this.mapActionToTimelineType(e.action),
      title: this.getTimelineTitle(e.action),
      description: e.description,
      date: e.createdAt,
      user: undefined,
      metadata: e.metadata,
    }));
  }

  private mapActionToTimelineType(action: string): string {
    const mapping: Record<string, string> = {
      CREATED: "CREATED",
      STATUS_CHANGED: "STATUS_CHANGE",
      TEBLIGAT_SENT: "TEBLIGAT",
      TEBLIGAT_DELIVERED: "TEBLIGAT",
      HACIZ_REQUESTED: "HACIZ",
      HACIZ_COMPLETED: "HACIZ",
      COLLECTION_ADDED: "TAHSILAT",
      NOTE_ADDED: "NOTE",
      DOCUMENT_ADDED: "DOCUMENT",
      HEARING_SCHEDULED: "DURUSMA",
    };
    return mapping[action] || "NOTE";
  }

  private getTimelineTitle(action: string): string {
    const titles: Record<string, string> = {
      CREATED: "Dosya oluşturuldu",
      STATUS_CHANGED: "Durum değiştirildi",
      TEBLIGAT_SENT: "Tebligat gönderildi",
      TEBLIGAT_DELIVERED: "Tebligat teslim edildi",
      HACIZ_REQUESTED: "Haciz talebi yapıldı",
      HACIZ_COMPLETED: "Haciz tamamlandı",
      COLLECTION_ADDED: "Tahsilat kaydedildi",
      NOTE_ADDED: "Not eklendi",
      DOCUMENT_ADDED: "Belge eklendi",
      HEARING_SCHEDULED: "Duruşma planlandı",
    };
    return titles[action] || action;
  }

  // ==================== TEBLİGAT TAKİP ====================

  /**
   * CaseDebtor tebligat bilgilerini güncelle
   */
  async updateCaseDebtorNotification(
    tenantId: string,
    caseId: string,
    caseDebtorId: string,
    data: {
      notificationBarcode?: string;
      notificationSentDate?: string;
      notificationDeliveredDate?: string;
      notificationStatus?: string;
      notificationNote?: string;
    }
  ) {
    // Dosyanın bu tenant'a ait olduğunu kontrol et
    const caseExists = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
    });
    if (!caseExists) throw new NotFoundException("Dosya bulunamadı");

    // CaseDebtor'un bu dosyaya ait olduğunu kontrol et
    const caseDebtor = await this.prisma.caseDebtor.findFirst({
      where: { id: caseDebtorId, caseId },
      include: { debtor: { select: { name: true } } },
    });
    if (!caseDebtor) throw new NotFoundException("Borçlu kaydı bulunamadı");

    // Güncelle
    const updated = await this.prisma.caseDebtor.update({
      where: { id: caseDebtorId },
      data: {
        notificationBarcode: data.notificationBarcode || null,
        notificationSentDate: data.notificationSentDate ? new Date(data.notificationSentDate) : null,
        notificationDeliveredDate: data.notificationDeliveredDate ? new Date(data.notificationDeliveredDate) : null,
        notificationStatus: data.notificationStatus || null,
        notificationNote: data.notificationNote || null,
      },
      include: {
        debtor: {
          include: { estateHeirs: true },
        },
      },
    });

    // Timeline'a kaydet
    if (data.notificationStatus === "GONDERILDI" && data.notificationSentDate) {
      await this.prisma.caseLifecycle.create({
        data: {
          caseId,
          stage: "INITIAL",
          action: "TEBLIGAT_SENT",
          description: `${caseDebtor.debtor.name} için tebligat gönderildi (Barkod: ${data.notificationBarcode || "-"})`,
          triggeredBy: "MANUAL",
          metadata: { caseDebtorId, barcode: data.notificationBarcode },
        },
      });
    }

    if (data.notificationStatus === "TEBLIG_EDILDI" && data.notificationDeliveredDate) {
      await this.prisma.caseLifecycle.create({
        data: {
          caseId,
          stage: "INITIAL",
          action: "TEBLIGAT_DELIVERED",
          description: `${caseDebtor.debtor.name} için tebligat teslim edildi`,
          triggeredBy: "MANUAL",
          metadata: { caseDebtorId, deliveredDate: data.notificationDeliveredDate },
        },
      });
    }

    return updated;
  }

  /**
   * Dosyadaki tüm borçluların tebligat durumlarını getir
   */
  async getCaseDebtorsWithNotification(tenantId: string, caseId: string) {
    // Dosyanın bu tenant'a ait olduğunu kontrol et
    const caseExists = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
    });
    if (!caseExists) throw new NotFoundException("Dosya bulunamadı");

    const caseDebtors = await this.prisma.caseDebtor.findMany({
      where: { caseId },
      include: {
        debtor: {
          include: {
            estateHeirs: true,
            debtorAddresses: true,
          },
        },
        selectedAddress: true,
      },
      orderBy: { createdAt: "asc" },
    });

    return caseDebtors;
  }

  // ==================== DOSYA AVUKAT YÖNETİMİ ====================

  /**
   * CaseLawyer yazımında Prisma P2002 (unique violation) → anlamlı 4xx'e çevir (maskeleme yok).
   *
   * - PR-C kısmi tekil index "CaseLawyer_one_responsible_per_case" (caseId başına ≤1 sorumlu):
   *   eşzamanlı "sorumlu yap" yarışının kaybedeni → 409 (tekrar dene). Index PR-C'de eklenir;
   *   o gelene dek bu dal DORMANT'tır (üretimde tetiklenmez), ama reorder + index birlikte güvenlidir.
   * - [caseId, lawyerId] tekilliği (aynı avukat iki kez) → 400 "zaten ekli" (ön-kontrolle aynı mesaj;
   *   ön-kontrol ile create arası TOCTOU yarışını kapatır).
   * - Diğer her hata AYNEN yeniden fırlatılır.
   *
   * Saf/yan-etkisiz çevirici: Hata NESNESİ döndürür (atmaz); çağıran `throw`'lar.
   *
   * @remarks Çağrıldığı yerler (WP-1d-5-7/9 sonrası: doğrudan update/create .catch; $transaction YOK):
   * - CaseService.updateCaseLawyer() → PATCH /cases/:id/lawyers/:caseLawyerId (caseLawyer.update .catch)
   * - CaseService.addCaseLawyer() → POST /cases/:id/lawyers (caseLawyer.create .catch)
   */
  private toCaseLawyerConflict(error: unknown): Error {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = String((error.meta as { target?: unknown } | undefined)?.target ?? '');
      // PR-C-FU: sorumlu partial unique index (case_lawyer_one_responsible_per_case). Prisma bu raw
      // (şema-dışı) index için P2002 target'ını KOLON raporlar = "caseId" (index ADI DEĞİL — canlı
      // doğrulamayla saptandı). caseId+lawyerId unique'inde target "caseId,lawyerId" olur. Ayrım:
      // caseId VAR + lawyerId YOK → sorumlu çakışması (409). Ad-substring kontrolü belt-and-suspenders
      // (başka bir Prisma sürümü target'ta index adını raporlarsa).
      const isResponsibleConflict =
        target.includes('one_responsible_per_case') ||
        (target.includes('caseId') && !target.includes('lawyerId'));
      if (isResponsibleConflict) {
        return new ConflictException(
          'Sorumlu avukat aynı anda başka bir işlemce değiştirildi; lütfen sayfayı yenileyip tekrar deneyin.',
        );
      }
      if (target.includes('caseId') || target.includes('lawyerId')) {
        return new BadRequestException('Bu avukat zaten dosyaya ekli');
      }
    }
    return error instanceof Error ? error : new Error(String(error));
  }

  /**
   * Dosyadaki avukatın rol ve yetkilerini güncelle.
   *
   * ASSIGN-4b: "tam 1 sorumlu" invariant'ı — bir avukat RESPONSIBLE yapılırsa diğer tüm
   * sorumlular düşürülür (isResponsible=false + role=ASSIGNED); tek sorumlu başka biri
   * yükseltilmeden düşürülmek istenirse BadRequest. Yazımlar tek $transaction'da atomik.
   *
   * @remarks Çağrıldığı yerler:
   * - CaseController.updateCaseLawyer() → PATCH /cases/:id/lawyers/:caseLawyerId
   *   ← apps/web cases/[id]/page.tsx#handleSaveCasePermissions (lawyer drawer rol/yetki)
   */
  async updateCaseLawyer(
    tenantId: string,
    caseId: string,
    caseLawyerId: string,
    data: {
      role?: 'RESPONSIBLE' | 'ASSIGNED' | 'ASSISTANT' | 'INTERN';
      canSign?: boolean;
      hasSignatureAuthority?: boolean;
      isResponsible?: boolean;
      casePermissions?: {
        canEditCase?: boolean;
        canGenerateDocs?: boolean;
        canSyncUYAP?: boolean;
        canViewFinance?: boolean;
        canEditFinance?: boolean;
        canChangeStatus?: boolean;
        canEditParties?: boolean;
      };
      receiveNotifications?: boolean;
    },
    userId: string,
  ) {
    // Dosyanın bu tenant'a ait olduğunu kontrol et
    const caseExists = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
    });
    if (!caseExists) throw new NotFoundException("Dosya bulunamadı");

    // CaseLawyer'ın bu dosyaya ait olduğunu kontrol et
    const caseLawyer = await this.prisma.caseLawyer.findFirst({
      where: { id: caseLawyerId, caseId },
      include: { lawyer: { select: { name: true, surname: true } } },
    });
    if (!caseLawyer) throw new NotFoundException("Avukat kaydı bulunamadı");

    // WP-1d-5-7: Hukuki Sorumlu Avukat (isResponsible / role==='RESPONSIBLE') ekseni YALNIZ kanonik uçtan
    // değiştirilir: PATCH /cases/:id/legal-responsible-lawyer (ADMIN + reason zorunlu + changeType audit).
    // Bu generic uç o ekseni DEĞİŞTİREMEZ: ne promote (RESPONSIBLE/isResponsible yükseltme) ne de mevcut
    // sorumlunun rolünü değiştirme (demote). Yalnız sorumlu-DIŞI rol + yetki/imza/bildirim güncellenir.
    const touchesResponsibleAxis =
      data.isResponsible !== undefined ||
      data.role === "RESPONSIBLE" ||
      (data.role !== undefined && caseLawyer.isResponsible === true);
    if (touchesResponsibleAxis) {
      throw new BadRequestException(
        'Hukuki sorumlu avukat kaydı bu uçtan değiştirilemez; "Hukuki Sorumlu Avukat Kaydını Değiştir" akışını kullanın. [LEGAL_RESPONSIBLE_CHANGE_VIA_CANONICAL_ENDPOINT_ONLY]',
      );
    }

    // Güncelleme verisi hazırla
    const updateData: any = {};
    
    if (data.role !== undefined) {
      // WP-1d-5-7: guard üstte RESPONSIBLE'ı + mevcut sorumlunun rol değişimini eledi → isResponsible bu uçtan DEĞİŞMEZ.
      updateData.role = data.role;
    }
    
    if (data.canSign !== undefined) {
      updateData.canSign = data.canSign;
      updateData.hasSignatureAuthority = data.canSign;
    }
    
    if (data.hasSignatureAuthority !== undefined) {
      updateData.hasSignatureAuthority = data.hasSignatureAuthority;
      updateData.canSign = data.hasSignatureAuthority;
    }
    
    // WP-1d-5-7: isResponsible alanı bu uçtan kabul edilmez (guard üstte reddeder) → eski handler kaldırıldı.

    if (data.casePermissions !== undefined) {
      updateData.casePermissions = data.casePermissions;
      updateData.permissionSource = 'CUSTOM';
    }
    
    if (data.receiveNotifications !== undefined) {
      updateData.receiveNotifications = data.receiveNotifications;
    }

    // WP-1d-5-7: bu uç artık sorumluluk eksenine DOKUNMAZ (guard üstte) → eski ASSIGN-4b tam-1
    // demote/promote mantığı GEREKMEZ. Sorumlu değişikliği yalnız kanonik LegalResponsibleLawyerService'tedir
    // (clear-before-set + changeType audit). Burada tek kayıt güncellemesi; P2002 → 409 defansif korunur.
    const updated = await this.prisma.caseLawyer
      .update({
        where: { id: caseLawyerId },
        data: updateData,
        include: {
          lawyer: {
            select: {
              id: true,
              name: true,
              surname: true,
              barNumber: true,
              lawyerRank: true,
            },
          },
        },
      })
      .catch((e) => {
        throw this.toCaseLawyerConflict(e);
      });

    // Audit log
    await this.auditService.log({
      tenantId,
      action: 'UPDATE',
      entityType: 'CASE_LAWYER',
      entityId: caseLawyerId,
      userId, // WP-1c-3
      metadata: { caseId }, // WP-1d-2-pre: legal-responsible temporal için caseId
      newValues: updateData,
      description: `Avukat yetkileri güncellendi: ${caseLawyer.lawyer.name} ${caseLawyer.lawyer.surname}`,
    });

    this.logger.log(`CaseLawyer updated: ${caseLawyerId}, role: ${updated.role}, permissions: ${JSON.stringify(updated.casePermissions)}`);

    return updated;
  }

  /**
   * Dosyadaki tüm avukatları getir (detaylı)
   */
  async getCaseLawyers(tenantId: string, caseId: string) {
    // Dosyanın bu tenant'a ait olduğunu kontrol et
    const caseExists = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
    });
    if (!caseExists) throw new NotFoundException("Dosya bulunamadı");

    const caseLawyers = await this.prisma.caseLawyer.findMany({
      where: { caseId },
      include: {
        lawyer: {
          select: {
            id: true,
            name: true,
            surname: true,
            barNumber: true,
            phone: true,
            email: true,
            lawyerRank: true,
            bankName: true,
            branchName: true,
            iban: true,
          },
        },
      },
      orderBy: [
        { isResponsible: 'desc' },
        { createdAt: 'asc' },
      ],
    });

    return caseLawyers.map(cl => ({
      id: cl.id,
      lawyerId: cl.lawyerId,
      role: cl.role,
      canSign: cl.canSign,
      hasSignatureAuthority: cl.hasSignatureAuthority,
      isResponsible: cl.isResponsible,
      casePermissions: cl.casePermissions,
      permissionSource: cl.permissionSource,
      receiveNotifications: cl.receiveNotifications,
      lawyer: cl.lawyer,
    }));
  }

  /**
   * Dosyaya avukat ekle.
   *
   * WP-1d-5-9 (L2/L3/L4): Hukuki Sorumlu Avukat ekseni lifecycle ekleme yoluyla DEĞİŞTİRİLEMEZ.
   * - Mevcut sorumlu YOKSA: ilk responsible initialization korunur (rank-default/explicit RESPONSIBLE olabilir).
   * - Mevcut sorumlu VARSA: explicit RESPONSIBLE reddedilir (kanonik uç); rank-default RESPONSIBLE ASSIGNED'a indirilir.
   *   Eski sorumlu KORUNUR; ekleme yoluyla demote YOK.
   *
   * @remarks Çağrıldığı yerler:
   * - CaseController.addCaseLawyer() → POST /cases/:id/lawyers
   */
  async addCaseLawyer(tenantId: string, caseId: string, data: {
    lawyerId: string;
    role?: 'RESPONSIBLE' | 'ASSIGNED' | 'ASSISTANT' | 'INTERN';
    canSign?: boolean;
  }, userId: string) {
    // Dosyanın bu tenant'a ait olduğunu kontrol et
    const caseExists = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
    });
    if (!caseExists) throw new NotFoundException("Dosya bulunamadı");

    // Avukatın bu tenant'a ait olduğunu kontrol et
    const lawyer = await this.prisma.lawyer.findFirst({
      where: { id: data.lawyerId, tenantId },
    });
    if (!lawyer) throw new NotFoundException("Avukat bulunamadı");

    // Zaten ekli mi kontrol et
    const existing = await this.prisma.caseLawyer.findFirst({
      where: { caseId, lawyerId: data.lawyerId },
    });
    if (existing) throw new BadRequestException("Bu avukat zaten dosyaya ekli");

    // WP-1d-5-9 (L3/L4): mevcut Hukuki Sorumlu Avukat varsa lifecycle ekleme onu DEĞİŞTİREMEZ.
    // (at-most-one DB partial unique index → mevcut sorumlu sayısı 0 ya da 1.)
    const existingResponsibleCount = await this.prisma.caseLawyer.count({
      where: { caseId, isResponsible: true },
    });
    const hasResponsible = existingResponsibleCount > 0;

    // L3: mevcut sorumlu varken EXPLICIT RESPONSIBLE ekleme → reddet (kanonik uç).
    if (hasResponsible && data.role === 'RESPONSIBLE') {
      throw new BadRequestException(
        'Dosyada zaten hukuki sorumlu avukat var; yeni avukat ekleme yoluyla hukuki sorumlu yapılamaz. "Hukuki Sorumlu Avukat Kaydını Değiştir" akışını kullanın. [LEGAL_RESPONSIBLE_CHANGE_REQUIRES_CANONICAL_ENDPOINT]',
      );
    }

    // LawyerRank'e göre varsayılan rol belirle
    let role = data.role;
    if (!role) {
      switch (lawyer.lawyerRank) {
        case 'PARTNER':
        case 'MANAGER':
          role = 'RESPONSIBLE';
          break;
        case 'AUTHORIZED':
          role = 'ASSIGNED';
          break;
        case 'INTERN':
          role = 'INTERN';
          break;
        default:
          role = 'ASSIGNED';
      }
    }

    // L4: mevcut sorumlu varken rank-default (PARTNER/MANAGER) yeni avukatı SESSİZCE sorumlu yapamaz →
    // ASSIGNED'a indir (örtük replacement engellenir; eski sorumlu KORUNUR).
    if (hasResponsible && role === 'RESPONSIBLE') {
      role = 'ASSIGNED';
    }

    // L2: hiç sorumlu yokken ilk responsible initialization KORUNUR → willBeResponsible yalnız burada true.
    const willBeResponsible = role === 'RESPONSIBLE';

    // Ekle. WP-1d-5-9: lifecycle ekleme artık mevcut sorumluyu DEMOTE ETMEZ (willBeResponsible yalnız
    // hasResponsible=false iken → demote edilecek kimse yok) → demote/$transaction gerekmez.
    // P2002 → 409 dönüşümü defansif korunur.
    const caseLawyer = await this.prisma.caseLawyer
      .create({
        data: {
          caseId,
          lawyerId: data.lawyerId,
          role,
          canSign: data.canSign ?? (lawyer.lawyerRank !== 'INTERN'),
          isResponsible: willBeResponsible,
        },
        include: {
          lawyer: {
            select: {
              id: true,
              name: true,
              surname: true,
              barNumber: true,
              lawyerRank: true,
            },
          },
        },
      })
      .catch((e) => {
        throw this.toCaseLawyerConflict(e);
      });

    // ASSIGN-4c: avukat eklemesi CASE_LAWYER CREATE olarak audit'lenir.
    await this.auditService.log({
      tenantId,
      action: 'CREATE',
      entityType: 'CASE_LAWYER',
      entityId: caseLawyer.id,
      userId, // WP-1c-3
      metadata: { caseId }, // WP-1d-2-pre: legal-responsible temporal için caseId
      newValues: { lawyerId: caseLawyer.lawyerId, role: caseLawyer.role, isResponsible: caseLawyer.isResponsible },
      description: `Dosyaya avukat eklendi: ${caseLawyer.lawyer.name} ${caseLawyer.lawyer.surname}`,
    });

    return caseLawyer;
  }

  /**
   * Dosyadan avukat çıkar.
   *
   * WP-1d-5-9 (L5/L6): Mevcut Hukuki Sorumlu Avukat lifecycle silme yoluyla ÇIKARILAMAZ
   * (otomatik promote ile sessiz sorumlu değişimi engellenir) → 400. Önce kanonik uçtan başka avukat
   * hukuki sorumlu yapılmalı (reason+audit), SONRA bu avukat silinebilir. Sorumlu-OLMAYAN avukat silme serbest.
   *
   * @remarks Çağrıldığı yerler:
   * - CaseController.removeCaseLawyer() → DELETE /cases/:id/lawyers/:caseLawyerId
   */
  async removeCaseLawyer(tenantId: string, caseId: string, caseLawyerId: string, userId: string) {
    // Dosyanın bu tenant'a ait olduğunu kontrol et
    const caseExists = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
    });
    if (!caseExists) throw new NotFoundException("Dosya bulunamadı");

    // CaseLawyer'ın bu dosyaya ait olduğunu kontrol et
    const caseLawyer = await this.prisma.caseLawyer.findFirst({
      where: { id: caseLawyerId, caseId },
    });
    if (!caseLawyer) throw new NotFoundException("Avukat ataması bulunamadı");

    // WP-1d-5-9 (L5): Mevcut Hukuki Sorumlu Avukat lifecycle silme yoluyla ÇIKARILAMAZ (otomatik
    // promote ile sessiz sorumlu değişimi engellenir). Önce kanonik uçtan başka avukat hukuki sorumlu
    // yapılmalı, SONRA bu avukat silinebilir.
    if (caseLawyer.isResponsible) {
      throw new BadRequestException(
        'Hukuki sorumlu avukat dosyadan çıkarılmadan önce başka bir avukat hukuki sorumlu yapılmalıdır. "Hukuki Sorumlu Avukat Kaydını Değiştir" akışını kullanın. [LEGAL_RESPONSIBLE_REMOVAL_REQUIRES_CANONICAL_REPLACEMENT]',
      );
    }

    // L6: sorumlu-OLMAYAN avukat silme — mevcut akış. WP-1d-5-9: otomatik promote YOK (responsible
    // silinmiyor) → demote/$transaction gerekmez; tek delete.
    await this.prisma.caseLawyer.delete({ where: { id: caseLawyerId } });

    // ASSIGN-4c: avukat çıkarması CASE_LAWYER DELETE olarak audit'lenir (oldValues silinen kayıttan).
    await this.auditService.log({
      tenantId,
      action: 'DELETE',
      entityType: 'CASE_LAWYER',
      entityId: caseLawyerId,
      userId, // WP-1c-3
      metadata: { caseId }, // WP-1d-2-pre: legal-responsible temporal için caseId
      oldValues: { lawyerId: caseLawyer.lawyerId, role: caseLawyer.role, isResponsible: caseLawyer.isResponsible },
      description: 'Dosyadan avukat çıkarıldı',
    });

    return { success: true };
  }

  /**
   * Dosyadaki personelleri getir
   */
  async getCaseStaff(tenantId: string, caseId: string) {
    // Dosyanın bu tenant'a ait olduğunu kontrol et
    const caseExists = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
    });
    if (!caseExists) throw new NotFoundException("Dosya bulunamadı");

    const caseStaff = await this.prisma.caseStaff.findMany({
      where: { caseId },
      include: {
        staffMember: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            staffType: true,
            phone: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return caseStaff;
  }

  /**
   * Dosyaya personel ekle
   */
  async addCaseStaff(tenantId: string, caseId: string, data: {
    staffMemberId: string;
    roleOnCase?: string;
  }) {
    // Dosyanın bu tenant'a ait olduğunu kontrol et
    const caseExists = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
    });
    if (!caseExists) throw new NotFoundException("Dosya bulunamadı");

    // Personelin bu tenant'a ait olduğunu kontrol et
    const staffMember = await this.prisma.staffMember.findFirst({
      where: { id: data.staffMemberId, tenantId },
    });
    if (!staffMember) throw new NotFoundException("Personel bulunamadı");

    // Zaten ekli mi kontrol et
    const existing = await this.prisma.caseStaff.findFirst({
      where: { caseId, staffMemberId: data.staffMemberId },
    });
    if (existing) throw new BadRequestException("Bu personel zaten dosyaya ekli");

    const caseStaff = await this.prisma.caseStaff.create({
      data: {
        caseId,
        staffMemberId: data.staffMemberId,
        roleOnCase: data.roleOnCase || staffMember.staffType,
      },
      include: {
        staffMember: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            staffType: true,
          },
        },
      },
    });

    return caseStaff;
  }

  /**
   * Dosyadan personel çıkar
   */
  async removeCaseStaff(tenantId: string, caseId: string, caseStaffId: string) {
    // Dosyanın bu tenant'a ait olduğunu kontrol et
    const caseExists = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
    });
    if (!caseExists) throw new NotFoundException("Dosya bulunamadı");

    // CaseStaff'ın bu dosyaya ait olduğunu kontrol et
    const caseStaff = await this.prisma.caseStaff.findFirst({
      where: { id: caseStaffId, caseId },
    });
    if (!caseStaff) throw new NotFoundException("Personel ataması bulunamadı");

    await this.prisma.caseStaff.delete({
      where: { id: caseStaffId },
    });

    return { success: true };
  }

  /**
   * Dosyadaki personelin bu-dosyaya özel ayarlarını güncelle (ASSIGN-3a).
   * Yalnız CaseStaff modeli alanları whitelist'lenir: roleOnCase, canEdit, canApprove, canView,
   * receiveNotifications, notes. Bilinmeyen alanlar (canSign, permissions — lawyer drawer'ından
   * sızmış kavramlar, PR-ASSIGN-3b'de frontend'den kaldırılacak) SESSİZCE yok sayılır.
   * Tenant guard: case bu tenant'a + caseStaff bu dosyaya ait. Audit: UPDATE / CASE_STAFF.
   * @remarks Çağrıldığı yer: CaseController.updateCaseStaff() → PATCH /cases/:id/staff/:caseStaffId.
   */
  async updateCaseStaff(
    tenantId: string,
    caseId: string,
    caseStaffId: string,
    data: {
      roleOnCase?: string;
      canEdit?: boolean;
      canApprove?: boolean;
      canView?: boolean;
      receiveNotifications?: boolean;
      notes?: string;
    },
    userId: string,
  ) {
    // Dosya bu tenant'a ait mi?
    const caseExists = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
    });
    if (!caseExists) throw new NotFoundException("Dosya bulunamadı");

    // CaseStaff bu dosyaya ait mi? (cross-tenant/yanlış-dosya → 404)
    const caseStaff = await this.prisma.caseStaff.findFirst({
      where: { id: caseStaffId, caseId },
    });
    if (!caseStaff) throw new NotFoundException("Personel ataması bulunamadı");

    // Service-whitelist: yalnız CaseStaff alanları (verilenler). canSign/permissions vb. yok sayılır.
    const updateData: Prisma.CaseStaffUpdateInput = {};
    if (data.roleOnCase !== undefined) updateData.roleOnCase = data.roleOnCase;
    if (data.canEdit !== undefined) updateData.canEdit = data.canEdit;
    if (data.canApprove !== undefined) updateData.canApprove = data.canApprove;
    if (data.canView !== undefined) updateData.canView = data.canView;
    if (data.receiveNotifications !== undefined) updateData.receiveNotifications = data.receiveNotifications;
    if (data.notes !== undefined) updateData.notes = data.notes;

    const updated = await this.prisma.caseStaff.update({
      where: { id: caseStaffId },
      data: updateData,
      include: {
        staffMember: {
          select: { id: true, firstName: true, lastName: true, staffType: true },
        },
      },
    });

    // Audit (ASSIGN-3a): personel rol/yetki güncellemesi (add/remove audit AYRI iş).
    await this.auditService.log({
      tenantId,
      action: "UPDATE",
      entityType: "CASE_STAFF",
      entityId: caseStaffId,
      userId, // WP-1c-3
      newValues: updateData,
      description: `Dosya personeli güncellendi: ${updated.staffMember.firstName} ${updated.staffMember.lastName}`,
    });

    return updated;
  }

  // ==================== ALACAK KALEMLERİ (DUES) ====================

  /**
   * Dosyanın alacak kalemlerini getir
   */
  async getCaseDues(tenantId: string, caseId: string) {
    const caseExists = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
    });
    if (!caseExists) throw new NotFoundException("Dosya bulunamadı");

    return this.prisma.due.findMany({
      where: { caseId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
  }

  /**
   * Alacak kalemi ekle.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - CaseController.createDue() → POST /cases/:id/dues (dosya açıldıktan sonra alacak kalemi ekleme)
   * </remarks>
   */
  async createDue(
    tenantId: string,
    caseId: string,
    data: {
      type: string;
      description?: string;
      amount: number;
      dueDate: string;
      currency?: string;
      interestType?: string;
      interestRate?: number;
      interestStartDate?: string;
      interestEndDate?: string;
      sourceDocumentNo?: string;
      hasKdv?: boolean;
      kdvRate?: number;
      isPrimary?: boolean;
    }
  ) {
    return this.prisma.$transaction(async (tx) => {
      const caseExists = await tx.case.findFirst({
        where: { id: caseId, tenantId },
      });
      if (!caseExists) throw new NotFoundException("Dosya bulunamadı");

      // Get max sortOrder
      const maxSort = await tx.due.aggregate({
        where: { caseId },
        _max: { sortOrder: true },
      });

      const due = await tx.due.create({
        data: {
          caseId,
          type: data.type as any,
          description: data.description,
          amount: data.amount,
          dueDate: new Date(data.dueDate),
          currency: data.currency || "TRY",
          interestType: data.interestType,
          interestRate: data.interestRate,
          interestStartDate: data.interestStartDate ? new Date(data.interestStartDate) : undefined,
          interestEndDate: data.interestEndDate ? new Date(data.interestEndDate) : undefined,
          sourceDocumentNo: data.sourceDocumentNo,
          hasKdv: data.hasKdv || false,
          kdvRate: data.kdvRate,
          isPrimary: data.isPrimary || false,
          sortOrder: (maxSort._max.sortOrder || 0) + 1,
        },
      });

      const claimItemData = this.buildDueSyncClaimItemData(tenantId, caseId, due);
      if (claimItemData) {
        await tx.claimItem.create({ data: claimItemData });
      }

      return due;
    });
  }

  /**
   * Alacak kalemi güncelle.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - CaseController.updateDue() → PATCH /cases/:id/dues/:dueId (dosya açıldıktan sonra alacak kalemi güncelleme)
   * </remarks>
   */
  async updateDue(
    tenantId: string,
    caseId: string,
    dueId: string,
    data: {
      type?: string;
      description?: string;
      amount?: number;
      dueDate?: string;
      currency?: string;
      interestType?: string;
      interestRate?: number;
      interestStartDate?: string;
      interestEndDate?: string;
      sourceDocumentNo?: string;
      hasKdv?: boolean;
      kdvRate?: number;
      isFinalized?: boolean;
      finalizationDate?: string;
      finalizationNote?: string;
      sortOrder?: number;
      isPrimary?: boolean;
    }
  ) {
    return this.prisma.$transaction(async (tx) => {
      const caseExists = await tx.case.findFirst({
        where: { id: caseId, tenantId },
      });
      if (!caseExists) throw new NotFoundException("Dosya bulunamadı");

      const due = await tx.due.findFirst({
        where: { id: dueId, caseId },
      });
      if (!due) throw new NotFoundException("Alacak kalemi bulunamadı");

      const updatedDue = await tx.due.update({
        where: { id: dueId },
        data: {
          type: data.type as any,
          description: data.description,
          amount: data.amount,
          dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
          currency: data.currency,
          interestType: data.interestType,
          interestRate: data.interestRate,
          interestStartDate: data.interestStartDate ? new Date(data.interestStartDate) : undefined,
          interestEndDate: data.interestEndDate ? new Date(data.interestEndDate) : undefined,
          sourceDocumentNo: data.sourceDocumentNo,
          hasKdv: data.hasKdv,
          kdvRate: data.kdvRate,
          isFinalized: data.isFinalized,
          finalizationDate: data.finalizationDate ? new Date(data.finalizationDate) : undefined,
          finalizationNote: data.finalizationNote,
          sortOrder: data.sortOrder,
          isPrimary: data.isPrimary,
        },
      });

      await this.syncMarkedClaimItemFromDue(tx, tenantId, caseId, updatedDue);

      return updatedDue;
    });
  }

  /**
   * Alacak kalemi sil.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - CaseController.deleteDue() → DELETE /cases/:id/dues/:dueId (dosya açıldıktan sonra alacak kalemi silme)
   * </remarks>
   */
  async deleteDue(tenantId: string, caseId: string, dueId: string) {
    return this.prisma.$transaction(async (tx) => {
      const caseExists = await tx.case.findFirst({
        where: { id: caseId, tenantId },
      });
      if (!caseExists) throw new NotFoundException("Dosya bulunamadı");

      const due = await tx.due.findFirst({
        where: { id: dueId, caseId },
      });
      if (!due) throw new NotFoundException("Alacak kalemi bulunamadı");

      const claimItem = await this.findDueSyncClaimItem(tx, tenantId, caseId, dueId);
      if (claimItem) {
        await tx.claimItem.update({
          where: { id: claimItem.id },
          data: { status: "CANCELLED" },
        });
      }

      await tx.due.delete({ where: { id: dueId } });
      return { success: true };
    });
  }

  // ==================== TAHSİLATLAR (COLLECTIONS) ====================

  /**
   * Dosyanın tahsilatlarını getir
   */
  async getCaseCollections(tenantId: string, caseId: string) {
    const caseExists = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
    });
    if (!caseExists) throw new NotFoundException("Dosya bulunamadı");

    return this.prisma.collection.findMany({
      where: { caseId, tenantId },
      orderBy: { date: "desc" },
      include: {
        case: { select: { id: true, fileNumber: true } },
      },
    });
  }

  /**
   * Tahsilat ekle
   */
  async createCollection(
    tenantId: string,
    caseId: string,
    data: {
      caseDebtorId?: string;
      amount: number;
      currency?: string;
      type: string;
      channel: string;
      date: string;
      valueDate?: string;
      description?: string;
      receiptNo?: string;
      bankName?: string;
      accountNo?: string;
      notes?: string;
    },
    userId?: string,
  ) {
    // G3d: kanonik yola delege — closed/duplicate guard + PAYMENT_RECEIVED event +
    // G3a ledger + CollectionAllocation tek otoritede (collection.service.create).
    return this.collectionService.create(
      tenantId,
      {
        caseId,
        caseDebtorId: data.caseDebtorId,
        amount: data.amount,
        currency: data.currency,
        type: data.type as any,
        channel: data.channel as any,
        date: data.date,
        valueDate: data.valueDate,
        description: data.description,
        receiptNo: data.receiptNo,
        bankName: data.bankName,
        accountNo: data.accountNo,
        notes: data.notes,
      } as any,
      userId,
    );
  }

  /**
   * Tahsilat güncelle
   */
  async updateCollection(
    tenantId: string,
    caseId: string,
    collectionId: string,
    data: {
      amount?: number;
      type?: string;
      channel?: string;
      date?: string;
      valueDate?: string;
      description?: string;
      receiptNo?: string;
      bankName?: string;
      notes?: string;
      status?: string;
    }
  ) {
    const collection = await this.prisma.collection.findFirst({
      where: { id: collectionId, caseId, tenantId },
    });
    if (!collection) throw new NotFoundException("Tahsilat bulunamadı");

    const updated = await this.prisma.collection.update({
      where: { id: collectionId },
      data: {
        amount: data.amount,
        type: data.type as any,
        channel: data.channel as any,
        date: data.date ? new Date(data.date) : undefined,
        valueDate: data.valueDate ? new Date(data.valueDate) : undefined,
        description: data.description,
        receiptNo: data.receiptNo,
        bankName: data.bankName,
        notes: data.notes,
        status: data.status as any,
      },
    });

    // Tahsilat güncellendikten sonra faiz hesaplamasını yeniden tetikle
    // TODO: interest-engine entegrasyonu tamamlandığında aktif edilecek
    // try {
    //   const today = new Date().toISOString().split('T')[0];
    //   await this.interestEngineService.recalculateForCase(caseId, today, tenantId);
    //   this.logger.debug(`Interest recalculated after collection update for case ${caseId}`);
    // } catch (error) {
    //   this.logger.warn(`Failed to recalculate interest after collection update: ${error.message}`);
    // }

    return updated;
  }

  /**
   * Tahsilat iptal et
   */
  async cancelCollection(tenantId: string, caseId: string, collectionId: string, reason?: string) {
    // G3d: kanonik cancel'a delege (tenant doğrulaması collection.service.cancel içinde).
    return this.collectionService.cancel(tenantId, collectionId, {
      cancelReason: reason || "",
    });
  }

  /**
   * Tahsilat sil
   */
  async deleteCollection(tenantId: string, caseId: string, collectionId: string) {
    const collection = await this.prisma.collection.findFirst({
      where: { id: collectionId, caseId, tenantId },
    });
    if (!collection) throw new NotFoundException("Tahsilat bulunamadı");

    await this.prisma.collection.delete({ where: { id: collectionId } });

    // Tahsilat silindikten sonra faiz hesaplamasını yeniden tetikle
    // TODO: interest-engine entegrasyonu tamamlandığında aktif edilecek
    // try {
    //   const today = new Date().toISOString().split('T')[0];
    //   await this.interestEngineService.recalculateForCase(caseId, today, tenantId);
    //   this.logger.debug(`Interest recalculated after collection delete for case ${caseId}`);
    // } catch (error) {
    //   this.logger.warn(`Failed to recalculate interest after collection delete: ${error.message}`);
    // }

    return { success: true };
  }

  /**
   * Dosya finans özeti
   */
  async getCaseFinanceSummary(tenantId: string, caseId: string) {
    const caseExists = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
      select: { id: true, currency: true },
    });
    if (!caseExists) throw new NotFoundException("Dosya bulunamadı");

    const [dues, collections] = await Promise.all([
      this.prisma.due.findMany({ where: { caseId } }),
      this.prisma.collection.findMany({ where: { caseId, tenantId, status: "CONFIRMED" } }),
    ]);

    const totalDues = dues.reduce((sum, d) => sum + Number(d.amount), 0);
    const totalCollections = collections.reduce((sum, c) => sum + Number(c.amount), 0);

    // Group dues by type
    const duesByType = dues.reduce((acc, d) => {
      const existing = acc.find((x) => x.type === d.type);
      if (existing) {
        existing.amount += Number(d.amount);
        existing.count += 1;
      } else {
        acc.push({ type: d.type, amount: Number(d.amount), count: 1 });
      }
      return acc;
    }, [] as Array<{ type: string; amount: number; count: number }>);

    // Group collections by channel
    const collectionsByChannel = collections.reduce((acc, c) => {
      const existing = acc.find((x) => x.channel === c.channel);
      if (existing) {
        existing.amount += Number(c.amount);
        existing.count += 1;
      } else {
        acc.push({ channel: c.channel, amount: Number(c.amount), count: 1 });
      }
      return acc;
    }, [] as Array<{ channel: string; amount: number; count: number }>);

    return {
      caseId,
      currency: caseExists.currency || "TRY",
      totalDues,
      totalCollections,
      balance: totalDues - totalCollections,
      duesByType,
      collectionsByChannel,
    };
  }

  /**
   * Hesap özeti - TEK KAYNAK PRENSİBİ
   * 
   * Tüm hesaplamalar backend engine'lerden gelir:
   * - Faiz: interest-engine
   * - Masraf/harç: fee-engine
   * - Vekalet ücreti: fee-engine/attorney-fee
   * 
   * UI'da hesaplama YAPILMAZ.
   * 
   * <remarks>
   * Çağrıldığı yerler:
   * - CaseController.getCalculationSummary() → GET /cases/:id/calculation-summary (case detay hesap özeti)
   * </remarks>
   *
   * @see ARCHITECTURE.md - Source of Truth Matrix
   */
  async getCalculationSummary(tenantId: string, caseId: string, calculationDate: string) {
    // 1. Case verilerini al
    const caseData = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
      include: {
        dues: true,
        collections: { where: { status: { not: 'CANCELLED' } } },
        debtors: { include: { debtor: true } },
        formType: true,
      },
    });

    if (!caseData) {
      throw new NotFoundException('Dosya bulunamadı');
    }

    const takipTarihi = caseData.caseDate?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0];
    const hesapTarihi = calculationDate;

    // 2. Asıl alacak ve kalem türü belirleme
    const principalDues = caseData.dues.filter((d: any) => 
      ['PRINCIPAL', 'ASIL_ALACAK', 'CEK', 'SENET', 'CHECK', 'BOND'].includes(d.type)
    );
    
    const asilAlacak = principalDues.length > 0
      ? principalDues.reduce((sum: number, d: any) => sum + Number(d.amount), 0)
      : Number(caseData.principalAmount || 0);

    const firstDue = principalDues[0] as any;
    const kalemTuru = firstDue?.type || 
      (caseData.type === 'CHECK' ? 'CEK' : caseData.type === 'BOND' ? 'SENET' : 'ASIL_ALACAK');

    // 3. Faiz hesabı - şimdilik basit hesaplama
    // TODO: interest-engine entegrasyonu tamamlandığında aktif edilecek
    let takipOncesiFaiz = 0;
    let takipSonrasiFaiz = 0;
    const faizSegmentleri = { takipOncesi: [] as any[], takipSonrasi: [] as any[] };

    // 4. Çek tazminatı ve komisyon
    const isCek = kalemTuru === 'CEK' || kalemTuru === 'CHECK';
    const tazminat = isCek ? asilAlacak * 0.10 : 0;
    const komisyon = isCek ? asilAlacak * 0.003 : 0;

    // 5. Takip tutarı
    const takipTutari = asilAlacak + tazminat + komisyon + takipOncesiFaiz;

    // 6. Masraflar - fee-engine'den veya 2026 tarifesi
    const debtorCount = caseData.debtors?.length || 1;
    const basvurmaHarci = 738.50;
    const vekaletHarci = 105.00;
    const pesinHarc = Math.max(Math.round(takipTutari * 0.005 * 100) / 100, 120);
    const dosyaGideri = 50.00;
    const tebligatGideri = 252.00 * debtorCount;
    const vekaletPulu = 165.60;
    const icraMasraflari = basvurmaHarci + vekaletHarci + pesinHarc + dosyaGideri + tebligatGideri + vekaletPulu;

    // 7. Tahsil harçları
    const pesinHarcDahilTahsilHarci = Math.round((takipTutari + icraMasraflari) * 0.0455 * 100) / 100;
    const pesinHarcHaricTahsilHarci = Math.round((takipTutari + icraMasraflari - pesinHarc) * 0.0455 * 100) / 100;

    // 8. Vekalet ücreti - fee-engine'den
    let vekaletUcreti = 9000; // Asgari
    try {
      vekaletUcreti = this.calculateAttorneyFee(takipTutari);
    } catch (error) {
      this.logger.warn(`Attorney fee calculation failed:`, error);
    }

    // 9. Tahsilatlar
    const aktiveTahsilatlar = caseData.collections
      .filter((c: any) => c.status !== 'CANCELLED')
      .map((c: any) => ({
        tarih: c.date?.toISOString().split('T')[0] || hesapTarihi,
        tutar: Number(c.amount),
      }));
    const toplamTahsilat = aktiveTahsilatlar.reduce((sum: number, c: any) => sum + c.tutar, 0);

    // 10. Toplamlar
    const toplamBorc = takipTutari + icraMasraflari + vekaletUcreti + takipSonrasiFaiz;
    const sonBorc = toplamBorc + pesinHarcHaricTahsilHarci;
    const kalanBorc = sonBorc - toplamTahsilat;
    const legacyCurrency = String(caseData.currency || "TRY");

    // 11. Tahsil oranları
    const tahsilOranlari = [
      { oran: 0, label: "0" },
      { oran: 0.0227, label: "2,27" },
      { oran: 0.0455, label: "4,55" },
      { oran: 0.0910, label: "9,10" },
      { oran: 0.1138, label: "11,38" },
    ].map(t => ({
      ...t,
      tutar: Math.round(toplamBorc * (1 + t.oran) * 100) / 100,
    }));

    const legacySummary = {
      caseId,
      hesapTarihi,
      takipTarihi,
      kalemTuru,
      
      asilAlacak,
      tazminat,
      komisyon,
      takipOncesiFaiz,
      takipTutari,
      
      basvurmaHarci,
      vekaletHarci,
      pesinHarc,
      dosyaGideri,
      tebligatGideri,
      vekaletPulu,
      icraMasraflari,
      
      pesinHarcDahilTahsilHarci,
      pesinHarcHaricTahsilHarci,
      
      vekaletUcreti,
      takipSonrasiFaiz,
      
      toplamBorc,
      sonBorc,
      toplamTahsilat,
      kalanBorc,
      kalanAnapara: asilAlacak, // TBK m.100 sonrası hesaplanacak
      
      mahsupDetaylari: [], // TODO: TBK m.100 mahsup detayları
      faizSegmentleri,
      tahsilOranlari,
    };

    return {
      ...legacySummary,
      canonicalShadow: await this.buildCalculationSummaryCanonicalShadow(tenantId, caseId, calculationDate, {
        legacyToplamBorc: toplamBorc,
        legacySonBorc: sonBorc,
        legacyToplamTahsilat: toplamTahsilat,
        legacyKalanBorc: kalanBorc,
        legacyTahsilHarci: pesinHarcHaricTahsilHarci,
        legacyIcraMasraflari: icraMasraflari,
        legacyVekaletUcreti: vekaletUcreti,
        legacyCurrency,
      }),
    };
  }

  /**
   * Legacy hesap ozeti sonucuna, davranis degistirmeyen canonical computeBalance tanisi ekler.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - CaseService.getCalculationSummary() → GET /cases/:id/calculation-summary (canonicalShadow diagnostic)
   * </remarks>
   */
  private async buildCalculationSummaryCanonicalShadow(
    tenantId: string,
    caseId: string,
    calculationDate: string,
    legacy: {
      legacyToplamBorc: number;
      legacySonBorc: number;
      legacyToplamTahsilat: number;
      legacyKalanBorc: number;
      legacyTahsilHarci: number;
      legacyIcraMasraflari: number;
      legacyVekaletUcreti: number;
      legacyCurrency: string;
    },
  ): Promise<CalculationSummaryCanonicalShadow> {
    if (!this.canonicalCaseBalance) {
      const scopeComparisonMatrix = buildCanonicalShadowScopeComparisonMatrix(legacy, {
        canonicalClaimOnlyTotal: null,
        canonicalProjectedWithCosts: null,
        canonicalProjectedWithCostsAndAncillaries: null,
      });

      return {
        status: "UNAVAILABLE",
        source: "computeCaseBalance",
        asOfDate: calculationDate,
        alignmentStatus: "SCOPE_MISMATCH",
        comparisonScope: CANONICAL_SHADOW_COMPARISON_SCOPE,
        canonicalProjectionCurrencyScope: CANONICAL_SHADOW_PROJECTION_CURRENCY_SCOPE,
        canonicalProjectionCurrency: legacy.legacyCurrency,
        matchStatusInterpretation: CANONICAL_SHADOW_MATCH_STATUS_INTERPRETATION,
        canonicalTotalDuePaymentScope: CANONICAL_TOTAL_DUE_PAYMENT_SCOPE,
        canonicalInterestPaymentScope: CANONICAL_INTEREST_PAYMENT_SCOPE,
        legacyToplamBorcPaymentScope: LEGACY_TOPLAM_BORC_PAYMENT_SCOPE,
        legacySonBorcPaymentScope: LEGACY_SON_BORC_PAYMENT_SCOPE,
        legacyKalanBorcPaymentScope: LEGACY_KALAN_BORC_PAYMENT_SCOPE,
        legacyPaymentSource: LEGACY_PAYMENT_SOURCE,
        canonicalPaymentSource: CANONICAL_PAYMENT_SOURCE,
        paymentSourceParity: PAYMENT_SOURCE_PARITY,
        paymentSourceParityReason: PAYMENT_SOURCE_PARITY_REASON,
        legacyToplamBorc: legacy.legacyToplamBorc,
        legacySonBorc: legacy.legacySonBorc,
        legacyToplamTahsilat: legacy.legacyToplamTahsilat,
        legacyKalanBorc: legacy.legacyKalanBorc,
        legacyTahsilHarci: legacy.legacyTahsilHarci,
        legacyIcraMasraflari: legacy.legacyIcraMasraflari,
        legacyVekaletUcreti: legacy.legacyVekaletUcreti,
        legacyCurrency: legacy.legacyCurrency,
        canonicalTotalDue: null,
        canonicalProjectionCostsTotal: null,
        canonicalProjectionAncillariesTotal: null,
        canonicalProjectedTotalDue: null,
        canonicalClaimOnlyTotal: null,
        canonicalProjectedWithCosts: null,
        canonicalProjectedWithCostsAndAncillaries: null,
        scopeComparisonMatrix,
        rawDelta: null,
        matchStatus: "UNAVAILABLE",
        errorCode: "CASE_BALANCE_SERVICE_UNAVAILABLE",
      };
    }

    try {
      const balance = await this.canonicalCaseBalance.computeCaseBalance(tenantId, caseId, calculationDate);
      const canonicalProjectionCostsTotal = sumCanonicalProjectionTotal(balance.projections.costs);
      const canonicalProjectionAncillariesTotal = sumCanonicalProjectionTotal(balance.projections.ancillaries);
      const legacyCurrencyResult = balance.currencyResults.find((entry) => entry.currency === legacy.legacyCurrency);
      const canonicalTotalDue = legacyCurrencyResult?.result?.totalDue ?? null;
      const rawDelta = canonicalTotalDue != null ? round2(canonicalTotalDue - legacy.legacySonBorc) : null;
      const canonicalClaimOnlyTotal = canonicalTotalDue;
      const canonicalProjectedWithCosts =
        canonicalTotalDue != null ? round2(canonicalTotalDue + canonicalProjectionCostsTotal) : null;
      const canonicalProjectedWithCostsAndAncillaries =
        canonicalTotalDue != null
          ? round2(canonicalTotalDue + canonicalProjectionCostsTotal + canonicalProjectionAncillariesTotal)
          : null;
      const canonicalProjectedTotalDue = canonicalProjectedWithCostsAndAncillaries;
      const scopeComparisonMatrix = buildCanonicalShadowScopeComparisonMatrix(legacy, {
        canonicalClaimOnlyTotal,
        canonicalProjectedWithCosts,
        canonicalProjectedWithCostsAndAncillaries,
      });

      return {
        status: "OK",
        source: "computeCaseBalance",
        asOfDate: balance.asOfDate,
        alignmentStatus: "SCOPE_MISMATCH",
        comparisonScope: CANONICAL_SHADOW_COMPARISON_SCOPE,
        canonicalProjectionCurrencyScope: CANONICAL_SHADOW_PROJECTION_CURRENCY_SCOPE,
        canonicalProjectionCurrency: legacy.legacyCurrency,
        matchStatusInterpretation: CANONICAL_SHADOW_MATCH_STATUS_INTERPRETATION,
        canonicalTotalDuePaymentScope: CANONICAL_TOTAL_DUE_PAYMENT_SCOPE,
        canonicalInterestPaymentScope: CANONICAL_INTEREST_PAYMENT_SCOPE,
        legacyToplamBorcPaymentScope: LEGACY_TOPLAM_BORC_PAYMENT_SCOPE,
        legacySonBorcPaymentScope: LEGACY_SON_BORC_PAYMENT_SCOPE,
        legacyKalanBorcPaymentScope: LEGACY_KALAN_BORC_PAYMENT_SCOPE,
        legacyPaymentSource: LEGACY_PAYMENT_SOURCE,
        canonicalPaymentSource: CANONICAL_PAYMENT_SOURCE,
        paymentSourceParity: PAYMENT_SOURCE_PARITY,
        paymentSourceParityReason: PAYMENT_SOURCE_PARITY_REASON,
        legacyToplamBorc: legacy.legacyToplamBorc,
        legacySonBorc: legacy.legacySonBorc,
        legacyToplamTahsilat: legacy.legacyToplamTahsilat,
        legacyKalanBorc: legacy.legacyKalanBorc,
        legacyTahsilHarci: legacy.legacyTahsilHarci,
        legacyIcraMasraflari: legacy.legacyIcraMasraflari,
        legacyVekaletUcreti: legacy.legacyVekaletUcreti,
        legacyCurrency: legacy.legacyCurrency,
        canonicalTotalDue,
        canonicalProjectionCostsTotal,
        canonicalProjectionAncillariesTotal,
        canonicalProjectedTotalDue,
        canonicalClaimOnlyTotal,
        canonicalProjectedWithCosts,
        canonicalProjectedWithCostsAndAncillaries,
        scopeComparisonMatrix,
        rawDelta,
        engineSource: balance.source,
        currencyResults: balance.currencyResults.map((entry) => {
          const totalDue = entry.result?.totalDue ?? null;
          const canCompareCurrency = entry.currency === legacy.legacyCurrency;
          const delta = canCompareCurrency && totalDue != null ? round2(totalDue - legacy.legacySonBorc) : null;
          const deltaPercent =
            delta != null && legacy.legacySonBorc !== 0
              ? round2((delta / legacy.legacySonBorc) * 100)
              : null;

          return {
            currency: entry.currency,
            totalDue,
            canonicalTotalDue: totalDue,
            totalInterest: entry.result?.totalInterest ?? null,
            preEnforcementInterest: entry.result?.preEnforcementInterest ?? null,
            postEnforcementInterest: entry.result?.postEnforcementInterest ?? null,
            skippedReason: entry.skippedReason ?? null,
            delta,
            deltaPercent,
            rawDelta: delta,
            alignmentStatus: "SCOPE_MISMATCH",
            comparisonScope: CANONICAL_SHADOW_COMPARISON_SCOPE,
            canonicalProjectionCurrencyScope: CANONICAL_SHADOW_PROJECTION_CURRENCY_SCOPE,
            canonicalProjectionCurrency: legacy.legacyCurrency,
            matchStatusInterpretation: CANONICAL_SHADOW_MATCH_STATUS_INTERPRETATION,
            matchStatus: classifyCanonicalShadowDelta(
              legacy.legacyCurrency,
              entry.currency,
              legacy.legacySonBorc,
              totalDue,
              delta,
              deltaPercent,
            ),
          };
        }),
        diagnostics: balance.diagnostics,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Canonical balance shadow failed for case ${caseId}: ${message}`);
      const scopeComparisonMatrix = buildCanonicalShadowScopeComparisonMatrix(legacy, {
        canonicalClaimOnlyTotal: null,
        canonicalProjectedWithCosts: null,
        canonicalProjectedWithCostsAndAncillaries: null,
      });

      return {
        status: "ERROR",
        source: "computeCaseBalance",
        asOfDate: calculationDate,
        alignmentStatus: "SCOPE_MISMATCH",
        comparisonScope: CANONICAL_SHADOW_COMPARISON_SCOPE,
        canonicalProjectionCurrencyScope: CANONICAL_SHADOW_PROJECTION_CURRENCY_SCOPE,
        canonicalProjectionCurrency: legacy.legacyCurrency,
        matchStatusInterpretation: CANONICAL_SHADOW_MATCH_STATUS_INTERPRETATION,
        canonicalTotalDuePaymentScope: CANONICAL_TOTAL_DUE_PAYMENT_SCOPE,
        canonicalInterestPaymentScope: CANONICAL_INTEREST_PAYMENT_SCOPE,
        legacyToplamBorcPaymentScope: LEGACY_TOPLAM_BORC_PAYMENT_SCOPE,
        legacySonBorcPaymentScope: LEGACY_SON_BORC_PAYMENT_SCOPE,
        legacyKalanBorcPaymentScope: LEGACY_KALAN_BORC_PAYMENT_SCOPE,
        legacyPaymentSource: LEGACY_PAYMENT_SOURCE,
        canonicalPaymentSource: CANONICAL_PAYMENT_SOURCE,
        paymentSourceParity: PAYMENT_SOURCE_PARITY,
        paymentSourceParityReason: PAYMENT_SOURCE_PARITY_REASON,
        legacyToplamBorc: legacy.legacyToplamBorc,
        legacySonBorc: legacy.legacySonBorc,
        legacyToplamTahsilat: legacy.legacyToplamTahsilat,
        legacyKalanBorc: legacy.legacyKalanBorc,
        legacyTahsilHarci: legacy.legacyTahsilHarci,
        legacyIcraMasraflari: legacy.legacyIcraMasraflari,
        legacyVekaletUcreti: legacy.legacyVekaletUcreti,
        legacyCurrency: legacy.legacyCurrency,
        canonicalTotalDue: null,
        canonicalProjectionCostsTotal: null,
        canonicalProjectionAncillariesTotal: null,
        canonicalProjectedTotalDue: null,
        canonicalClaimOnlyTotal: null,
        canonicalProjectedWithCosts: null,
        canonicalProjectedWithCostsAndAncillaries: null,
        scopeComparisonMatrix,
        rawDelta: null,
        matchStatus: "ERROR",
        errorCode: "CANONICAL_SHADOW_COMPUTE_FAILED",
      };
    }
  }

  /**
   * Vekalet ücreti hesaplama (2025/2026 Tarifesi)
   * @deprecated fee-engine'e taşınacak
   */
  private calculateAttorneyFee(takipTutari: number): number {
    const MAKTU_ICRA_UCRETI = 9000;
    
    const dilimler = [
      { limit: 600000, oran: 0.16 },
      { limit: 1200000, oran: 0.15 },
      { limit: 2400000, oran: 0.14 },
      { limit: 3600000, oran: 0.13 },
      { limit: 5400000, oran: 0.11 },
      { limit: 7800000, oran: 0.08 },
      { limit: 10800000, oran: 0.05 },
      { limit: 14400000, oran: 0.03 },
      { limit: 18600000, oran: 0.02 },
      { limit: Infinity, oran: 0.01 },
    ];
    
    let toplam = 0;
    let kalanTutar = takipTutari;
    let oncekiLimit = 0;
    
    for (const dilim of dilimler) {
      if (kalanTutar <= 0) break;
      const dilimGenisligi = dilim.limit - oncekiLimit;
      const buDilimdekiTutar = Math.min(kalanTutar, dilimGenisligi);
      toplam += buDilimdekiTutar * dilim.oran;
      kalanTutar -= buDilimdekiTutar;
      oncekiLimit = dilim.limit;
    }
    
    return Math.max(Math.round(toplam * 100) / 100, MAKTU_ICRA_UCRETI);
  }
}
