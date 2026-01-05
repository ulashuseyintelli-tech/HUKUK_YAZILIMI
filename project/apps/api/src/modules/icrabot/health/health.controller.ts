/**
 * HEALTH CONTROLLER (v36)
 * 
 * Case Health ve UiMap Validation API endpoint'leri.
 */

import {
  Controller,
  Get,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { CaseHealthService } from './case-health.service';
import { UiMapValidatorService } from './uimap-validator.service';

@Controller('icrabot/case-health')
@UseGuards(JwtAuthGuard)
export class CaseHealthController {
  constructor(private caseHealthService: CaseHealthService) {}

  /**
   * GET /icrabot/case-health/:caseId
   * Dosya sağlık raporu
   */
  @Get(':caseId')
  async getCaseHealth(
    @CurrentUser() user: { tenantId: string },
    @Param('caseId') caseId: string,
  ) {
    const report = await this.caseHealthService.computeCaseHealth(
      user.tenantId,
      caseId,
    );

    return {
      ok: true,
      ...report,
    };
  }
}

@Controller('icrabot/uimap-validate')
@UseGuards(JwtAuthGuard)
export class UiMapValidateController {
  constructor(private uimapValidatorService: UiMapValidatorService) {}

  /**
   * GET /icrabot/uimap-validate/validate-active
   * Aktif UiMap bundle'ı doğrula
   */
  @Get('validate-active')
  async validateActive(
    @CurrentUser() user: { tenantId: string },
  ) {
    const report = await this.uimapValidatorService.validateActiveUiMap(
      user.tenantId,
    );

    return report;
  }
}
