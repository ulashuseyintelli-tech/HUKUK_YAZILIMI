import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fetchWithTimeout } from '../../common/fetch-with-timeout.util';

/**
 * E-posta Provider Servisi
 * 
 * Desteklenen providerlar:
 * - SMTP (nodemailer)
 * - SendGrid
 * - AWS SES
 * 
 * .env dosyasında yapılandırma:
 * EMAIL_PROVIDER=smtp|sendgrid|ses
 * EMAIL_FROM=noreply@example.com
 * EMAIL_FROM_NAME=Hukuk Yazılımı
 * 
 * SMTP için:
 * SMTP_HOST=smtp.example.com
 * SMTP_PORT=587
 * SMTP_USER=xxx
 * SMTP_PASS=xxx
 * 
 * SendGrid için:
 * SENDGRID_API_KEY=xxx
 * 
 * AWS SES için:
 * AWS_REGION=eu-west-1
 * AWS_ACCESS_KEY_ID=xxx
 * AWS_SECRET_ACCESS_KEY=xxx
 */

/**
 * Gonderim sonucunun KESINLIGI (owner GO 2026-09-07).
 *
 * NEDEN AYRI ALAN: `success: false` tek basina "mesaj gitmedi" KANITI DEGILDIR. Saglayici
 * yollari istisnalari YAKALAYIP `success:false` donduruyor; bir SendGrid timeout'u ile kalici
 * bir 400 reddi AYNI degeri uretiyordu. Cagiran ikisini ayirt edemeyince kullaniciya
 * "gonderilemedi" deniyor, kullanici tekrar gonderiyor ve MUKERRER e-posta olusuyordu.
 *
 *  - `ACCEPTED`      : saglayici mesaji KABUL etti (`success: true` ile birlikte doner).
 *                      **Alicinin posta kutusuna TESLIM KANITI DEGILDIR.**
 *  - `REJECTED`      : gonderim KESIN olarak gerceklesmedi (dogrulanabilir ret: sunucu yaniti,
 *                      kimlik dogrulama hatasi, baglantinin hic kurulmamasi, gecersiz adres).
 *  - `INDETERMINATE` : sonuc DOGRULANAMADI — mesaj iletilmis OLABILIR (timeout, yanit kaybi,
 *                      soket kopmasi). Cagiran kesinlik iddia ETMEMELI ve KOR TEKRAR GONDERIM
 *                      YAPMAMALIDIR.
 */
export type EmailDeliveryOutcome = 'ACCEPTED' | 'REJECTED' | 'INDETERMINATE';

export interface EmailResult {
  success: boolean;
  messageId?: string;
  errorCode?: string;
  errorMessage?: string;
  provider: string;
  /**
   * OPSIYONELDIR — mevcut `success` sozlesmesi DEGISMEDI ve mevcut tuketiciler etkilenmez.
   * Alan YOKSA cagiran kesinlik VARSAYMAMALIDIR (fail-safe yorum: belirsiz).
   */
  deliveryOutcome?: EmailDeliveryOutcome;
}

/**
 * Baglantinin HIC kurulmadigini gosteren tasima kodlari — bu durumda mesaj kesinlikle
 * gonderilmemistir. Liste DAR tutulur: burada olmayan her sey BELIRSIZ sayilir.
 */
const TRANSPORT_NEVER_SENT_CODES: ReadonlySet<string> = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
]);

/**
 * SMTP tarafinda KESIN ret sayilan kodlar. `ETIMEDOUT`/`ESOCKET`/`ECONNRESET`/`EPIPE`
 * BILEREK DISARIDA: bu durumlarda veri gonderilmis olabilir.
 */
const SMTP_DEFINITE_REJECT_CODES: ReadonlySet<string> = new Set([
  'EAUTH',
  'EENVELOPE',
  'EMESSAGE',
]);

