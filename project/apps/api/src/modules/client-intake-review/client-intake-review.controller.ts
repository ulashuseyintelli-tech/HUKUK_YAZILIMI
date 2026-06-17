import { Controller, Get, Post, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { ClientIntakeSubmissionStatus } from '@prisma/client';
import { ClientIntakeReviewService } from './client-intake-review.service';
import { ReviewFieldDto, BulkReviewFieldsDto, ReviewTransitionDto } from './dto/client-intake-review.dto';

interface AuthRequest extends Request {
  user: { id: string; tenantId: string };
}

/**
 * Client Intake Review Queue controller (Faz 4.5) — personel/JWT.
 * Yalnız inceleme/lifecycle işaretler. PROMOTE endpoint'i YOK (4.6). Kanoniğe yazım YOK.
 */
@Controller()
@UseGuards(AuthGuard('jwt'))
export class ClientIntakeReviewController {
  constructor(private readonly service: ClientIntakeReviewService) {}

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
    return this.service.claim(req.user.tenantId, id, req.user.id);
  }

  /** Gönderimi reddet — POST /client-intake-submissions/:id/reject */
  @Post('client-intake-submissions/:id/reject')
  async reject(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: ReviewTransitionDto) {
    return this.service.rejectSubmission(req.user.tenantId, id, req.user.id, body.note);
  }

  /** Toplu field review (aynı submission) — POST /client-intake-submissions/:id/fields/bulk-review */
  @Post('client-intake-submissions/:id/fields/bulk-review')
  async bulkReview(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: BulkReviewFieldsDto) {
    return this.service.bulkReviewFields(req.user.tenantId, id, req.user.id, dto.fieldIds, dto.decision, dto.note);
  }

  /** Tek alan review — POST /client-intake-fields/:fieldId/review */
  @Post('client-intake-fields/:fieldId/review')
  async reviewField(@Req() req: AuthRequest, @Param('fieldId') fieldId: string, @Body() dto: ReviewFieldDto) {
    return this.service.reviewField(req.user.tenantId, fieldId, req.user.id, dto.decision, dto.note);
  }
}
