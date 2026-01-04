import { Injectable, Logger } from '@nestjs/common';

/**
 * TCMB Döviz Kuru Servisi
 * 
 * T.C. Merkez Bankası XML API entegrasyonu
 * https://www.tcmb.gov.tr/kurlar/today.xml
 * 
 * API Key gerektirmez, doğrudan XML endpoint kullanır.
 */

export interface TcmbExchangeRate {
  currency: string;
  buyingRate: number;  // Döviz alış (ForexBuying)
  sellingRate: number; // Döviz satış (ForexSelling)
  banknoteBuying?: number;  // Efektif alış
  banknoteSelling?: number; // Efektif satış
  unit: number;        // Birim (1 veya 100)
  date: string;
  source: 'TCMB' | 'CACHE' | 'DEFAULT';
}

interface CachedRates {
  rates: Map<string, TcmbExchangeRate>;
  fetchedAt: Date;
  dateStr: string;
}

@Injectable()
export class TcmbService {
  private readonly logger = new Logger(TcmbService.name);
  
  // TCMB XML API endpoints
  private readonly TCMB_TODAY_URL = 'https://www.tcmb.gov.tr/kurlar/today.xml';
  private readonly TCMB_ARCHIVE_URL = 'https://www.tcmb.gov.tr/kurlar'; // /YYMM/DDMMYY.xml
  
  // Cache (5 dakika geçerli)
  private cache: CachedRates | null = null;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000;
  
  // Varsayılan kurlar (API erişilemezse fallback)
  private readonly defaultRates: Record<string, { buying: number; selling: number; unit: number }> = {
    USD: { buying: 35.50, selling: 35.80, unit: 1 },
    EUR: { buying: 37.00, selling: 37.30, unit: 1 },
    GBP: { buying: 44.50, selling: 45.00, unit: 1 },
    CHF: { buying: 39.50, selling: 40.00, unit: 1 },
    JPY: { buying: 23.00, selling: 23.50, unit: 100 },
    SAR: { buying: 9.45, selling: 9.55, unit: 1 },
    AUD: { buying: 22.50, selling: 22.80, unit: 1 },
    CAD: { buying: 25.00, selling: 25.30, unit: 1 },
    SEK: { buying: 3.25, selling: 3.30, unit: 1 },
    NOK: { buying: 3.15, selling: 3.20, unit: 1 },
    DKK: { buying: 4.95, selling: 5.00, unit: 1 },
  };

  /**
   * Güncel döviz kuru al
   * @param currency Para birimi kodu (USD, EUR, GBP, vb.)
   * @param date Tarih (opsiyonel, varsayılan bugün)
   */
  async getExchangeRate(currency: string, date?: Date): Promise<TcmbExchangeRate> {
    const currencyUpper = currency.toUpperCase();
    const targetDate = date || new Date();
    const dateStr = targetDate.toLocaleDateString('tr-TR');
    
    try {
      // Cache kontrolü (sadece bugünkü kurlar için)
      if (!date && this.isCacheValid()) {
        const cached = this.cache!.rates.get(currencyUpper);
        if (cached) {
          return { ...cached, source: 'CACHE' };
        }
      }

      // TCMB'den çek
      const rates = await this.fetchFromTcmb(targetDate);
      const rate = rates.get(currencyUpper);
      
      if (rate) {
        return rate;
      }
      
      // Para birimi bulunamadı, varsayılana düş
      this.logger.warn(`TCMB'de ${currencyUpper} bulunamadı, varsayılan kullanılıyor`);
    } catch (error) {
      this.logger.warn(`TCMB API hatası: ${error instanceof Error ? error.message : error}`);
    }

    // Fallback: varsayılan kurlar
    return this.getDefaultRate(currencyUpper, dateStr);
  }

