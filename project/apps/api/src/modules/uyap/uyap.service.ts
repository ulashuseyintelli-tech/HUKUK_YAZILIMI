import { Injectable, Logger, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PoaService } from '../poa/poa.service';

/**
 * UYAP Entegrasyon Servisi
 * 
 * Bu servis UYAP (Ulusal Yargı Ağı Platformu) ile entegrasyon için
 * hazırlanmış stub metodları içerir. Gerçek UYAP API'si açıldığında
 * bu metodlar implement edilecektir.
 * 
 * UYAP Entegrasyonu SOAP/WebService tabanlıdır.
 * Tüm işlemler UyapRequestLog tablosuna kaydedilir.
 */

export interface UyapResponse<T = any> {
  success: boolean;
  data?: T;
  errorCode?: string;
  errorMessage?: string;
  evkNo?: string; // Evrak Kayıt Numarası
  requestId: string;
}

export interface PaymentOrderRequest {
  caseId: string;
  executionOfficeCode: string;
  creditor: {
    id?: string; // Client ID - vekalet kontrolü için
    name: string;
    identityNo?: string;
    address?: string;
  };
  debtor: {
    name: string;
    identityNo?: string;
    address?: string;
  };
  lawyerId?: string; // Vekalet kontrolü için
  tenantId?: string; // Vekalet kontrolü için
  amount: number;
  currency: string;
  interestType?: string;
  interestStartDate?: Date;
  skipPoaCheck?: boolean; // Test için vekalet kontrolünü atla
}

export interface TebligatStatus {
  tebligatId: string;
  status: 'PENDING' | 'SENT' | 'DELIVERED' | 'RETURNED' | 'FAILED';
  deliveryDate?: Date;
  returnReason?: string;
}

export interface HacizRequest {
  caseId: string;
  targetType: 'BANK' | 'VEHICLE' | 'PROPERTY' | 'SALARY';
  targetDetails: Record<string, any>;
  amount: number;
  clientId?: string; // Vekalet kontrolü için
  lawyerId?: string; // Vekalet kontrolü için
  tenantId?: string; // Vekalet kontrolü için
  skipPoaCheck?: boolean; // Test için vekalet kontrolünü atla
}

export interface PoaValidationResult {
  isValid: boolean;
  message: string;
  daysRemaining?: number;
  poaId?: string;
}

