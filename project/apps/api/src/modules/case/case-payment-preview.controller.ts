import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CasePaymentPreviewService } from "./case-payment-preview.service";
import { PaymentPreviewRequestDto } from "./dto/payment-preview.dto";
import { CaseViewScoped } from "./case-view-scope.guard";

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
  @CaseViewScoped() // F02 P3 tarama S1: dosya görünüm kapsamı (bayrak açıkken; kapsam dışı / yok 404)
  previewPayment(
    @CurrentUser("tenantId") tenantId: string,
    @Param("caseId") caseId: string,
    @Body() body: PaymentPreviewRequestDto,
  ) {
    return this.casePaymentPreviewService.preview({ tenantId, caseId, input: body });
  }
}
