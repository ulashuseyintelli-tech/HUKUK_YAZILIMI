import { Controller, ForbiddenException, Get, Post, Request, UseGuards } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ViewerWriteDenyGuard } from '../auth/guards/viewer-write-deny.guard';
import type { SchedulerActor } from './scheduler-manual-run-policy';

/**
 * F02: Manuel tetikleme uclari YALNIZ `SchedulerService.runManual` uzerinden gecer.
 * Controller, servisin cron giris noktalarini (parametresiz = GLOBAL kapsam) DOGRUDAN
 * CAGIRMAZ; boylece HTTP istegi global calisma baglamini SECEMEZ. Aktor JWT'den
 * turetilir; yetki (I02-R3 elevated esigi) ve tenant kapsami servis sinirinda uygulanir.
 */
function actorFromRequest(req: { user?: { id?: string; tenantId?: string; role?: string } }): SchedulerActor {
  return {
    userId: req?.user?.id ?? '',
    tenantId: req?.user?.tenantId ?? '',
    role: req?.user?.role ?? '',
  };
}

// F02-D-2 dilim 5 (owner ek talimatı 30.10.2026): VIEWER zamanlanmış işleri (run-all, ödeme emri / nafaka / MTS / UYAP retry kontrolleri) TETİKLEYEMEZ (5 yazma). Kapalı kural OWN-13 §51 / AK-1a / B4-B6 `ViewerWriteDenyGuard`; okuma uçları DEĞİŞMEZ.
@Controller('scheduler')
@UseGuards(JwtAuthGuard, ViewerWriteDenyGuard)
export class SchedulerController {
  constructor(private schedulerService: SchedulerService) {}

  /**
   * Scheduler durumu — KI-049 / F02-D (owner F02 uygulama talimatı 2026-10-29; OFP-18): sayımlar YALNIZ
   * aktörün kiracısına aittir; HTTP isteği kiracılar-arası toplam SEÇEMEZ. Okuma ucudur; rol eşiği değişmez.
   */
  @Get('status')
  async getStatus(@Request() req: any) {
    const actor = actorFromRequest(req);
    if (!actor.tenantId) {
      throw new ForbiddenException({ reasonCode: 'SCHEDULER_STATUS_DENIED_NO_TENANT' });
    }
    return this.schedulerService.getStatus({ tenantId: actor.tenantId });
  }

  /**
   * Tüm kontrolleri manuel çalıştır (aktörün tenant'ı ile sınırlı)
   */
  @Post('run-all')
  async runAll(@Request() req: any) {
    return this.schedulerService.runManual('run-all', actorFromRequest(req));
  }

  /**
   * Ödeme emri kontrolü
   */
  @Post('check/payment-orders')
  async checkPaymentOrders(@Request() req: any) {
    return this.schedulerService.runManual('payment-orders', actorFromRequest(req)); // F02: guard outcome yanita gecer
  }

  /**
   * Nafaka dönem kontrolü
   */
  @Post('check/nafaka')
  async checkNafaka(@Request() req: any) {
    return this.schedulerService.runManual('nafaka', actorFromRequest(req)); // F02: guard outcome yanita gecer
  }

  /**
   * MTS dönüş kontrolü
   */
  @Post('check/mts')
  async checkMts(@Request() req: any) {
    return this.schedulerService.runManual('mts', actorFromRequest(req)); // F02: guard outcome yanita gecer
  }

  /**
   * UYAP retry
   */
  @Post('check/uyap-retry')
  async checkUyapRetry(@Request() req: any) {
    return this.schedulerService.runManual('uyap-retry', actorFromRequest(req)); // F02: guard outcome yanita gecer
  }
}
