import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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

export interface EmailResult {
  success: boolean;
  messageId?: string;
  errorCode?: string;
  errorMessage?: string;
  provider: string;
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
      };
    } catch (error: any) {
      this.logger.error('SMTP hatası:', error);
      return {
        success: false,
        errorCode: error.code || 'SMTP_ERROR',
        errorMessage: error.message,
        provider: 'smtp',
      };
    }
  }

  /**
   * SendGrid ile e-posta gönder
   */
  private async sendViaSendGrid(options: EmailOptions): Promise<EmailResult> {
    try {
      const apiKey = this.configService.get('SENDGRID_API_KEY');
      
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
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
      });

      if (response.ok) {
        const messageId = response.headers.get('x-message-id');
        return {
          success: true,
          messageId: messageId || undefined,
          provider: 'sendgrid',
        };
      }

      const error = await response.json();
      return {
        success: false,
        errorCode: response.status.toString(),
        errorMessage: error.errors?.[0]?.message || 'SendGrid hatası',
        provider: 'sendgrid',
      };
    } catch (error: any) {
      this.logger.error('SendGrid hatası:', error);
      return {
        success: false,
        errorCode: 'NETWORK_ERROR',
        errorMessage: error.message,
        provider: 'sendgrid',
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
        };
      }
      
      const { SESClient, SendEmailCommand } = sesModule;
      
      const client = new SESClient({
        region: this.configService.get('AWS_REGION') || 'eu-west-1',
        credentials: {
          accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID') || '',
          secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY') || '',
        },
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
      };
    } catch (error: any) {
      this.logger.error('AWS SES hatası:', error);
      return {
        success: false,
        errorCode: error.code || 'SES_ERROR',
        errorMessage: error.message,
        provider: 'ses',
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
    };
  }

  /**
   * E-posta adresini doğrula
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
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
