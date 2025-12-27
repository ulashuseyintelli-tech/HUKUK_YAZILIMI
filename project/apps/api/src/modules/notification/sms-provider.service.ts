import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * SMS Provider Servisi
 * 
 * Desteklenen providerlar:
 * - NetGSM
 * - İletimerkezi
 * - Twilio (uluslararası)
 * 
 * .env dosyasında yapılandırma:
 * SMS_PROVIDER=netgsm|iletimerkezi|twilio
 * SMS_API_KEY=xxx
 * SMS_API_SECRET=xxx
 * SMS_SENDER_ID=xxx
 */

export interface SmsResult {
  success: boolean;
  messageId?: string;
  errorCode?: string;
  errorMessage?: string;
  provider: string;
}

@Injectable()
export class SmsProviderService {
  private readonly logger = new Logger(SmsProviderService.name);
  private readonly provider: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly senderId: string;

  constructor(private configService: ConfigService) {
    this.provider = this.configService.get('SMS_PROVIDER') || 'mock';
    this.apiKey = this.configService.get('SMS_API_KEY') || '';
    this.apiSecret = this.configService.get('SMS_API_SECRET') || '';
    this.senderId = this.configService.get('SMS_SENDER_ID') || 'HUKUK';
  }

  /**
   * SMS gönder
   */
  async send(phone: string, message: string): Promise<SmsResult> {
    // Telefon numarasını normalize et
    const normalizedPhone = this.normalizePhone(phone);
    
    if (!normalizedPhone) {
      return {
        success: false,
        errorCode: 'INVALID_PHONE',
        errorMessage: 'Geçersiz telefon numarası',
        provider: this.provider,
      };
    }

    this.logger.log(`SMS gönderiliyor: ${normalizedPhone} (${this.provider})`);

    switch (this.provider) {
      case 'netgsm':
        return this.sendViaNetGsm(normalizedPhone, message);
      case 'iletimerkezi':
        return this.sendViaIletiMerkezi(normalizedPhone, message);
      case 'twilio':
        return this.sendViaTwilio(normalizedPhone, message);
      default:
        return this.sendViaMock(normalizedPhone, message);
    }
  }

