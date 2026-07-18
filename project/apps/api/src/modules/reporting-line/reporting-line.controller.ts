import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ReportingLineService } from "./reporting-line.service";
import { AssignManagerDto, ActorRefDto } from "./dto/reporting-line.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AdminGuard } from "../auth/guards/admin.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

/**
 * ReportingLine Population Core yönetim yüzeyi — tenant ADMIN yalnız.
 * Backend authorization AdminGuard ile (JwtAuthGuard sonrası); servis ayrıca
 * defense-in-depth ADMIN kontrolü yapar. Bu yüzey object-scope enforcement
 * AKTİVE ETMEZ.
 */
@Controller("reporting-lines")
@UseGuards(JwtAuthGuard, AdminGuard)
export class ReportingLineController {
  constructor(private reportingLineService: ReportingLineService) {}

  @Get()
  list(@CurrentUser("tenantId") tenantId: string) {
    return this.reportingLineService.listActive(tenantId);
  }

  @Get("eligible")
  eligible(@CurrentUser("tenantId") tenantId: string) {
    return this.reportingLineService.listEligible(tenantId);
  }

  @Get("reconciliation")
  reconciliation(@CurrentUser("tenantId") tenantId: string) {
    return this.reportingLineService.reconciliation(tenantId);
  }

  @Post("assign")
  assign(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") userId: string,
    @CurrentUser("role") role: string,
    @Body() dto: AssignManagerDto,
  ) {
    return this.reportingLineService.assignManager(tenantId, userId, role, dto);
  }

  @Post("end")
  end(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") userId: string,
    @CurrentUser("role") role: string,
    @Body() dto: ActorRefDto,
  ) {
    return this.reportingLineService.endRelationship(tenantId, userId, role, dto);
  }

  @Post("top-level")
  topLevel(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") userId: string,
    @CurrentUser("role") role: string,
    @Body() dto: ActorRefDto,
  ) {
    return this.reportingLineService.markTopLevel(tenantId, userId, role, dto);
  }
}
