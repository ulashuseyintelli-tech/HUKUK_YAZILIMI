import { Injectable, Logger } from '@nestjs/common';

/**
 * Karşılıksız Çek Tazminatı Hesaplama Servisi
 * 
 * TTK m.783 ve 5941 sayılı Çek Kanunu'na göre karşılıksız çek tazminatı hesaplar.
 * 
 * Tazminat Oranları:
 * - Çek bedeli üzerinden %10 (TTK m.783)
 * - Ayrıca gecikme faizi de işler
 */
@Injectable()
export class CekTazminatService {
  private readonly logger = new Logger(CekTazminatService.name);

  // TTK m.783 - Karşılıksız çek tazminat oranı
  private readonly KARSILISIZ_CEK_TAZMINAT_ORANI = 0.10; // %10

  /**
   * Karşılıksız çek tazminatı hesapla
   * 
   * @param cekBedeli Çek bedeli (TL)
   * @param ibrazTarihi İbraz tarihi
   * @param karsilisizSerhTarihi Karşılıksız şerhi tarihi (varsa)
   * @returns Tazminat tutarı ve detayları
   */
  calculateKarsilisizCekTazminati(
    cekBedeli: number,
    ibrazTarihi: string,
    karsilisizSerhTarihi?: string,
  ): KarsilisizCekTazminatResult {
    // TTK m.783'e göre %10 tazminat
    const tazminatTutari = cekBedeli * this.KARSILISIZ_CEK_TAZMINAT_ORANI;

    // Tazminat başlangıç tarihi: karşılıksız şerhi tarihi veya ibraz tarihi
    const baslangicTarihi = karsilisizSerhTarihi || ibrazTarihi;

    this.logger.debug(
      `Karşılıksız çek tazminatı: ${cekBedeli} TL x %10 = ${tazminatTutari} TL`,
    );

    return {
      cekBedeli,
      tazminatOrani: this.KARSILISIZ_CEK_TAZMINAT_ORANI,
      tazminatTutari: this.round(tazminatTutari),
      baslangicTarihi,
      yasal_dayanak: 'TTK m.783',
      aciklama: `Çek bedeli üzerinden %${this.KARSILISIZ_CEK_TAZMINAT_ORANI * 100} karşılıksız çek tazminatı`,
    };
  }

  /**
   * Çek protestosu masraflarını hesapla
   * 
   * @param protestoYapildiMi Protesto yapıldı mı?
   * @param protestoMasrafi Protesto masrafı (varsa)
   * @returns Protesto masrafı detayları
   */
  calculateProtestoMasrafi(
    protestoYapildiMi: boolean,
    protestoMasrafi?: number,
  ): ProtestoMasrafiResult | null {
    if (!protestoYapildiMi) {
      return null;
    }

    // Varsayılan protesto masrafı (noter ücreti + posta)
    const masraf = protestoMasrafi || 500; // Varsayılan değer

    return {
      protestoYapildi: true,
      masrafTutari: masraf,
      yasal_dayanak: 'TTK m.714',
      aciklama: 'Çek protestosu masrafı',
    };
  }

  /**
   * Komisyon hesapla (banka komisyonu vb.)
   * 
   * @param cekBedeli Çek bedeli
   * @param komisyonOrani Komisyon oranı (varsayılan %0.5)
   * @returns Komisyon tutarı
   */
  calculateKomisyon(
    cekBedeli: number,
    komisyonOrani: number = 0.005,
  ): KomisyonResult {
    const komisyonTutari = cekBedeli * komisyonOrani;

    return {
      cekBedeli,
      komisyonOrani,
      komisyonTutari: this.round(komisyonTutari),
      aciklama: `Banka komisyonu (%${komisyonOrani * 100})`,
    };
  }

  /**
   * Tüm çek fer'ilerini hesapla
   * 
   * @param params Çek parametreleri
   * @returns Toplam fer'i tutarı ve detaylar
   */
  calculateAllCekFerileri(params: CekFerilerParams): CekFerilerResult {
    const results: CekFerilerResult = {
      cekBedeli: params.cekBedeli,
      items: [],
      toplamFeriler: 0,
    };

    // 1. Karşılıksız çek tazminatı
    if (params.karsilisiz) {
      const tazminat = this.calculateKarsilisizCekTazminati(
        params.cekBedeli,
        params.ibrazTarihi,
        params.karsilisizSerhTarihi,
      );
      results.items.push({
        type: 'KARSILISIZ_CEK_TAZMINATI',
        tutar: tazminat.tazminatTutari,
        oran: tazminat.tazminatOrani,
        yasal_dayanak: tazminat.yasal_dayanak,
        aciklama: tazminat.aciklama,
      });
      results.toplamFeriler += tazminat.tazminatTutari;
    }

    // 2. Protesto masrafı
    if (params.protestoYapildi) {
      const protesto = this.calculateProtestoMasrafi(true, params.protestoMasrafi);
      if (protesto) {
        results.items.push({
          type: 'PROTESTO_MASRAFI',
          tutar: protesto.masrafTutari,
          yasal_dayanak: protesto.yasal_dayanak,
          aciklama: protesto.aciklama,
        });
        results.toplamFeriler += protesto.masrafTutari;
      }
    }

    // 3. Komisyon
    if (params.komisyonDahil) {
      const komisyon = this.calculateKomisyon(params.cekBedeli, params.komisyonOrani);
      results.items.push({
        type: 'KOMISYON',
        tutar: komisyon.komisyonTutari,
        oran: komisyon.komisyonOrani,
        aciklama: komisyon.aciklama,
      });
      results.toplamFeriler += komisyon.komisyonTutari;
    }

    results.toplamFeriler = this.round(results.toplamFeriler);

    this.logger.log(
      `Çek fer'ileri hesaplandı: ${results.items.length} kalem, toplam ${results.toplamFeriler} TL`,
    );

    return results;
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}

// ============================================================================
// INTERFACES
// ============================================================================

export interface KarsilisizCekTazminatResult {
  cekBedeli: number;
  tazminatOrani: number;
  tazminatTutari: number;
  baslangicTarihi: string;
  yasal_dayanak: string;
  aciklama: string;
}

export interface ProtestoMasrafiResult {
  protestoYapildi: boolean;
  masrafTutari: number;
  yasal_dayanak: string;
  aciklama: string;
}

export interface KomisyonResult {
  cekBedeli: number;
  komisyonOrani: number;
  komisyonTutari: number;
  aciklama: string;
}

export interface CekFerilerParams {
  cekBedeli: number;
  ibrazTarihi: string;
  karsilisiz: boolean;
  karsilisizSerhTarihi?: string;
  protestoYapildi?: boolean;
  protestoMasrafi?: number;
  komisyonDahil?: boolean;
  komisyonOrani?: number;
}

export interface CekFeriItem {
  type: 'KARSILISIZ_CEK_TAZMINATI' | 'PROTESTO_MASRAFI' | 'KOMISYON' | 'DIGER';
  tutar: number;
  oran?: number;
  yasal_dayanak?: string;
  aciklama: string;
}

export interface CekFerilerResult {
  cekBedeli: number;
  items: CekFeriItem[];
  toplamFeriler: number;
}
