import { Controller, Param, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClientFinancialDisclosureOfficeService } from '../client-financial-disclosure/client-financial-disclosure-office-service';
import { ClientFinancialDisclosureCommandService } from './client-financial-disclosure-command.service';

interface AuthRequest {
  user: { id: string; tenantId: string };
}

/**
 * PR-1.2 — X1 OFİS YÜZEYİNİN KOMUT UCU.
 *
 * NEDEN AYRI CONTROLLER: okuma yüzeyi (`ClientFinancialDisclosureController`)
 * `client-financial-disclosure` modülündedir; komut servisi ise `client-settlement`
 * modülünde. Modül bağımlılığı settlement → FD yönündedir; okuma controller'ına
 * komut servisi enjekte etmek DAİRESEL bağımlılık yaratırdı. Bu yüzden komut ucu
 * settlement tarafında, fakat AYNI kanonik route ağacı altında tanımlanır.
 * Route çakışması yoktur: okuma controller'ında `office/...` altında yalnız @Get vardır.
 *
 * GÜVENLİK SÖZLEŞMESİ (değişmez):
 *  - İstemci HAM disposition ID GÖNDERMEZ ve GÖRMEZ; yalnız tek yönlü
 *    `preparationReference` taşır.
 *  - Gövde YOKTUR: `caseId`, `caseClientId` ve idempotency anahtarı domain servisinde
 *    dispozisyon kaydından SERVER-SIDE türetilir.
 *  - Referans çözümü yalnız bu aktörün/tenant'ın gerçekten uygun adayları üzerinden
 *    yapılır; eşleşmeyen her durum generic NotFound ile fail-closed olur
 *    (hash-oracle veya varlık doğrulaması YOK).
 *  - Yetki, aktivasyon bayrağı, POSTED kontrolü, mevcut-root tekliği ve audit aktörü
 *    mevcut `createFromDisposition` domain servisinden gelir; burada YENİDEN YAZILMAZ.
 */
@Controller('client-financial-disclosures/office')
@UseGuards(JwtAuthGuard)
export class ClientFinancialDisclosureOfficeCommandController {
  constructor(
    private readonly office: ClientFinancialDisclosureOfficeService,
    private readonly command: ClientFinancialDisclosureCommandService,
  ) {}

  /**
   * Cagrildigi yerler:
   * - X1 office FD workspace "Finansal Bildirim Hazırla" ->
   *   POST /client-financial-disclosures/office/clients/:clientId/preparation-sources/:preparationReference/financial-disclosure
   */
  @Post('clients/:clientId/preparation-sources/:preparationReference/financial-disclosure')
  async createFromPreparationSource(
    @Request() req: AuthRequest,
    @Param('clientId') clientId: string,
    @Param('preparationReference') preparationReference: string,
  ) {
    const dispositionId = await this.office.resolvePreparationSourceDispositionId(
      { tenantId: req.user.tenantId, actorUserId: req.user.id, clientId },
      preparationReference,
    );

    // Domain sözleşmesi aynen tüketilir: aktivasyon + yetki + POSTED + idempotency
    // (aynı dispozisyon için ikinci kök OLUŞMAZ, `replayed: true` döner).
    const data = await this.command.createFromDisposition(req.user.tenantId, dispositionId, {
      userId: req.user.id,
    });

    // Yanıt client-safe: ham disposition/source kimliği İÇERMEZ.
    return { data };
  }
}
