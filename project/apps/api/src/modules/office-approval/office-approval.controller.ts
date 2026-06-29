import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { OfficeApprovalService } from './office-approval.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OfficeApprovalStatus } from '@prisma/client';
import {
  ApproveOfficeApprovalDto,
  RejectOfficeApprovalDto,
  RequestRevisionOfficeApprovalDto,
  ApproveWithChangesOfficeApprovalDto,
  toSummaryDto,
  toDetailDto,
} from './dto/office-approval.dto';

// P4-4 — OfficeApprovalController (Inbox / Approve API). KESİN (Ulaş kilidi):
//  - DECISION-ONLY: approve/reject/revision/approve-with-changes/cancel yalnız STATUS GEÇİŞİ yapar; EXECUTION TETİKLEMEZ
//    (executionStatus NOT_RUN kalır; deferred execution P4-5). markExecution* PUBLIC ROUTE EDİLMEZ (executor-internal).
//  - Yetki/guard SERVİS-İÇİNDE (assertApproverEligible/self-approval/PENDING/tenant); controller truthful-actor adapter (actor=@CurrentUser, body.userId YOK SAYILIR).
//  - READ tenant-scoped: inbox/mine tenant filtreli; detail getByIdForTenant (çapraz-tenant→404) + görünürlük (requester ∨ eligible-approver).
//  - Yanıt her zaman { success, data: toSummaryDto/toDetailDto } — raw Prisma entity ASLA dönmez. AuditLog'a ham alan girmez (servis hash-only).
//
// /// <remarks>
// /// Çağrıldığı yerler (HTTP, frontend inbox UI SONRA):
// ///  GET  /office-approvals/inbox · GET /office-approvals/mine · GET /office-approvals/:id
// ///  POST /office-approvals/:id/{approve,reject,request-revision,approve-with-changes,cancel}
// /// </remarks>

const VALID_STATUSES = new Set<string>(Object.values(OfficeApprovalStatus));
function parseStatus(raw?: string): OfficeApprovalStatus | undefined {
  if (raw === undefined || raw === '') return undefined;
  if (!VALID_STATUSES.has(raw)) {
    throw new BadRequestException(`Geçersiz status değeri: ${raw}`);
  }
  return raw as OfficeApprovalStatus;
}

@Controller('office-approvals')
@UseGuards(JwtAuthGuard)
export class OfficeApprovalController {
  constructor(private readonly service: OfficeApprovalService) {}

  // Inbox — approver'ın eyleme geçebileceği bekleyenler (KENDİ talepleri hariç). Yetkisiz → boş liste (403 DEĞİL).
  @Get('inbox')
  async inbox(
    @CurrentUser('id') actorUserId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Query('status') status?: string,
  ) {
    if (!(await this.service.isApproverEligible(actorUserId, tenantId))) {
      return { success: true, data: [] }; // yetki yok → boş liste; sınır = tenant + eligibility (ifşa yok)
    }
    const rows = await this.service.listForTenant(tenantId, {
      view: 'inbox',
      callerUserId: actorUserId,
      status: parseStatus(status),
    });
    return { success: true, data: rows.map(toSummaryDto) };
  }

  // Mine — caller'ın KENDİ talepleri (tüm statüler; her authenticated kullanıcı, kendi tenant'ı).
  @Get('mine')
  async mine(
    @CurrentUser('id') actorUserId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Query('status') status?: string,
  ) {
    const rows = await this.service.listForTenant(tenantId, {
      view: 'mine',
      callerUserId: actorUserId,
      status: parseStatus(status),
    });
    return { success: true, data: rows.map(toSummaryDto) };
  }

  // Detail — tenant-scoped (çapraz-tenant→404) + görünürlük: requester ∨ eligible-approver; aksi → 404 (existence-oracle yok).
  @Get(':id')
  async detail(
    @CurrentUser('id') actorUserId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    const req = await this.service.getByIdForTenant(id, tenantId); // çapraz-tenant → 404
    const isRequester = req.requesterUserId === actorUserId;
    if (!isRequester && !(await this.service.isApproverEligible(actorUserId, tenantId))) {
      throw new NotFoundException('Onay talebi bulunamadı.'); // ilgisiz aynı-tenant kullanıcı → 404
    }
    // Ulaş kilidi: DETAIL ham savedIntent + replacementSavedIntent + decisionNote EXPOSE (approver gördüğünü onaylar).
    return { success: true, data: toDetailDto(req) };
  }

  // Approve — status→APPROVED; EXECUTION TETİKLEMEZ (executionStatus NOT_RUN kalır → P4-5).
  @Post(':id/approve')
  async approve(
    @CurrentUser('id') actorUserId: string,
    @Param('id') id: string,
    @Body() dto: ApproveOfficeApprovalDto,
  ) {
    const r = await this.service.approve(id, actorUserId, dto.note);
    return { success: true, data: toDetailDto(r) };
  }

  // Reject — gerekçe ZORUNLU (DTO @MinLength + servis throw).
  @Post(':id/reject')
  async reject(
    @CurrentUser('id') actorUserId: string,
    @Param('id') id: string,
    @Body() dto: RejectOfficeApprovalDto,
  ) {
    const r = await this.service.reject(id, actorUserId, dto.note);
    return { success: true, data: toDetailDto(r) };
  }

  // Request-revision — revizyon notu ZORUNLU; REVISION_REQUESTED ≠ REJECTED.
  @Post(':id/request-revision')
  async requestRevision(
    @CurrentUser('id') actorUserId: string,
    @Param('id') id: string,
    @Body() dto: RequestRevisionOfficeApprovalDto,
  ) {
    const r = await this.service.requestRevision(id, actorUserId, dto.note);
    return { success: true, data: toDetailDto(r) };
  }

  // Approve-with-changes — replacementSavedIntent ZORUNLU (opaque); orijinal savedIntent ASLA ezilmez; status→APPROVED_WITH_CHANGES, execution YOK.
  @Post(':id/approve-with-changes')
  async approveWithChanges(
    @CurrentUser('id') actorUserId: string,
    @Param('id') id: string,
    @Body() dto: ApproveWithChangesOfficeApprovalDto,
  ) {
    const r = await this.service.approveWithChanges(id, actorUserId, dto.replacementSavedIntent, dto.note);
    return { success: true, data: toDetailDto(r) };
  }

  // Cancel — YALNIZ requester (servis ForbiddenException ile enforce); PENDING dışında 409. Execution yok.
  @Post(':id/cancel')
  async cancel(@CurrentUser('id') actorUserId: string, @Param('id') id: string) {
    const r = await this.service.cancel(id, actorUserId);
    return { success: true, data: toDetailDto(r) };
  }
}
