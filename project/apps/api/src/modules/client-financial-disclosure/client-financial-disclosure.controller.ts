import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  isDisclosurePublicationEnabled,
  isDisclosureWriteEnabled,
} from './client-financial-disclosure-activation';
import { ClientFinancialDisclosureApprovalService } from './client-financial-disclosure-approval.service';
import { ClientFinancialDisclosureOfficeService } from './client-financial-disclosure-office-service';
import { ClientFinancialDisclosurePublicationService } from './client-financial-disclosure-publication.service';
import { ClientFinancialDisclosureOfficeQueryDto } from './dto/client-financial-disclosure-office.dto';
import {
  CompleteDisclosureOfficeApprovalDto,
  RequestDisclosureContentApprovalDto,
  ReverseClientFinancialDisclosureDto,
  SupersedeClientFinancialDisclosureDto,
} from './dto/client-financial-disclosure.dto';

/**
 * Financial Disclosure approval/publication HTTP adapter.
 *
 * Bu controller yalnız JWT'den gelen tenant/actor bağlamını ve strict activation gate'lerini
 * mevcut domain servislerine taşır. Yeterlilik, four-eyes, stale snapshot, tenant/object scope,
 * provider allowlist ve conditional-update kuralları servislerin canonical uygulamasında kalır.
 */
@Controller('client-financial-disclosures')
@UseGuards(JwtAuthGuard)
export class ClientFinancialDisclosureController {
  constructor(
    private readonly approval: ClientFinancialDisclosureApprovalService,
    private readonly publication: ClientFinancialDisclosurePublicationService,
    private readonly office: ClientFinancialDisclosureOfficeService,
  ) {}

  /**
   * Cagrildigi yerler:
   * - Office FD workspace -> GET /client-financial-disclosures/office/clients/:clientId
   */
  @Get('office/clients/:clientId')
  getOfficeList(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Param('clientId') clientId: string,
    @Query() query: ClientFinancialDisclosureOfficeQueryDto,
  ) {
    return this.office.getList({ tenantId, actorUserId, clientId, caseId: query.caseId });
  }

  /**
   * Cagrildigi yerler:
   * - Office FD workspace preparation -> GET /client-financial-disclosures/office/clients/:clientId/preparation-sources
   */
  @Get('office/clients/:clientId/preparation-sources')
  getOfficePreparationSources(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Param('clientId') clientId: string,
    @Query() query: ClientFinancialDisclosureOfficeQueryDto,
  ) {
    return this.office.getPreparationSources({
      tenantId,
      actorUserId,
      clientId,
      caseId: query.caseId,
    });
  }

  /**
   * Cagrildigi yerler:
   * - Office FD workspace detail -> GET /client-financial-disclosures/office/clients/:clientId/versions/:disclosureVersionId
   */
  @Get('office/clients/:clientId/versions/:disclosureVersionId')
  getOfficeDetail(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Param('clientId') clientId: string,
    @Param('disclosureVersionId') disclosureVersionId: string,
  ) {
    return this.office.getDetail(
      { tenantId, actorUserId, clientId },
      disclosureVersionId,
    );
  }

  /**
   * Cagrildigi yerler:
   * - Office FD workspace history -> GET /client-financial-disclosures/office/clients/:clientId/disclosures/:disclosureId/history
   */
  @Get('office/clients/:clientId/disclosures/:disclosureId/history')
  getOfficeHistory(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Param('clientId') clientId: string,
    @Param('disclosureId') disclosureId: string,
    @Query() query: ClientFinancialDisclosureOfficeQueryDto,
  ) {
    return this.office.getHistory(
      { tenantId, actorUserId, clientId, caseId: query.caseId },
      disclosureId,
    );
  }

  /**
   * Cagrildigi yerler:
   * - Office FD workspace timeline -> GET /client-financial-disclosures/office/clients/:clientId/versions/:disclosureVersionId/timeline
   */
  @Get('office/clients/:clientId/versions/:disclosureVersionId/timeline')
  getOfficeTimeline(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Param('clientId') clientId: string,
    @Param('disclosureVersionId') disclosureVersionId: string,
  ) {
    return this.office.getTimeline(
      { tenantId, actorUserId, clientId },
      disclosureVersionId,
    );
  }

  /**
   * Cagrildigi yerler:
   * - ClientFinancialDisclosureController.requestOfficeApproval() -> POST /client-financial-disclosures/:disclosureVersionId/request-office-approval (ofis onay talebi)
   */
  @Post(':disclosureVersionId/request-office-approval')
  requestOfficeApproval(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Param('disclosureVersionId') disclosureVersionId: string,
  ) {
    this.assertWriteEnabled();
    return this.approval.requestOfficeApproval({
      tenantId,
      disclosureVersionId,
      requesterUserId: actorUserId,
    });
  }

  /**
   * Cagrildigi yerler:
   * - ClientFinancialDisclosureController.completeOfficeApproval() -> POST /client-financial-disclosures/:disclosureVersionId/complete-office-approval (ofis onay karari)
   */
  @Post(':disclosureVersionId/complete-office-approval')
  completeOfficeApproval(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Param('disclosureVersionId') disclosureVersionId: string,
    @Body() body: CompleteDisclosureOfficeApprovalDto,
  ) {
    this.assertWriteEnabled();
    return this.approval.completeOfficeApproval({
      tenantId,
      disclosureVersionId,
      approvalRequestId: body.approvalRequestId,
      approverUserId: actorUserId,
    });
  }

