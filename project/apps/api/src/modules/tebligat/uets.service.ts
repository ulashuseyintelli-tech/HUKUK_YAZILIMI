import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TebligatChannel } from './dto/tebligat.dto';

export interface UetsRecipient {
  tcVkn: string;
  name: string;
  kepAddress?: string;
  uetsAddress?: string;
  isRegistered: boolean;
}

export interface UetsSendRequest {
  tebligatId: string;
  recipientTcVkn: string;
  recipientName: string;
  subject: string;
  content: string;
  attachments?: UetsAttachment[];
}

export interface UetsAttachment {
  fileName: string;
  fileType: string;
  fileContent: string; // Base64
}

export interface UetsSendResult {
  success: boolean;
  uetsNo?: string;
  kepNo?: string;
  sentAt?: Date;
  errorMessage?: string;
}

export interface UetsDeliveryStatus {
  uetsNo: string;
  status: 'GONDERILDI' | 'TESLIM_EDILDI' | 'OKUNAMADI' | 'HATA';
  deliveredAt?: Date;
  readAt?: Date;
  errorMessage?: string;
}

@Injectable()
export class UetsService {
  private readonly logger = new Logger(UetsService.name);

  // UETS API URL'leri (gercek URL'ler UYAP/PTT'den alinmali)
  private readonly UETS_API_URL = process.env.UETS_API_URL || 'https://uets.gov.tr/api';
  private readonly KEP_API_URL = process.env.KEP_API_URL || 'https://kep.gov.tr/api';

  constructor(private prisma: PrismaService) {}

  /**
   * Alicinin UETS/KEP kayitli olup olmadigini kontrol et
   */
  async checkRecipientRegistration(tcVkn: string): Promise<UetsRecipient> {
    this.logger.log(`UETS/KEP kayit kontrolu: ${tcVkn}`);

    try {
      // Gercek API cagirisi burada yapilacak
      // const response = await fetch(`${this.UETS_API_URL}/check/${tcVkn}`);
      // const data = await response.json();

      // Mock response - gercek entegrasyonda kaldirilacak
      // Tuzel kisiler (VKN) genellikle KEP'e kayitli
      const isTuzelKisi = tcVkn.length === 10;
      
      return {
        tcVkn,
        name: 'ALICI ADI', // Gercek API'den gelecek
        kepAddress: isTuzelKisi ? `${tcVkn}@hs01.kep.tr` : undefined,
        uetsAddress: `${tcVkn}@uets.gov.tr`,
        isRegistered: true, // Gercek API'den gelecek
      };
    } catch (error) {
      this.logger.error(`UETS kayit kontrolu hatasi: ${error.message}`);
      return {
        tcVkn,
        name: '',
        isRegistered: false,
      };
    }
  }

  /**
   * UETS ile tebligat gonder
   */
  async sendViaUets(request: UetsSendRequest): Promise<UetsSendResult> {
    this.logger.log(`UETS tebligat gonderiliyor: ${request.tebligatId}`);

    try {
      // Alici kayitli mi kontrol et
      const recipient = await this.checkRecipientRegistration(request.recipientTcVkn);
      
      if (!recipient.isRegistered) {
        return {
          success: false,
          errorMessage: 'Alici UETS sistemine kayitli degil',
        };
      }

      // Gercek UETS API cagirisi burada yapilacak
      // const response = await fetch(`${this.UETS_API_URL}/send`, {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({
      //     recipient: recipient.uetsAddress,
      //     subject: request.subject,
      //     content: request.content,
      //     attachments: request.attachments,
      //   }),
      // });

      // NOT_INTEGRATED: gercek UETS API entegrasyonu henuz yok.
      // Gonderilmis gibi sahte basari durumu (GONDERILDI + uydurma barkod) YAZILMAZ.
      this.logger.warn(`UETS entegrasyonu aktif degil, tebligat ${request.tebligatId} GONDERILMEDI (NOT_INTEGRATED)`);

      return {
        success: false,
        errorMessage: 'UETS entegrasyonu henüz aktif değil (NOT_INTEGRATED)',
      };
    } catch (error) {
      this.logger.error(`UETS gonderim hatasi: ${error.message}`);
      return {
        success: false,
        errorMessage: error.message,
      };
    }
  }

