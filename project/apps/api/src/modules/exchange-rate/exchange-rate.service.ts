import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

export interface ExchangeRate {
  currency: string;
  buying: number;
  selling: number;
  effectiveBuying: number;
  effectiveSelling: number;
  date: string;
  source: 'TCMB' | 'CACHE' | 'FALLBACK';
}

export interface ExchangeRateHistory {
  currency: string;
  date: string;
  rate: number;
}

@Injectable()
export class ExchangeRateService {
  private readonly logger = new Logger(ExchangeRateService.name);
  private rateCache: Map<string, ExchangeRate> = new Map();
  private lastUpdate: Date | null = null;

  // Varsayilan kurlar (TCMB'ye ulasilamazsa)
  private fallbackRates: Record<string, { buying: number; selling: number }> = {
    USD: { buying: 34.50, selling: 34.60 },
    EUR: { buying: 36.20, selling: 36.30 },
    GBP: { buying: 43.80, selling: 43.90 },
    CHF: { buying: 38.90, selling: 39.00 },
  };

  constructor() {
    // Baslangicta kurlari yukle
    this.fetchRatesFromTCMB();
  }

  // Her gun saat 15:30'da TCMB kurlarini guncelle (TCMB 15:30'da gunceller)
  @Cron('30 15 * * 1-5') // Pazartesi-Cuma 15:30
  async scheduledRateUpdate() {
    this.logger.log('Zamanlanmis kur guncellemesi basliyor...');
    await this.fetchRatesFromTCMB();
  }

  // TCMB'den kurlari cek
  async fetchRatesFromTCMB(): Promise<boolean> {
    try {
      // TCMB XML servisi
      const response = await fetch('https://www.tcmb.gov.tr/kurlar/today.xml', {
        headers: { 'Accept': 'application/xml' },
        signal: AbortSignal.timeout(10000), // 10 saniye timeout
      });

      if (!response.ok) {
        throw new Error(`TCMB yanit vermedi: ${response.status}`);
      }

      const xmlText = await response.text();
      const rates = this.parseXML(xmlText);

      if (rates.length > 0) {
        const today = new Date().toISOString().split('T')[0];
        for (const rate of rates) {
          this.rateCache.set(rate.currency, { ...rate, date: today, source: 'TCMB' });
        }
        this.lastUpdate = new Date();
        this.logger.log(`TCMB kurlari guncellendi: ${rates.length} doviz`);
        return true;
      }

      return false;
    } catch (error) {
      this.logger.error('TCMB kur cekme hatasi:', error);
      // Fallback kurlari kullan
      this.loadFallbackRates();
      return false;
    }
  }

  // XML parse (basit regex tabanli - xml2js gerektirmez)
  private parseXML(xml: string): Omit<ExchangeRate, 'date' | 'source'>[] {
    const rates: Omit<ExchangeRate, 'date' | 'source'>[] = [];
    const currencies = ['USD', 'EUR', 'GBP', 'CHF', 'JPY', 'SAR', 'AUD', 'CAD'];

    for (const currency of currencies) {
      const regex = new RegExp(
        `<Currency[^>]*CurrencyCode="${currency}"[^>]*>` +
        `[\\s\\S]*?<ForexBuying>([\\d.]+)</ForexBuying>` +
        `[\\s\\S]*?<ForexSelling>([\\d.]+)</ForexSelling>` +
        `[\\s\\S]*?<BanknoteBuying>([\\d.]+)</BanknoteBuying>` +
        `[\\s\\S]*?<BanknoteSelling>([\\d.]+)</BanknoteSelling>`,
        'i'
      );

      const match = xml.match(regex);
      if (match) {
        rates.push({
          currency,
          buying: parseFloat(match[1]) || 0,
          selling: parseFloat(match[2]) || 0,
          effectiveBuying: parseFloat(match[3]) || 0,
          effectiveSelling: parseFloat(match[4]) || 0,
        });
      }
    }

    return rates;
  }

  // Fallback kurlari yukle
  private loadFallbackRates(): void {
    const today = new Date().toISOString().split('T')[0];
    for (const [currency, rates] of Object.entries(this.fallbackRates)) {
      this.rateCache.set(currency, {
        currency,
        buying: rates.buying,
        selling: rates.selling,
        effectiveBuying: rates.buying,
        effectiveSelling: rates.selling,
        date: today,
        source: 'FALLBACK',
      });
    }
    this.logger.warn('Fallback kurlar yuklendi');
  }

  // Guncel kuru getir
  getRate(currency: string): ExchangeRate | null {
    // Cache'de varsa dondur
    const cached = this.rateCache.get(currency);
    if (cached) {
      return cached;
    }

    // Fallback'te varsa yukle ve dondur
    if (this.fallbackRates[currency]) {
      const fallback = this.fallbackRates[currency];
      const rate: ExchangeRate = {
        currency,
        buying: fallback.buying,
        selling: fallback.selling,
        effectiveBuying: fallback.buying,
        effectiveSelling: fallback.selling,
        date: new Date().toISOString().split('T')[0],
        source: 'FALLBACK',
      };
      this.rateCache.set(currency, rate);
      return rate;
    }

    return null;
  }

  // Tum kurlari getir
  getAllRates(): ExchangeRate[] {
    return Array.from(this.rateCache.values());
  }

  // Doviz cevirme (efektif satis kuru ile)
  convertToTRY(amount: number, currency: string): { tlAmount: number; rate: number; source: string } {
    if (currency === 'TRY') {
      return { tlAmount: amount, rate: 1, source: 'DIRECT' };
    }

    const rate = this.getRate(currency);
    if (!rate) {
      throw new Error(`Kur bulunamadi: ${currency}`);
    }

    // Icra takiplerinde efektif satis kuru kullanilir
    const effectiveRate = rate.effectiveSelling || rate.selling;
    return {
      tlAmount: Math.round(amount * effectiveRate * 100) / 100,
      rate: effectiveRate,
      source: rate.source,
    };
  }

  // Belirli tarihteki kuru getir (gecmis kurlar icin)
  async getHistoricalRate(currency: string, date: Date): Promise<ExchangeRate | null> {
    const dateStr = date.toISOString().split('T')[0];
    const [year, month, day] = dateStr.split('-');

    try {
      // TCMB gecmis kur servisi
      const url = `https://www.tcmb.gov.tr/kurlar/${year}${month}/${day}${month}${year}.xml`;
      const response = await fetch(url, {
        headers: { 'Accept': 'application/xml' },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        this.logger.warn(`Gecmis kur bulunamadi: ${dateStr}`);
        return this.getRate(currency); // Guncel kuru dondur
      }

      const xmlText = await response.text();
      const rates = this.parseXML(xmlText);
      const rate = rates.find(r => r.currency === currency);

      if (rate) {
        return { ...rate, date: dateStr, source: 'TCMB' };
      }

      return null;
    } catch (error) {
      this.logger.error(`Gecmis kur cekme hatasi (${dateStr}):`, error);
      return this.getRate(currency);
    }
  }

  // Son guncelleme zamanini getir
  getLastUpdateTime(): Date | null {
    return this.lastUpdate;
  }

  // Manuel guncelleme tetikle
  async refreshRates(): Promise<{ success: boolean; message: string; rates: ExchangeRate[] }> {
    const success = await this.fetchRatesFromTCMB();
    return {
      success,
      message: success ? 'Kurlar TCMB\'den guncellendi' : 'Kurlar guncellenemedi, fallback kullaniliyor',
      rates: this.getAllRates(),
    };
  }
}
