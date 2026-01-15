import { Injectable, Logger, BadRequestException, Inject, forwardRef, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PoaService } from '../poa/poa.service';
import { CasePolicyEngine } from '../policy-engine/case-policy-engine.service';
import { ActionCode } from '../policy-engine/types/action-code.enum';

/**
 * UYAP Entegrasyon Servisi
 * 
 * Bu servis UYAP (Ulusal Yargı Ağı Platformu) ile entegrasyon için
 * hazırlanmış stub metodları içerir. Gerçek UYAP API'si açıldığında
 * bu metodlar implement edilecektir.
 * 
 * UYAP Entegrasyonu SOAP/WebService tabanlıdır.
 * Tüm işlemler UyapRequestLog tablosuna kaydedilir.
 * 
 * Policy Engine Entegrasyonu:
 * - Tüm UYAP işlemleri CPE gate kontrolünden geçer
 * - HIGH risk aksiyonlar için CPE onayı zorunludur
 * @see ARCHITECTURE.md
 */

export interface UyapResponse<T = any> {
  success: boolean;
  data?: T;
  errorCode?: string;
  errorMessage?: string;
  evkNo?: string; // Evrak Kayıt Numarası
  requestId: string;
  /** CPE decision trace ID for audit */
  cpeTraceId?: string;
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
  skipCpeCheck?: boolean; // Test için CPE kontrolünü atla
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
  skipCpeCheck?: boolean; // Test için CPE kontrolünü atla
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
    @Optional() @Inject(forwardRef(() => CasePolicyEngine))
    private casePolicyEngine?: CasePolicyEngine,
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
   * 
   * CPE Gate Kontrolü: UYAP_SEND aksiyonu için policy-engine onayı gerekir
   */
  async sendPaymentOrder(request: PaymentOrderRequest): Promise<UyapResponse> {
    let cpeTraceId: string | undefined;

    // CPE Gate kontrolü (HIGH risk aksiyon)
    if (!request.skipCpeCheck && this.casePolicyEngine) {
      try {
        const decision = await this.casePolicyEngine.canPerformAction(
          request.caseId,
          ActionCode.UYAP_SEND,
          {
            debtorId: request.debtor.identityNo,
            userId: request.lawyerId,
          },
        );

        cpeTraceId = decision.traceId;

        if (!decision.allowed) {
          this.logger.error(`UYAP işlemi CPE tarafından engellendi: ${decision.reason}`);
          throw new BadRequestException({
            code: 'CPE_GATE_BLOCKED',
            message: `UYAP işlemi yapılamaz: ${decision.reason}`,
            details: 'Policy engine bu işleme izin vermiyor',
            cpeTraceId,
            cpeCode: decision.code,
          });
        }

        // Soft warnings varsa logla
        if (decision.warnings && decision.warnings.length > 0) {
          this.logger.warn(`CPE warnings for UYAP_SEND:`, decision.warnings);
        }
      } catch (error: any) {
        if (error.response?.code === 'CPE_GATE_BLOCKED') {
          throw error;
        }
        // CPE hatası durumunda fail-open (logla ama devam et)
        this.logger.error('CPE kontrolü başarısız, devam ediliyor:', error);
      }
    }

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
        cpeTraceId,
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
        cpeTraceId,
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
   * 
   * CPE Gate Kontrolü: TRIGGER_HACIZ aksiyonu için policy-engine onayı gerekir (HIGH risk)
   */
  async pushHacizRequest(request: HacizRequest): Promise<UyapResponse> {
    let cpeTraceId: string | undefined;

    // CPE Gate kontrolü (HIGH risk aksiyon)
    if (!request.skipCpeCheck && this.casePolicyEngine) {
      try {
        const decision = await this.casePolicyEngine.canPerformAction(
          request.caseId,
          ActionCode.TRIGGER_HACIZ,
          {
            assetId: request.targetDetails?.assetId,
            userId: request.lawyerId,
          },
        );

        cpeTraceId = decision.traceId;

        if (!decision.allowed) {
          this.logger.error(`Haciz işlemi CPE tarafından engellendi: ${decision.reason}`);
          throw new BadRequestException({
            code: 'CPE_GATE_BLOCKED',
            message: `Haciz talebi yapılamaz: ${decision.reason}`,
            details: 'Policy engine bu işleme izin vermiyor',
            cpeTraceId,
            cpeCode: decision.code,
          });
        }

        // Soft warnings varsa logla
        if (decision.warnings && decision.warnings.length > 0) {
          this.logger.warn(`CPE warnings for TRIGGER_HACIZ:`, decision.warnings);
        }
      } catch (error: any) {
        if (error.response?.code === 'CPE_GATE_BLOCKED') {
          throw error;
        }
        // CPE hatası durumunda fail-closed (haciz yüksek riskli)
        this.logger.error('CPE kontrolü başarısız, haciz engelleniyor:', error);
        throw new BadRequestException({
          code: 'CPE_CHECK_FAILED',
          message: 'Haciz talebi yapılamaz: Güvenlik kontrolü başarısız',
          details: 'Policy engine kontrolü yapılamadı, güvenlik nedeniyle işlem engellendi',
        });
      }
    }

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
        cpeTraceId,
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
   * UYAP'a dosya/evrak gönder
   * Takip talebi, dilekçe vb. evrakları UYAP'a yükler
   */
  async submitDocument(request: {
    caseId: string;
    documentType: 'TAKIP_TALEBI' | 'DILEKCE' | 'BEYAN' | 'ITIRAZ' | 'HACIZ_TALEBI' | 'DIGER';
    documentContent: string; // Base64 encoded PDF
    documentName: string;
    clientId?: string;
    lawyerId?: string;
    tenantId?: string;
    skipPoaCheck?: boolean;
  }): Promise<UyapResponse> {
    // Vekalet kontrolü
    if (!request.skipPoaCheck && request.clientId && request.lawyerId && request.tenantId) {
      const poaValidation = await this.validatePowerOfAttorney(
        request.clientId,
        request.lawyerId,
        request.tenantId,
      );

      if (!poaValidation.isValid) {
        this.logger.error(`UYAP evrak gönderimi engellendi - Vekalet hatası: ${poaValidation.message}`);
        throw new BadRequestException({
          code: 'POA_VALIDATION_FAILED',
          message: `Evrak gönderilemez: ${poaValidation.message}`,
        });
      }
    }

    const requestId = await this.logRequest('submitDocument', {
      caseId: request.caseId,
      documentType: request.documentType,
      documentName: request.documentName,
      hasContent: !!request.documentContent,
    });

    try {
      this.logger.log(`[STUB] UYAP'a evrak gönderiliyor: ${request.documentType} - ${request.documentName}`);

      const response: UyapResponse = {
        success: true,
        requestId,
        evkNo: `DOC-${Date.now()}`,
        data: {
          message: 'Evrak UYAP kuyruğuna alındı (STUB)',
          documentType: request.documentType,
          documentName: request.documentName,
          submittedAt: new Date(),
        },
      };

      await this.logResponse(requestId, response);
      return response;
    } catch (error: any) {
      const errorResponse: UyapResponse = {
        success: false,
        requestId,
        errorCode: 'UYAP_DOCUMENT_ERROR',
        errorMessage: error.message,
      };
      await this.logResponse(requestId, errorResponse, error.message);
      return errorResponse;
    }
  }

  /**
   * Takip durumunu UYAP'tan sorgula
   */
  async queryCaseStatus(caseId: string, uyapDosyaId?: string): Promise<UyapResponse> {
    const requestId = await this.logRequest('queryCaseStatus', { caseId, uyapDosyaId });

    try {
      this.logger.log(`[STUB] UYAP takip durumu sorgulanıyor: ${caseId}`);

      // Veritabanından case bilgilerini al
      const caseData = await this.prisma.case.findUnique({
        where: { id: caseId },
        select: {
          id: true,
          fileNumber: true,
          status: true,
          uyapDosyaId: true,
          uyapBirimKodu: true,
        },
      });

      const response: UyapResponse = {
        success: true,
        requestId,
        data: {
          caseId,
          localStatus: caseData?.status || 'UNKNOWN',
          uyapDosyaId: caseData?.uyapDosyaId || uyapDosyaId,
          uyapStatus: 'PENDING', // UYAP'tan gelecek
          lastSync: new Date(),
          message: 'UYAP durum sorgusu henüz aktif değil (STUB)',
          // Gerçek implementasyonda UYAP'tan gelecek alanlar:
          // uyapStatus: 'ACIK' | 'KAPALI' | 'ARSIV' | 'BEKLEMEDE'
          // lastAction: string
          // pendingActions: string[]
        },
      };

      await this.logResponse(requestId, response);
      return response;
    } catch (error: any) {
      const errorResponse: UyapResponse = {
        success: false,
        requestId,
        errorCode: 'UYAP_STATUS_ERROR',
        errorMessage: error.message,
      };
      await this.logResponse(requestId, errorResponse, error.message);
      return errorResponse;
    }
  }

  /**
   * UYAP'tan borçlu mal varlığı sorgula
   */
  async queryDebtorAssets(debtorIdentityNo: string, caseId: string): Promise<UyapResponse> {
    const requestId = await this.logRequest('queryDebtorAssets', { debtorIdentityNo, caseId });

    try {
      this.logger.log(`[STUB] Borçlu mal varlığı sorgulanıyor: ${debtorIdentityNo}`);

      const response: UyapResponse = {
        success: true,
        requestId,
        data: {
          debtorIdentityNo,
          queryDate: new Date(),
          assets: {
            bankAccounts: [], // Banka hesapları
            vehicles: [], // Araçlar
            properties: [], // Taşınmazlar
            companies: [], // Şirket ortaklıkları
          },
          message: 'Mal varlığı sorgusu henüz aktif değil (STUB)',
        },
      };

      await this.logResponse(requestId, response);
      return response;
    } catch (error: any) {
      const errorResponse: UyapResponse = {
        success: false,
        requestId,
        errorCode: 'UYAP_ASSET_QUERY_ERROR',
        errorMessage: error.message,
      };
      await this.logResponse(requestId, errorResponse, error.message);
      return errorResponse;
    }
  }

  /**
   * UYAP istek geçmişini getir
   */
  async getRequestHistory(caseId?: string, limit = 50): Promise<any[]> {
    const where = caseId
      ? { requestData: { path: ['caseId'], equals: caseId } }
      : {};

    return this.prisma.uyapRequestLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        requestType: true,
        status: true,
        evkNo: true,
        createdAt: true,
        responseAt: true,
        errorMessage: true,
      },
    });
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

