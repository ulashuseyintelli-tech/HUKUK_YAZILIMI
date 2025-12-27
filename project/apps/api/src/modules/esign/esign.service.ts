import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * E-İmza Servisi
 * 
 * Desteklenen e-imza sağlayıcıları:
 * - E-Güven (Türkiye)
 * - Turkcell E-İmza
 * - E-Tugra
 * - Test/Mock modu
 * 
 * .env yapılandırması:
 * ESIGN_PROVIDER=eguven|turkcell|etugra|mock
 * ESIGN_API_URL=https://api.eguven.com
 * ESIGN_API_KEY=xxx
 * ESIGN_API_SECRET=xxx
 * ESIGN_CERTIFICATE_PATH=/path/to/cert.p12
 */

export type ESignProvider = 'eguven' | 'turkcell' | 'etugra' | 'mock';

export interface ESignRequest {
  documentId: string;
  documentName: string;
  documentContent: string; // Base64 encoded PDF
  signerId: string;
  signerName: string;
  signerTcNo: string;
  signerEmail?: string;
  signerPhone?: string;
  signatureType: 'QUALIFIED' | 'ADVANCED' | 'SIMPLE';
  signatureReason?: string;
  signatureLocation?: string;
  callbackUrl?: string;
}

export interface ESignResult {
  success: boolean;
  transactionId?: string;
  signedDocument?: string; // Base64 encoded signed PDF
  signatureInfo?: {
    signedAt: Date;
    signerName: string;
    signerTcNo: string;
    certificateSerial?: string;
    certificateIssuer?: string;
    signatureType: string;
  };
  errorCode?: string;
  errorMessage?: string;
  provider: string;
}

export interface ESignVerifyResult {
  isValid: boolean;
  signerInfo?: {
    name: string;
    tcNo?: string;
    signedAt: Date;
    certificateSerial?: string;
    certificateIssuer?: string;
    certificateValidUntil?: Date;
  };
  errorMessage?: string;
}

export interface ESignStatus {
  transactionId: string;
  status: 'PENDING' | 'SIGNED' | 'REJECTED' | 'EXPIRED' | 'ERROR';
  signedDocument?: string;
  signedAt?: Date;
  errorMessage?: string;
}

