import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { RateScheduleService } from './rate-schedule.service';
import { InterestTypeCode, RateSourceType } from './types';
import { fetchWithTimeout } from '../../common/fetch-with-timeout.util';

/**
 * TCMB Faiz Oranı Senkronizasyon Servisi
 * 
 * TCMB EVDS API veya web scraping ile faiz oranlarını otomatik günceller.
 */
@Injectable()
export class RateSyncService {
  private readonly logger = new Logger(RateSyncService.name);

  // TCMB EVDS API endpoints
  private readonly EVDS_BASE_URL = 'https://evds2.tcmb.gov.tr/service/evds';

  // Faiz oranı serileri
  private readonly RATE_SERIES = {
    REESKONT: 'TP.PY.REESKONT',
    AVANS: 'TP.PY.AVANS',
    MEVDUAT_TL: 'TP.TRY.MT01',
    MEVDUAT_USD: 'TP.USD.MT01',
    MEVDUAT_EUR: 'TP.EUR.MT01',
    KAMU_MEVDUAT_TL: 'TP.TRY.KMT01',
    KAMU_MEVDUAT_USD: 'TP.USD.KMT01',
    KAMU_MEVDUAT_EUR: 'TP.EUR.KMT01',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly rateSchedule: RateScheduleService,
  ) {}

