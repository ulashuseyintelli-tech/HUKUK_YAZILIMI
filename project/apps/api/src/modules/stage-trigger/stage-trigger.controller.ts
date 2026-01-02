import { Controller, Post, Body, Param, UseGuards, Req } from '@nestjs/common';
import { StageTriggerService, TriggerStageParams } from './stage-trigger.service';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';

interface AuthRequest extends Request {
  user: { id: string; tenantId: string };
}

@Controller('cases/:caseId')
@UseGuards(AuthGuard('jwt'))
export class StageTriggerController {
  constructor(private readonly stageTriggerService: StageTriggerService) {}

  /**
   * Stage event tetikle
   * POST /cases/:caseId/stage-trigger
   */
  @Post('stage-trigger')
  async triggerStage(
    @Param('caseId') caseId: string,
    @Body() body: TriggerStageParams,
    @Req() req: AuthRequest,
  ) {
    return this.stageTriggerService.triggerStage(req.user.tenantId, caseId, body, req.user.id);
  }

  /**
   * UYAP'a gönderim hazırlığı
   * POST /cases/:caseId/uyap/prepare
   */
  @Post('uyap/prepare')
  async prepareForUyap(
    @Param('caseId') caseId: string,
    @Req() req: AuthRequest,
  ) {
    return this.stageTriggerService.prepareForUyap(req.user.tenantId, caseId, req.user.id);
  }

  /**
   * Bakiyeden düşerek işlem yap
   * POST /cases/:caseId/operations
   */
  @Post('operations')
  async executeOperation(
    @Param('caseId') caseId: string,
    @Body() body: {
      operationCode: string;
      amount: number;
      description?: string;
    },
    @Req() req: AuthRequest,
  ) {
    return this.stageTriggerService.triggerStage(req.user.tenantId, caseId, {
      eventCode: body.operationCode,
      params: {
        estimatedAmount: body.amount,
        notes: body.description,
      },
    }, req.user.id);
  }
}
