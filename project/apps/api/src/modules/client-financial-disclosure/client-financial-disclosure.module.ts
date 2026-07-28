import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { ClientFinancialDisclosureApprovalService } from './client-financial-disclosure-approval.service';
import { ClientFinancialDisclosurePublicationService } from './client-financial-disclosure-publication.service';
import type { DisclosureNotificationDispatcher } from './client-financial-disclosure-publication.contract';
import { ClientFinancialDisclosureWriterService } from './client-financial-disclosure-writer.service';
import { DISCLOSURE_NOTIFICATION_DISPATCHER } from './client-financial-disclosure.tokens';
import { UnconfiguredDisclosureNotificationDispatcher } from './unconfigured-disclosure-dispatcher';

/**
 * CLIENT-FINANCIAL-DISCLOSURE-PRODUCTION-ACTIVATION-R01 / I02 — PRODUCTION COMPOSITION BINDING
 *
 * Track B'nin (charter §37–§46) canonical domain servislerini gerçek Nest composition'ına bağlar.
 *
 * TASARIM SINIRI — domain servisleri DEĞİŞTİRİLMEZ:
 *   `...WriterService`, `...ApprovalService` ve `...PublicationService` sade TypeScript
 *   sınıflarıdır; `@Injectable()` DEĞİLLERDİR ve `@nestjs/*` import ETMEZLER. Bağlama burada
 *   **factory provider** ile yapılır. `PrismaService extends PrismaClient` olduğu için
 *   kurucularına doğrudan geçirilebilir — adaptör katmanı, cast veya sarmalayıcı GEREKMEZ.
 *   Böylece charter §38.4/§42.2/§43.9'daki clean-architecture sınırı korunur.
 *
 * BU MODÜL TEK BAŞINA HİÇBİR ŞEYİ AKTİFLEŞTİRMEZ:
 *   - Hiçbir controller, route, resolver, cron, worker veya event listener TANIMLAMAZ.
 *   - Hiçbir eager side-effect üretmez (provider'lar yalnız enjekte edildiklerinde kurulur).
 *   - Gönderim dispatcher'ı FAIL-CLOSED varsayılana bağlıdır: gerçek adaptör (I04) gelene
 *     kadar `assertProductionProvider()` §35.10 gereği yayınlamayı reddeder.
 *
 *   COMPOSITION BOUND != WRITE PATH REACHABLE != PRODUCTION ACTIVATED
 */
@Module({
  imports: [PrismaModule],
  providers: [
    UnconfiguredDisclosureNotificationDispatcher,
    {
      provide: DISCLOSURE_NOTIFICATION_DISPATCHER,
      useExisting: UnconfiguredDisclosureNotificationDispatcher,
    },
    {
      provide: ClientFinancialDisclosureWriterService,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) =>
        new ClientFinancialDisclosureWriterService(prisma),
    },
    {
      provide: ClientFinancialDisclosureApprovalService,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) =>
        new ClientFinancialDisclosureApprovalService(prisma),
    },
    {
      provide: ClientFinancialDisclosurePublicationService,
      inject: [PrismaService, DISCLOSURE_NOTIFICATION_DISPATCHER],
      useFactory: (prisma: PrismaService, dispatcher: DisclosureNotificationDispatcher) =>
        new ClientFinancialDisclosurePublicationService(prisma, dispatcher),
    },
  ],
  exports: [
    ClientFinancialDisclosureWriterService,
    ClientFinancialDisclosureApprovalService,
    ClientFinancialDisclosurePublicationService,
    DISCLOSURE_NOTIFICATION_DISPATCHER,
  ],
})
export class ClientFinancialDisclosureModule {}