/** Hata nesnesinden KESINLIK cikarir; kanit yoksa BELIRSIZ doner. */
function classifyTransportError(
  error: any,
  extraRejectCodes?: ReadonlySet<string>,
): EmailDeliveryOutcome {
  const code = String(error?.code ?? error?.cause?.code ?? '').toUpperCase();
  if (code && TRANSPORT_NEVER_SENT_CODES.has(code)) return 'REJECTED';
  if (code && extraRejectCodes?.has(code)) return 'REJECTED';
  // SMTP kalici ret (5xx): sunucu mesaji acikca reddetti.
  const responseCode = Number(error?.responseCode);
  if (Number.isFinite(responseCode) && responseCode >= 500 && responseCode < 600) return 'REJECTED';
  // AWS SDK: HTTP yaniti alinmissa sunucu istegi degerlendirmistir.
  const awsStatus = Number(error?.$metadata?.httpStatusCode);
  if (Number.isFinite(awsStatus) && awsStatus > 0) return 'REJECTED';
  // Geri kalan her sey (timeout, abort, soket kopmasi, bilinmeyen) BELIRSIZDIR.
  return 'INDETERMINATE';
}

export interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  cc?: string[];
  bcc?: string[];
  attachments?: Array<{
    filename: string;
    content: string | Buffer;
    contentType?: string;
  }>;
  replyTo?: string;
}

@Injectable()
export class EmailProviderService {
  private readonly logger = new Logger(EmailProviderService.name);
  private readonly provider: string;
  private readonly fromEmail: string;
  private readonly fromName: string;

  constructor(private configService: ConfigService) {
    this.provider = this.configService.get('EMAIL_PROVIDER') || 'mock';
    this.fromEmail = this.configService.get('EMAIL_FROM') || 'noreply@hukuk.local';
    this.fromName = this.configService.get('EMAIL_FROM_NAME') || 'Hukuk Yazılımı';
  }

  /**
   * CLIENT-FD-ACT-R01-I04: yapilandirilmis provider adinin PUBLIC, SENKRON okunmasi.
   * Eklendi cunku financial disclosure yayinlama guard'i (charter §35.10) provider'a tek byte
   * gitmeden ONCE onayli-provider allowlist kontrolu yapmak zorundadir; `checkStatus()` async
   * oldugu icin bu amaca uygun degildir. Salt okuma — davranis DEGISMEDI, private alan
   * erisimi veya cast KULLANILMADI.
   */
  get providerName(): string {
    return this.provider;
  }

  /**
   * E-posta gönder
   */
  async send(options: EmailOptions): Promise<EmailResult> {
    // E-posta adresini doğrula
    if (!this.isValidEmail(options.to)) {
      return {
        success: false,
        errorCode: 'INVALID_EMAIL',
        errorMessage: 'Geçersiz e-posta adresi',
        provider: this.provider,
        // Hicbir tasima cagrisi YAPILMADI → kesin ret.
        deliveryOutcome: 'REJECTED',
      };
    }

    this.logger.log(`E-posta gönderiliyor: ${options.to} (${this.provider})`);

    switch (this.provider) {
      case 'smtp':
        return this.sendViaSmtp(options);
      case 'sendgrid':
        return this.sendViaSendGrid(options);
      case 'ses':
        return this.sendViaSes(options);
      default:
        return this.sendViaMock(options);
    }
  }

