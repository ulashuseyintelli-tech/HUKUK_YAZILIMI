import { Test } from "@nestjs/testing";
import { PrismaService } from "../../../prisma/prisma.service";
import { CaseBalanceService } from "../../interest-engine/orchestration/case-balance.service";
import { DebtorScoringModule } from "../debtor-scoring.module";
import { DebtorScoringService } from "../debtor-scoring.service";

/**
 * DEBTOR-SCORING PR-2C — module registration smoke testi.
 *
 * `DebtorScoringModule`'ün gerçek NestJS DI grafiğinde derlenip
 * `DebtorScoringService`'i çözebildiğini kanıtlar. `PrismaModule`/
 * `InterestEngineModule` bağımlılıklarını gerçek kurmak yerine (ağır,
 * disposable-DB gerektirir) `CaseBalanceService` ve `PrismaService`
 * override edilir — yalnız DI KABLOLAMASI test edilir, davranış değil
 * (davranış zaten PR-2A/2B/2C'nin diğer spec'lerinde kanıtlı).
 */
describe("DebtorScoringModule (PR-2C — DI wiring smoke test)", () => {
  it("modül derlenir ve DebtorScoringService çözülebilir", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DebtorScoringModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(CaseBalanceService)
      .useValue({ computeCaseBalance: jest.fn() })
      .compile();

    const service = moduleRef.get(DebtorScoringService);
    expect(service).toBeInstanceOf(DebtorScoringService);

    await moduleRef.close();
  });
});
