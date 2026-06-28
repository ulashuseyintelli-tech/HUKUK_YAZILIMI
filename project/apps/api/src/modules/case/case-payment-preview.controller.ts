import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CasePaymentPreviewService } from "./case-payment-preview.service";
import { PaymentPreviewRequestDto } from "./dto/payment-preview.dto";

@Controller("cases")
@UseGuards(JwtAuthGuard)
export class CasePaymentPreviewController {
  constructor(private readonly casePaymentPreviewService: CasePaymentPreviewService) {}

  /**
   * Odeme/tahsilat onizlemesi. DB'ye kayit yazmaz.
   */
  /// <remarks>
  /// Cagrildigi yerler:
  /// - CasePaymentPreviewController.previewPayment() -> POST /cases/:caseId/payment-preview (backend dry-run odeme onizleme endpoint'i)
  /// </remarks>
  @Post(":caseId/payment-preview")
  previewPayment(
    @CurrentUser("tenantId") tenantId: string,
    @Param("caseId") caseId: string,
    @Body() body: PaymentPreviewRequestDto,
  ) {
    return this.casePaymentPreviewService.preview({ tenantId, caseId, input: body });
  }
}
