import { Injectable } from "@nestjs/common";
import { FinancialInputAdapter } from "./inputs/financial-input.adapter";
import { CaseSignalInputAdapter } from "./inputs/case-signal-input.adapter";
import { calculateScore } from "./scoring-engine";
import { DebtorScoringResult, ScoringInput } from "./debtor-scoring.types";

/**
 * DEBTOR-SCORING-CANON Phase 2 / PR-2C — read-only skor orkestrasyonu.
 *
 * PR-2B'nin iki adaptörünü paralel çağırır, tek `ScoringInput` kurar ve
 * PR-2A'nın saf `calculateScore()` motorunu çağırır. Kendisi hiçbir Prisma
 * write yapmaz, `Case.riskScore`/`RiskReport` yazmaz, hiçbir consumer/cron/
 * endpoint'e bağlı değildir (Phase 2'de dead-code-by-design; Phase 3'ün
 * endpoint/consumer-switch işi burayı ÇAĞIRMAYA başlar, bu dosya değişmez).
 *
 * `asOf` bilinçli olarak ZORUNLU parametre — `CaseBalanceService.computeCaseBalance`
 * ile aynı desen (bkz. `InterestEngineController.getCaseBalance`: "şimdi" kararı
 * yalnız controller/çağıran katmanda verilir). Bu servis sistem saatini OKUMAZ;
 * determinizm/testability zinciri motor→adaptör→orkestrasyon boyunca korunur.
 *
 * <remarks>
 * Çağrıldığı yerler: HENÜZ YOK (Phase 3 endpoint/consumer-switch işi).
 * </remarks>
 */
@Injectable()
export class DebtorScoringService {
  constructor(
    private readonly financialInput: FinancialInputAdapter,
    private readonly caseSignalInput: CaseSignalInputAdapter,
  ) {}

  async calculateCaseScore(tenantId: string, caseId: string, asOf: string): Promise<DebtorScoringResult> {
    const [financialResult, signalResult] = await Promise.all([
      this.financialInput.build(tenantId, caseId, asOf),
      this.caseSignalInput.build(tenantId, caseId),
    ]);

    const input: ScoringInput = {
      tenantId,
      caseId,
      asOf,
      financial: financialResult.financial,
      asset: signalResult.asset,
      caseSignals: signalResult.caseSignals,
      service: signalResult.service,
      warnings: [...financialResult.warnings, ...signalResult.warnings],
    };

    return calculateScore(input);
  }
}
