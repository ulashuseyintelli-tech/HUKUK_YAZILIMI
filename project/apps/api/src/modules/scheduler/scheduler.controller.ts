import { Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
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

@Controller('scheduler')
@UseGuards(JwtAuthGuard)
export class SchedulerController {
  constructor(private schedulerService: SchedulerService) {}

  /**
   * Scheduler durumu
   */
  @Get('status')
  async getStatus() {
    return this.schedulerService.getStatus();
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
    await this.schedulerService.runManual('payment-orders', actorFromRequest(req));
    return { message: 'Ödeme emri kontrolü tamamlandı' };
  }

  /**
   * Nafaka dönem kontrolü
   */
  @Post('check/nafaka')
  async checkNafaka(@Request() req: any) {
    await this.schedulerService.runManual('nafaka', actorFromRequest(req));
    return { message: 'Nafaka dönem kontrolü tamamlandı' };
  }

  /**
   * MTS dönüş kontrolü
   */
  @Post('check/mts')
  async checkMts(@Request() req: any) {
    await this.schedulerService.runManual('mts', actorFromRequest(req));
    return { message: 'MTS kontrolü tamamlandı' };
  }

  /**
   * UYAP retry
   */
  @Post('check/uyap-retry')
  async checkUyapRetry(@Request() req: any) {
    await this.schedulerService.runManual('uyap-retry', actorFromRequest(req));
    return { message: 'UYAP retry kontrolü tamamlandı' };
  }
}
