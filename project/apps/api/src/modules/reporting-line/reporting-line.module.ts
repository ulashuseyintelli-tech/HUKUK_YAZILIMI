import { Module } from "@nestjs/common";
import { ReportingLineService } from "./reporting-line.service";
import { ReportingLineController } from "./reporting-line.controller";

/**
 * ReportingLine Population Core — CAP-02 object-scope enablement.
 * PrismaModule ve AuditModule @Global olduğundan ayrıca import gerekmez.
 */
@Module({
  controllers: [ReportingLineController],
  providers: [ReportingLineService],
  exports: [ReportingLineService],
})
export class ReportingLineModule {}