  // ==================== DAVA AÇMA (İLGİLİ DAVALAR) ====================

  /**
   * UYAP'a ceza davası (şikayet) gönder
   * Karşılıksız çek, dolandırıcılık vb. ceza davaları için
   */
  async submitCriminalComplaint(request: {
    caseId: string;
    lawsuitType: 'KARSILIKSIZ_CEK' | 'DOLANDIRICILIK' | 'GUVENI_KOTUYE_KULLANMA' | 'RESMI_BELGEDE_SAHTECILIK';
    uyapDavaTuru: string;
    courtType: string;
    documentContent: string; // Base64 encoded PDF/DOCX
    documentName: string;
    complainant: {
      name: string;
      identityNo?: string;
      address?: string;
    };
    suspect: {
      name: string;
      identityNo?: string;
      address?: string;
    };
    instrumentInfo?: {
      type: 'CEK' | 'SENET';
      serialNo: string;
      amount: number;
      currency: string;
      presentationDate?: string;
      dishonorDate?: string;
    };
    clientId?: string;
    lawyerId?: string;
    tenantId?: string;
    skipPoaCheck?: boolean;
  }): Promise<UyapResponse> {
    // Vekalet kontrolü
    if (!request.skipPoaCheck && request.clientId && request.lawyerId && request.tenantId) {
      const poaValidation = await this.validatePowerOfAttorney(
        request.clientId,
        request.lawyerId,
        request.tenantId,
      );

      if (!poaValidation.isValid) {
        this.logger.error(`UYAP ceza davası gönderimi engellendi - Vekalet hatası: ${poaValidation.message}`);
        throw new BadRequestException({
          code: 'POA_VALIDATION_FAILED',
          message: `Şikayet dilekçesi gönderilemez: ${poaValidation.message}`,
        });
      }
    }

    const requestId = await this.logRequest('submitCriminalComplaint', {
      caseId: request.caseId,
      lawsuitType: request.lawsuitType,
      uyapDavaTuru: request.uyapDavaTuru,
      courtType: request.courtType,
      documentName: request.documentName,
      complainant: request.complainant.name,
      suspect: request.suspect.name,
      hasInstrument: !!request.instrumentInfo,
    });

    try {
      this.logger.log(`[STUB] UYAP'a ceza davası gönderiliyor: ${request.lawsuitType} - ${request.documentName}`);

      // UYAP dava türü kodunu belirle
      const uyapCodes: Record<string, string> = {
        'KARSILIKSIZ_CEK': 'CEZA_KARSILIKSIZ_CEK',
        'DOLANDIRICILIK': 'CEZA_DOLANDIRICILIK',
        'GUVENI_KOTUYE_KULLANMA': 'CEZA_GUVENI_KOTUYE_KULLANMA',
        'RESMI_BELGEDE_SAHTECILIK': 'CEZA_SAHTECILIK',
      };

      const response: UyapResponse = {
        success: true,
        requestId,
        evkNo: `CEZA-${Date.now()}`,
        data: {
          message: 'Ceza davası şikayeti UYAP kuyruğuna alındı (STUB)',
          lawsuitType: request.lawsuitType,
          uyapDavaTuru: uyapCodes[request.lawsuitType] || request.uyapDavaTuru,
          courtType: request.courtType,
          documentName: request.documentName,
          submittedAt: new Date(),
          estimatedProcessing: '3-5 iş günü',
          // Gerçek implementasyonda UYAP'tan gelecek:
          // uyapDosyaNo: string
          // mahkemeEsasNo: string
          // durusmatarihi: Date
        },
      };

      // Case'e ilgili dava kaydı ekle (opsiyonel)
      try {
        await this.prisma.caseLifecycle.create({
          data: {
            caseId: request.caseId,
            stage: 'ENFORCEMENT',
            action: 'CRIMINAL_COMPLAINT_SUBMITTED',
            description: `${request.lawsuitType} şikayeti UYAP'a gönderildi`,
            metadata: {
              lawsuitType: request.lawsuitType,
              evkNo: response.evkNo,
              courtType: request.courtType,
            },
          },
        });
      } catch (e) {
        this.logger.warn('Lifecycle event kaydedilemedi:', e);
      }

      await this.logResponse(requestId, response);
      return response;
    } catch (error: any) {
      const errorResponse: UyapResponse = {
        success: false,
        requestId,
        errorCode: 'UYAP_CRIMINAL_COMPLAINT_ERROR',
        errorMessage: error.message,
      };
      await this.logResponse(requestId, errorResponse, error.message);
      return errorResponse;
    }
  }