  /**
   * Cagrildigi yerler:
   * - ClientFinancialDisclosureController.requestContentApproval() -> POST /client-financial-disclosures/:disclosureVersionId/request-content-approval (icerik ve alici onay talebi)
   */
  @Post(':disclosureVersionId/request-content-approval')
  requestContentApproval(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Param('disclosureVersionId') disclosureVersionId: string,
    @Body() body: RequestDisclosureContentApprovalDto,
  ) {
    this.assertWriteEnabled();
    return this.approval.requestContentApproval({
      tenantId,
      disclosureVersionId,
      requesterUserId: actorUserId,
      approvedRecipientEmail: body.approvedRecipientEmail,
      approvedRecipientPortalUserId: body.approvedRecipientPortalUserId,
    });
  }

  /**
   * Cagrildigi yerler:
   * - ClientFinancialDisclosureController.completeContentApproval() -> POST /client-financial-disclosures/:disclosureVersionId/complete-content-approval (icerik onay karari)
   */
  @Post(':disclosureVersionId/complete-content-approval')
  completeContentApproval(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Param('disclosureVersionId') disclosureVersionId: string,
  ) {
    this.assertWriteEnabled();
    return this.approval.completeContentApproval({
      tenantId,
      disclosureVersionId,
      contentApproverUserId: actorUserId,
    });
  }

  /**
   * Cagrildigi yerler:
   * - ClientFinancialDisclosureController.publish() -> POST /client-financial-disclosures/:disclosureVersionId/publish (onayli versiyonu gonderir ve yayinlar)
   *
   * CONTENT_APPROVED -> SEND_PENDING kalıcı niyeti ile provider dispatch'ini tek HTTP
   * komutunda sıralar. Her iki adımın bütünlük ve concurrency kapıları publication servisindedir.
   */
  @Post(':disclosureVersionId/publish')
  async publish(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Param('disclosureVersionId') disclosureVersionId: string,
  ) {
    this.assertPublicationEnabled();
    const scope = { tenantId, disclosureVersionId, actorUserId };
    await this.publication.beginSend(scope);
    return this.publication.dispatchAndPublish(scope);
  }

  /**
   * Cagrildigi yerler:
   * - ClientFinancialDisclosureController.retryPublication() -> POST /client-financial-disclosures/:disclosureVersionId/retry-publication (basarisiz gonderimi yeniden dener)
   *
   * SEND_FAILED -> SEND_PENDING -> provider dispatch; doğrudan gönderim bypass'ı yoktur.
   */
  @Post(':disclosureVersionId/retry-publication')
  async retryPublication(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Param('disclosureVersionId') disclosureVersionId: string,
  ) {
    this.assertPublicationEnabled();
    const scope = { tenantId, disclosureVersionId, actorUserId };
    await this.publication.retrySend(scope);
    return this.publication.dispatchAndPublish(scope);
  }

  /**
   * Cagrildigi yerler:
   * - ClientFinancialDisclosureController.reverse() -> POST /client-financial-disclosures/:disclosureVersionId/reverse (yayinlanmis versiyonu geri alir)
   */
  @Post(':disclosureVersionId/reverse')
  reverse(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Param('disclosureVersionId') disclosureVersionId: string,
    @Body() body: ReverseClientFinancialDisclosureDto,
  ) {
    this.assertPublicationEnabled();
    return this.publication.reversePublishedVersion({
      tenantId,
      disclosureVersionId,
      actorUserId,
      correctionReason: body.correctionReason,
    });
  }

  /**
   * Cagrildigi yerler:
   * - ClientFinancialDisclosureController.supersede() -> POST /client-financial-disclosures/:supersededVersionId/supersede (yayinlanmis versiyonu onayli yeni versiyonla degistirir)
   */
  @Post(':supersededVersionId/supersede')
  supersede(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Param('supersededVersionId') supersededVersionId: string,
    @Body() body: SupersedeClientFinancialDisclosureDto,
  ) {
    this.assertPublicationEnabled();
    return this.publication.supersedePublishedVersion({
      tenantId,
      supersededVersionId,
      supersedingVersionId: body.supersedingVersionId,
      actorUserId,
      correctionReason: body.correctionReason,
    });
  }

  /** Flag kapalıyken tenant/version lookup yapılmadan tek tip fail-closed cevap. */
  private assertWriteEnabled(): void {
    if (!isDisclosureWriteEnabled()) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Client Financial Disclosure Write Disabled',
        code: 'DISCLOSURE_WRITE_NOT_ENABLED',
        message: 'Client financial disclosure write operations are not enabled.',
      });
    }
  }

  /** Publication hiçbir durumda write kapısını veya ayrı publication kapısını atlayamaz. */
  private assertPublicationEnabled(): void {
    this.assertWriteEnabled();
    if (!isDisclosurePublicationEnabled()) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Client Financial Disclosure Publication Disabled',
        code: 'DISCLOSURE_PUBLICATION_NOT_ENABLED',
        message: 'Client financial disclosure publication is not enabled.',
      });
    }
  }
}