  /**
   * KEP ile tebligat gonder
   */
  async sendViaKep(request: UetsSendRequest): Promise<UetsSendResult> {
    this.logger.log(`KEP tebligat gonderiliyor: ${request.tebligatId}`);

    try {
      // Alici kayitli mi kontrol et
      const recipient = await this.checkRecipientRegistration(request.recipientTcVkn);
      
      if (!recipient.kepAddress) {
        return {
          success: false,
          errorMessage: 'Alicinin KEP adresi bulunamadi',
        };
      }

      // Gercek KEP API cagirisi burada yapilacak
      // const response = await fetch(`${this.KEP_API_URL}/send`, {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({
      //     recipient: recipient.kepAddress,
      //     subject: request.subject,
      //     content: request.content,
      //     attachments: request.attachments,
      //   }),
      // });

      // NOT_INTEGRATED: gercek KEP API entegrasyonu henuz yok.
      // Gonderilmis gibi sahte basari durumu (GONDERILDI + uydurma barkod) YAZILMAZ.
      this.logger.warn(`KEP entegrasyonu aktif degil, tebligat ${request.tebligatId} GONDERILMEDI (NOT_INTEGRATED)`);

      return {
        success: false,
        errorMessage: 'KEP entegrasyonu henüz aktif değil (NOT_INTEGRATED)',
      };
    } catch (error) {
      this.logger.error(`KEP gonderim hatasi: ${error.message}`);
      return {
        success: false,
        errorMessage: error.message,
      };
    }
  }

  /**
   * UETS/KEP teslim durumunu sorgula
   */
  async checkDeliveryStatus(uetsOrKepNo: string): Promise<UetsDeliveryStatus> {
    this.logger.log(`UETS/KEP durum sorgulaniyor: ${uetsOrKepNo}`);

    // Gercek API cagirisi burada yapilacak
    // const isKep = uetsOrKepNo.startsWith('KEP');
    // const apiUrl = isKep ? this.KEP_API_URL : this.UETS_API_URL;
    // const response = await fetch(`${apiUrl}/status/${uetsOrKepNo}`);

    // NOT_INTEGRATED: gercek UETS/KEP durum sorgu API'si henuz yok.
    // Teslim edilmis gibi sahte basari YAZILMAZ. 'GONDERILDI' donuyoruz cunku
    // recordElectronicResult (tebligat.service.ts) bunu "ara durum, terminal
    // sonuc degil" olarak ele alip Tebligat/CaseDebtor'a HICBIR yazma yapmiyor
    // ('HATA' ise IPTAL'e eslenip yanlislikla terminal-negatif durum yazdirirdi).
    this.logger.warn(`UETS/KEP entegrasyonu aktif degil, ${uetsOrKepNo} icin gercek durum sorgulanamadi`);

    return {
      uetsNo: uetsOrKepNo,
      status: 'GONDERILDI',
      errorMessage: 'UETS/KEP durum sorgu entegrasyonu henüz aktif değil (NOT_INTEGRATED)',
    };
  }

  /**
   * Elektronik tebligat icin en uygun kanali belirle
   */
  async determineElectronicChannel(tcVkn: string): Promise<TebligatChannel | null> {
    const recipient = await this.checkRecipientRegistration(tcVkn);

    if (!recipient.isRegistered) {
      return null;
    }

    // Tuzel kisiler icin KEP tercih edilir
    if (recipient.kepAddress) {
      return TebligatChannel.KEP;
    }

    // Gercek kisiler icin UETS
    if (recipient.uetsAddress) {
      return TebligatChannel.UETS;
    }

    return null;
  }

  /**
   * Toplu elektronik tebligat gonder
   */
  async sendBulkElectronic(requests: UetsSendRequest[]): Promise<Map<string, UetsSendResult>> {
    const results = new Map<string, UetsSendResult>();

    for (const request of requests) {
      // Kanal belirle
      const channel = await this.determineElectronicChannel(request.recipientTcVkn);
      
      let result: UetsSendResult;
      
      if (channel === TebligatChannel.KEP) {
        result = await this.sendViaKep(request);
      } else if (channel === TebligatChannel.UETS) {
        result = await this.sendViaUets(request);
      } else {
        result = {
          success: false,
          errorMessage: 'Alici elektronik tebligat sistemine kayitli degil',
        };
      }

      results.set(request.tebligatId, result);
      
      // Rate limiting
      await this.delay(1000);
    }

    return results;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
