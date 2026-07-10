import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import { filterConfirmedCollections } from "../../../common/collection-confirmed.util";
import {
  AssetChannelSignal,
  ScoringAssetInput,
  ScoringCaseSignals,
  ScoringServiceInput,
  ServiceStatusSignal,
  WorkflowStageSignal,
} from "../debtor-scoring.types";

export interface CaseSignalInputResult {
  caseSignals: ScoringCaseSignals;
  asset: ScoringAssetInput;
  service: ScoringServiceInput;
  warnings: string[];
}

interface ActiveDebtorRow {
  role: string;
  serviceStatus: string;
  assetVehicle: string;
  assetRealEstate: string;
  assetBank: string;
  assetSgkWage: string;
}

function pickMostInformative(values: string[]): AssetChannelSignal {
  if (values.includes("YES")) return "YES";
  if (values.includes("NO")) return "NO";
  if (values.includes("PENDING")) return "PENDING";
  if (values.includes("ERROR")) return "ERROR";
  return "UNKNOWN";
}

/**
 * DEBTOR-SCORING-CANON Phase 2 / PR-2B — kanonik dosya/borçlu sinyal adaptörü.
 *
 * `CaseDebtor.asset*` (AssetQueryStatus) + `serviceStatus`, `Tebligat` varlık
 * kontrolü, `Case.lifecycleEvents` (itiraz), CONFIRMED tahsilat recency ve
 * `Case.createdAt`/`workflowStage`. Manuel borçlu-düzeyi el etiketi, manuel
 * dosya-düzeyi el etiketi, operasyonel bildirim kuyruğu ve dormant v4
 * skorlama motorunun girdisi HİÇBİR ZAMAN okunmaz/sorgulanmaz.
 *
 * Co-borçlu tekilleştirme (owner tarafından açıkça belirtilmemiş, adaptör-içi
 * karar — Bölüm 12 Case-level v1 kararıyla uyumlu): yalnız ACTIVE CaseDebtor
 * satırları kullanılır; her varlık kanalı için "herhangi biri YES/NO" en
 * bilgilendirici sinyal kazanır (F1'in "any debtor" desenine paralel);
 * servis-durumu için ASIL_BORCLU rolü tercih edilir, yoksa ilk aktif borçlu.
 * Birden fazla aktif co-borçlu varsa `warnings`'e açıkça not düşülür.
 *
 * <remarks>
 * Çağrıldığı yerler:
 * - (PR-2C) DebtorScoringService.calculateCaseScore() -> ScoringInput.caseSignals/
 *   asset/service alanlarını doldurmak için çağırır. PR-2B'de henüz caller yoktur.
 * </remarks>
 */
@Injectable()
export class CaseSignalInputAdapter {
  constructor(private readonly prisma: PrismaService) {}

  async build(tenantId: string, caseId: string): Promise<CaseSignalInputResult> {
    const caseRow = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
      select: { createdAt: true, workflowStage: true },
    });
    if (!caseRow) {
      throw new NotFoundException("Case not found");
    }

    const warnings: string[] = [];

    const [activeDebtors, tebligatCount, collections, objectionEvent] = await Promise.all([
      this.prisma.caseDebtor.findMany({
        where: { caseId, case: { tenantId }, lifecycleStatus: "ACTIVE" },
        select: {
          role: true,
          serviceStatus: true,
          assetVehicle: true,
          assetRealEstate: true,
          assetBank: true,
          assetSgkWage: true,
        },
      }) as Promise<ActiveDebtorRow[]>,
      this.prisma.tebligat.count({ where: { caseId, tenantId } }),
      this.prisma.collection.findMany({
        where: { caseId, tenantId },
        select: { amount: true, status: true, date: true },
      }),
      this.prisma.caseLifecycle.findFirst({
        where: { caseId, case: { tenantId }, stage: "OBJECTION" },
        select: { id: true },
      }),
    ]);

    if (activeDebtors.length === 0) {
      warnings.push(
        "CaseSignalInputAdapter: aktif CaseDebtor bulunamadı — asset UNKNOWN, service NOT_AVAILABLE döndürülüyor",
      );
    } else if (activeDebtors.length > 1) {
      warnings.push(
        `CaseSignalInputAdapter: ${activeDebtors.length} aktif co-borçlu bulundu — asset kanalları "herhangi biri YES/NO" ve service birincil borçlu (ASIL_BORCLU tercihli) kuralıyla tekilleştirildi`,
      );
    }

    const asset: ScoringAssetInput =
      activeDebtors.length === 0
        ? { source: "NOT_AVAILABLE", vehicle: "UNKNOWN", realEstate: "UNKNOWN", bank: "UNKNOWN", sgkWage: "UNKNOWN" }
        : {
            source: "CASE_DEBTOR_FIELDS",
            vehicle: pickMostInformative(activeDebtors.map((d) => d.assetVehicle)),
            realEstate: pickMostInformative(activeDebtors.map((d) => d.assetRealEstate)),
            bank: pickMostInformative(activeDebtors.map((d) => d.assetBank)),
            sgkWage: pickMostInformative(activeDebtors.map((d) => d.assetSgkWage)),
          };

    const service: ScoringServiceInput =
      tebligatCount === 0
        ? { source: "NOT_AVAILABLE", serviceStatus: "UNKNOWN" }
        : {
            source: "TEBLIGAT",
            serviceStatus:
              ((activeDebtors.find((d) => d.role === "ASIL_BORCLU") ?? activeDebtors[0])
                ?.serviceStatus as ServiceStatusSignal) ?? "UNKNOWN",
          };

    const confirmed = filterConfirmedCollections(collections);
    const lastConfirmedPaymentAt =
      confirmed.length > 0
        ? confirmed
            .reduce((latest, c) => (c.date > latest ? c.date : latest), confirmed[0].date)
            .toISOString()
        : null;

    const caseSignals: ScoringCaseSignals = {
      createdAt: caseRow.createdAt.toISOString(),
      workflowStage: caseRow.workflowStage as WorkflowStageSignal,
      hasObjection: objectionEvent !== null,
      lastConfirmedPaymentAt,
    };

    return { caseSignals, asset, service, warnings };
  }
}
