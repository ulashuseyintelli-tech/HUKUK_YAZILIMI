import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { OfficeApprovalExecutionStatus, OfficeApprovalStatus } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { OfficeApprovalService } from './office-approval.service';
import { OfficeApprovalExecutorService } from './office-approval-executor.service';

/**
 * OFFICE-A07 — KONTROLLU YURUTME (execute) + HEDEFLI RECONCILE.
 *
 * NEDEN VAR: `OfficeApprovalExecutorService.execute()`'un urun kodunda TEK cagirani
 * cron'dur ve onay akisi controller'inda yurutme ucu YOKTU. Sonuc: ADR-009 tek-motor
 * yurutme izini uretebilen tek yol cron'du — yani "cron kabul satirini yurutmesin" ile
 * "yurutme izi uret" AYNI ANDA saglanamiyordu. Bu servis, izi KONTROLLU ve GOZLENEBILIR
 * bir yoldan uretir; boylece kabul cron'a IHTIYAC DUYMAZ ve genel cron bayragi KAPALI
 * kalabilir (bu, "bayraga guvenmek" degil, "bayraga ihtiyac duymamak"tir).
 *
 * DEGISTIRMEDIKLERI (bilincli):
 *   - `OfficeApprovalExecutorCronService` ve `reconcileStuckRunning` AYNEN kalir. Genel cron
 *     davranisi DEGISMEZ; bu servisin reconcile'i AYRI ve YALNIZ HEDEF talep uzerinde calisir,
 *     genel tarama BASLATMAZ.
 *   - `isF01ActorAuthorized` paylasimli predicate'tir; DOKUNULMAZ.
 *
 * KAPI SIRASI (hepsi fail-closed, bayrak yetki YERINE GECMEZ):
 *   1. Kabul bayragi (varsayilan KAPALI, genel cron bayragindan BAGIMSIZ ad)
 *   2. ADMIN rolu
 *   3. F01 aktor kapisi — tenant'in ofisi SUNUCUDA cozulur; istemciden gelen tenant/ofis
 *      degeri guvenilir baglam SAYILMAZ. Ofis yoksa VEYA aktorun iliskilerinde tenant/ofis
 *      uyusmazligi varsa REDDEDILIR.
 *   4. Talep tenant-kapsamli okunur (cross-tenant/yok -> 404; varlik sizdirma yok)
 *   5. Kapsam: yalniz CHANGE_STATUS / LegalCase
 */
@Injectable()
export class OfficeApprovalControlledExecutionService {
  private readonly logger = new Logger(OfficeApprovalControlledExecutionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly officeApproval: OfficeApprovalService,
    private readonly executor: OfficeApprovalExecutorService,
  ) {}

  /**
   * Kabul bayragi. **Genel cron bayragi `OFFICE_APPROVAL_EXECUTOR_ENABLED`'DAN BAGIMSIZDIR**
   * ve varsayilani KAPALI'dir (yokluk dahil). Bayrak ACIKKEN de asagidaki yetki/kapsam
   * kontrollerinin HEPSI zorunludur — bayrak yetki yerine GECMEZ.
   */
  private isEnabled(): boolean {
    return String(process.env.OFFICE_APPROVAL_CONTROLLED_EXECUTION_ENABLED ?? '')
      .trim().toLowerCase() === 'true';
  }

  private assertEnabled(): void {
    if (!this.isEnabled()) {
      throw new ForbiddenException('OFFICE_APPROVAL_CONTROLLED_EXECUTION_DISABLED');
    }
  }

  /**
   * Yetki: bayrak -> ADMIN -> F01 (SUNUCUDA cozulen ofis baglamiyla).
   *
   * `Office.tenantId` **@unique**: bir tenant'ta EN FAZLA BIR ofis vardir ("tam olarak bir"
   * DEGIL). Ofis bulunamazsa fail-closed REDDEDILIR — yoklugu "kontrol atlanabilir" anlamina
   * GELMEZ.
   *
   * NOT (dar kapsam): bu kontrol AK-1c'yi veya butun F01 yuzeylerini KAPATMAZ. Avukat bagi
   * olmayan bir ADMIN'de `isF01ActorAuthorized` ofis karsilastirmasini yapisal olarak atlar;
   * bu residual owner karari olarak ACIK kalir ve burada kapandigi IDDIA EDILMEZ.
   */
  private async assertAuthorized(actorUserId: string, actorRole: string, tenantId: string): Promise<void> {
    this.assertEnabled();
    if (!actorUserId || !tenantId) throw new ForbiddenException('OFFICE_F01_AUTHORIZATION_REQUIRED');
    if (actorRole !== 'ADMIN') throw new ForbiddenException('OFFICE_CONTROLLED_EXECUTION_ADMIN_REQUIRED');

    const office = await this.prisma.office.findUnique({
      where: { tenantId },
      select: { id: true },
    });
    if (!office) throw new ForbiddenException('OFFICE_CONTEXT_UNRESOLVED');

    const ok = await this.officeApproval.isF01ActorAuthorized(actorUserId, tenantId, office.id);
    if (!ok) throw new ForbiddenException('OFFICE_F01_AUTHORIZATION_REQUIRED');
  }

