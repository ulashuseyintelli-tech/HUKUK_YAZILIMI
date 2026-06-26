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
import { GuidedOpenObserveService } from "../permission-diagnostics/guided-open-observe.service";
import { ActionCode } from "../policy-engine/types/action-code.enum";

@Controller()
@UseGuards(JwtAuthGuard)
export class CaseDebtorController {
  constructor(
    private caseDebtorService: CaseDebtorService,
    // P2b-2b-1: EDIT_PARTIES Guided-Open observe adapter (diagnostic only; engelleme YOK)
    private guidedOpenObserve: GuidedOpenObserveService,
  ) {}

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
  async addDebtorToCase(
    @CurrentUser("id") userId: string,
    @CurrentUser("tenantId") tenantId: string,
    @Param("caseId") caseId: string,
    @Body() dto: AddDebtorToCaseDto
  ) {
    // P2b-2b-1 EDIT_PARTIES observe (PRE-action; JwtAuthGuard'dan SONRA; engelleme YOK, response/DTO değişmez).
    // GİZLİLİK: dto observe'a GEÇMEZ (yalnız actionCode + caseId). Best-effort (observe ASLA throw etmez).
    await this.guidedOpenObserve.observe({
      actorUserId: userId,
      tenantId,
      caseId,
      actionCode: ActionCode.EDIT_PARTIES,
    });
    return this.caseDebtorService.addDebtorToCase(tenantId, caseId, dto);
  }

  @Post("cases/:caseId/debtors/bulk")
  async addMultipleDebtorsToCase(
    @CurrentUser("id") userId: string,
    @CurrentUser("tenantId") tenantId: string,
    @Param("caseId") caseId: string,
    @Body() debtors: AddDebtorToCaseDto[]
  ) {
    // P2b-2b-1 EDIT_PARTIES observe (PRE-action; engelleme YOK). GİZLİLİK: debtors[] observe'a GEÇMEZ.
    await this.guidedOpenObserve.observe({
      actorUserId: userId,
      tenantId,
      caseId,
      actionCode: ActionCode.EDIT_PARTIES,
    });
    return this.caseDebtorService.addMultipleDebtorsToCase(tenantId, caseId, debtors);
  }

  @Put("case-debtors/:id")
  async updateCaseDebtor(
    @CurrentUser("id") userId: string,
    @CurrentUser("tenantId") tenantId: string,
    @Param("id") id: string,
    @Body() dto: UpdateCaseDebtorDto
  ) {
    // P2b-2b-1 EDIT_PARTIES observe (PRE-action; engelleme YOK). caseId path'te YOK → hedef = caseDebtorId
    // (opts.targetRef); EKSTRA DB OKUMASI YAPILMAZ. GİZLİLİK: dto observe'a GEÇMEZ.
    await this.guidedOpenObserve.observe(
      { actorUserId: userId, tenantId, actionCode: ActionCode.EDIT_PARTIES },
      { targetRef: id },
    );
    return this.caseDebtorService.updateCaseDebtor(tenantId, id, dto);
  }

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - CaseDebtorController.removeCaseDebtor() → DELETE /case-debtors/:id (dosya borçlusunu aktif işlem öznesi olmaktan çıkarır)
  /// P2b-2b-1: PRE-action EDIT_PARTIES observe eklendi (diagnostic only; mutation davranışı/response değişmedi).
  /// </remarks>
  @Delete("case-debtors/:id")
  async removeCaseDebtor(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") currentUserId: string | undefined,
    @Param("id") id: string
  ) {
    // P2b-2b-1 EDIT_PARTIES observe (PRE-action). Truthful actor VARSA observe et (synthesize YOK);
    // caseId path'te yok → targetRef = caseDebtorId. Best-effort; mutation engellenmez.
    if (currentUserId) {
      await this.guidedOpenObserve.observe(
        { actorUserId: currentUserId, tenantId, actionCode: ActionCode.EDIT_PARTIES },
        { targetRef: id },
      );
    }
    return this.caseDebtorService.removeCaseDebtor(tenantId, id, currentUserId);
  }
}
