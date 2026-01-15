import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import type { ITariffRepository, Tariff as SharedTariff } from '@shared/types';

/**
 * Tariff Service
 * 
 * Sorumluluklar:
 * - YAML tarife dosyalarını yönetme (CRUD)
 * - Tarife verisi sağlama (ITariffRepository)
 * - Admin işlemleri
 * 
 * NOT: Masraf hesaplama bu modülün sorumluluğunda DEĞİL.
 * @see fee-engine - Masraf hesaplama için tek kaynak
 * @see ARCHITECTURE.md - Source of Truth Matrix
 */

export interface TariffData {
  version: number;
  year: number;
  effective_date: string;
  fixed_fees: Record<string, { amount: number; label: string; item_type: string; applies_to: string[] }>;
  rate_fees: Record<string, { rate: number; label: string; item_type: string; base: string; applies_to: string[]; min_amount?: number }>;
  postage: Record<string, { amount: number | null; label: string; description: string }>;
  interest_rates: Record<string, Record<string, Array<{ start_date: string; rate: number }>>>;
  penalties: Record<string, { default_rate: number; max_rate?: number; label: string }>;
}

export interface TariffSummary {
  year: number;
  effectiveDate: string;
  fixedFeesCount: number;
  rateFeesCount: number;
  postageTypesCount: number;
  isActive: boolean;
}

@Injectable()
export class TariffService implements ITariffRepository {
  private readonly logger = new Logger(TariffService.name);
  private readonly configPath: string;
  private tariffs: Map<number, TariffData> = new Map();

  constructor() {
    this.configPath = path.join(process.cwd(), 'src/config/tariffs');
    this.loadAllTariffs();
  }

  // ============================================
  // ITariffRepository Implementation
  // ============================================

  /**
   * Shared Tariff formatına dönüştür
   */
  private toSharedFormat(data: TariffData): SharedTariff {
    return {
      version: data.version,
      year: data.year,
      effectiveDate: data.effective_date,
      fixedFees: Object.fromEntries(
        Object.entries(data.fixed_fees).map(([k, v]) => [k, {
          amount: v.amount,
          label: v.label,
          itemType: v.item_type,
          appliesTo: v.applies_to,
        }])
      ),
      rateFees: Object.fromEntries(
        Object.entries(data.rate_fees).map(([k, v]) => [k, {
          rate: v.rate,
          label: v.label,
          itemType: v.item_type,
          base: v.base,
          appliesTo: v.applies_to,
          minAmount: v.min_amount,
        }])
      ),
      postage: Object.fromEntries(
        Object.entries(data.postage).map(([k, v]) => [k, {
          amount: v.amount,
          label: v.label,
          description: v.description,
        }])
      ),
      interestRates: Object.fromEntries(
        Object.entries(data.interest_rates).map(([currency, types]) => [
          currency,
          Object.fromEntries(
            Object.entries(types).map(([type, rates]) => [
              type,
              rates.map(r => ({ startDate: r.start_date, rate: r.rate }))
            ])
          )
        ])
      ),
      penalties: Object.fromEntries(
        Object.entries(data.penalties).map(([k, v]) => [k, {
          defaultRate: v.default_rate,
          maxRate: v.max_rate,
          label: v.label,
        }])
      ),
    };
  }

  /**
   * ITariffRepository: Get tariff by year (returns SharedTariff for interface compliance)
   */
  getTariff(year: number): SharedTariff | null {
    const data = this.tariffs.get(year);
    return data ? this.toSharedFormat(data) : null;
  }

  /**
   * Get raw tariff data (internal use)
   */
  getTariffData(year: number): TariffData | null {
    return this.tariffs.get(year) || null;
  }

  /**
   * ITariffRepository: Get tariff in shared format (alias)
   */
  getSharedTariff(year: number): SharedTariff | null {
    return this.getTariff(year);
  }

  /**
   * ITariffRepository: Get active tariff (returns SharedTariff for interface compliance)
   */
  getActiveTariff(): SharedTariff | null {
    const currentYear = new Date().getFullYear();
    const data = this.tariffs.get(currentYear) || this.tariffs.get(currentYear - 1);
    return data ? this.toSharedFormat(data) : null;
  }

  /**
   * Get active raw tariff data (internal use)
   */
  getActiveTariffData(): TariffData | null {
    const currentYear = new Date().getFullYear();
    return this.tariffs.get(currentYear) || this.tariffs.get(currentYear - 1) || null;
  }

  /**
   * ITariffRepository: Get active tariff in shared format (alias)
   */
  getActiveSharedTariff(): SharedTariff | null {
    return this.getActiveTariff();
  }

  getAvailableYears(): number[] {
    return Array.from(this.tariffs.keys()).sort((a, b) => b - a);
  }

  // ============================================
  // Internal Methods
  // ============================================

  // Tum tarifeleri yukle
  private loadAllTariffs(): void {
    try {
      if (!fs.existsSync(this.configPath)) {
        fs.mkdirSync(this.configPath, { recursive: true });
      }

      const files = fs.readdirSync(this.configPath).filter(f => f.endsWith('.yaml'));
      for (const file of files) {
        const year = parseInt(file.replace('.yaml', ''));
        if (!isNaN(year)) {
          const content = fs.readFileSync(path.join(this.configPath, file), 'utf8');
          const tariff = yaml.load(content) as TariffData;
          this.tariffs.set(year, tariff);
          this.logger.log(`Tarife yuklendi: ${year}`);
        }
      }
    } catch (error) {
      this.logger.error('Tarife yukleme hatasi:', error);
    }
  }

