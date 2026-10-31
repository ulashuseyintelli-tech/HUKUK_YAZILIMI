/**
 * ENTERPRISE CONTROLLER (v38)
 * 
 * Kurumsal ölçek katmanı API endpoint'leri.
 * - PII masking
 * - Audit chain (HTTP yuzeyi F02-C B-2 ile KALDIRILDI; AuditChainService dahili)
 * - Approval workflow
 * - Job leasing
 * - Backpressure (HTTP yuzeyi F02-C B-2 ile KALDIRILDI; BackpressureService dahili)
 * - Plan limits (HTTP yuzeyi F02-C B-2 ile KALDIRILDI; PlanLimitsService dahili)
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ViewerWriteDenyGuard } from '../../auth/guards/viewer-write-deny.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import {
  CreateApprovalRequestDto,
  SubmitApprovalDecisionDto,
} from './dto/enterprise-approval.dto';
import { ApprovalWorkflowService, ApprovalDecision } from './approval-workflow.service';

// ============================================================
// PII MASKING CONTROLLER — KALDIRILDI
//
// DEBTOR-ENTERPRISE-PII-DIAGNOSTIC-CONTAINMENT-P1-I02 (bulgu R02-F09D)
//
// `POST /icrabot/enterprise/pii/test-mask` ve `GET /icrabot/enterprise/pii/should-mask`
// KIMLIK DOGRULAMASIZ yayindaydi. Endpoint'ler depolanmis PII okumuyordu
// (PiiMaskingService saf/IO-suz), fakat kimliksiz olarak:
//   - hangi alanin hangi rol icin maskelendigini (KVKK maskeleme politikasi) ve
//   - maskeleme fonksiyonlarinin ne kadarini acikta biraktigini
// olculebilir kiliyordu.
//
// Repo genelinde iki bagimsiz tarama uretim tuketicisi bulamadi (frontend 0,
// servis 0, script 0, Python katmaninda HTTP cagrisi 0); route yalniz kendi
// tanimi, iki audit dokumani ve README'de geciyordu. Bu nedenle yetki modeli
// ICAT EDILMEDI — HTTP yuzeyi tamamen kaldirildi.
//
// `PiiMaskingService` KASITLI OLARAK DEGISTIRILMEDI ve provider olarak kayitli
// kalir: ileride gercek bir uretim tuketicisi cikarsa servis yerinde durur,
// ancak public HTTP yuzeyi olmadan.
// ============================================================

// ============================================================
// AUDIT CHAIN CONTROLLER — KALDIRILDI
//
// F02-C B-2 (owner karari 31.10.2026; karar listesi R04 §B B-2 secenek (a): "HTTP yuzeyinden kaldir")
//
// `POST /icrabot/enterprise/audit/log` (tenantId + userId GOVDEDEN) ve `GET /icrabot/enterprise/audit/verify/:tenantId`
// (tenantId URL'den) JwtAuthGuard TASIMIYORDU: kimliksiz bir cagiran baska kiracinin denetim zincirine kayit yazabilir,
// zincir dogrulamasini okuyabilirdi. Depoda web / API / betik cagirani YOK (F02-D-2 dilim 4 ve F02-C taramasi; I01A
// bilinçli "guard yok" bekliyordu). Yetki modeli ICAT EDILMEDI; public HTTP yuzeyi kaldirildi.
//
// `AuditChainService` DEGISTIRILMEDI ve provider olarak kayitli kalir (dahili yetenek). Ileride gercek bir tuketici cikarsa
// principal'dan tenant/aktor okuyan AUTHENTICATED bir yuzey TASARLANARAK eklenir; eski guard'siz uclar geri getirilmez.
// ============================================================

// ============================================================
// APPROVAL WORKFLOW CONTROLLER
// ============================================================
@Controller('icrabot/enterprise/approval')
/**
 * DEBTOR-ENTERPRISE-APPROVAL-AUTHORIZATION-P0-I01 (R02-F09A) — I01A CONTAINMENT
 *
 * Bu sinif ONCEDEN TAMAMEN KIMLIKSIZDI: tenant, actor ve rol dogrudan govdeden/URL'den
 * okunuyordu. Guard BILEREK sinif seviyesindedir ve YALNIZ bu sinifa uygulanir —
 * ayni dosyadaki PII (F09D), audit (F09B) ve leasing (F09C) controller'lari AYRI
 * siniflardir ve davranislari bu gorevde DEGISTIRILMEMISTIR.
 */
