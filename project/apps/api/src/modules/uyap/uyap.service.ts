import { Injectable, Logger, BadRequestException, ForbiddenException, Inject, forwardRef, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PoaService } from '../poa/poa.service';
import { CasePolicyEngine } from '../policy-engine/case-policy-engine.service';
import { ActionCode } from '../policy-engine/types/action-code.enum';
import { maskIdentity } from '../../common/pii-mask.util';
import { ValidationGateService } from '../validation-gate/validation-gate.service'; // PR-D4e-6: karar-anı risk snapshot
import { IntegrationErrorReporter } from '../error-log/integration-error-reporter'; // PR-3: UYAP hataları → ErrorLog

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
  userId?: string; // PR-D4e-6: karar-anı audit aktörü (yoksa sistem/otomasyon)
  skipPoaCheck?: boolean; // Test için vekalet kontrolünü atla
}

export interface PoaValidationResult {
  isValid: boolean;
  message: string;
  daysRemaining?: number;
  poaId?: string;
}

/**
 * TRANSPORT-CONTAIN-01: gerçek transport bulunmayan (REAL-TRANSPORT=0) tüm stub-success
 * yollarının ortak doğruluk sözleşmesi. Yerel simülasyon başarısı; provider kabulü veya
 * hukuki sonuç ASLA iddia edilmez. `evkNo` bu yollarda hiç doldurulmaz (gelecekte gerçek
 * provider cevabı için ayrılır); yerine izlenebilir yerel referans `stubReference` kullanılır.
 */
const STUB_TRANSPORT_TRUTH = {
  simulated: true,
  dispatched: false,
  providerAccepted: false,
  legalEffectConfirmed: false,
} as const;

