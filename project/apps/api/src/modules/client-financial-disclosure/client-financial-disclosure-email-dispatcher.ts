import { Injectable } from '@nestjs/common';
import { EmailProviderService } from '../notification/email-provider.service';
import type {
  DisclosureDispatchResult,
  DisclosureNotificationDispatcher,
} from './client-financial-disclosure-publication.contract';
import { isClientFinancialDisclosureApprovedDispatchReceipt } from './client-financial-disclosure-publication.contract';

/**
 * CLIENT-FINANCIAL-DISCLOSURE-PRODUCTION-ACTIVATION-R01 / I04 — PRODUCTION DISPATCHER ADAPTER
 *
 * `DisclosureNotificationDispatcher` portunu repository'nin **canonical** e-posta altyapısına
 * (`EmailProviderService`) bağlar. İkinci bir notification framework ÜRETİLMEZ; kuyruk,
 * scheduler, retry döngüsü veya şablon motoru burada YOKTUR.
 *
 * SORUMLULUK SINIRI — adapter şunları TEKRAR UYGULAMAZ (canonical servislerde kalır):
 *   publication state machine · onay kuralları · tenant yetkisi · hash doğrulaması ·
 *   DB transaction'ı · çift-gönderim engeli (`sendRequestedAt` koşullu claim'i).
 *
 * Adapter'ın işi yalnız: provider adı çözümü · alıcı doğrulaması · provider çağrısı ·
 * message ID yakalama · retryable/terminal sınıflandırma · güvenli sonuç dönüşü.
 *
 * SIZINTI SINIRI: alıcı adresi, konu, gövde ve provider hata METNİ log'a YAZILMAZ ve dönüş
 * değerine KOPYALANMAZ; yalnız düşük-kardinaliteli `errorCode` taşınır.
 */

/**
 * §35.10 guard'ı `providerName`i onaylı allowlist ile karşılaştırır. Sınıflandırma buradadır
 * çünkü `EmailProviderService` retryable/terminal ayrımı YAPMAZ — yalnız ham `errorCode`
 * döndürür (`INVALID_EMAIL`, `SMTP_ERROR`, HTTP status, `NETWORK_ERROR`, `SDK_NOT_INSTALLED`,
 * `SES_ERROR` veya provider'ın kendi kodu).
 */
const TERMINAL_ERROR_CODES = new Set([
  'INVALID_EMAIL',
  'SDK_NOT_INSTALLED',
  'EAUTH', // SMTP kimlik reddi — yeniden deneme AYNI sonucu verir
  'EENVELOPE', // gecersiz zarf/alici
]);

/** 4xx kalıcıdır (429 hariç), 5xx ve ağ hataları geçicidir. */
export function classifyDispatchFailure(errorCode: string | undefined): boolean {
  const code = (errorCode ?? '').trim().toUpperCase();
  if (code.length === 0) return false; // siniflandirilamayan -> temkinli: TERMINAL
  if (TERMINAL_ERROR_CODES.has(code)) return false;
  if (code === 'NETWORK_ERROR' || code === 'ETIMEDOUT' || code === 'ECONNRESET') return true;
  const status = Number(code);
  if (Number.isInteger(status) && status >= 400 && status <= 599) {
    if (status === 429) return true; // rate limit -> gecici
    return status >= 500; // 5xx gecici, diger 4xx kalici
  }
  // SMTP gecici sinifi: 4yz kodlari (ornek '421', '450'); ustteki sayi dali zaten yakalar.
  return true; // taniniamayan provider kodu -> yeniden denenebilir kabul edilir
}

/** Minimal, provider-bağımsız alıcı doğrulaması (provider çağrısından ÖNCE). */
export function isDispatchableRecipient(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const email = value.trim();
  if (email.length === 0 || email.length > 254 || /\s/u.test(email)) return false;
  const at = email.indexOf('@');
  if (at <= 0 || at !== email.lastIndexOf('@')) return false;
  const dot = email.indexOf('.', at + 2);
  return dot !== -1 && dot < email.length - 1;
}

@Injectable()
export class ClientFinancialDisclosureEmailDispatcher implements DisclosureNotificationDispatcher {
  constructor(private readonly email: EmailProviderService) {}

  /**
   * Yapılandırılmış provider adı — UYDURULMAZ, `EmailProviderService`'in kendi değeridir.
   * §35.10 guard'ı bunu onaylı allowlist ile karşılaştırır; `mock`/tanımsız ise yayınlama
   * provider'a tek byte gitmeden reddedilir.
   */
  get providerName(): string {
    return this.email.providerName;
  }

  async send(input: {
    readonly to: string;
    readonly subject: string;
    readonly text: string;
  }): Promise<DisclosureDispatchResult> {
    // Alıcı doğrulaması provider ÇAĞRILMADAN önce — geçersiz alıcı için dış çağrı YAPILMAZ.
    if (!isDispatchableRecipient(input.to)) {
      return {
        success: false,
        errorCode: 'DISCLOSURE_RECIPIENT_INVALID',
        provider: this.providerName,
        retryable: false,
      };
    }

    const result = await this.email.send({
      to: input.to,
      subject: input.subject,
      text: input.text,
    });

    // Configured provider ile donen kabul kaniti EXACT ayni kimligi tasimalidir. Ornegin
    // `smtp` olarak baglanan adapter'dan `mock` sonucu gelmesi production yetkisi URETEMEZ.
    if (!isClientFinancialDisclosureApprovedDispatchReceipt(this.providerName, result.provider)) {
      return {
        success: false,
        errorCode: 'DISCLOSURE_PROVIDER_IDENTITY_MISMATCH',
        provider: this.providerName,
        retryable: false,
      };
    }

    const messageId = typeof result.messageId === 'string' ? result.messageId.trim() : '';

    // §35.10 KANIT KAPISI: provider "başarılı" dese bile KALICI message ID yoksa bu bir
    // başarı DEĞİLDİR. Adapter burada başarı TAKLİT EDEMEZ.
    if (!result.success || messageId.length === 0) {
      // Bos string `??` ile GECMEZ: operator icin anlamsiz bir kod birakmamak adina
      // normalize edilir (dusuk kardinaliteli, tiplenmis kod garantisi).
      const raw = typeof result.errorCode === 'string' ? result.errorCode.trim() : '';
      const errorCode = result.success
        ? 'PROVIDER_MESSAGE_ID_MISSING'
        : raw.length > 0
          ? raw
          : 'PROVIDER_ERROR';
      return {
        success: false,
        errorCode,
        provider: result.provider ?? this.providerName,
        retryable: result.success ? true : classifyDispatchFailure(result.errorCode),
      };
    }

    return {
      success: true,
      messageId,
      provider: result.provider ?? this.providerName,
    };
  }
}