// F02-D-2 dilim 4 (owner ek talimatı 30.10.2026): VIEWER onay talebi açamaz / karar veremez (ApprovalWorkflowService rütbe/eligibility soruyor, ROL sormuyor —
// AK-1a: rol kapısı rütbeden ÖNCE). Yalnız bu sınıf (I01A containment korunur: audit / backpressure / plan sınıfları DEĞİŞMEZ —
// o yüzeyler owner kalemiydi → F02-C B-2 (owner kararı 31.10.2026) ile audit / backpressure / plan HTTP yüzeyleri BU DOSYADAN KALDIRILDI; servisler dahili).
@UseGuards(JwtAuthGuard, ViewerWriteDenyGuard)
export class ApprovalWorkflowController {
  constructor(private readonly approvalService: ApprovalWorkflowService) {}

  /**
   * Govdede/URL'de tasinabilen tenant degeri yalniz TUTARLILIK IDDIASIDIR.
   * Kanonik authority principal'dir; uyusmazlik sessizce yok sayilmaz, FAIL-CLOSED.
   */
  private resolveTenantAuthority(principalTenantId: unknown, claimedTenantId?: string): string {
    if (typeof principalTenantId !== 'string' || principalTenantId.length === 0) {
      throw new ForbiddenException('enterprise_approval_tenant_required: principal tenant cozumlenemedi');
    }
    if (typeof claimedTenantId === 'string' && claimedTenantId !== principalTenantId) {
      throw new ForbiddenException('enterprise_approval_tenant_mismatch: tenant iddiasi principal ile uyusmuyor');
    }
    return principalTenantId;
  }

  private resolveActorAuthority(principalUserId: unknown): string {
    if (typeof principalUserId !== 'string' || principalUserId.length === 0) {
      throw new ForbiddenException('enterprise_approval_actor_required: principal actor cozumlenemedi');
    }
    return principalUserId;
  }

  /**
   * Check if approval is required
   */
  @Get('check-required')
  checkRequired(
    @Query('riskLevel') riskLevel?: string,
    @Query('lockId') lockId?: string,
  ) {
    const rule = this.approvalService.isApprovalRequired(riskLevel, lockId);
    return {
      required: !!rule,
      rule,
    };
  }

  /**
   * Create an approval request
   */
  @Post('request')
  @HttpCode(HttpStatus.CREATED)
  async createRequest(
    @Body() body: CreateApprovalRequestDto,
    @CurrentUser('tenantId') principalTenantId: string,
    @CurrentUser('id') principalUserId: string,
  ) {
    // Tenant VE requester kimligi principal'dan turer; govde alanlari authority degildir.
    const tenantId = this.resolveTenantAuthority(principalTenantId, body.tenantId);
    const requestedByUserId = this.resolveActorAuthority(principalUserId);

    const request = await this.approvalService.createApprovalRequest(
      tenantId,
      body.caseId,
      requestedByUserId,
      body.reason,
      {
        jobId: body.jobId,
        riskLevel: body.riskLevel,
        lockId: body.lockId,
      },
    );
    return { ok: true, request };
  }

  /**
   * Submit a decision on an approval request
   */
  @Post('decide')
  @HttpCode(HttpStatus.OK)
  async submitDecision(
    @Body() body: SubmitApprovalDecisionDto,
    @CurrentUser('tenantId') principalTenantId: string,
    @CurrentUser('id') principalUserId: string,
  ) {
    // Tenant ve actor principal'dan turer. `userRole` DTO'dan TAMAMEN CIKARILDI:
    // cagiran kendi rolunu beyan edemez.
    const tenantId = this.resolveTenantAuthority(principalTenantId, body.tenantId);
    const actorUserId = this.resolveActorAuthority(principalUserId);

    const result = await this.approvalService.submitDecisionAuthorized(
      tenantId,
      body.approvalRequestId,
      actorUserId,
      body.decision as ApprovalDecision,
      body.note,
    );
    return { ok: true, ...result };
  }