@Injectable()
export class ESignService {
  private readonly logger = new Logger(ESignService.name);
  private readonly provider: ESignProvider;
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    this.provider = (this.configService.get('ESIGN_PROVIDER') || 'mock') as ESignProvider;
    this.apiUrl = this.configService.get('ESIGN_API_URL') || '';
    this.apiKey = this.configService.get('ESIGN_API_KEY') || '';
    this.apiSecret = this.configService.get('ESIGN_API_SECRET') || '';
  }

  /**
   * Belge imzalama isteği başlat
   */
  async requestSignature(request: ESignRequest): Promise<ESignResult> {
    this.logger.log(`E-imza isteği: ${request.documentName} (${this.provider})`);

    // İsteği logla
    const logEntry = await this.logRequest(request);

    try {
      let result: ESignResult;

      switch (this.provider) {
        case 'eguven':
          result = await this.signViaEGuven(request);
          break;
        case 'turkcell':
          result = await this.signViaTurkcell(request);
          break;
        case 'etugra':
          result = await this.signViaETugra(request);
          break;
        default:
          result = await this.signViaMock(request);
      }

      // Sonucu logla
      await this.updateLogEntry(logEntry.id, result);

      return result;
    } catch (error: any) {
      const errorResult: ESignResult = {
        success: false,
        errorCode: 'ESIGN_ERROR',
        errorMessage: error.message,
        provider: this.provider,
      };
      await this.updateLogEntry(logEntry.id, errorResult);
      return errorResult;
    }
  }

  /**
   * İmza durumunu sorgula
   */
  async checkStatus(transactionId: string): Promise<ESignStatus> {
    this.logger.log(`E-imza durumu sorgulanıyor: ${transactionId}`);

    switch (this.provider) {
      case 'eguven':
        return this.checkStatusEGuven(transactionId);
      case 'turkcell':
        return this.checkStatusTurkcell(transactionId);
      case 'etugra':
        return this.checkStatusETugra(transactionId);
      default:
        return this.checkStatusMock(transactionId);
    }
  }

  /**
   * İmzalı belgeyi doğrula
   */
  async verifySignature(signedDocument: string): Promise<ESignVerifyResult> {
    this.logger.log(`E-imza doğrulanıyor (${this.provider})`);

    switch (this.provider) {
      case 'eguven':
        return this.verifyViaEGuven(signedDocument);
      case 'turkcell':
        return this.verifyViaTurkcell(signedDocument);
      case 'etugra':
        return this.verifyViaETugra(signedDocument);
      default:
        return this.verifyViaMock(signedDocument);
    }
  }

  /**
   * Toplu imza isteği
   */
  async requestBulkSignature(requests: ESignRequest[]): Promise<ESignResult[]> {
    const results: ESignResult[] = [];
    
    for (const request of requests) {
      const result = await this.requestSignature(request);
      results.push(result);
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    return results;
  }

  // ==================== E-GÜVEN ====================

  private async signViaEGuven(request: ESignRequest): Promise<ESignResult> {
    try {
      const response = await fetch(`${this.apiUrl}/sign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
          'X-API-Secret': this.apiSecret,
        },
        body: JSON.stringify({
          document: request.documentContent,
          documentName: request.documentName,
          signerTcNo: request.signerTcNo,
          signerName: request.signerName,
          signerEmail: request.signerEmail,
          signerPhone: request.signerPhone,
          signatureType: request.signatureType,
          signatureReason: request.signatureReason || 'İcra Takibi',
          signatureLocation: request.signatureLocation || 'Türkiye',
          callbackUrl: request.callbackUrl,
        }),
      });

      const data = await response.json();

      if (data.success) {
        return {
          success: true,
          transactionId: data.transactionId,
          signedDocument: data.signedDocument,
          signatureInfo: data.signatureInfo,
          provider: 'eguven',
        };
      }

      return {
        success: false,
        errorCode: data.errorCode,
        errorMessage: data.errorMessage,
        provider: 'eguven',
      };
    } catch (error: any) {
      this.logger.error('E-Güven hatası:', error);
      return {
        success: false,
        errorCode: 'NETWORK_ERROR',
        errorMessage: error.message,
        provider: 'eguven',
      };
    }
  }

  private async checkStatusEGuven(transactionId: string): Promise<ESignStatus> {
    try {
      const response = await fetch(`${this.apiUrl}/status/${transactionId}`, {
        headers: {
          'X-API-Key': this.apiKey,
          'X-API-Secret': this.apiSecret,
        },
      });

      const data = await response.json();
      return {
        transactionId,
        status: data.status,
        signedDocument: data.signedDocument,
        signedAt: data.signedAt ? new Date(data.signedAt) : undefined,
        errorMessage: data.errorMessage,
      };
    } catch (error: any) {
      return {
        transactionId,
        status: 'ERROR',
        errorMessage: error.message,
      };
    }
  }

  private async verifyViaEGuven(signedDocument: string): Promise<ESignVerifyResult> {
    try {
      const response = await fetch(`${this.apiUrl}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
          'X-API-Secret': this.apiSecret,
        },
        body: JSON.stringify({ document: signedDocument }),
      });

      const data = await response.json();
      return {
        isValid: data.isValid,
        signerInfo: data.signerInfo,
        errorMessage: data.errorMessage,
      };
    } catch (error: any) {
      return {
        isValid: false,
        errorMessage: error.message,
      };
    }
  }

  // ==================== TURKCELL ====================

  private async signViaTurkcell(request: ESignRequest): Promise<ESignResult> {
    try {
      // Turkcell Mobil İmza API
      const response = await fetch(`${this.apiUrl}/mobilimza/sign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          msisdn: request.signerPhone, // Turkcell mobil imza telefon numarası gerektirir
          document: request.documentContent,
          documentName: request.documentName,
          signText: request.signatureReason || 'İmzalamak istediğinize emin misiniz?',
        }),
      });

      const data = await response.json();

      if (data.resultCode === '0') {
        return {
          success: true,
          transactionId: data.transactionId,
          provider: 'turkcell',
        };
      }

      return {
        success: false,
        errorCode: data.resultCode,
        errorMessage: data.resultMessage,
        provider: 'turkcell',
      };
    } catch (error: any) {
      this.logger.error('Turkcell hatası:', error);
      return {
        success: false,
        errorCode: 'NETWORK_ERROR',
        errorMessage: error.message,
        provider: 'turkcell',
      };
    }
  }

  private async checkStatusTurkcell(transactionId: string): Promise<ESignStatus> {
    try {
      const response = await fetch(`${this.apiUrl}/mobilimza/status/${transactionId}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      const data = await response.json();
      
      const statusMap: Record<string, ESignStatus['status']> = {
        '0': 'SIGNED',
        '1': 'PENDING',
        '2': 'REJECTED',
        '3': 'EXPIRED',
      };

      return {
        transactionId,
        status: statusMap[data.status] || 'ERROR',
        signedDocument: data.signedDocument,
        signedAt: data.signedAt ? new Date(data.signedAt) : undefined,
        errorMessage: data.errorMessage,
      };
    } catch (error: any) {
      return {
        transactionId,
        status: 'ERROR',
        errorMessage: error.message,
      };
    }
  }

  private async verifyViaTurkcell(signedDocument: string): Promise<ESignVerifyResult> {
    try {
      const response = await fetch(`${this.apiUrl}/mobilimza/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ document: signedDocument }),
      });

      const data = await response.json();
      return {
        isValid: data.resultCode === '0',
        signerInfo: data.signerInfo,
        errorMessage: data.resultMessage,
      };
    } catch (error: any) {
      return {
        isValid: false,
        errorMessage: error.message,
      };
    }
  }

  // ==================== E-TUGRA ====================

  private async signViaETugra(request: ESignRequest): Promise<ESignResult> {
    try {
      const response = await fetch(`${this.apiUrl}/api/sign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Auth-Token': this.apiKey,
        },
        body: JSON.stringify({
          pdfContent: request.documentContent,
          fileName: request.documentName,
          tcKimlikNo: request.signerTcNo,
          adSoyad: request.signerName,
          email: request.signerEmail,
          telefon: request.signerPhone,
          imzaNedeni: request.signatureReason,
          imzaYeri: request.signatureLocation,
        }),
      });

      const data = await response.json();

      if (data.basarili) {
        return {
          success: true,
          transactionId: data.islemId,
          signedDocument: data.imzaliPdf,
          signatureInfo: {
            signedAt: new Date(),
            signerName: request.signerName,
            signerTcNo: request.signerTcNo,
            signatureType: request.signatureType,
          },
          provider: 'etugra',
        };
      }

      return {
        success: false,
        errorCode: data.hataKodu,
        errorMessage: data.hataMesaji,
        provider: 'etugra',
      };
    } catch (error: any) {
      this.logger.error('E-Tugra hatası:', error);
      return {
        success: false,
        errorCode: 'NETWORK_ERROR',
        errorMessage: error.message,
        provider: 'etugra',
      };
    }
  }

  private async checkStatusETugra(transactionId: string): Promise<ESignStatus> {
    try {
      const response = await fetch(`${this.apiUrl}/api/durum/${transactionId}`, {
        headers: {
          'X-Auth-Token': this.apiKey,
        },
      });

      const data = await response.json();
      
      const statusMap: Record<string, ESignStatus['status']> = {
        'BEKLIYOR': 'PENDING',
        'IMZALANDI': 'SIGNED',
        'REDDEDILDI': 'REJECTED',
        'SURESI_DOLDU': 'EXPIRED',
      };

      return {
        transactionId,
        status: statusMap[data.durum] || 'ERROR',
        signedDocument: data.imzaliPdf,
        signedAt: data.imzaTarihi ? new Date(data.imzaTarihi) : undefined,
        errorMessage: data.hataMesaji,
      };
    } catch (error: any) {
      return {
        transactionId,
        status: 'ERROR',
        errorMessage: error.message,
      };
    }
  }

  private async verifyViaETugra(signedDocument: string): Promise<ESignVerifyResult> {
    try {
      const response = await fetch(`${this.apiUrl}/api/dogrula`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Auth-Token': this.apiKey,
        },
        body: JSON.stringify({ imzaliPdf: signedDocument }),
      });

      const data = await response.json();
      return {
        isValid: data.gecerli,
        signerInfo: data.imzaciBilgisi ? {
          name: data.imzaciBilgisi.adSoyad,
          tcNo: data.imzaciBilgisi.tcKimlikNo,
          signedAt: new Date(data.imzaciBilgisi.imzaTarihi),
          certificateSerial: data.imzaciBilgisi.sertifikaSeriNo,
          certificateIssuer: data.imzaciBilgisi.sertifikaVeren,
          certificateValidUntil: data.imzaciBilgisi.sertifikaGecerlilik ? new Date(data.imzaciBilgisi.sertifikaGecerlilik) : undefined,
        } : undefined,
        errorMessage: data.hataMesaji,
      };
    } catch (error: any) {
      return {
        isValid: false,
        errorMessage: error.message,
      };
    }
  }

  // ==================== MOCK ====================

  private async signViaMock(request: ESignRequest): Promise<ESignResult> {
    this.logger.log(`[MOCK E-SIGN] Document: ${request.documentName}`);
    this.logger.log(`[MOCK E-SIGN] Signer: ${request.signerName} (${request.signerTcNo})`);
    
    // Simüle edilmiş gecikme
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const transactionId = `MOCK-${Date.now()}`;
    
    // Mock imzalı belge (gerçekte PDF'e imza eklenir)
    const signedDocument = request.documentContent; // Aynı içerik döner
    
    return {
      success: true,
      transactionId,
      signedDocument,
      signatureInfo: {
        signedAt: new Date(),
        signerName: request.signerName,
        signerTcNo: request.signerTcNo,
        certificateSerial: 'MOCK-CERT-001',
        certificateIssuer: 'Mock CA',
        signatureType: request.signatureType,
      },
      provider: 'mock',
    };
  }

  private async checkStatusMock(transactionId: string): Promise<ESignStatus> {
    // Mock: Her zaman imzalanmış döner
    return {
      transactionId,
      status: 'SIGNED',
      signedAt: new Date(),
    };
  }

  private async verifyViaMock(signedDocument: string): Promise<ESignVerifyResult> {
    // Mock: Her zaman geçerli döner
    return {
      isValid: true,
      signerInfo: {
        name: 'Mock Signer',
        tcNo: '12345678901',
        signedAt: new Date(),
        certificateSerial: 'MOCK-CERT-001',
        certificateIssuer: 'Mock CA',
        certificateValidUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
    };
  }

  // ==================== LOGGING ====================

  private async logRequest(request: ESignRequest) {
    return this.prisma.esignLog.create({
      data: {
        documentId: request.documentId,
        documentName: request.documentName,
        signerId: request.signerId,
        signerName: request.signerName,
        signerTcNo: request.signerTcNo,
        signatureType: request.signatureType,
        provider: this.provider,
        status: 'PENDING',
      },
    });
  }

  private async updateLogEntry(logId: string, result: ESignResult) {
    return this.prisma.esignLog.update({
      where: { id: logId },
      data: {
        transactionId: result.transactionId,
        status: result.success ? 'SUCCESS' : 'FAILED',
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
        signedAt: result.signatureInfo?.signedAt,
        completedAt: new Date(),
      },
    });
  }

  // ==================== HELPERS ====================

  /**
   * Provider durumunu kontrol et
   */
  async checkProviderStatus(): Promise<{ provider: string; configured: boolean; testResult?: ESignResult }> {
    const configured = this.provider !== 'mock' && !!this.apiKey;
    
    return {
      provider: this.provider,
      configured,
    };
  }

  /**
   * İmza geçmişini getir
   */
  async getSignatureHistory(filters?: {
    documentId?: string;
    signerId?: string;
    status?: string;
    limit?: number;
  }) {
    return this.prisma.esignLog.findMany({
      where: {
        documentId: filters?.documentId,
        signerId: filters?.signerId,
        status: filters?.status,
      },
      orderBy: { createdAt: 'desc' },
      take: filters?.limit || 50,
    });
  }

  /**
   * İstatistikleri getir
   */
  async getStats() {
    const [total, pending, success, failed] = await Promise.all([
      this.prisma.esignLog.count(),
      this.prisma.esignLog.count({ where: { status: 'PENDING' } }),
      this.prisma.esignLog.count({ where: { status: 'SUCCESS' } }),
      this.prisma.esignLog.count({ where: { status: 'FAILED' } }),
    ]);

    return { total, pending, success, failed };
  }
}