@Injectable()
export class UyapService {
  private readonly logger = new Logger(UyapService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => PoaService))
    private poaService: PoaService,
    private validationGate: ValidationGateService, // PR-D4e-6: haciz karar-anı risk snapshot audit
    private readonly errorReporter: IntegrationErrorReporter, // PR-3: UYAP hataları → ErrorLog (source=UYAP)
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
      // CLIENT-SEC-H1 (S1): PII-safe error handling. Kimlik-enrichment lookup'ları kaldırıldı; her
      // geçersiz durumda AYNI generic mesaj döner — kayıt-varlığı veya kimlik (PII) ifşası yok.
      return {
        isValid: false,
        message: 'Geçerli vekalet bulunamadı',
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
    // CLIENT-SEC-H1 (S1): case load tenant-scoped (fail-closed). Cross-tenant caseId eşleşmez →
    // caseData null → 'Takip bulunamadı' (varlık ifşası yok).
    const caseData = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
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
  // CLIENT-SEC-H2C-P02-R1: `tenantId` trusted execution context (authenticated principal,
  // controller @CurrentUser) — business DTO'nun opsiyonel `request.tenantId` (POA) alanından
  // AYRI ve zorunludur; log ownership yalnız buradan gelir. Business/POA davranışı DEĞİŞMEZ.
  async sendPaymentOrder(request: PaymentOrderRequest, tenantId: string): Promise<UyapResponse> {
    let cpeTraceId: string | undefined;

    // CPE Gate kontrolü (HIGH risk aksiyon)
    // TRANSPORT-CONTAIN-01: action-matrix UYAP_SEND=failMode:'CLOSED' ile uzlaştırıldı —
    // CasePolicyEngine yokluğu veya teknik hata artık fail-open DEĞİL, fail-closed'tır
    // (pushHacizRequest zaten bu davranıştaydı; ödeme emri buna eşitlendi).
    if (!this.casePolicyEngine) {
      this.logger.error('UYAP ödeme emri engellendi: Policy engine kullanılamıyor');
      throw new BadRequestException({
        code: 'CPE_CHECK_FAILED',
        message: 'UYAP işlemi yapılamaz: Güvenlik kontrolü kullanılamıyor',
        details: 'Policy engine kullanılamıyor, güvenlik nedeniyle işlem engellendi',
      });
    }

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
      // TRANSPORT-CONTAIN-01: CPE teknik hatası artık fail-closed (önceden fail-open idi).
      this.logger.error('CPE kontrolü başarısız, ödeme emri engelleniyor:', error);
      throw new BadRequestException({
        code: 'CPE_CHECK_FAILED',
        message: 'UYAP işlemi yapılamaz: Güvenlik kontrolü başarısız',
        details: 'Policy engine kontrolü yapılamadı, güvenlik nedeniyle işlem engellendi',
      });
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

    const requestId = await this.logRequest('sendPaymentOrder', request, tenantId);

    try {
      // TODO: Gerçek UYAP SOAP çağrısı
      this.logger.log(`[STUB] Ödeme emri gönderiliyor: ${request.caseId}`);

      // Simüle edilmiş başarılı yanıt — TRANSPORT-CONTAIN-01: yerel simülasyon, gerçek gönderim DEĞİL.
      const response: UyapResponse = {
        success: true,
        requestId,
        cpeTraceId,
        data: {
          ...STUB_TRANSPORT_TRUTH,
          stubReference: `EVK-${Date.now()}`,
          message: 'Ödeme emri için yerel UYAP gönderim simülasyonu oluşturuldu; gerçek UYAP gönderimi yapılmadı.',
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
  async checkTebligatStatus(tebligatId: string, tenantId: string): Promise<UyapResponse<TebligatStatus>> {
    // CLIENT-SEC-H2C-P02: fail-closed — tenantId authenticated context'ten gelmeli.
    if (!tenantId) {
      throw new ForbiddenException('Tenant context required');
    }
    const requestId = await this.logRequest('checkTebligatStatus', { tebligatId }, tenantId);

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
  // CLIENT-SEC-H2C-P02-R1: `tenantId` trusted execution context (authenticated principal) —
  // business DTO'nun opsiyonel `request.tenantId` (POA + D4e-6 audit) alanından AYRI ve zorunludur;
  // log ownership yalnız buradan gelir. POA/audit davranışı request.tenantId'yi kullanmaya devam eder.
  async pushHacizRequest(request: HacizRequest, tenantId: string): Promise<UyapResponse> {
    let cpeTraceId: string | undefined;
    let cpeWarnings: any[] = []; // PR-D4e-6: CPE soft warnings audit metadata'sına eklenecek

    // CPE Gate kontrolü (HIGH risk aksiyon)
    if (this.casePolicyEngine) {
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

        // Soft warnings varsa logla + audit metadata'sı için sakla (D4e-6)
        if (decision.warnings && decision.warnings.length > 0) {
          this.logger.warn(`CPE warnings for TRIGGER_HACIZ:`, decision.warnings);
          cpeWarnings = decision.warnings;
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

    const requestId = await this.logRequest('pushHacizRequest', request, tenantId);

    // PR-D4e-6: KARAR-ANI risk snapshot audit (best-effort, BLOK YOK — audit hatası haczi kesmez).
    await this.auditHacizDecision(request, requestId, cpeTraceId, cpeWarnings);

    try {
      // TODO: Gerçek UYAP SOAP çağrısı
      this.logger.log(`[STUB] Haciz talebi gönderiliyor: ${request.caseId} - ${request.targetType}`);

      // TRANSPORT-CONTAIN-01: yerel simülasyon, gerçek gönderim DEĞİL.
      const response: UyapResponse = {
        success: true,
        requestId,
        cpeTraceId,
        data: {
          ...STUB_TRANSPORT_TRUTH,
          stubReference: `HCZ-${Date.now()}`,
          message: `${request.targetType} haczi için yerel UYAP gönderim simülasyonu oluşturuldu; gerçek UYAP gönderimi yapılmadı.`,
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
  // CLIENT-SEC-H2C-P02-R1: `tenantId` trusted execution context — DTO'nun opsiyonel `request.tenantId`
  // (POA) alanından AYRI ve zorunlu; log ownership yalnız buradan gelir.
  async submitDocument(request: {
    caseId: string;
    documentType: 'TAKIP_TALEBI' | 'DILEKCE' | 'BEYAN' | 'ITIRAZ' | 'HACIZ_TALEBI' | 'DIGER';
    documentContent: string; // Base64 encoded PDF
    documentName: string;
    clientId?: string;
    lawyerId?: string;
    tenantId?: string;
    skipPoaCheck?: boolean;
  }, tenantId: string): Promise<UyapResponse> {
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
    }, tenantId);

    try {
      this.logger.log(`[STUB] UYAP'a evrak gönderiliyor: ${request.documentType} - ${request.documentName}`);

      // TRANSPORT-CONTAIN-01: yerel simülasyon, gerçek gönderim DEĞİL.
      const response: UyapResponse = {
        success: true,
        requestId,
        data: {
          ...STUB_TRANSPORT_TRUTH,
          stubReference: `DOC-${Date.now()}`,
          message: 'Evrak için yerel UYAP gönderim simülasyonu oluşturuldu; gerçek UYAP gönderimi yapılmadı.',
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
  // CLIENT-SEC-H2B: tenantId zorunlu parametre (CLIENT-SEC-H1 S1'in aynı dosyadaki
  // validatePowerOfAttorney/validateCasePoaForUyap deseniyle birebir). Cross-tenant ve
  // nonexistent case AYNI sonucu (localStatus:'UNKNOWN') üretir — varlık ifşası yok.
  async queryCaseStatus(caseId: string, tenantId: string, uyapDosyaId?: string): Promise<UyapResponse> {
    const requestId = await this.logRequest('queryCaseStatus', { caseId, uyapDosyaId }, tenantId);

    try {
      this.logger.log(`[STUB] UYAP takip durumu sorgulanıyor: ${caseId}`);

      // Veritabanından case bilgilerini al (tenant-scoped)
      const caseData = await this.prisma.case.findFirst({
        where: { id: caseId, tenantId },
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
  async queryDebtorAssets(debtorIdentityNo: string, caseId: string, tenantId: string): Promise<UyapResponse> {
    // CLIENT-SEC-H2C-P02: fail-closed — tenantId authenticated context'ten gelmeli.
    if (!tenantId) {
      throw new ForbiddenException('Tenant context required');
    }
    const requestId = await this.logRequest('queryDebtorAssets', { debtorIdentityNo, caseId }, tenantId);

    try {
      this.logger.log(`[STUB] Borçlu mal varlığı sorgulanıyor: ${maskIdentity(debtorIdentityNo)}`);

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
  async checkMtsStatus(mtsReferenceNo: string, tenantId: string): Promise<UyapResponse> {
    // CLIENT-SEC-H2C-P02: fail-closed — tenantId authenticated context'ten gelmeli.
    if (!tenantId) {
      throw new ForbiddenException('Tenant context required');
    }
    const requestId = await this.logRequest('checkMtsStatus', { mtsReferenceNo }, tenantId);

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
  // CLIENT-SEC-H2C-P02: tenantId opsiyonel — bazı requestType'lar (case-bağımsız dış-referans
  // sorguları) için güvenilir tenant kaynağı olmayabilir (bkz. çağıranlar); bu satırlarda NULL
  // kalması bilinçlidir, sentinel/sahte tenant ÜRETİLMEZ. Mevcut satırlar/update yolu etkilenmez.
  private async logRequest(requestType: string, requestData: any, tenantId?: string): Promise<string> {
    const log = await this.prisma.uyapRequestLog.create({
      data: {
        requestType,
        requestData,
        // PR-D4e-6/D6-Q5: transport log'unda caseId boş kalıyordu; requestData'dan set et.
        caseId: requestData?.caseId ?? null,
        tenantId: tenantId ?? null,
        status: 'PENDING',
      },
    });

    this.logger.debug(`UYAP Request logged: ${log.id} - ${requestType}`);
    return log.id;
  }

  /**
   * PR-D4e-6: Haciz talebi gönderim anında BACKEND'in hesapladığı saha istihbaratı riskini
   * AuditLog'a değiştirilemez snapshot olarak yazar (karar-anı izi). Bu CANLI skor persist'i
   * DEĞİL; nokta-anı audit olayıdır. BLOK YOK + BEST-EFFORT: hesap/yazım hatası haczi KESMEZ.
   * Risk client snapshot'ından DEĞİL, submission anında YENİDEN hesaplanır (tamper-proof).
   * Aktör userId; yoksa sistem/otomasyon (retry yolu kullanıcısız). tenantId yoksa atlanır.
   * <remarks>
   * Çağrıldığı yerler:
   * - UyapService.pushHacizRequest() → haciz gönderiminden hemen sonra (logRequest ardından)
   * </remarks>
   */
  private async auditHacizDecision(
    request: HacizRequest,
    requestId: string,
    cpeTraceId: string | undefined,
    cpeWarnings: any[],
  ): Promise<void> {
    try {
      if (!request.tenantId) {
        this.logger.warn('[D4e-6] Haciz audit atlandı: tenantId yok');
        return;
      }

      // Submission anında backend-otoriter risk (client snapshot'a güvenme).
      const risk = await this.validationGate.checkPreHacizIntelligence(request.tenantId, request.caseId);

      await this.prisma.auditLog.create({
        data: {
          tenantId: request.tenantId,
          action: 'HACIZ_REQUEST_SUBMITTED',
          entityType: 'CASE',
          entityId: request.caseId,
          userId: request.userId ?? null,
          userName: request.userId ? null : 'SYSTEM',
          // TRANSPORT-CONTAIN-01: yerel simülasyon; gerçek UYAP gönderimi/provider kabulü/hukuki
          // sonuç iddia edilmez ("gönderildi" → "yerel simülasyon oluşturuldu").
          description: `Haciz talebi için yerel simülasyon oluşturuldu (${request.targetType}); gerçek UYAP gönderimi yapılmadı. Karar-anı risk: ${risk.overallLevel}.`,
          metadata: {
            targetType: request.targetType,
            amount: request.amount,
            uyapRequestId: requestId,
            cpeTraceId: cpeTraceId ?? null,
            overallLevel: risk.overallLevel,
            debtors: risk.debtors.map((d) => ({
              debtorId: d.debtorId,
              name: d.name,
              level: d.level,
              reasonIds: d.reasons.map((r) => r.id),
            })),
            cpeWarnings,
            ...STUB_TRANSPORT_TRUTH,
          },
        },
      });
    } catch (error: any) {
      // BEST-EFFORT: audit hatası haciz talebini ASLA başarısız yapmaz.
      this.logger.error(`[D4e-6] Haciz karar-anı audit yazılamadı (haciz etkilenmez): ${error?.message}`);
    }
  }

  /**
   * Yanıtı logla
   */
  private async logResponse(
    requestId: string,
    response: UyapResponse,
    errorMessage?: string,
  ): Promise<void> {
    const updated = await this.prisma.uyapRequestLog.update({
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

    // PR-3: TÜM UYAP operasyon başarısızlıkları bu ortak yoldan geçer → ErrorLog (source=UYAP).
    // report() fire-and-forget + swallow + PII-redacted; ham UYAP payload/taraf verisi/TCKN YAZILMAZ.
    if (!response.success) {
      void this.errorReporter.report({
        source: 'UYAP',
        operation: `uyap.${updated.requestType ?? 'request'}`,
        error: {
          name: response.errorCode ?? 'UyapError',
          message: errorMessage ?? response.errorMessage ?? 'UYAP işlemi başarısız',
        },
        metadata: { safeErrorCode: response.errorCode, retryCount: updated.retryCount },
      });
    }
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
      // CLIENT-SEC-H2C-P02-R1: re-dispatch'te trusted tenant LOG SATIRININ KENDİ `tenantId`'sinden
      // alınır (requestData'dan DEĞİL). Legacy `tenantId=NULL` satırlar için sahte tenant ÜRETİLMEZ;
      // re-dispatch atlanır (yeni NULL-owned log oluşmaz). Bu, legacy-null satırların re-dispatch
      // davranışında bilinçli bir daralmadır (status/retryCount güncellemesi değişmez); scope
      // genişletilmeden burada raporlanır (bkz. PR açıklaması).
      try {
        switch (request.requestType) {
          case 'sendPaymentOrder':
            if (request.tenantId) {
              await this.sendPaymentOrder(request.requestData as unknown as PaymentOrderRequest, request.tenantId);
            } else {
              this.logger.warn(`CLIENT-SEC-H2C-P02-R1: legacy tenant-less kayıt re-dispatch atlandı (sahte tenant üretilmez): ${request.id}`);
            }
            break;
          case 'pushHacizRequest':
            if (request.tenantId) {
              await this.pushHacizRequest(request.requestData as unknown as HacizRequest, request.tenantId);
            } else {
              this.logger.warn(`CLIENT-SEC-H2C-P02-R1: legacy tenant-less kayıt re-dispatch atlandı (sahte tenant üretilmez): ${request.id}`);
            }
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
  // SEC-XTEN-UYAP-STATS-01: tenantId zorunlu, authenticated principal'dan gelir (DTO/query/header
  // DEĞİL). Eksik/boş/whitespace tenantId → fail-closed sıfır sonuç, Prisma'ya HİÇ ulaşılmaz;
  // undefined tenant filtresinin Prisma tarafından sessizce yoksayılmasına güvenilmez. Tenant-scoped
  // eşitlik filtresi legacy tenantId=NULL kayıtları doğal olarak dışlar (SQL NULL eşitlik semantiği).
  async getStats(tenantId: string): Promise<{
    total: number;
    pending: number;
    success: number;
    failed: number;
  }> {
    if (!tenantId || !tenantId.trim()) {
      return { total: 0, pending: 0, success: 0, failed: 0 };
    }

    const [total, pending, success, failed] = await Promise.all([
      this.prisma.uyapRequestLog.count({ where: { tenantId } }),
      this.prisma.uyapRequestLog.count({ where: { tenantId, status: 'PENDING' } }),
      this.prisma.uyapRequestLog.count({ where: { tenantId, status: 'SUCCESS' } }),
      this.prisma.uyapRequestLog.count({ where: { tenantId, status: 'FAILED' } }),
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
  }, tenantId: string): Promise<UyapResponse> {
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

    // CLIENT-SEC-H2C-P02-R1: log ownership trusted `tenantId` param'ından (DTO'dan DEĞİL).
    const requestId = await this.logRequest('submitCriminalComplaint', {
      caseId: request.caseId,
      lawsuitType: request.lawsuitType,
      uyapDavaTuru: request.uyapDavaTuru,
      courtType: request.courtType,
      documentName: request.documentName,
      complainant: request.complainant.name,
      suspect: request.suspect.name,
      hasInstrument: !!request.instrumentInfo,
    }, tenantId);

    try {
      this.logger.log(`[STUB] UYAP'a ceza davası gönderiliyor: ${request.lawsuitType} - ${request.documentName}`);

      // UYAP dava türü kodunu belirle
      const uyapCodes: Record<string, string> = {
        'KARSILIKSIZ_CEK': 'CEZA_KARSILIKSIZ_CEK',
        'DOLANDIRICILIK': 'CEZA_DOLANDIRICILIK',
        'GUVENI_KOTUYE_KULLANMA': 'CEZA_GUVENI_KOTUYE_KULLANMA',
        'RESMI_BELGEDE_SAHTECILIK': 'CEZA_SAHTECILIK',
      };

      // TRANSPORT-CONTAIN-01: yerel simülasyon, gerçek gönderim DEĞİL.
      const response: UyapResponse = {
        success: true,
        requestId,
        data: {
          ...STUB_TRANSPORT_TRUTH,
          stubReference: `CEZA-${Date.now()}`,
          message: 'Ceza davası şikayeti için yerel UYAP gönderim simülasyonu oluşturuldu; gerçek UYAP gönderimi yapılmadı.',
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
            // TRANSPORT-CONTAIN-01: "gönderildi" (koşulsuz) → "yerel simülasyon oluşturuldu".
            description: `${request.lawsuitType} şikayeti için yerel UYAP gönderim simülasyonu oluşturuldu; gerçek UYAP gönderimi yapılmadı.`,
            metadata: {
              lawsuitType: request.lawsuitType,
              stubReference: response.data?.stubReference ?? null,
              courtType: request.courtType,
              ...STUB_TRANSPORT_TRUTH,
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
  }, tenantId: string): Promise<UyapResponse> {
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

    // CLIENT-SEC-H2C-P02-R1: log ownership trusted `tenantId` param'ından (DTO'dan DEĞİL).
    const requestId = await this.logRequest('submitCivilLawsuit', {
      caseId: request.caseId,
      lawsuitType: request.lawsuitType,
      uyapDavaTuru: request.uyapDavaTuru,
      courtType: request.courtType,
      documentName: request.documentName,
      plaintiff: request.plaintiff.name,
      defendant: request.defendant.name,
      claimAmount: request.claimAmount,
    }, tenantId);

    try {
      this.logger.log(`[STUB] UYAP'a hukuk davası gönderiliyor: ${request.lawsuitType} - ${request.documentName}`);

      // TRANSPORT-CONTAIN-01: yerel simülasyon, gerçek gönderim DEĞİL.
      const response: UyapResponse = {
        success: true,
        requestId,
        data: {
          ...STUB_TRANSPORT_TRUTH,
          stubReference: `HUKUK-${Date.now()}`,
          message: 'Hukuk davası dilekçesi için yerel UYAP gönderim simülasyonu oluşturuldu; gerçek UYAP gönderimi yapılmadı.',
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
            // TRANSPORT-CONTAIN-01: "gönderildi" (koşulsuz) → "yerel simülasyon oluşturuldu".
            description: `${request.lawsuitType} davası için yerel UYAP gönderim simülasyonu oluşturuldu; gerçek UYAP gönderimi yapılmadı.`,
            metadata: {
              lawsuitType: request.lawsuitType,
              stubReference: response.data?.stubReference ?? null,
              courtType: request.courtType,
              claimAmount: request.claimAmount,
              ...STUB_TRANSPORT_TRUTH,
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
  async queryRelatedLawsuitStatus(evkNo: string, tenantId: string): Promise<UyapResponse> {
    // CLIENT-SEC-H2C-P02: fail-closed — tenantId authenticated context'ten gelmeli.
    if (!tenantId) {
      throw new ForbiddenException('Tenant context required');
    }
    const requestId = await this.logRequest('queryRelatedLawsuitStatus', { evkNo }, tenantId);

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