  /**
   * Toplu e-posta gönder
   */
  async sendBulk(recipients: EmailOptions[]): Promise<EmailResult[]> {
    const results: EmailResult[] = [];
    
    for (const options of recipients) {
      const result = await this.send(options);
      results.push(result);
      
      // Rate limiting - her e-posta arasında 50ms bekle
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    return results;
  }

  /**
   * SMTP ile e-posta gönder
   */
  private async sendViaSmtp(options: EmailOptions): Promise<EmailResult> {
    try {
      // nodemailer kullanımı için dinamik import
      const nodemailer = await import('nodemailer');
      
      const transporter = nodemailer.createTransport({
        host: this.configService.get('SMTP_HOST'),
        port: parseInt(this.configService.get('SMTP_PORT') || '587'),
        secure: this.configService.get('SMTP_PORT') === '465',
        auth: {
          user: this.configService.get('SMTP_USER'),
          pass: this.configService.get('SMTP_PASS'),
        },
      });

      const mailOptions = {
        from: `"${this.fromName}" <${this.fromEmail}>`,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        cc: options.cc?.join(', '),
        bcc: options.bcc?.join(', '),
        replyTo: options.replyTo,
        attachments: options.attachments?.map(att => ({
          filename: att.filename,
          content: att.content,
          contentType: att.contentType,
        })),
      };

      const info = await transporter.sendMail(mailOptions);

      return {
        success: true,
        messageId: info.messageId,
        provider: 'smtp',
        deliveryOutcome: 'ACCEPTED',
      };
    } catch (error: any) {
      this.logger.error('SMTP hatası:', error);
      return {
        success: false,
        errorCode: error.code || 'SMTP_ERROR',
        errorMessage: error.message,
        provider: 'smtp',
        deliveryOutcome: classifyTransportError(error, SMTP_DEFINITE_REJECT_CODES),
      };
    }
  }

  /**
   * SendGrid ile e-posta gönder
   */
  private async sendViaSendGrid(options: EmailOptions): Promise<EmailResult> {
    try {
      const apiKey = this.configService.get('SENDGRID_API_KEY');
      
      const response = await fetchWithTimeout('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{
            to: [{ email: options.to }],
            cc: options.cc?.map(email => ({ email })),
            bcc: options.bcc?.map(email => ({ email })),
          }],
          from: { email: this.fromEmail, name: this.fromName },
          reply_to: options.replyTo ? { email: options.replyTo } : undefined,
          subject: options.subject,
          content: [
            options.text ? { type: 'text/plain', value: options.text } : null,
            options.html ? { type: 'text/html', value: options.html } : null,
          ].filter(Boolean),
          attachments: options.attachments?.map(att => ({
            filename: att.filename,
            content: typeof att.content === 'string' 
              ? att.content 
              : att.content.toString('base64'),
            type: att.contentType,
          })),
        }),
      }, 10_000);

      if (response.ok) {
        const messageId = response.headers.get('x-message-id');
        return {
          success: true,
          messageId: messageId || undefined,
          provider: 'sendgrid',
          deliveryOutcome: 'ACCEPTED',
        };
      }

      const error: any = await response.json().catch(() => ({}));
      return {
        success: false,
        errorCode: response.status.toString(),
        errorMessage: error.errors?.[0]?.message || 'SendGrid hatası',
        provider: 'sendgrid',
        // HTTP YANITI ALINDI → saglayici istegi degerlendirdi ve KABUL ETMEDI.
        deliveryOutcome: 'REJECTED',
      };
    } catch (error: any) {
      this.logger.error('SendGrid hatası:', error);
      // Yanit ALINAMADI (timeout/abort/soket kopmasi) → istek sunucuya ULASMIS OLABILIR.
      // Yalniz baglantinin hic kurulmadigi kodlar kesin ret sayilir.
      return {
        success: false,
        errorCode: 'NETWORK_ERROR',
        errorMessage: error.message,
        provider: 'sendgrid',
        deliveryOutcome: classifyTransportError(error),
      };
    }
  }

  /**
   * AWS SES ile e-posta gönder
   */
  private async sendViaSes(options: EmailOptions): Promise<EmailResult> {
    try {
      // AWS SDK v3 kullanımı - optional dependency
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      let sesModule: any;
      try {
        sesModule = require('@aws-sdk/client-ses');
      } catch {
        this.logger.warn('AWS SES SDK yüklü değil. npm install @aws-sdk/client-ses');
        return {
          success: false,
          errorCode: 'SDK_NOT_INSTALLED',
          errorMessage: 'AWS SES SDK yüklü değil',
          provider: 'ses',
          // Hicbir tasima cagrisi YAPILMADI → kesin ret.
          deliveryOutcome: 'REJECTED',
        };
      }
      
      const { SESClient, SendEmailCommand } = sesModule;
      
      const client = new SESClient({
        region: this.configService.get('AWS_REGION') || 'eu-west-1',
        credentials: {
          accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID') || '',
          secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY') || '',
        },
        // KOR TEKRAR GONDERIM YOK (owner GO 2026-09-07). AWS SDK v3 varsayilani `maxAttempts: 3`
        // ile timeout/ag hatasinda istegi KENDILIGINDEN tekrarlar. E-posta gonderimi idempotent
        // DEGILDIR: ilk istek sunucuya ulasmis ama yanit kaybolmussa tekrar MUKERRER e-posta
        // uretir. Tek deneme + belirsiz sonucun kullaniciya bildirilmesi tercih edilir; tekrar
        // karari kullanicinindir. SMTP (nodemailer) ve SendGrid (`fetchWithTimeout`) yollari
        // zaten tek deneme yapar.
        maxAttempts: 1,
      });

      const command = new SendEmailCommand({
        Source: `${this.fromName} <${this.fromEmail}>`,
        Destination: {
          ToAddresses: [options.to],
          CcAddresses: options.cc,
          BccAddresses: options.bcc,
        },
        Message: {
          Subject: { Data: options.subject },
          Body: {
            Text: options.text ? { Data: options.text } : undefined,
            Html: options.html ? { Data: options.html } : undefined,
          },
        },
        ReplyToAddresses: options.replyTo ? [options.replyTo] : undefined,
      });

      const response = await client.send(command);

      return {
        success: true,
        messageId: response.MessageId,
        provider: 'ses',
        deliveryOutcome: 'ACCEPTED',
      };
    } catch (error: any) {
      this.logger.error('AWS SES hatası:', error);
      return {
        success: false,
        errorCode: error.code || 'SES_ERROR',
        errorMessage: error.message,
        provider: 'ses',
        deliveryOutcome: classifyTransportError(error),
      };
    }
  }

  /**
   * Mock e-posta gönder (test için)
   */
  private async sendViaMock(options: EmailOptions): Promise<EmailResult> {
    this.logger.log(`[MOCK EMAIL] To: ${options.to}`);
    this.logger.log(`[MOCK EMAIL] Subject: ${options.subject}`);
    this.logger.log(`[MOCK EMAIL] Body: ${(options.text || options.html || '').substring(0, 100)}...`);
    
    // Simüle edilmiş gecikme
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return {
      success: true,
      messageId: `MOCK-${Date.now()}`,
      provider: 'mock',
      deliveryOutcome: 'ACCEPTED',
    };
  }

  /**
   * E-posta adresini doğrula
   */
  private isValidEmail(email: string): boolean {
    if (typeof email !== 'string' || email.length === 0 || /\s/u.test(email)) {
      return false;
    }

    const atIndex = email.indexOf('@');
    if (atIndex <= 0 || atIndex !== email.lastIndexOf('@')) {
      return false;
    }

    const domainStart = atIndex + 1;
    const separatorDotIndex = email.indexOf('.', domainStart + 1);
    return separatorDotIndex !== -1 && separatorDotIndex < email.length - 1;
  }

  /**
   * Provider durumunu kontrol et
   */
  async checkStatus(): Promise<{ provider: string; configured: boolean }> {
    let configured = false;
    
    switch (this.provider) {
      case 'smtp':
        configured = !!(
          this.configService.get('SMTP_HOST') &&
          this.configService.get('SMTP_USER') &&
          this.configService.get('SMTP_PASS')
        );
        break;
      case 'sendgrid':
        configured = !!this.configService.get('SENDGRID_API_KEY');
        break;
      case 'ses':
        configured = !!(
          this.configService.get('AWS_ACCESS_KEY_ID') &&
          this.configService.get('AWS_SECRET_ACCESS_KEY')
        );
        break;
    }
    
    return {
      provider: this.provider,
      configured,
    };
  }
}