  /**
   * TCMB XML API'den kurları çek
   */
  private async fetchFromTcmb(date: Date): Promise<Map<string, TcmbExchangeRate>> {
    const isToday = this.isToday(date);
    const url = isToday 
      ? this.TCMB_TODAY_URL 
      : this.buildArchiveUrl(date);

    this.logger.log(`TCMB API çağrısı: ${url}`);

    const response = await fetch(url, {
      headers: { 'Accept': 'application/xml' },
    });

    if (!response.ok) {
      // Hafta sonu veya tatil günü - 404 dönebilir
      if (response.status === 404) {
        throw new Error('Tatil günü - kur verisi yok');
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const xml = await response.text();
    const rates = this.parseXml(xml, date);

    // Cache'e kaydet (sadece bugünkü kurlar)
    if (isToday) {
      this.cache = {
        rates,
        fetchedAt: new Date(),
        dateStr: date.toLocaleDateString('tr-TR'),
      };
    }

    return rates;
  }

  /**
   * XML'i parse et
   */
  private parseXml(xml: string, date: Date): Map<string, TcmbExchangeRate> {
    const rates = new Map<string, TcmbExchangeRate>();
    const dateStr = date.toLocaleDateString('tr-TR');

    // Basit regex-based XML parsing (xml2js dependency'si eklemeden)
    const currencyRegex = /<Currency[^>]*CurrencyCode="([^"]+)"[^>]*>[\s\S]*?<\/Currency>/g;
    let match;

    while ((match = currencyRegex.exec(xml)) !== null) {
      const currencyCode = match[1];
      const block = match[0];

      const unit = this.extractValue(block, 'Unit') || '1';
      const forexBuying = this.extractValue(block, 'ForexBuying');
      const forexSelling = this.extractValue(block, 'ForexSelling');
      const banknoteBuying = this.extractValue(block, 'BanknoteBuying');
      const banknoteSelling = this.extractValue(block, 'BanknoteSelling');

      if (forexBuying && forexSelling) {
        rates.set(currencyCode, {
          currency: currencyCode,
          buyingRate: parseFloat(forexBuying),
          sellingRate: parseFloat(forexSelling),
          banknoteBuying: banknoteBuying ? parseFloat(banknoteBuying) : undefined,
          banknoteSelling: banknoteSelling ? parseFloat(banknoteSelling) : undefined,
          unit: parseInt(unit, 10),
          date: dateStr,
          source: 'TCMB',
        });
      }
    }

    return rates;
  }

  /**
   * XML'den değer çıkar
   */
  private extractValue(xml: string, tag: string): string | null {
    const regex = new RegExp(`<${tag}>([^<]*)</${tag}>`);
    const match = xml.match(regex);
    return match ? match[1].trim() : null;
  }

  /**
   * Arşiv URL'i oluştur
   */
  private buildArchiveUrl(date: Date): string {
    const yy = date.getFullYear().toString().slice(-2);
    const mm = (date.getMonth() + 1).toString().padStart(2, '0');
    const dd = date.getDate().toString().padStart(2, '0');
    return `${this.TCMB_ARCHIVE_URL}/${yy}${mm}/${dd}${mm}${yy}.xml`;
  }

  /**
   * Bugün mü kontrol et
   */
  private isToday(date: Date): boolean {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  }

  /**
   * Cache geçerli mi
   */
  private isCacheValid(): boolean {
    if (!this.cache) return false;
    const now = new Date();
    return (now.getTime() - this.cache.fetchedAt.getTime()) < this.CACHE_TTL_MS;
  }

  /**
   * Varsayılan kur döndür
   */
  private getDefaultRate(currency: string, dateStr: string): TcmbExchangeRate {
    const rates = this.defaultRates[currency];
    if (!rates) {
      this.logger.warn(`Bilinmeyen para birimi: ${currency}, USD kullanılıyor`);
      const usdRates = this.defaultRates['USD'];
      return {
        currency: 'USD',
        buyingRate: usdRates.buying,
        sellingRate: usdRates.selling,
        unit: usdRates.unit,
        date: dateStr,
        source: 'DEFAULT',
      };
    }

    return {
      currency,
      buyingRate: rates.buying,
      sellingRate: rates.selling,
      unit: rates.unit,
      date: dateStr,
      source: 'DEFAULT',
    };
  }

