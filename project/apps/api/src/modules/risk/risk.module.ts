import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { RiskService } from "./risk.service";
import { RiskController } from "./risk.controller";
import { CaseViewScopeModule } from "../case/case-view-scope.module";

@Module({
  imports: [CaseViewScopeModule, PrismaModule],
  controllers: [RiskController],
  providers: [RiskService],
  exports: [RiskService],
})
export class RiskModule {}