  /**
   * Get pending approval requests
   */
  /**
   * URL'deki tenant segmenti KORUNUR (route uyumlulugu) ama AUTHORITY DEGILDIR:
   * yalnizca principal tenant'i ile karsilastirilir. Baska tenant'in id'si
   * yazildiginda liste sessizce bos donmez — istek fail-closed reddedilir.
   */
  @Get('pending/:tenantId')
  async getPending(
    @Param('tenantId') pathTenantId: string,
    @CurrentUser('tenantId') principalTenantId: string,
  ) {
    const tenantId = this.resolveTenantAuthority(principalTenantId, pathTenantId);
    const requests = await this.approvalService.getPendingRequests(tenantId);
    return { ok: true, requests };
  }
}

// ============================================================
// JOB LEASING CONTROLLER — KALDIRILDI
//
// DEBTOR-ENTERPRISE-LEASING-CONTAINMENT-P1-I03 (bulgu R02-F09C)
//
// Dort ucun HEPSI YAZMA idi ve HICBIRINDE guard yoktu; tenant ve worker kimligi
// dogrudan istek govdesinden/URL'den okunuyordu:
//   POST /icrabot/enterprise/leasing/acquire          (body: tenantId, workerId)
//   POST /icrabot/enterprise/leasing/release          (body: jobId, workerId, status)
//   POST /icrabot/enterprise/leasing/extend           (body: jobId, workerId)
//   POST /icrabot/enterprise/leasing/cleanup/:tenantId (URL: tenantId)
//
// Kimliksiz bir cagiran boylece baska tenant'in kuyrugundan is kapabiliyor,
// baskasinin isini DONE/FAILED isaretleyebiliyor, lease uzatarak gercek worker'i
// ac birakabiliyor ve bir tenant'in lease'lerini toplu temizleyebiliyordu.
//
// Iki bagimsiz repo taramasi uretim tuketicisi bulamadi: frontend 0, servis 0,
// scheduler/worker 0, Python katmanindaki `job_leasing_pseudo.py` bastan sona
// `# Pseudo-code (Django)` tasarim notu — calisan bir HTTP istemcisi DEGIL.
// Route yalniz kendi tanimi, iki audit dokumani ve README'de geciyordu.
//
// Bu nedenle yetki modeli ICAT EDILMEDI; public HTTP yuzeyi kaldirildi.
//
// `JobLeasingService`, veri modeli ve schema KORUNDU (PRESERVED / DORMANT
// INTERNAL CAPABILITY). Ileride gercek bir worker gerektiginde bu yetenek
// yerinde durur; ancak o noktada AUTHENTICATED bir internal control-plane
// TASARLANARAK eklenmelidir — bu dosyadaki eski guard'siz uclar geri getirilmez.
// ============================================================

// ============================================================
// BACKPRESSURE CONTROLLER — KALDIRILDI
//
// F02-C B-2 (owner karari 31.10.2026): `POST record-action/:tenantId`, `POST enable-throttle` (tenantId govdeden),
// `POST disable-throttle/:tenantId`, `GET status/:tenantId`, `GET config` JwtAuthGuard TASIMIYORDU ve kiraciyi URL/govdeden
// okuyordu (kimliksiz cagiran baska kiraci icin throttle acip kapatabilirdi). Depoda cagiran YOK. Yetki modeli ICAT EDILMEDI;
// public HTTP yuzeyi kaldirildi. `BackpressureService` DEGISTIRILMEDI, provider olarak kalir (dahili yetenek).
// ============================================================

// ============================================================
// PLAN LIMITS CONTROLLER — KALDIRILDI
//
// F02-C B-2 (owner karari 31.10.2026): `GET limits/:plan`, `GET usage/:tenantId`, `GET summary/:tenantId`,
// `GET can-create-case/:tenantId`, `GET can-create-job/:tenantId`, `GET has-feature` JwtAuthGuard TASIMIYORDU ve kiraciyi
// URL'den okuyordu (kimliksiz cagiran baska kiracinin kullanim / kota bilgisini okuyabilirdi). Depoda cagiran YOK. Yetki modeli
// ICAT EDILMEDI; public HTTP yuzeyi kaldirildi. `PlanLimitsService` DEGISTIRILMEDI, provider olarak kalir (dahili yetenek).
// ============================================================