  /**
   * UYAP'a hukuk davası gönder
   * İtirazın iptali, tasarrufun iptali vb. hukuk davaları için
   */
  async submitCivilLawsuit(request: {
    caseId: string;
    lawsuitType: 'ITIRAZIN_IPTALI' | 'ITIRAZIN_KALDIRILMASI' | 'TASARRUFUN_IPTALI' | 'MENFI_TESPIT' | 'ISTIRDAT';
    uyapDavaTuru: string;
    courtType: string;
    documentContent: string;
    documentName: string;
    plaintiff: {
      name: string;
      identityNo?: string;
      address?: string;
    };
    defendant: {
      name: string;
      identityNo?: string;
      address?: string;
    };
    claimAmount?: number;
    currency?: string;
    relatedExecutionFile?: string;
    clientId?: string;
    lawyerId?: string;
    tenantId?: string;
    skipPoaCheck?: boolean;
  }): Promise<UyapResponse> {
    // Vekalet kontrolü
    if (!request.skipPoaCheck && request.clientId && request.lawyerId && request.tenantId) {
      const poaValidation = await this.validatePowerOfAttorney(
        request.clientId,
        request.lawyerId,
        request.tenantId,
      );

      if (!poaValidation.isValid) {
        this.logger.error(`UYAP hukuk davası gönderimi engellendi - Vekalet hatası: ${poaValidation.message}`);
        throw new BadRequestException({
          code: 'POA_VALIDATION_FAILED',
          message: `Dava dilekçesi gönderilemez: ${poaValidation.message}`,
        });
      }
    }

    const requestId = await this.logRequest('submitCivilLawsuit', {
      caseId: request.caseId,
      lawsuitType: request.lawsuitType,
      uyapDavaTuru: request.uyapDavaTuru,
      courtType: request.courtType,
      documentName: request.documentName,
      plaintiff: request.plaintiff.name,
      defendant: request.defendant.name,
      claimAmount: request.claimAmount,
    });

    try {
      this.logger.log(`[STUB] UYAP'a hukuk davası gönderiliyor: ${request.lawsuitType} - ${request.documentName}`);

      const response: UyapResponse = {
        success: true,
        requestId,
        evkNo: `HUKUK-${Date.now()}`,
        data: {
          message: 'Hukuk davası dilekçesi UYAP kuyruğuna alındı (STUB)',
          lawsuitType: request.lawsuitType,
          uyapDavaTuru: request.uyapDavaTuru,
          courtType: request.courtType,
          documentName: request.documentName,
          claimAmount: request.claimAmount,
          currency: request.currency || 'TRY',
          submittedAt: new Date(),
          estimatedProcessing: '5-7 iş günü',
        },
      };

      // Case'e ilgili dava kaydı ekle
      try {
        await this.prisma.caseLifecycle.create({
          data: {
            caseId: request.caseId,
            stage: 'ENFORCEMENT',
            action: 'CIVIL_LAWSUIT_SUBMITTED',
            description: `${request.lawsuitType} davası UYAP'a gönderildi`,
            metadata: {
              lawsuitType: request.lawsuitType,
              evkNo: response.evkNo,
              courtType: request.courtType,
              claimAmount: request.claimAmount,
            },
          },
        });
      } catch (e) {
        this.logger.warn('Lifecycle event kaydedilemedi:', e);
      }

      await this.logResponse(requestId, response);
      return response;
    } catch (error: any) {
      const errorResponse: UyapResponse = {
        success: false,
        requestId,
        errorCode: 'UYAP_CIVIL_LAWSUIT_ERROR',
        errorMessage: error.message,
      };
      await this.logResponse(requestId, errorResponse, error.message);
      return errorResponse;
    }
  }

  /**
   * İlgili dava durumunu sorgula
   */
  async queryRelatedLawsuitStatus(evkNo: string): Promise<UyapResponse> {
    const requestId = await this.logRequest('queryRelatedLawsuitStatus', { evkNo });

    try {
      this.logger.log(`[STUB] İlgili dava durumu sorgulanıyor: ${evkNo}`);

      const response: UyapResponse = {
        success: true,
        requestId,
        data: {
          evkNo,
          status: 'PENDING', // PENDING, ACCEPTED, REJECTED, IN_PROGRESS, COMPLETED
          queryDate: new Date(),
          message: 'İlgili dava durumu sorgusu henüz aktif değil (STUB)',
          // Gerçek implementasyonda UYAP'tan gelecek:
          // mahkemeEsasNo: string
          // durusmatarihi: Date
          // sonrakiIslem: string
          // kararOzeti: string
        },
      };

      await this.logResponse(requestId, response);
      return response;
    } catch (error: any) {
      const errorResponse: UyapResponse = {
        success: false,
        requestId,
        errorCode: 'UYAP_LAWSUIT_STATUS_ERROR',
        errorMessage: error.message,
      };
      await this.logResponse(requestId, errorResponse, error.message);
      return errorResponse;
    }
  }
}
