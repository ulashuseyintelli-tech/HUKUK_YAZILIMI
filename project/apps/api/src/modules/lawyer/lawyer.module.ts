import { Module } from "@nestjs/common";
import { LawyerController } from "./lawyer.controller";
import { LawyerService } from "./lawyer.service";
import { ActingLawyerResolverService } from "./acting-lawyer-resolver.service";
import { PrismaModule } from "@/prisma/prisma.module";
import { OfficeApprovalModule } from "../office-approval/office-approval.module";

// L1A: AuditService @Global (AuditModule) — ek import gerekmez. OfficeApprovalModule
// deactivate capability-gate (isApproverEligible) için gerekli.
// UYAP-ACTING-LAWYER-RESOLVER-I01: canonical acting-lawyer çözümlemesi Lawyer domain'ine aittir
// (UYAP-BC-OFFICE-001 — connector authority truth ÜRETMEZ, tüketir); tüketiciler export ile alır.
@Module({
  imports: [PrismaModule, OfficeApprovalModule],
  controllers: [LawyerController],
  providers: [LawyerService, ActingLawyerResolverService],
  exports: [LawyerService, ActingLawyerResolverService],
})
export class LawyerModule {}