  /**
   * Toplu SMS gönder
   */
  async sendBulk(recipients: Array<{ phone: string; message: string }>): Promise<SmsResult[]> {
    const results: SmsResult[] = [];
    
    for (const recipient of recipients) {
      const result = await this.send(recipient.phone, recipient.message);
      results.push(result);
      
      // Rate limiting - her SMS arasında 100ms bekle
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return results;
  }

  /**
   * NetGSM ile SMS gönder
   */
  private async sendViaNetGsm(phone: string, message: string): Promise<SmsResult> {
    try {
      // NetGSM API endpoint
      const url = 'https://api.netgsm.com.tr/sms/send/get';
      const params = new URLSearchParams({
        usercode: this.apiKey,
        password: this.apiSecret,
        gsmno: phone,
        message: message,
        msgheader: this.senderId,
      });

      const response = await fetch(`${url}?${params}`);
      const result = await response.text();

      // NetGSM yanıt kodları
      // 00: Başarılı
      // 20: Mesaj metni boş
      // 30: Geçersiz kullanıcı
      // 40: Mesaj başlığı tanımlı değil
      // 70: Parametre hatası

      if (result.startsWith('00')) {
        const messageId = result.split(' ')[1];
        return {
          success: true,
          messageId,
          provider: 'netgsm',
        };
      }

      return {
        success: false,
        errorCode: result.substring(0, 2),
        errorMessage: this.getNetGsmErrorMessage(result.substring(0, 2)),
        provider: 'netgsm',
      };
    } catch (error: any) {
      this.logger.error('NetGSM hatası:', error);
      return {
        success: false,
        errorCode: 'NETWORK_ERROR',
        errorMessage: error.message,
        provider: 'netgsm',
      };
    }
  }

  /**
   * İletimerkezi ile SMS gönder
   */
  private async sendViaIletiMerkezi(phone: string, message: string): Promise<SmsResult> {
    try {
      const url = 'https://api.iletimerkezi.com/v1/send-sms/get/';
      const params = new URLSearchParams({
        username: this.apiKey,
        password: this.apiSecret,
        text: message,
        receipents: phone,
        sender: this.senderId,
      });

      const response = await fetch(`${url}?${params}`);
      const result = await response.json();

      if (result.response?.status?.code === '200') {
        return {
          success: true,
          messageId: result.response?.order?.id,
          provider: 'iletimerkezi',
        };
      }

      return {
        success: false,
        errorCode: result.response?.status?.code,
        errorMessage: result.response?.status?.message,
        provider: 'iletimerkezi',
      };
    } catch (error: any) {
      this.logger.error('İletimerkezi hatası:', error);
      return {
        success: false,
        errorCode: 'NETWORK_ERROR',
        errorMessage: error.message,
        provider: 'iletimerkezi',
      };
    }
  }

  /**
   * Twilio ile SMS gönder
   */
  private async sendViaTwilio(phone: string, message: string): Promise<SmsResult> {
    try {
      const accountSid = this.apiKey;
      const authToken = this.apiSecret;
      const fromNumber = this.senderId;

      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: phone.startsWith('+') ? phone : `+90${phone}`,
          From: fromNumber,
          Body: message,
        }),
      });

      const result = await response.json();

      if (result.sid) {
        return {
          success: true,
          messageId: result.sid,
          provider: 'twilio',
        };
      }

      return {
        success: false,
        errorCode: result.code?.toString(),
        errorMessage: result.message,
        provider: 'twilio',
      };
    } catch (error: any) {
      this.logger.error('Twilio hatası:', error);
      return {
        success: false,
        errorCode: 'NETWORK_ERROR',
        errorMessage: error.message,
        provider: 'twilio',
      };
    }
  }

  /**
   * Mock SMS gönder (test için)
   */
  private async sendViaMock(phone: string, message: string): Promise<SmsResult> {
    this.logger.log(`[MOCK SMS] To: ${phone}`);
    this.logger.log(`[MOCK SMS] Message: ${message.substring(0, 50)}...`);
    
    // Simüle edilmiş gecikme
    await new Promise(resolve => setTimeout(resolve, 200));
    
    return {
      success: true,
      messageId: `MOCK-${Date.now()}`,
      provider: 'mock',
    };
  }

  /**
   * Telefon numarasını normalize et
   */
  private normalizePhone(phone: string): string | null {
    // Sadece rakamları al
    const digits = phone.replace(/\D/g, '');
    
    // Türkiye numarası kontrolü
    if (digits.length === 10 && digits.startsWith('5')) {
      return digits; // 5xxxxxxxxx
    }
    
    if (digits.length === 11 && digits.startsWith('05')) {
      return digits.substring(1); // 05xxxxxxxxx -> 5xxxxxxxxx
    }
    
    if (digits.length === 12 && digits.startsWith('905')) {
      return digits.substring(2); // 905xxxxxxxxx -> 5xxxxxxxxx
    }
    
    if (digits.length === 13 && digits.startsWith('0905')) {
      return digits.substring(3); // 0905xxxxxxxxx -> 5xxxxxxxxx
    }
    
    return null;
  }

  /**
   * NetGSM hata mesajları
   */
  private getNetGsmErrorMessage(code: string): string {
    const messages: Record<string, string> = {
      '20': 'Mesaj metni boş',
      '30': 'Geçersiz kullanıcı adı veya şifre',
      '40': 'Mesaj başlığı tanımlı değil',
      '50': 'Abone hesabı aktif değil',
      '51': 'Abone hesabı aktif değil',
      '70': 'Parametre hatası',
      '80': 'Sorgu limiti aşıldı',
      '85': 'Mükerrer gönderim',
    };
    return messages[code] || 'Bilinmeyen hata';
  }

  /**
   * Provider durumunu kontrol et
   */
  async checkStatus(): Promise<{ provider: string; configured: boolean; testResult?: SmsResult }> {
    const configured = this.provider !== 'mock' && !!this.apiKey && !!this.apiSecret;
    
    return {
      provider: this.provider,
      configured,
    };
  }
}
