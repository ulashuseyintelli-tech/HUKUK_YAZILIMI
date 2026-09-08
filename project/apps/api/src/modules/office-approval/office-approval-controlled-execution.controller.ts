import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OfficeF01AuthorizationGuard } from './office-f01-authorization.guard';
import { OfficeApprovalControlledExecutionService } from './office-approval-controlled-execution.service';

/**
 * OFFICE-A07 — kontrollü yürütme uçları.
 *
 * NEDEN AYRI CONTROLLER (mimari zorunluluk, tercih değil): `OfficeApprovalController`
 * `OfficeApprovalModule` içindedir; bu uçlar ise `OfficeApprovalExecutorService`'e ihtiyaç
 * duyar ve o servis `OfficeApprovalExecutorModule`'dedir — ki o modül zaten
 * `OfficeApprovalModule`'ü **import eder**. Executor'ı `OfficeApprovalModule`'e taşımak,
 * `office-approval-executor.module.ts`'in kendi şerhinde uyardığı **circular module
 * dependency**'yi doğururdu (`CaseStatusModule` zaten `OfficeApprovalModule`'ü import ediyor).
 * Bu controller tüketici modülde durarak asiklik DAG'ı ve P4-2 wiring'ini korur.
 *
 * Yol öneki aynıdır (`office-approvals`) ama rotalar çakışmaz: mevcut controller'da
 * `:id/execute` veya `:id/reconcile` YOKTUR.
 *
 * GÖVDE YOKTUR — hedef yalnızca yol parametresidir. İstemci tenant/ofis/deneme bağı
 * gönderemez; hepsi sunucuda çözülür.
 */
@Controller('office-approvals')
@UseGuards(JwtAuthGuard)
export class OfficeApprovalControlledExecutionController {
  constructor(private readonly controlled: OfficeApprovalControlledExecutionService) {}

  /**
   * Kontrollü yürütme. Guard + servis içi dar kontrol BİRLİKTE çalışır:
   * `OfficeF01AuthorizationGuard` `targetOfficeId` geçirmediği için tek başına YETMEZ;
   * servis tenant'ın ofisini sunucuda çözüp `isF01ActorAuthorized(userId, tenantId, office.id)`
   * çağırır, ADMIN şartını ve varsayılan KAPALI kabul bayrağını uygular.
   */
  @Post(':id/execute')
  @UseGuards(OfficeF01AuthorizationGuard)
  async execute(
    @CurrentUser('id') actorUserId: string,
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('role') actorRole: string,
    @Param('id') id: string,
  ) {
    const data = await this.controlled.execute(id, tenantId, actorUserId, actorRole);
    return {
      success: true,
      data: {
        id: data.id,
        status: data.status,
        executionStatus: data.executionStatus,
        executedAt: data.executedAt,
        retryCount: data.retryCount,
      },
    };
  }

  /**
   * Hedefli uzlaştırma — YALNIZ verilen talep; genel cron taraması BAŞLATMAZ.
   * Kanıt eşiği talebe VE denemeye özgü `CaseStatusHistory` bağıdır; bulunamazsa
   * SUCCEEDED yazılmaz ve sonuç BELİRSİZ döner.
   */
  @Post(':id/reconcile')
  @UseGuards(OfficeF01AuthorizationGuard)
  async reconcile(
    @CurrentUser('id') actorUserId: string,
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('role') actorRole: string,
    @Param('id') id: string,
  ) {
    const data = await this.controlled.reconcile(id, tenantId, actorUserId, actorRole);
    return { success: true, data };
  }
}