  /**
   * Tüm desteklenen para birimlerini listele
   */
  getSupportedCurrencies(): string[] {
    return Object.keys(this.defaultRates);
  }

  /**
   * Tüm güncel kurları al
   */
  async getAllRates(): Promise<TcmbExchangeRate[]> {
    try {
      // Cache kontrolü
      if (this.isCacheValid()) {
        return Array.from(this.cache!.rates.values()).map(r => ({ ...r, source: 'CACHE' as const }));
      }

      // TCMB'den çek
      const rates = await this.fetchFromTcmb(new Date());
      return Array.from(rates.values());
    } catch (error) {
      this.logger.warn(`Tüm kurlar alınamadı, varsayılanlar kullanılıyor: ${error}`);
      
      // Fallback
      const dateStr = new Date().toLocaleDateString('tr-TR');
      return Object.entries(this.defaultRates).map(([currency, rates]) => ({
        currency,
        buyingRate: rates.buying,
        sellingRate: rates.selling,
        unit: rates.unit,
        date: dateStr,
        source: 'DEFAULT' as const,
      }));
    }
  }

  /**
   * Döviz tutarını TL'ye çevir (döviz satış kuru ile)
   * İcra takiplerinde alacaklı lehine satış kuru kullanılır
   */
  async convertToTL(amount: number, currency: string, date?: Date): Promise<{
    originalAmount: number;
    currency: string;
    rate: number;
    unit: number;
    tlAmount: number;
    date: string;
    source: 'TCMB' | 'CACHE' | 'DEFAULT';
  }> {
    const rateInfo = await this.getExchangeRate(currency, date);
    // Birim düzeltmesi (JPY için 100 birim = X TL)
    const effectiveRate = rateInfo.sellingRate / rateInfo.unit;
    const tlAmount = amount * effectiveRate;

    return {
      originalAmount: amount,
      currency: rateInfo.currency,
      rate: rateInfo.sellingRate,
      unit: rateInfo.unit,
      tlAmount: Math.round(tlAmount * 100) / 100,
      date: rateInfo.date,
      source: rateInfo.source,
    };
  }

  /**
   * TL tutarını dövize çevir (döviz alış kuru ile)
   */
  async convertFromTL(tlAmount: number, currency: string, date?: Date): Promise<{
    tlAmount: number;
    currency: string;
    rate: number;
    unit: number;
    foreignAmount: number;
    date: string;
    source: 'TCMB' | 'CACHE' | 'DEFAULT';
  }> {
    const rateInfo = await this.getExchangeRate(currency, date);
    // Birim düzeltmesi
    const effectiveRate = rateInfo.buyingRate / rateInfo.unit;
    const foreignAmount = tlAmount / effectiveRate;

    return {
      tlAmount,
      currency: rateInfo.currency,
      rate: rateInfo.buyingRate,
      unit: rateInfo.unit,
      foreignAmount: Math.round(foreignAmount * 100) / 100,
      date: rateInfo.date,
      source: rateInfo.source,
    };
  }

  /**
   * Belirli bir tarihteki kuru al (geçmiş tarih için)
   * Hafta sonu/tatil günlerinde bir önceki iş gününü dener
   */
  async getHistoricalRate(currency: string, date: Date, maxRetries = 5): Promise<TcmbExchangeRate> {
    let currentDate = new Date(date);
    let retries = 0;

    while (retries < maxRetries) {
      try {
        return await this.getExchangeRate(currency, currentDate);
      } catch (error) {
        // Bir önceki güne git
        currentDate.setDate(currentDate.getDate() - 1);
        retries++;
      }
    }

    // Son çare: varsayılan kur
    return this.getDefaultRate(currency.toUpperCase(), date.toLocaleDateString('tr-TR'));
  }
}
