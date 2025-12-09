import { Injectable, Logger } from '@nestjs/common';

/**
 * TCMB Döviz Kuru Servisi
 * 
 * T.C. Merkez Bankası EVDS API entegrasyonu
 * https://evds2.tcmb.gov.tr/
 * 
 * Not: Gerçek API kullanımı için TCMB'den API anahtarı alınmalıdır.
 * Bu servis şimdilik varsayılan kurlarla çalışır.
 */

export interface TcmbExchangeRate {
  currency: string;
  buyingRate: number;  // Alış kuru
  sellingRate: number; // Satış kuru (efektif)
  date: string;
  source: 'TCMB' | 'DEFAULT';
}

@Injectable()
export class TcmbService {
  private readonly logger = new Logger(TcmbService.name);
  
  // TCMB EVDS API endpoint (gerçek entegrasyon için)
  private readonly TCMB_API_URL = 'https://evds2.tcmb.gov.tr/service/evds';
  
  // Varsayılan kurlar (API entegrasyonu yapılana kadar)
  // Aralık 2024 yaklaşık kurları
  private readonly defaultRates: Record<string, { buying: number; selling: number }> = {
    USD: { buying: 34.20, selling: 34.50 },
    EUR: { buying: 35.90, selling: 36.20 },
    GBP: { buying: 43.40, selling: 43.80 },
    CHF: { buying: 38.50, selling: 38.90 },
    JPY: { buying: 0.225, selling: 0.228 },
    SAR: { buying: 9.10, selling: 9.20 },
    AUD: { buying: 22.10, selling: 22.40 },
    CAD: { buying: 24.50, selling: 24.80 },
    SEK: { buying: 3.15, selling: 3.20 },
    NOK: { buying: 3.05, selling: 3.10 },
    DKK: { buying: 4.80, selling: 4.85 },
  };

  /**
   * Güncel döviz kuru al
   * @param currency Para birimi kodu (USD, EUR, GBP, vb.)
   * @param date Tarih (opsiyonel, varsayılan bugün)
   */
  async getExchangeRate(currency: string, date?: Date): Promise<TcmbExchangeRate> {
    const dateStr = (date || new Date()).toLocaleDateString('tr-TR');
    
    // Önce gerçek API'yi dene (API anahtarı varsa)
    try {
      const apiKey = process.env.TCMB_API_KEY;
      if (apiKey) {
        return await this.fetchFromTcmb(currency, date, apiKey);
      }
    } catch (error) {
      this.logger.warn(`TCMB API hatası, varsayılan kur kullanılıyor: ${error}`);
    }

    // Varsayılan kurları kullan
    const rates = this.defaultRates[currency.toUpperCase()];
    if (!rates) {
      this.logger.warn(`Bilinmeyen para birimi: ${currency}, USD kullanılıyor`);
      const usdRates = this.defaultRates['USD'];
      return {
        currency: 'USD',
        buyingRate: usdRates.buying,
        sellingRate: usdRates.selling,
        date: dateStr,
        source: 'DEFAULT',
      };
    }

    return {
      currency: currency.toUpperCase(),
      buyingRate: rates.buying,
      sellingRate: rates.selling,
      date: dateStr,
      source: 'DEFAULT',
    };
  }

  /**
   * TCMB EVDS API'den kur çek
   * Not: Gerçek implementasyon için TCMB API dokümantasyonuna bakılmalı
   */
  private async fetchFromTcmb(
    currency: string,
    date: Date | undefined,
    apiKey: string
  ): Promise<TcmbExchangeRate> {
    // TCMB EVDS API formatı
    // Seri kodları: TP.DK.USD.A (USD Alış), TP.DK.USD.S (USD Satış)
    const seriesCode = `TP.DK.${currency.toUpperCase()}`;
    const dateStr = date 
      ? date.toISOString().split('T')[0].replace(/-/g, '')
      : new Date().toISOString().split('T')[0].replace(/-/g, '');

    // Not: Gerçek API çağrısı burada yapılacak
    // const response = await fetch(`${this.TCMB_API_URL}?series=${seriesCode}&startDate=${dateStr}&endDate=${dateStr}&type=json&key=${apiKey}`);
    
    this.logger.log(`TCMB API çağrısı: ${seriesCode} - ${dateStr}`);
    
    // Şimdilik varsayılan değerleri döndür
    throw new Error('TCMB API henüz aktif değil');
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
    const currencies = this.getSupportedCurrencies();
    const rates: TcmbExchangeRate[] = [];

    for (const currency of currencies) {
      const rate = await this.getExchangeRate(currency);
      rates.push(rate);
    }

    return rates;
  }

  /**
   * Döviz tutarını TL'ye çevir (efektif satış kuru ile)
   */
  async convertToTL(amount: number, currency: string, date?: Date): Promise<{
    originalAmount: number;
    currency: string;
    rate: number;
    tlAmount: number;
    date: string;
  }> {
    const rateInfo = await this.getExchangeRate(currency, date);
    const tlAmount = amount * rateInfo.sellingRate;

    return {
      originalAmount: amount,
      currency: rateInfo.currency,
      rate: rateInfo.sellingRate,
      tlAmount: Math.round(tlAmount * 100) / 100,
      date: rateInfo.date,
    };
  }

  /**
   * TL tutarını dövize çevir (efektif alış kuru ile)
   */
  async convertFromTL(tlAmount: number, currency: string, date?: Date): Promise<{
    tlAmount: number;
    currency: string;
    rate: number;
    foreignAmount: number;
    date: string;
  }> {
    const rateInfo = await this.getExchangeRate(currency, date);
    const foreignAmount = tlAmount / rateInfo.buyingRate;

    return {
      tlAmount,
      currency: rateInfo.currency,
      rate: rateInfo.buyingRate,
      foreignAmount: Math.round(foreignAmount * 100) / 100,
      date: rateInfo.date,
    };
  }
}