  /**
   * Günlük TCMB faiz oranı senkronizasyonu
   * Her gün 09:30'da çalışır (TCMB duyurularından sonra)
   */
  @Cron('30 9 * * *')
  async syncTcmbRates(): Promise<void> {
    this.logger.log('TCMB faiz oranı senkronizasyonu başlıyor...');

    try {
      // Get all tenants
      const tenants = await this.prisma.office.findMany({
        select: { id: true },
      });

      for (const tenant of tenants) {
        await this.syncRatesForTenant(tenant.id);
      }

      this.logger.log('TCMB faiz oranı senkronizasyonu tamamlandı');
    } catch (error) {
      this.logger.error(`TCMB sync hatası: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Aylık mevduat faizi senkronizasyonu
   * Her ayın 2. günü 10:00'da çalışır
   */
  @Cron('0 10 2 * *')
  async syncMonthlyMevduatRates(): Promise<void> {
    this.logger.log('Aylık mevduat faizi senkronizasyonu başlıyor...');

    try {
      const tenants = await this.prisma.office.findMany({
        select: { id: true },
      });

      for (const tenant of tenants) {
        await this.syncMevduatRates(tenant.id);
      }
    } catch (error) {
      this.logger.error(`Mevduat sync hatası: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Manuel senkronizasyon tetikleyici
   */
  async syncRatesForTenant(tenantId: string): Promise<number> {
    let addedCount = 0;

    try {
      // 1. Avans faizi (ticari temerrüt için)
      const avansAdded = await this.syncAvansRate(tenantId);
      addedCount += avansAdded ? 1 : 0;

      // 2. Mevduat faizleri
      addedCount += await this.syncMevduatRates(tenantId);
    } catch (error) {
      this.logger.warn(`Tenant ${tenantId} sync hatası: ${error}`);
    }

    return addedCount;
  }

  /**
   * Avans faizi senkronizasyonu
   */
  private async syncAvansRate(tenantId: string): Promise<boolean> {
    const apiKey = process.env.TCMB_EVDS_API_KEY;

    if (!apiKey) {
      this.logger.debug('TCMB_EVDS_API_KEY tanımlı değil, avans sync atlanıyor');
      return false;
    }

    try {
      const response = await this.fetchEvdsData(this.RATE_SERIES.AVANS, apiKey);

      if (response?.items?.length > 0) {
        const latest = response.items[response.items.length - 1];
        const rateValue = latest[this.RATE_SERIES.AVANS];

        if (rateValue) {
          const rate = parseFloat(rateValue) / 100;
          const date = this.parseEvdsDate(latest.Tarih);

          return await this.rateSchedule.addRateIfNew(
            {
              interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2,
              validFrom: date,
              annualRate: rate,
              source: RateSourceType.TCMB,
              sourceRef: `TCMB EVDS ${latest.Tarih}`,
            },
            tenantId,
          );
        }
      }
    } catch (error) {
      this.logger.warn(`Avans rate sync failed: ${error}`);
    }

    return false;
  }

  /**
   * Mevduat faizleri senkronizasyonu
   */
  private async syncMevduatRates(tenantId: string): Promise<number> {
    const apiKey = process.env.TCMB_EVDS_API_KEY;
    let addedCount = 0;

    if (!apiKey) {
      this.logger.debug('TCMB_EVDS_API_KEY tanımlı değil, mevduat sync atlanıyor');
      return 0;
    }

    const mevduatTypes = [
      { series: this.RATE_SERIES.MEVDUAT_TL, type: InterestTypeCode.MEVDUAT_TL_BANKALARCA },
      { series: this.RATE_SERIES.MEVDUAT_USD, type: InterestTypeCode.MEVDUAT_USD_BANKALARCA },
      { series: this.RATE_SERIES.MEVDUAT_EUR, type: InterestTypeCode.MEVDUAT_EUR_BANKALARCA },
      { series: this.RATE_SERIES.KAMU_MEVDUAT_TL, type: InterestTypeCode.MEVDUAT_TL_KAMU },
      { series: this.RATE_SERIES.KAMU_MEVDUAT_USD, type: InterestTypeCode.MEVDUAT_USD_KAMU },
      { series: this.RATE_SERIES.KAMU_MEVDUAT_EUR, type: InterestTypeCode.MEVDUAT_EUR_KAMU },
    ];

    for (const { series, type } of mevduatTypes) {
      try {
        const response = await this.fetchEvdsData(series, apiKey);

        if (response?.items?.length > 0) {
          const latest = response.items[response.items.length - 1];
          const rateValue = latest[series];

          if (rateValue) {
            const rate = parseFloat(rateValue) / 100;
            const date = this.parseEvdsDate(latest.Tarih);

            const added = await this.rateSchedule.addRateIfNew(
              {
                interestType: type,
                validFrom: date,
                annualRate: rate,
                source: RateSourceType.TCMB,
                sourceRef: `TCMB EVDS ${latest.Tarih}`,
              },
              tenantId,
            );

            if (added) addedCount++;
          }
        }
      } catch (error) {
        this.logger.warn(`${type} sync failed: ${error}`);
      }
    }

    return addedCount;
  }

  /**
   * EVDS API'den veri çek
   */
  private async fetchEvdsData(seriesCode: string, apiKey: string): Promise<any> {
    const today = new Date();
    const startDate = '01-01-2020';
    const endDate = `${today.getDate().toString().padStart(2, '0')}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getFullYear()}`;

    const url = `${this.EVDS_BASE_URL}?series=${seriesCode}&startDate=${startDate}&endDate=${endDate}&type=json&key=${apiKey}`;

    const response = await fetchWithTimeout(url, {
      headers: { Accept: 'application/json' },
    }, 15_000); // EVDS API — 15s timeout

    if (!response.ok) {
      throw new Error(`EVDS API error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * EVDS tarih formatını ISO'ya çevir
   */
  private parseEvdsDate(dateStr: string): string {
    // Format: "01-01-2024" -> "2024-01-01"
    const [day, month, year] = dateStr.split('-');
    return `${year}-${month}-${day}`;
  }

  /**
   * Seed historical rates for a tenant
   * 
   * Kaynaklar:
   * - TCMB Reeskont ve Avans Faiz Oranları: https://www.tcmb.gov.tr/wps/wcm/connect/TR/TCMB+TR/Main+Menu/Temel+Faaliyetler/Para+Politikasi/Reeskont+ve+Avans+Faiz+Oranlari
   * - TTK 1530 Oranları: TCMB yıllık ilan
   */
  async seedHistoricalRates(tenantId: string): Promise<number> {
    let addedCount = 0;

    // ═══════════════════════════════════════════════════════════════════════════
    // YASAL FAİZ (3095 sayılı Kanun m.1)
    // ═══════════════════════════════════════════════════════════════════════════
    const yasalFaizRates = [
      { validFrom: '2003-07-01', annualRate: 0.50 },
      { validFrom: '2004-01-01', annualRate: 0.43 },
      { validFrom: '2004-07-01', annualRate: 0.38 },
      { validFrom: '2005-05-01', annualRate: 0.12 },
      { validFrom: '2006-01-01', annualRate: 0.09 },
      { validFrom: '2024-06-01', annualRate: 0.24 }, // Resmi Gazete 01.06.2024
    ];

    for (const rate of yasalFaizRates) {
      const added = await this.rateSchedule.addRateIfNew(
        {
          interestType: InterestTypeCode.LEGAL_3095,
          validFrom: rate.validFrom,
          annualRate: rate.annualRate,
          source: RateSourceType.RESMI_GAZETE,
          sourceRef: 'Resmi Gazete',
        },
        tenantId,
      );
      if (added) addedCount++;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TİCARİ TEMERRÜT / AVANS FAİZİ (3095 sayılı Kanun m.2/2)
    // Kaynak: TCMB Reeskont ve Avans Faiz Oranları Tablosu
    // ═══════════════════════════════════════════════════════════════════════════
    const avansFaizRates = [
      // 2004-2019 (eski oranlar)
      { validFrom: '2004-01-01', annualRate: 0.48 },
      { validFrom: '2004-07-01', annualRate: 0.42 },
      { validFrom: '2005-07-01', annualRate: 0.30 },
      { validFrom: '2006-01-01', annualRate: 0.25 },
      { validFrom: '2007-01-01', annualRate: 0.29 },
      { validFrom: '2008-01-01', annualRate: 0.27 },
      { validFrom: '2009-07-01', annualRate: 0.19 },
      { validFrom: '2010-01-01', annualRate: 0.16 },
      { validFrom: '2011-01-01', annualRate: 0.15 },
      { validFrom: '2012-01-01', annualRate: 0.1775 },
      { validFrom: '2013-01-01', annualRate: 0.1375 },
      { validFrom: '2014-01-01', annualRate: 0.1175 },
      { validFrom: '2015-01-01', annualRate: 0.105 },
      { validFrom: '2017-01-01', annualRate: 0.0975 },
      { validFrom: '2018-07-01', annualRate: 0.195 },
      
      // 2020 değişimleri
      { validFrom: '2020-01-01', annualRate: 0.1175 },
      { validFrom: '2020-05-22', annualRate: 0.0925 },
      { validFrom: '2020-06-13', annualRate: 0.0825 },
      { validFrom: '2020-09-25', annualRate: 0.0925 },
      { validFrom: '2020-11-20', annualRate: 0.1425 },
      { validFrom: '2020-12-25', annualRate: 0.1725 },
      
      // 2021 değişimleri
      { validFrom: '2021-03-19', annualRate: 0.1925 },
      { validFrom: '2021-09-24', annualRate: 0.1825 },
      { validFrom: '2021-10-22', annualRate: 0.1625 },
      { validFrom: '2021-11-19', annualRate: 0.1525 },
      { validFrom: '2021-12-17', annualRate: 0.1425 },
      
      // 2022 değişimleri
      { validFrom: '2022-08-19', annualRate: 0.1325 },
      { validFrom: '2022-09-23', annualRate: 0.1225 },
      { validFrom: '2022-10-21', annualRate: 0.1075 },
      { validFrom: '2022-11-25', annualRate: 0.095 },
      
      // 2023 değişimleri
      { validFrom: '2023-06-23', annualRate: 0.15 },
      { validFrom: '2023-07-21', annualRate: 0.175 },
      { validFrom: '2023-08-25', annualRate: 0.255 },
      { validFrom: '2023-09-22', annualRate: 0.305 },
      { validFrom: '2023-10-27', annualRate: 0.355 },
      { validFrom: '2023-11-24', annualRate: 0.405 },
      { validFrom: '2023-12-29', annualRate: 0.45 },
      
      // 2024 değişimleri (TCMB Reeskont ve Avans Faiz Oranları)
      { validFrom: '2024-01-26', annualRate: 0.46 },
      { validFrom: '2024-03-22', annualRate: 0.50 },
      { validFrom: '2024-06-22', annualRate: 0.50 },   // Değişiklik yok, teyit
      { validFrom: '2024-12-28', annualRate: 0.4925 }, // %49,25
      
      // 2025 değişimleri (TCMB resmi tablosu)
      { validFrom: '2025-01-25', annualRate: 0.4675 }, // %46,75 (Ocak 2025)
      { validFrom: '2025-02-22', annualRate: 0.4525 }, // %45,25 (Şubat 2025)
      { validFrom: '2025-03-08', annualRate: 0.4425 }, // %44,25 (Mart 2025)
      { validFrom: '2025-04-18', annualRate: 0.4375 }, // %43,75 (Nisan 2025)
      { validFrom: '2025-05-23', annualRate: 0.4325 }, // %43,25 (Mayıs 2025)
      { validFrom: '2025-06-21', annualRate: 0.4275 }, // %42,75 (Haziran 2025)
      { validFrom: '2025-07-19', annualRate: 0.4275 }, // %42,75 (Temmuz 2025 - değişiklik yok)
      { validFrom: '2025-08-23', annualRate: 0.4275 }, // %42,75 (Ağustos 2025 - değişiklik yok)
      { validFrom: '2025-09-17', annualRate: 0.4225 }, // %42,25 (Eylül 2025)
      { validFrom: '2025-10-18', annualRate: 0.4175 }, // %41,75 (Ekim 2025)
      { validFrom: '2025-11-22', annualRate: 0.4075 }, // %40,75 (Kasım 2025)
      { validFrom: '2025-12-20', annualRate: 0.3975 }, // %39,75 (Aralık 2025)
    ];

    for (const rate of avansFaizRates) {
      const added = await this.rateSchedule.addRateIfNew(
        {
          interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2,
          validFrom: rate.validFrom,
          annualRate: rate.annualRate,
          source: RateSourceType.TCMB,
          sourceRef: `TCMB ${rate.validFrom}`,
        },
        tenantId,
      );
      if (added) addedCount++;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TTK 1530 GEÇ ÖDEME FAİZİ (Mal/Hizmet Tedariki)
    // Kaynak: TCMB yıllık ilan
    // ═══════════════════════════════════════════════════════════════════════════
    const ttk1530Rates = [
      { validFrom: '2020-01-01', annualRate: 0.1575 },
      { validFrom: '2021-01-01', annualRate: 0.1875 },
      { validFrom: '2022-01-01', annualRate: 0.1875 },
      { validFrom: '2023-01-01', annualRate: 0.1875 },
      { validFrom: '2024-01-01', annualRate: 0.4875 },
      { validFrom: '2025-01-01', annualRate: 0.5325 }, // Yapılacaklar.txt: 2025 %53,25
      { validFrom: '2026-01-01', annualRate: 0.43 },   // Yapılacaklar.txt: 2026 %43,00
    ];

    for (const rate of ttk1530Rates) {
      const added = await this.rateSchedule.addRateIfNew(
        {
          interestType: InterestTypeCode.TTK_1530,
          validFrom: rate.validFrom,
          annualRate: rate.annualRate,
          source: RateSourceType.TCMB,
          sourceRef: `TCMB TTK 1530 ${rate.validFrom.substring(0, 4)}`,
        },
        tenantId,
      );
      if (added) addedCount++;
    }

    this.logger.log(`Seeded ${addedCount} historical rates for tenant ${tenantId}`);
    return addedCount;
  }
}
