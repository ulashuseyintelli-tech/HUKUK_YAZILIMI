import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { InterestEngineModule } from "../interest-engine/interest-engine.module";
import { FinancialInputAdapter } from "./inputs/financial-input.adapter";
import { CaseSignalInputAdapter } from "./inputs/case-signal-input.adapter";
import { DebtorScoringService } from "./debtor-scoring.service";

/**
 * DEBTOR-SCORING-CANON Phase 2 / PR-2C — module registration.
 *
 * Controller/endpoint BİLİNÇLİ OLARAK YOK (Phase 3'ün işi). `DebtorScoringService`
 * export edilir ki gelecekteki bir controller/consumer onu import edebilsin;
 * bugün hiçbir modül bu modülü import etmiyor (dead-code-by-design, app.module.ts
 * kaydı hariç).
 */
@Module({
  imports: [PrismaModule, InterestEngineModule],
  providers: [FinancialInputAdapter, CaseSignalInputAdapter, DebtorScoringService],
  exports: [DebtorScoringService],
})
export class DebtorScoringModule {}
