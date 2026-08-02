import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { ExternalCaseClosureReason, ExternalCaseStatus, Prisma } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CaseDebtorLifecycleGuardService } from "../case-debtor-lifecycle-guard/case-debtor-lifecycle-guard.service";
import { ExternalCaseStatusAuthorityService } from "./external-case-status-authority.service";
import { CloseExternalCaseDto, TransitionExternalCaseStatusDto } from "./dto/third-party.dto";

export const EXTERNAL_CASE_STATUS_TRANSITION_AUDIT_ACTION = "EXTERNAL_CASE_STATUS_TRANSITIONED" as const;

interface ManualTransitionRule {
  readonly from: ExternalCaseStatus;
  readonly to: ExternalCaseStatus;
}

// Owner-ratified manuel FACT/PROCESS transition matrix (D2 Bölüm 2). Yalnız bu 3
// kenar bu yoldan geçer; KAPANDI ayrı closeManual()'ün, TAHSIL_BASLADI/KAPANDI
// (tam tahsilat) ayrı applySystemDerivedProjection()'ın konusudur — icad edilmiş
// başka hiçbir (from,to) çifti kabul edilmez.
const MANUAL_FACT_OR_PROCESS_TRANSITIONS: readonly ManualTransitionRule[] = [
  { from: "HACIZ_TALEP", to: "CEVAP_BEKLENIYOR" },
  { from: "HACIZ_TALEP", to: "HACIZ_KONDU" },
  { from: "CEVAP_BEKLENIYOR", to: "HACIZ_KONDU" },
];

interface LoadedExternalCase {
  readonly caseDebtorId: string;
  readonly caseId: string;
}

export interface ExternalCaseDerivedProjectionCurrent {
  readonly attachmentStatus: ExternalCaseStatus;
  readonly claimAmount: Prisma.Decimal;
  readonly receivedAmount: Prisma.Decimal;
  readonly notes: string | null;
}

export interface ExternalCaseDerivedProjectionNext {
  readonly receivedAmount: number;
  readonly attachmentStatus: ExternalCaseStatus;
  readonly closureReason: ExternalCaseClosureReason | null;
  readonly lastReceivedAt: Date;
  readonly notes: string;
}

/**
 * DEBTOR-EXTERNAL-CASE-STATUS-INTEGRITY-P1-I15-D2-I02 (OWNER D2 POLICY DECISION —
 * RATIFIED). `ExternalCase.attachmentStatus`'un TEK yazma yüzeyi. Üç giriş noktası:
 *
 * - `transitionManual` / `closeManual`: HTTP-facing, insan aktör (lawyer/staff),
 *   `bank-candidate-settlement-transition.service.ts:121-154` ile AYNI CAS deseni
 *   (updateMany + expectedStatus guard + count===0 → raced-read → idempotent-
 *   replay-veya-409). Sessiz overwrite YOK.
 * - `applySystemDerivedProjection`: hiçbir controller route'una bağlı DEĞİLDİR —
 *   yalnız `ThirdPartyService.addExternalCaseCollection()` çağırır (owner-ratified
 *   "canonical-Collection-writer-only" kuralı, bir permission check yerine
 *   ÇAĞRILABİLİRLİK ile enforce edilir). `updatedAt` optimistic-concurrency token'ı
 *   ile bounded retry — insan CAS'ından farklı olarak, çakışma tespit edilince
 *   409 DÖNMEZ, taze aggregate ile YENİDEN hesaplar (sistem her zaman doğru
 *   toplam değere yakınsamalı, insan onayına gerek yok).
 *
 * Yeni tarihçe tablosu YOK — `AuditService.logInTransaction` (C0-a, mevcut) reuse
 * edilir; mutation ile AYNI transaction içinde, hata yutmadan.
 */