  // Tum tarifelerin ozetini getir
  getAllTariffs(): TariffSummary[] {
    const currentYear = new Date().getFullYear();
    return Array.from(this.tariffs.entries()).map(([year, tariff]) => ({
      year,
      effectiveDate: tariff.effective_date,
      fixedFeesCount: Object.keys(tariff.fixed_fees || {}).length,
      rateFeesCount: Object.keys(tariff.rate_fees || {}).length,
      postageTypesCount: Object.keys(tariff.postage || {}).length,
      isActive: year === currentYear,
    })).sort((a, b) => b.year - a.year);
  }

  // Yeni tarife olustur/guncelle
  saveTariff(year: number, data: TariffData): { success: boolean; message: string } {
    try {
      // Veriyi dogrula
      if (!data.fixed_fees || !data.postage) {
        return { success: false, message: 'Gecersiz tarife verisi' };
      }

      data.year = year;
      data.version = (this.tariffs.get(year)?.version || 0) + 1;

      // YAML olarak kaydet
      const yamlContent = yaml.dump(data, { indent: 2, lineWidth: 120 });
      const filePath = path.join(this.configPath, `${year}.yaml`);
      fs.writeFileSync(filePath, yamlContent, 'utf8');

      // Cache'i guncelle
      this.tariffs.set(year, data);

      this.logger.log(`Tarife kaydedildi: ${year} (v${data.version})`);
      return { success: true, message: `${year} yili tarifesi kaydedildi` };
    } catch (error) {
      this.logger.error('Tarife kaydetme hatasi:', error);
      return { success: false, message: 'Tarife kaydedilemedi' };
    }
  }

  // Tarife sil
  deleteTariff(year: number): { success: boolean; message: string } {
    try {
      const filePath = path.join(this.configPath, `${year}.yaml`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        this.tariffs.delete(year);
        this.logger.log(`Tarife silindi: ${year}`);
        return { success: true, message: `${year} yili tarifesi silindi` };
      }
      return { success: false, message: 'Tarife bulunamadi' };
    } catch (error) {
      this.logger.error('Tarife silme hatasi:', error);
      return { success: false, message: 'Tarife silinemedi' };
    }
  }

  // Bos tarife sablonu olustur
  createEmptyTariff(year: number): TariffData {
    const prevYear = this.tariffs.get(year - 1);
    
    // Onceki yildan kopyala veya bos olustur
    if (prevYear) {
      return {
        ...JSON.parse(JSON.stringify(prevYear)),
        year,
        version: 1,
        effective_date: `${year}-01-01`,
      };
    }

    return {
      version: 1,
      year,
      effective_date: `${year}-01-01`,
      fixed_fees: {
        application_fee: { amount: 0, label: 'Basvurma Harci', item_type: 'FEE', applies_to: ['ILAMSIZ', 'ILAMLI', 'KAMBIYO'] },
        poa_copy_fee: { amount: 0, label: 'Vekalet Suret Harci', item_type: 'FEE', applies_to: ['ILAMSIZ', 'ILAMLI', 'KAMBIYO'] },
        bar_stamp_fee: { amount: 0, label: 'Vekalet Pulu', item_type: 'STAMP', applies_to: ['ILAMSIZ', 'ILAMLI', 'KAMBIYO'] },
      },
      rate_fees: {
        ilamsiz_pesin_harc: { rate: 0.005, label: 'Pesin Harc', item_type: 'FEE', base: 'principal_plus_interest', applies_to: ['ILAMSIZ', 'KIRA'], min_amount: 100 },
      },
      postage: {
        UETS: { amount: 0, label: 'UETS Tebligat', description: 'Elektronik tebligat' },
        NORMAL: { amount: 0, label: 'Normal Tebligat', description: 'PTT normal tebligat' },
        FAST: { amount: 0, label: 'Hizli Tebligat', description: 'PTT hizli tebligat' },
      },
      interest_rates: {
        TRY: {
          YASAL: [{ start_date: `${year}-01-01`, rate: 24 }],
          TICARI: [{ start_date: `${year}-01-01`, rate: 48 }],
        },
      },
      penalties: {
        bad_check_compensation: { default_rate: 0.10, max_rate: 0.20, label: 'Karsiliksiz Cek Tazminati' },
      },
    };
  }

  // JSON'dan tarife import et
  importFromJSON(year: number, jsonData: any): { success: boolean; message: string } {
    try {
      const tariff: TariffData = {
        version: 1,
        year,
        effective_date: jsonData.effective_date || `${year}-01-01`,
        fixed_fees: jsonData.fixed_fees || {},
        rate_fees: jsonData.rate_fees || {},
        postage: jsonData.postage || {},
        interest_rates: jsonData.interest_rates || {},
        penalties: jsonData.penalties || {},
      };

      return this.saveTariff(year, tariff);
    } catch (error) {
      return { success: false, message: 'JSON import hatasi' };
    }
  }

  // Tarifeyi JSON olarak export et
  exportToJSON(year: number): TariffData | null {
    return this.getTariffData(year);
  }
}
