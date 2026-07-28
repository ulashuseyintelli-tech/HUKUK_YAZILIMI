import { Injectable } from '@nestjs/common';
import type {
  DisclosureDispatchResult,
  DisclosureNotificationDispatcher,
} from './client-financial-disclosure-publication.contract';
import { DISCLOSURE_DISPATCHER_UNCONFIGURED_PROVIDER } from './client-financial-disclosure.tokens';

/**
 * CLIENT-FINANCIAL-DISCLOSURE-PRODUCTION-ACTIVATION-R01 / I02 — FAIL-CLOSED varsayılan dispatcher.
 *
 * Amaç: `ClientFinancialDisclosurePublicationService` Nest composition'ında **çözülebilir**
 * olsun, fakat gerçek bir gönderim adaptörü bağlanmadan **hiçbir şey gönderilemesin**.
 *
 * İki katmanlı güvence:
 *   1. `providerName = 'unconfigured'` → §35.10 onaylı provider allowlist'inde YOKTUR, dolayısıyla
 *      `assertProductionProvider()` provider'a tek byte gitmeden `403 PROVIDER_NOT_PRODUCTION` atar.
 *   2. Guard bir şekilde atlanırsa `send()` yine de **başarısız** ve **message ID'siz** döner →
 *      §35.10 kanıt kapısı `SEND_FAILED` üretir, `PUBLISHED` ASLA olmaz.
 *
 * Bu sınıf bir "mock provider" DEĞİLDİR: başarı taklit etmez, sessizce yutmaz, kuyruğa almaz.
 * Gerçek adaptör (I04) bu binding'i devralınca tamamen devre dışı kalır.
 */
@Injectable()
export class UnconfiguredDisclosureNotificationDispatcher
  implements DisclosureNotificationDispatcher
{
  readonly providerName = DISCLOSURE_DISPATCHER_UNCONFIGURED_PROVIDER;

  async send(_input: {
    readonly to: string;
    readonly subject: string;
    readonly text: string;
  }): Promise<DisclosureDispatchResult> {
    // Alıcı, konu ve içerik BİLEREK okunmaz ve log'a YAZILMAZ (§35.14 sızıntı sınırı).
    return {
      success: false,
      errorCode: 'DISCLOSURE_DISPATCHER_NOT_CONFIGURED',
      provider: this.providerName,
    };
  }
}
