import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TariffService, TariffData, TariffSummary } from './tariff.service';
import { GazetteWatcherService, GazetteNotification } from './gazette-watcher.service';
import type { Tariff as SharedTariff } from '@shared/types';

@Controller('tariffs')
@UseGuards(JwtAuthGuard)
export class TariffController {
  constructor(
    private readonly tariffService: TariffService,
    private readonly gazetteWatcher: GazetteWatcherService,
  ) {}

  // Tum tarifeleri listele
  @Get()
  getAllTariffs(): TariffSummary[] {
    return this.tariffService.getAllTariffs();
  }

  // Aktif tarifeyi getir
  @Get('active')
  getActiveTariff(): SharedTariff | null | { error: string } {
    const tariff = this.tariffService.getActiveTariff();
    if (!tariff) {
      return { error: 'Aktif tarife bulunamadi' };
    }
    return tariff;
  }

  // Belirli yilin tarifesini getir
  @Get(':year')
  getTariff(@Param('year') year: string): SharedTariff | null | { error: string } {
    const tariff = this.tariffService.getTariff(parseInt(year));
    if (!tariff) {
      return { error: `${year} yili tarifesi bulunamadi` };
    }
    return tariff;
  }

  // Yeni tarife olustur (onceki yildan kopyala)
  @Post(':year/create')
  createTariff(@Param('year') year: string): { success: boolean; message: string; tariff?: TariffData } {
    const yearNum = parseInt(year);
    const emptyTariff = this.tariffService.createEmptyTariff(yearNum);
    const result = this.tariffService.saveTariff(yearNum, emptyTariff);
    return { ...result, tariff: result.success ? emptyTariff : undefined };
  }

  // Tarifeyi guncelle
  @Put(':year')
  updateTariff(
    @Param('year') year: string,
    @Body() data: TariffData,
  ): { success: boolean; message: string } {
    return this.tariffService.saveTariff(parseInt(year), data);
  }

  // Tarifeyi sil
  @Delete(':year')
  deleteTariff(@Param('year') year: string): { success: boolean; message: string } {
    return this.tariffService.deleteTariff(parseInt(year));
  }

  // JSON'dan import et
  @Post(':year/import')
  importTariff(
    @Param('year') year: string,
    @Body() jsonData: any,
  ): { success: boolean; message: string } {
    return this.tariffService.importFromJSON(parseInt(year), jsonData);
  }

  // JSON olarak export et
  @Get(':year/export')
  exportTariff(@Param('year') year: string): TariffData | null | { error: string } {
    const tariff = this.tariffService.getTariffData(parseInt(year));
    if (!tariff) {
      return { error: `${year} yili tarifesi bulunamadi` };
    }
    return tariff;
  }

  // ============================================
  // RESMI GAZETE IZLEYICI ENDPOINT'LERI
  // ============================================

  // Resmi Gazete bildirimlerini getir
  @Get('gazette/notifications')
  getGazetteNotifications(): GazetteNotification[] {
    return this.gazetteWatcher.getNotifications();
  }

  // Okunmamis bildirimleri getir
  @Get('gazette/notifications/unread')
  getUnreadNotifications(): { count: number; notifications: GazetteNotification[] } {
    return {
      count: this.gazetteWatcher.getUnreadCount(),
      notifications: this.gazetteWatcher.getNotifications(true),
    };
  }

  // Bildirimi okundu olarak isaretle
  @Post('gazette/notifications/:id/read')
  markNotificationAsRead(@Param('id') id: string): { success: boolean } {
    return { success: this.gazetteWatcher.markAsRead(id) };
  }

  // Tum bildirimleri okundu olarak isaretle
  @Post('gazette/notifications/read-all')
  markAllNotificationsAsRead(): { success: boolean; count: number } {
    const count = this.gazetteWatcher.markAllAsRead();
    return { success: true, count };
  }

  // Manuel kontrol tetikle
  @Post('gazette/check')
  async checkGazette(): Promise<{ success: boolean; newCount: number; notifications: GazetteNotification[] }> {
    return this.gazetteWatcher.manualCheck();
  }

  // Son kontrol zamanini getir
  @Get('gazette/status')
  getGazetteStatus(): { lastCheck: Date | null; unreadCount: number } {
    return {
      lastCheck: this.gazetteWatcher.getLastCheckTime(),
      unreadCount: this.gazetteWatcher.getUnreadCount(),
    };
  }
}