  /** Talebi tenant-kapsamli oku + kapsam kontrolu (CHANGE_STATUS/LegalCase). */
  private async requireInScopeRequest(requestId: string, tenantId: string) {
    const req = await this.prisma.officeApprovalRequest.findFirst({
      where: { id: requestId, tenantId },
    });
    if (!req) throw new NotFoundException('Onay talebi bulunamadı.');
    if (req.actionCode !== 'CHANGE_STATUS' || req.targetType !== 'LegalCase') {
      throw new BadRequestException(
        `UNSUPPORTED_ACTION_CODE: kontrollü yürütme kapsamı CHANGE_STATUS/LegalCase; '${req.actionCode}/${req.targetType}' yürütülmez.`,
      );
    }
    return req;
  }

  /**
   * KONTROLLU EXECUTE — tek ve acikca belirtilen talep.
   *
   * Tekrar / eszamanli / terminal kayit uzerinde cagri: mevcut `markExecutionRunning` STRICT
   * `NOT_RUN -> RUNNING` compare-and-set fence'i islemi IKINCI KEZ UYGULATMAZ; CAS dusunce
   * `ConflictException` yukselir. Bu fence DEGISTIRILMEDI, KULLANILDI.
   */
  async execute(requestId: string, tenantId: string, actorUserId: string, actorRole: string) {
    await this.assertAuthorized(actorUserId, actorRole, tenantId);
    await this.requireInScopeRequest(requestId, tenantId);
    this.logger.log(`controlled execute(${requestId}) — actor=${actorUserId}`);
    return this.executor.execute(requestId, tenantId, actorUserId);
  }

  /**
   * HEDEFLI RECONCILE — YALNIZ verilen talep. Genel cron taramasi BASLATMAZ; baska taleplere
   * veya gercek tenant kayitlarina ERISMEZ.
   *
   * KANIT ESIGI (owner sarti: "islemin gerceklestigini KANITLAMADAN SUCCEEDED yazmasin"):
   * `caseStatus === intent.status` karsilastirmasi YETERSIZDIR — statu gecisleri serbesttir
   * (P3-2B-1) ve ayni statuye BASKA bir yoldan gelinmis olabilir; ustelik `changeStatus`in
   * IKI uretim cagirani vardir, yani ayni aktor controller uzerinden BIREBIR AYNI GORUNEN bir
   * history satiri uretebilir. Bu yuzden kanit, **talebe VE denemeye ozgu kesin bag**tir:
   *     CaseStatusHistory.approvalRequestId = <talep id> AND approvalAttempt = <deneme>
   * Bulunamazsa SUCCEEDED YAZILMAZ; sonuc BELIRSIZ doner ve kabul KAPANMAZ.
   *
   * GECMISE DONUK DOLDURMA YOK: bagi olmayan eski kayitlar bu yolda basariya YUKSELTILMEZ.
   */
  async reconcile(requestId: string, tenantId: string, actorUserId: string, actorRole: string) {
    await this.assertAuthorized(actorUserId, actorRole, tenantId);
    const req = await this.requireInScopeRequest(requestId, tenantId);

    if (req.executionStatus !== OfficeApprovalExecutionStatus.RUNNING) {
      throw new ConflictException(
        `Hedefli reconcile yalnız RUNNING talepte anlamlıdır (durum: ${req.executionStatus}).`,
      );
    }
    const executable =
      req.status === OfficeApprovalStatus.APPROVED || req.status === OfficeApprovalStatus.APPROVED_WITH_CHANGES;
    if (!executable) {
      throw new ConflictException(`Yalnız APPROVED/APPROVED_WITH_CHANGES uzlaştırılabilir (durum: ${req.status}).`);
    }

    // KESIN BAG ARANIR — tahmin YOK, zaman penceresi YOK.
    const evidence = await this.prisma.caseStatusHistory.findFirst({
      where: { approvalRequestId: req.id, approvalAttempt: req.retryCount },
      select: { id: true, toStatus: true, createdAt: true },
    });

    if (!evidence) {
      this.logger.warn(`controlled reconcile(${requestId}): kesin bag YOK → BELIRSIZ (SUCCEEDED yazılmadı)`);
      return {
        reconciled: false,
        verdict: 'BELIRSIZ' as const,
        reason: 'EXECUTION_EVIDENCE_NOT_FOUND',
        requestId: req.id,
        attempt: req.retryCount,
        detail:
          'Bu talebe ve denemeye özgü CaseStatusHistory bağı bulunamadı; işlemin gerçekleştiği KANITLANAMADI. SUCCEEDED yazılmadı.',
      };
    }

    // Kanit VAR → terminal isaret. RE-APPLY YAPILMAZ (islem zaten uygulanmis).
    const updated = await this.officeApproval.markExecutionSucceeded(req.id, req.approverUserId ?? actorUserId);
    this.logger.log(`controlled reconcile(${requestId}): kesin bag bulundu (history=${evidence.id}) → SUCCEEDED`);
    return {
      reconciled: true,
      verdict: 'SUCCEEDED' as const,
      requestId: req.id,
      attempt: req.retryCount,
      evidenceId: evidence.id,
      toStatus: evidence.toStatus,
      executionStatus: updated.executionStatus,
    };
  }
}