@Injectable()
export class UyapService {
  private readonly logger = new Logger(UyapService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => PoaService))
    private poaService: PoaService,
  ) {}

  /**
   * Vekalet geçerliliğini kontrol et (UYAP işlemlerinden önce)
   * PoaService'i kullanır
   */
  async validatePowerOfAttorney(clientId: string, lawyerId: string, tenantId: string): Promise<PoaValidationResult> {
    if (!clientId || !lawyerId) {
      return {
        isValid: false,
        message: 'Müvekkil veya avukat bilgisi eksik',
      };
    }

    const result = await this.poaService.checkValidPoa(clientId, lawyerId, tenantId);

    if (!result.isValid) {
      // Avukat ve müvekkil isimlerini al
      const [client, lawyer] = await Promise.all([
        this.prisma.client.findUnique({ where: { id: clientId }, select: { displayName: true } }),
        this.prisma.lawyer.findUnique({ where: { id: lawyerId }, select: { name: true, surname: true } }),
      ]);

      return {
        isValid: false,
        message: `${lawyer?.name} ${lawyer?.surname} için ${client?.displayName} müvekkiline ait geçerli vekalet bulunamadı`,
      };
    }

    return {
      isValid: true,
      message: 'Geçerli vekalet mevcut',
      daysRemaining: result.daysRemaining,
      poaId: result.poa?.id,
    };
  }

  /**
   * Takip için tüm müvekkil-avukat kombinasyonlarının vekaletlerini kontrol et
   */
  async validateCasePoaForUyap(caseId: string, tenantId: string): Promise<{ isValid: boolean; errors: string[] }> {
    const caseData = await this.prisma.case.findUnique({
      where: { id: caseId },
      include: {
        caseClients: { include: { client: true } },
        lawyers: { include: { lawyer: true } },
      },
    });

    if (!caseData) {
      return { isValid: false, errors: ['Takip bulunamadı'] };
    }

    const errors: string[] = [];

    // Her müvekkil-avukat kombinasyonu için vekalet kontrolü
    for (const clientEntry of caseData.caseClients) {
      for (const lawyerEntry of caseData.lawyers) {
        const result = await this.validatePowerOfAttorney(
          clientEntry.clientId,
          lawyerEntry.lawyerId,
          tenantId,
        );

        if (!result.isValid) {
          errors.push(result.message);
        } else if (result.daysRemaining !== undefined && result.daysRemaining <= 7) {
          // 7 günden az kaldıysa uyarı (ama bloklamaz)
          this.logger.warn(
            `Vekalet uyarısı: ${result.daysRemaining} gün kaldı - Case: ${caseId}`,
          );
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * UYAP'a ödeme emri gönder
   * Şimdilik stub - gerçek implementasyon UYAP API açıldığında yapılacak
   */
  async sendPaymentOrder(request: PaymentOrderRequest): Promise<UyapResponse> {
    // Vekalet kontrolü
    if (!request.skipPoaCheck && request.creditor.id && request.lawyerId && request.tenantId) {
      const poaValidation = await this.validatePowerOfAttorney(
        request.creditor.id,
        request.lawyerId,
        request.tenantId,
      );

      if (!poaValidation.isValid) {
        this.logger.error(`UYAP işlemi engellendi - Vekalet hatası: ${poaValidation.message}`);
        throw new BadRequestException({
          code: 'POA_VALIDATION_FAILED',
          message: `UYAP işlemi yapılamaz: ${poaValidation.message}`,
          details: 'Geçerli vekalet olmadan UYAP\'a gönderim yapılamaz',
        });
      }
    }

    const requestId = await this.logRequest('sendPaymentOrder', request);

    try {
      // TODO: Gerçek UYAP SOAP çağrısı
      this.logger.log(`[STUB] Ödeme emri gönderiliyor: ${request.caseId}`);

      // Simüle edilmiş başarılı yanıt
      const response: UyapResponse = {
        success: true,
        requestId,
        evkNo: `EVK-${Date.now()}`,
        data: {
          message: 'Ödeme emri kuyruğa alındı (STUB)',
          estimatedDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      };

      await this.logResponse(requestId, response);
      return response;
    } catch (error: any) {
      const errorResponse: UyapResponse = {
        success: false,
        requestId,
        errorCode: 'UYAP_CONNECTION_ERROR',
        errorMessage: error.message || 'UYAP bağlantı hatası',
      };
      await this.logResponse(requestId, errorResponse, error.message);
      return errorResponse;
    }
  }


  /**
   * Tebligat durumunu sorgula
   * E-Tebligat veya PTT tebligat durumu
   */
  async checkTebligatStatus(tebligatId: string): Promise<UyapResponse<TebligatStatus>> {
    const requestId = await this.logRequest('checkTebligatStatus', { tebligatId });

    try {
      // TODO: Gerçek UYAP SOAP çağrısı
      this.logger.log(`[STUB] Tebligat durumu sorgulanıyor: ${tebligatId}`);

      const response: UyapResponse<TebligatStatus> = {
        success: true,
        requestId,
        data: {
          tebligatId,
          status: 'PENDING',
          // Gerçek implementasyonda UYAP'tan gelecek
        },
      };

      await this.logResponse(requestId, response);
      return response;
    } catch (error: any) {
      const errorResponse: UyapResponse<TebligatStatus> = {
        success: false,
        requestId,
        errorCode: 'UYAP_QUERY_ERROR',
        errorMessage: error.message,
      };
      await this.logResponse(requestId, errorResponse, error.message);
      return errorResponse;
    }
  }

  /**
   * Haciz talebi gönder
   * Banka, araç, taşınmaz veya maaş haczi
   */
  async pushHacizRequest(request: HacizRequest): Promise<UyapResponse> {
    // Vekalet kontrolü
    if (!request.skipPoaCheck && request.clientId && request.lawyerId && request.tenantId) {
      const poaValidation = await this.validatePowerOfAttorney(
        request.clientId,
        request.lawyerId,
        request.tenantId,
      );

      if (!poaValidation.isValid) {
        this.logger.error(`UYAP Haciz işlemi engellendi - Vekalet hatası: ${poaValidation.message}`);
        throw new BadRequestException({
          code: 'POA_VALIDATION_FAILED',
          message: `Haciz talebi yapılamaz: ${poaValidation.message}`,
          details: 'Geçerli vekalet olmadan haciz talebi gönderilemez',
        });
      }
    }

    const requestId = await this.logRequest('pushHacizRequest', request);

    try {
      // TODO: Gerçek UYAP SOAP çağrısı
      this.logger.log(`[STUB] Haciz talebi gönderiliyor: ${request.caseId} - ${request.targetType}`);

      const response: UyapResponse = {
        success: true,
        requestId,
        evkNo: `HCZ-${Date.now()}`,
        data: {
          message: `${request.targetType} haciz talebi kuyruğa alındı (STUB)`,
          targetType: request.targetType,
        },
      };

      await this.logResponse(requestId, response);
      return response;
    } catch (error: any) {
      const errorResponse: UyapResponse = {
        success: false,
        requestId,
        errorCode: 'UYAP_HACIZ_ERROR',
        errorMessage: error.message,
      };
      await this.logResponse(requestId, errorResponse, error.message);
      return errorResponse;
    }
  }

  /**
   * E-imza doğrulama
   * Kullanıcının e-imza sertifikasını doğrula
   */
  async verifyUserEsignature(userId: string, certificateData: string): Promise<UyapResponse<boolean>> {
    const requestId = await this.logRequest('verifyUserEsignature', { userId, hasCertificate: !!certificateData });

    try {
      // TODO: Gerçek e-imza doğrulama
      this.logger.log(`[STUB] E-imza doğrulanıyor: ${userId}`);

      const response: UyapResponse<boolean> = {
        success: true,
        requestId,
        data: true, // Stub: her zaman geçerli
      };

      await this.logResponse(requestId, response);
      return response;
    } catch (error: any) {
      const errorResponse: UyapResponse<boolean> = {
        success: false,
        requestId,
        errorCode: 'ESIGN_VERIFY_ERROR',
        errorMessage: error.message,
        data: false,
      };
      await this.logResponse(requestId, errorResponse, error.message);
      return errorResponse;
    }
  }

  /**
   * Dosya bilgilerini UYAP'tan çek
   */
  async fetchCaseFromUyap(uyapDosyaId: string): Promise<UyapResponse> {
    const requestId = await this.logRequest('fetchCaseFromUyap', { uyapDosyaId });

    try {
      this.logger.log(`[STUB] UYAP'tan dosya çekiliyor: ${uyapDosyaId}`);

      const response: UyapResponse = {
        success: true,
        requestId,
        data: {
          message: 'UYAP dosya sorgusu henüz aktif değil (STUB)',
          uyapDosyaId,
        },
      };

      await this.logResponse(requestId, response);
      return response;
    } catch (error: any) {
      const errorResponse: UyapResponse = {
        success: false,
        requestId,
        errorCode: 'UYAP_FETCH_ERROR',
        errorMessage: error.message,
      };
      await this.logResponse(requestId, errorResponse, error.message);
      return errorResponse;
    }
  }

  /**
   * MTS (Merkezi Takip Sistemi) sorgusu
   */
  async checkMtsStatus(mtsReferenceNo: string): Promise<UyapResponse> {
    const requestId = await this.logRequest('checkMtsStatus', { mtsReferenceNo });

    try {
      this.logger.log(`[STUB] MTS durumu sorgulanıyor: ${mtsReferenceNo}`);

      const response: UyapResponse = {
        success: true,
        requestId,
        data: {
          mtsReferenceNo,
          status: 'PENDING', // PENDING, PAID, RETURNED
          message: 'MTS sorgusu henüz aktif değil (STUB)',
        },
      };

      await this.logResponse(requestId, response);
      return response;
    } catch (error: any) {
      const errorResponse: UyapResponse = {
        success: false,
        requestId,
        errorCode: 'MTS_QUERY_ERROR',
        errorMessage: error.message,
      };
      await this.logResponse(requestId, errorResponse, error.message);
      return errorResponse;
    }
  }


  // ==================== LOGGING HELPERS ====================

  /**
   * İstek logla ve requestId döndür
   */
  private async logRequest(requestType: string, requestData: any): Promise<string> {
    const log = await this.prisma.uyapRequestLog.create({
      data: {
        requestType,
        requestData,
        status: 'PENDING',
      },
    });

    this.logger.debug(`UYAP Request logged: ${log.id} - ${requestType}`);
    return log.id;
  }

  /**
   * Yanıtı logla
   */
  private async logResponse(
    requestId: string,
    response: UyapResponse,
    errorMessage?: string,
  ): Promise<void> {
    await this.prisma.uyapRequestLog.update({
      where: { id: requestId },
      data: {
        responseData: response as any,
        responseAt: new Date(),
        status: response.success ? 'SUCCESS' : 'FAILED',
        errorMessage,
        evkNo: response.evkNo,
      },
    });

    this.logger.debug(`UYAP Response logged: ${requestId} - ${response.success ? 'SUCCESS' : 'FAILED'}`);
  }

  /**
   * Başarısız istekleri yeniden dene
   */
  async retryFailedRequests(): Promise<number> {
    const failedRequests = await this.prisma.uyapRequestLog.findMany({
      where: {
        status: 'FAILED',
        retryCount: { lt: 3 }, // Max 3 deneme
      },
      orderBy: { createdAt: 'asc' },
      take: 10,
    });

    let retryCount = 0;

    for (const request of failedRequests) {
      this.logger.log(`Retrying request: ${request.id} - ${request.requestType}`);

      await this.prisma.uyapRequestLog.update({
        where: { id: request.id },
        data: {
          status: 'RETRY',
          retryCount: { increment: 1 },
        },
      });

      // İstek tipine göre yeniden dene
      try {
        switch (request.requestType) {
          case 'sendPaymentOrder':
            await this.sendPaymentOrder(request.requestData as unknown as PaymentOrderRequest);
            break;
          case 'pushHacizRequest':
            await this.pushHacizRequest(request.requestData as unknown as HacizRequest);
            break;
          // Diğer tipler...
        }
        retryCount++;
      } catch (error) {
        this.logger.error(`Retry failed for ${request.id}: ${error}`);
      }
    }

    return retryCount;
  }

  /**
   * UYAP bağlantı durumunu kontrol et
   */
  async checkConnection(): Promise<boolean> {
    // TODO: Gerçek UYAP health check
    this.logger.log('[STUB] UYAP bağlantı kontrolü');
    return true;
  }

  /**
   * İstatistikleri getir
   */
  async getStats(): Promise<{
    total: number;
    pending: number;
    success: number;
    failed: number;
  }> {
    const [total, pending, success, failed] = await Promise.all([
      this.prisma.uyapRequestLog.count(),
      this.prisma.uyapRequestLog.count({ where: { status: 'PENDING' } }),
      this.prisma.uyapRequestLog.count({ where: { status: 'SUCCESS' } }),
      this.prisma.uyapRequestLog.count({ where: { status: 'FAILED' } }),
    ]);

    return { total, pending, success, failed };
  }
}