@Injectable()
export class ExternalCaseStatusTransitionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly authority: ExternalCaseStatusAuthorityService,
    private readonly caseDebtorLifecycleGuard: CaseDebtorLifecycleGuardService,
  ) {}

  async transitionManual(
    tenantId: string,
    externalCaseId: string,
    dto: TransitionExternalCaseStatusDto,
    actorUserId: string,
  ) {
    if (!actorUserId?.trim()) {
      throw new BadRequestException({ code: "EXTERNAL_CASE_TRANSITION_ACTOR_REQUIRED" });
    }
    const rule = MANUAL_FACT_OR_PROCESS_TRANSITIONS.find(
      (r) => r.from === dto.expectedStatus && r.to === dto.targetStatus,
    );
    if (!rule) {
      throw new BadRequestException({
        code: "EXTERNAL_CASE_TRANSITION_ILLEGAL",
        message: `${dto.expectedStatus} -> ${dto.targetStatus} geçişi tanımlı değil`,
      });
    }

    const loaded = await this.loadForTenant(tenantId, externalCaseId);
    await this.caseDebtorLifecycleGuard.assertActiveByCaseDebtorId(tenantId, loaded.caseDebtorId);
    await this.authority.assertFactOrProcessTransitionAuthority(tenantId, loaded.caseId, actorUserId);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.externalCase.updateMany({
        where: { id: externalCaseId, tenantId, attachmentStatus: dto.expectedStatus },
        data: {
          attachmentStatus: dto.targetStatus,
          statusSource: "MANUAL",
          statusChangedBy: actorUserId,
          statusChangedAt: new Date(),
          statusOccurredAt: dto.statusOccurredAt ? new Date(dto.statusOccurredAt) : undefined,
          externalReference: dto.externalReference ?? undefined,
        },
      });

      if (updated.count === 0) {
        const current = await tx.externalCase.findFirst({ where: { id: externalCaseId, tenantId } });
        if (!current) throw new NotFoundException({ code: "EXTERNAL_CASE_NOT_FOUND" });
        if (current.attachmentStatus === dto.targetStatus) {
          return { status: "REPLAYED" as const, externalCase: current };
        }
        throw new ConflictException({
          code: "EXTERNAL_CASE_STATUS_TRANSITION_CONFLICT",
          message: "Dosya durumu beklenenden farklı; sayfayı yenileyip tekrar deneyin.",
          details: { actualStatus: current.attachmentStatus },
        });
      }

      await this.auditService.logInTransaction(tx, {
        tenantId,
        action: EXTERNAL_CASE_STATUS_TRANSITION_AUDIT_ACTION,
        entityType: "EXTERNAL_CASE",
        entityId: externalCaseId,
        userId: actorUserId,
        description: "ExternalCase durumu manuel olarak (fact/process) geçirildi.",
        metadata: {
          fromStatus: dto.expectedStatus,
          toStatus: dto.targetStatus,
          statusSource: "MANUAL",
          externalReference: dto.externalReference ?? null,
        },
      });

      const row = await tx.externalCase.findFirst({ where: { id: externalCaseId, tenantId } });
      return { status: "TRANSITIONED" as const, externalCase: row };
    });
  }

  async closeManual(
    tenantId: string,
    externalCaseId: string,
    dto: CloseExternalCaseDto,
    actorUserId: string,
  ) {
    if (!actorUserId?.trim()) {
      throw new BadRequestException({ code: "EXTERNAL_CASE_CLOSURE_ACTOR_REQUIRED" });
    }
    if (dto.expectedStatus === "KAPANDI") {
      throw new BadRequestException({
        code: "EXTERNAL_CASE_CLOSURE_ALREADY_CLOSED_EXPECTATION",
        message: "Dosya zaten kapalı bir durumdan tekrar kapatılamaz",
      });
    }
    // DEBTOR-EXTERNAL-CASE-STATUS-INTEGRITY-P1-I15-D2-I02: FULLY_COLLECTED yalnız
    // SYSTEM_DERIVED writer (tam tahsilat) tarafından üretilir — manuel kapatma
    // bu nedeni ASLA seçemez (schema.prisma enum yorumu ile birebir).
    if (dto.closureReason === ExternalCaseClosureReason.FULLY_COLLECTED) {
      throw new BadRequestException({
        code: "EXTERNAL_CASE_CLOSURE_REASON_RESERVED",
        message: "FULLY_COLLECTED yalnız sistem tarafından (tam tahsilat) üretilebilir; manuel kapatmada seçilemez",
      });
    }

    const loaded = await this.loadForTenant(tenantId, externalCaseId);
    await this.caseDebtorLifecycleGuard.assertActiveByCaseDebtorId(tenantId, loaded.caseDebtorId);
    await this.authority.assertManualClosureAuthority(tenantId, loaded.caseId, actorUserId);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.externalCase.updateMany({
        where: { id: externalCaseId, tenantId, attachmentStatus: dto.expectedStatus },
        data: {
          attachmentStatus: "KAPANDI",
          statusSource: "MANUAL",
          statusChangedBy: actorUserId,
          statusChangedAt: new Date(),
          statusOccurredAt: dto.statusOccurredAt ? new Date(dto.statusOccurredAt) : undefined,
          externalReference: dto.externalReference ?? undefined,
          closureReason: dto.closureReason,
        },
      });

      if (updated.count === 0) {
        const current = await tx.externalCase.findFirst({ where: { id: externalCaseId, tenantId } });
        if (!current) throw new NotFoundException({ code: "EXTERNAL_CASE_NOT_FOUND" });
        if (current.attachmentStatus === "KAPANDI" && current.closureReason === dto.closureReason) {
          return { status: "REPLAYED" as const, externalCase: current };
        }
        throw new ConflictException({
          code: "EXTERNAL_CASE_CLOSURE_CONFLICT",
          message: "Dosya durumu beklenenden farklı; sayfayı yenileyip tekrar deneyin.",
          details: { actualStatus: current.attachmentStatus, actualClosureReason: current.closureReason },
        });
      }

      await this.auditService.logInTransaction(tx, {
        tenantId,
        action: EXTERNAL_CASE_STATUS_TRANSITION_AUDIT_ACTION,
        entityType: "EXTERNAL_CASE",
        entityId: externalCaseId,
        userId: actorUserId,
        description: "ExternalCase manuel olarak avukat tarafından kapatıldı.",
        metadata: {
          fromStatus: dto.expectedStatus,
          toStatus: "KAPANDI",
          statusSource: "MANUAL",
          closureReason: dto.closureReason,
          externalReference: dto.externalReference ?? null,
        },
      });

      const row = await tx.externalCase.findFirst({ where: { id: externalCaseId, tenantId } });
      return { status: "TRANSITIONED" as const, externalCase: row };
    });
  }

  /**
   * SYSTEM_DERIVED projeksiyon — yalnız `ThirdPartyService.addExternalCaseCollection()`
   * çağırır (canonical Collection writer). `computeNext` sorumludur: aggregate
   * sorgusu (canonical Collection toplamı) TAM OLARAK kilit alındıktan sonra, bu
   * metodun içinden çağrılır — böylece hiçbir eşzamanlı yazar arada sıkışıp eski
   * bir toplamı kullanamaz.
   *
   * DEBTOR-EXTERNAL-CASE-STATUS-INTEGRITY-P1-I15-D2-I02 REVIZYON: ilk sürüm burada
   * `updatedAt` tabanlı optimistic-CAS + bounded (5) retry kullanıyordu. Gerçek CI'da
   * 10 eşzamanlı addExternalCaseCollection() çağrısıyla bazı denemeler 5 tur içinde
   * kazanamayıp ConflictException fırlattı (thundering-herd: N eşzamanlı yazar
   * birbirinin retry'ları ile de çakışabilir, yalnız "diğer N-1" ile değil). Optimistic
   * retry'nin doğası gereği SABİT bir üst sınır hiçbir zaman "asla başarısız olmaz"
   * garantisi VEREMEZ. Bunun yerine pessimistic `SELECT ... FOR UPDATE` kilidi
   * kullanılır: eşzamanlı çağrılar retry/çakışma YAŞAMAZ, yalnız aynı satırda
   * SERİLEŞİR (Postgres'in kendi lock-queue'su) — sınırsız yazar sayısında bile
   * kayıpsız yakınsama garantilidir, ConflictException hiç fırlatılmaz.
   */
  async applySystemDerivedProjection(
    tenantId: string,
    externalCaseId: string,
    computeNext: (
      current: ExternalCaseDerivedProjectionCurrent,
    ) => Promise<ExternalCaseDerivedProjectionNext>,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<ExternalCaseDerivedProjectionCurrent[]>(
        Prisma.sql`SELECT "attachmentStatus", "claimAmount", "receivedAmount", "notes"
          FROM "ExternalCase"
          WHERE "id" = ${externalCaseId} AND "tenantId" = ${tenantId}
          FOR UPDATE`,
      );
      const current = rows[0];
      if (!current) {
        throw new NotFoundException({ code: "EXTERNAL_CASE_NOT_FOUND" });
      }

      const next = await computeNext(current);
      const statusChanged = next.attachmentStatus !== current.attachmentStatus;

      await tx.externalCase.update({
        where: { id: externalCaseId },
        data: {
          receivedAmount: next.receivedAmount,
          attachmentStatus: next.attachmentStatus,
          lastReceivedAt: next.lastReceivedAt,
          notes: next.notes,
          ...(statusChanged
            ? {
                statusSource: "SYSTEM_DERIVED" as const,
                statusChangedAt: new Date(),
                statusChangedBy: null,
                closureReason: next.closureReason ?? undefined,
              }
            : {}),
        },
      });

      if (statusChanged) {
        await this.auditService.logInTransaction(tx, {
          tenantId,
          action: EXTERNAL_CASE_STATUS_TRANSITION_AUDIT_ACTION,
          entityType: "EXTERNAL_CASE",
          entityId: externalCaseId,
          description: "ExternalCase durumu sistem tarafından (canonical Collection kaydından) türetildi.",
          metadata: {
            fromStatus: current.attachmentStatus,
            toStatus: next.attachmentStatus,
            statusSource: "SYSTEM_DERIVED",
            closureReason: next.closureReason ?? null,
          },
        });
      }

      return tx.externalCase.findFirst({ where: { id: externalCaseId, tenantId } });
    });
  }

  private async loadForTenant(tenantId: string, externalCaseId: string): Promise<LoadedExternalCase> {
    const row = await this.prisma.externalCase.findFirst({
      where: { id: externalCaseId, tenantId },
      include: { caseDebtor: { include: { case: true } } },
    });
    if (!row?.caseDebtor?.case) {
      throw new NotFoundException({ code: "EXTERNAL_CASE_NOT_FOUND" });
    }
    return { caseDebtorId: row.caseDebtorId, caseId: row.caseDebtor.case.id };
  }
}
