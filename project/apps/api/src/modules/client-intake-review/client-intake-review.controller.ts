import { Controller, Get, Post, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { ClientIntakeSubmissionStatus } from '@prisma/client';
import { ClientIntakeReviewService } from './client-intake-review.service';
import { ReviewFieldDto, BulkReviewFieldsDto, ReviewTransitionDto } from './dto/client-intake-review.dto';
import { AuditService } from '../audit/audit.service';
import {
  CLIENT_WORKSPACE_COMMAND,
  ClientWorkspaceCommandType,
  runAuthorizedClientWorkspaceCommand,
} from '../client/client-workspace-command-authority';
import { ClientIntakeReviewAuthorizationService } from './client-intake-review-authorization.service';

interface AuthRequest extends Request {
  user: { id: string; tenantId: string; role?: string };
}

/**
 * Client Intake Review Queue controller (Faz 4.5) — personel/JWT.
 * Yalnız inceleme/lifecycle işaretler. PROMOTE endpoint'i YOK (4.6). Kanoniğe yazım YOK.
 */
@Controller()
@UseGuards(AuthGuard('jwt'))
export class ClientIntakeReviewController {
  constructor(
    private readonly service: ClientIntakeReviewService,
    private readonly reviewAuthorization: ClientIntakeReviewAuthorizationService,
    private readonly audit: AuditService,
  ) {}

  /**
   * X3-B04 — frozen C2 review-authority primitive tüketim noktası.
   *
   * Promotion eligibility bilinçli olarak `false` callback'idir: C2'nin review sınıfı
   * bunu hiç çağırmaz; mapping drift ederse review fail-closed kalır, promotion yetkisi
   * review'a sızmaz.
   *
   * @remarks Çağrıldığı yerler: claim, reject, bulkReview ve reviewField mutation'ları.
   */
  private runReviewCommand<T>(
    req: AuthRequest,
    clientId: string,
    commandType: ClientWorkspaceCommandType,
    execute: () => Promise<T>,
  ): Promise<T> {
    return runAuthorizedClientWorkspaceCommand(
      {
        isApproverEligible: async () => false,
        isIntakeReviewAuthorized: (userId, tenantId) =>
          this.reviewAuthorization.isAuthorized(userId, tenantId),
        auditLog: (input) => this.audit.log(input),
      },
      { userId: req.user.id, tenantId: req.user.tenantId, role: req.user.role },
      { tenantId: req.user.tenantId, clientId, commandType },
      execute,
      (result) => ({ status: (result as { status?: string })?.status ?? null }),
    );
  }

  /** Kuyruk listesi (default CLIENT_SUBMITTED+IN_REVIEW) — GET /client-intake-submissions?status=&caseId= */
  @Get('client-intake-submissions')
  async listQueue(
    @Req() req: AuthRequest,
    @Query('status') status?: ClientIntakeSubmissionStatus,
    @Query('caseId') caseId?: string,
  ) {
    return this.service.listQueue(req.user.tenantId, { status, caseId });
  }

  /** Detay + alanlar — GET /client-intake-submissions/:id */
  @Get('client-intake-submissions/:id')
  async getOne(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.service.getOne(req.user.tenantId, id);
  }

  /** İncelemeyi üstlen (CLIENT_SUBMITTED → IN_REVIEW) — POST /client-intake-submissions/:id/claim */
  @Post('client-intake-submissions/:id/claim')
  async claim(@Req() req: AuthRequest, @Param('id') id: string) {
    const target = await this.service.getCommandTargetBySubmission(req.user.tenantId, id);
    return this.runReviewCommand(
      req,
      target.clientId,
      CLIENT_WORKSPACE_COMMAND.INTAKE_REVIEW_CLAIM,
      () => this.service.claim(req.user.tenantId, id, req.user.id),
    );
  }

  /** Gönderimi reddet — POST /client-intake-submissions/:id/reject */
  @Post('client-intake-submissions/:id/reject')
  async reject(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: ReviewTransitionDto) {
    const target = await this.service.getCommandTargetBySubmission(req.user.tenantId, id);
    return this.runReviewCommand(
      req,
      target.clientId,
      CLIENT_WORKSPACE_COMMAND.INTAKE_REVIEW_SUBMISSION_REJECT,
      () => this.service.rejectSubmission(req.user.tenantId, id, req.user.id, body.note),
    );
  }

  /** Toplu field review (aynı submission) — POST /client-intake-submissions/:id/fields/bulk-review */
  @Post('client-intake-submissions/:id/fields/bulk-review')
  async bulkReview(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: BulkReviewFieldsDto) {
    const target = await this.service.getCommandTargetBySubmission(req.user.tenantId, id);
    return this.runReviewCommand(
      req,
      target.clientId,
      CLIENT_WORKSPACE_COMMAND.INTAKE_REVIEW_FIELD_DECIDE,
      () =>
        this.service.bulkReviewFields(
          req.user.tenantId,
          id,
          req.user.id,
          dto.fieldIds,
          dto.decision,
          dto.note,
        ),
    );
  }

  /** Tek alan review — POST /client-intake-fields/:fieldId/review */
  @Post('client-intake-fields/:fieldId/review')
  async reviewField(@Req() req: AuthRequest, @Param('fieldId') fieldId: string, @Body() dto: ReviewFieldDto) {
    const target = await this.service.getCommandTargetByField(req.user.tenantId, fieldId);
    return this.runReviewCommand(
      req,
      target.clientId,
      CLIENT_WORKSPACE_COMMAND.INTAKE_REVIEW_FIELD_DECIDE,
      () =>
        this.service.reviewField(
          req.user.tenantId,
          fieldId,
          req.user.id,
          dto.decision,
          dto.note,
        ),
    );
  }
}
