import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

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
   * Tüm kontrolleri manuel çalıştır
   */
  @Post('run-all')
  async runAll() {
    return this.schedulerService.runAllChecks();
  }

  /**
   * Ödeme emri kontrolü
   */
  @Post('check/payment-orders')
  async checkPaymentOrders() {
    await this.schedulerService.checkPaymentOrderDeadlines();
    return { message: 'Ödeme emri kontrolü tamamlandı' };
  }

  /**
   * Nafaka dönem kontrolü
   */
  @Post('check/nafaka')
  async checkNafaka() {
    await this.schedulerService.processNafakaPeriods();
    return { message: 'Nafaka dönem kontrolü tamamlandı' };
  }

  /**
   * MTS dönüş kontrolü
   */
  @Post('check/mts')
  async checkMts() {
    await this.schedulerService.checkMtsReturns();
    return { message: 'MTS kontrolü tamamlandı' };
  }

  /**
   * UYAP retry
   */
  @Post('check/uyap-retry')
  async checkUyapRetry() {
    await this.schedulerService.retryFailedUyapRequests();
    return { message: 'UYAP retry kontrolü tamamlandı' };
  }
}
