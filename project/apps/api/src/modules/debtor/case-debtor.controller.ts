import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from "@nestjs/common";
import { CaseDebtorService } from "./case-debtor.service";
import { AddDebtorToCaseDto, UpdateCaseDebtorDto } from "./dto/case-debtor.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

@Controller()
@UseGuards(JwtAuthGuard)
export class CaseDebtorController {
  constructor(private caseDebtorService: CaseDebtorService) {}

  // ==================== CASE DEBTORS ====================

  @Get("cases/:caseId/debtors")
  getCaseDebtors(
    @CurrentUser("tenantId") tenantId: string,
    @Param("caseId") caseId: string
  ) {
    return this.caseDebtorService.getCaseDebtors(tenantId, caseId);
  }

  @Get("cases/:caseId/debtors/statistics")
  getCaseDebtorStatistics(
    @CurrentUser("tenantId") tenantId: string,
    @Param("caseId") caseId: string
  ) {
    return this.caseDebtorService.getCaseDebtorStatistics(tenantId, caseId);
  }

  @Post("cases/:caseId/debtors")
  addDebtorToCase(
    @CurrentUser("tenantId") tenantId: string,
    @Param("caseId") caseId: string,
    @Body() dto: AddDebtorToCaseDto
  ) {
    return this.caseDebtorService.addDebtorToCase(tenantId, caseId, dto);
  }

  @Post("cases/:caseId/debtors/bulk")
  addMultipleDebtorsToCase(
    @CurrentUser("tenantId") tenantId: string,
    @Param("caseId") caseId: string,
    @Body() debtors: AddDebtorToCaseDto[]
  ) {
    return this.caseDebtorService.addMultipleDebtorsToCase(tenantId, caseId, debtors);
  }

  @Put("case-debtors/:id")
  updateCaseDebtor(
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string,
    @Body() dto: UpdateCaseDebtorDto
  ) {
    return this.caseDebtorService.updateCaseDebtor(tenantId, id, dto);
  }

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - CaseDebtorController.removeCaseDebtor() → DELETE /case-debtors/:id (dosya borçlusunu aktif işlem öznesi olmaktan çıkarır)
  /// </remarks>
  @Delete("case-debtors/:id")
  removeCaseDebtor(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") currentUserId: string | undefined,
    @Param("id") id: string
  ) {
    return this.caseDebtorService.removeCaseDebtor(tenantId, id, currentUserId);
  }
}
