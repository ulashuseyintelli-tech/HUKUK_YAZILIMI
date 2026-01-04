/**
 * UYAP Faiz Türleri
 * 
 * XML FAİZ TÜRLERİNE İLİŞKİN DUYURU – 20.03.2024
 * 
 * Değişiklikler:
 * - 03.11.2023: Azami Mevduat Faizi (TL/USD/EUR/DEM) kaldırıldı (TCMB yayını durdurdu)
 * - 12.01.2024: 1 Yıl ve Daha Uzun Vadeli faiz oranları eklendi
 * - 12.01.2024: "Mevduatlara" → "1 Yıla Kadar Vadeli Mevduatlara" olarak güncellendi
 */

export interface UyapFaizTuru {
  kod: string;
  aciklama: string;
  /** Para birimi (varsa) */
  currency?: 'TRY' | 'USD' | 'EUR' | 'DEM' | 'FRF';
  /** Faiz kategorisi */
  kategori: 'YASAL' | 'BANKA' | 'KAMU_BANKASI' | 'KREDI_KARTI' | 'VERGI' | 'TICARI' | 'ENFLASYON' | 'DIGER';
  /** Vade türü */
  vadeTuru?: 'KISA' | 'UZUN'; // 1 yıla kadar / 1 yıl ve üzeri
  /** Aktif mi? (TCMB tarafından kaldırılanlar false) */
  aktif: boolean;
}

export const UYAP_FAIZ_TURLERI: UyapFaizTuru[] = [
  // ==========================================
  // YASAL FAİZLER
  // ==========================================
  {
    kod: 'FAIZT00001',
    aciklama: 'Reeskont İskonto',
    kategori: 'YASAL',
    aktif: true,
  },
  {
    kod: 'FAIZT00002',
    aciklama: 'Adi Kanuni Faiz',
    kategori: 'YASAL',
    aktif: true,
  },
  {
    kod: 'FAIZT00007',
    aciklama: 'Reeskont Avans',
    kategori: 'YASAL',
    aktif: true,
  },

  // ==========================================
  // ENFLASYON ENDEKSLERİ
  // ==========================================
  {
    kod: 'FAIZT00009',
    aciklama: 'ÜFE',
    kategori: 'ENFLASYON',
    aktif: true,
  },
  {
    kod: 'FAIZT00010',
    aciklama: 'TÜFE',
    kategori: 'ENFLASYON',
    aktif: true,
  },

  // ==========================================
  // BANKA FAİZLERİ - 1 YILA KADAR VADELİ
  // ==========================================
  {
    kod: 'FAIZT00011',
    aciklama: 'Bankalarca 1 Yıla Kadar Vadeli Mevduatlara Fiilen Uygulanan Azami Faiz (TL)',
    kategori: 'BANKA',
    currency: 'TRY',
    vadeTuru: 'KISA',
    aktif: true,
  },
  {
    kod: 'FAIZT00012',
    aciklama: 'Bankalarca 1 Yıla Kadar Vadeli Mevduatlara Fiilen Uygulanan Azami Faiz (USD)',
    kategori: 'BANKA',
    currency: 'USD',
    vadeTuru: 'KISA',
    aktif: true,
  },
  {
    kod: 'FAIZT00013',
    aciklama: 'Bankalarca 1 Yıla Kadar Vadeli Mevduatlara Fiilen Uygulanan Azami Faiz (EUR)',
    kategori: 'BANKA',
    currency: 'EUR',
    vadeTuru: 'KISA',
    aktif: true,
  },
  {
    kod: 'FAIZT00014',
    aciklama: 'Bankalarca 1 Yıla Kadar Vadeli Mevduatlara Fiilen Uygulanan Azami Faiz (FRF)',
    kategori: 'BANKA',
    currency: 'FRF',
    vadeTuru: 'KISA',
    aktif: false, // FRF artık kullanılmıyor (Euro'ya geçti)
  },
  {
    kod: 'FAIZT00015',
    aciklama: 'Bankalarca 1 Yıla Kadar Vadeli Mevduatlara Fiilen Uygulanan Azami Faiz (DEM)',
    kategori: 'BANKA',
    currency: 'DEM',
    vadeTuru: 'KISA',
    aktif: false, // DEM artık kullanılmıyor (Euro'ya geçti)
  },

  // ==========================================
  // BANKA FAİZLERİ - 1 YIL VE DAHA UZUN VADELİ (12.01.2024 eklendi)
  // ==========================================
  {
    kod: 'FAIZT00032',
    aciklama: 'Bankalarca 1 Yıl ve Daha Uzun Vadeli Mevduatlara Fiilen Uygulanan Azami Faiz (TL)',
    kategori: 'BANKA',
    currency: 'TRY',
    vadeTuru: 'UZUN',
    aktif: true,
  },
  {
    kod: 'FAIZT00033',
    aciklama: 'Bankalarca 1 Yıl ve Daha Uzun Vadeli Mevduatlara Fiilen Uygulanan Azami Faiz (USD)',
    kategori: 'BANKA',
    currency: 'USD',
    vadeTuru: 'UZUN',
    aktif: true,
  },
  {
    kod: 'FAIZT00034',
    aciklama: 'Bankalarca 1 Yıl ve Daha Uzun Vadeli Mevduatlara Fiilen Uygulanan Azami Faiz (EUR)',
    kategori: 'BANKA',
    currency: 'EUR',
    vadeTuru: 'UZUN',
    aktif: true,
  },

  // ==========================================
  // KAMU BANKASI FAİZLERİ - 1 YILA KADAR VADELİ
  // ==========================================
  {
    kod: 'FAIZT00026',
    aciklama: 'Kamu Bankalarınca 1 Yıla Kadar Vadeli Mevduatlara Fiilen Uygulanan Azami Faiz (TL)',
    kategori: 'KAMU_BANKASI',
    currency: 'TRY',
    vadeTuru: 'KISA',
    aktif: true,
  },
  {
    kod: 'FAIZT00027',
    aciklama: 'Kamu Bankalarınca 1 Yıla Kadar Vadeli Mevduatlara Fiilen Uygulanan Azami Faiz (USD)',
    kategori: 'KAMU_BANKASI',
    currency: 'USD',
    vadeTuru: 'KISA',
    aktif: true,
  },
  {
    kod: 'FAIZT00028',
    aciklama: 'Kamu Bankalarınca 1 Yıla Kadar Vadeli Mevduatlara Fiilen Uygulanan Azami Faiz (EUR)',
    kategori: 'KAMU_BANKASI',
    currency: 'EUR',
    vadeTuru: 'KISA',
    aktif: true,
  },

  // ==========================================
  // KAMU BANKASI FAİZLERİ - 1 YIL VE DAHA UZUN VADELİ (12.01.2024 eklendi)
  // ==========================================
  {
    kod: 'FAIZT00029',
    aciklama: 'Kamu Bankalarınca 1 Yıl ve Daha Uzun Vadeli Mevduatlara Fiilen Uygulanan Azami Faiz (TL)',
    kategori: 'KAMU_BANKASI',
    currency: 'TRY',
    vadeTuru: 'UZUN',
    aktif: true,
  },
  {
    kod: 'FAIZT00030',
    aciklama: 'Kamu Bankalarınca 1 Yıl ve Daha Uzun Vadeli Mevduatlara Fiilen Uygulanan Azami Faiz (USD)',
    kategori: 'KAMU_BANKASI',
    currency: 'USD',
    vadeTuru: 'UZUN',
    aktif: true,
  },
  {
    kod: 'FAIZT00031',
    aciklama: 'Kamu Bankalarınca 1 Yıl ve Daha Uzun Vadeli Mevduatlara Fiilen Uygulanan Azami Faiz (EUR)',
    kategori: 'KAMU_BANKASI',
    currency: 'EUR',
    vadeTuru: 'UZUN',
    aktif: true,
  },

  // ==========================================
  // VERGİ / KAMU ALACAKLARI
  // ==========================================
  {
    kod: 'FAIZT00016',
    aciklama: '6183 Sayılı K. 51.Madde Gecikme Faizi',
    kategori: 'VERGI',
    aktif: true,
  },

  // ==========================================
  // TİCARİ FAİZLER
  // ==========================================
  {
    kod: 'FAIZT00017',
    aciklama: 'TTK.1530. Madde Temerrüt Faizi',
    kategori: 'TICARI',
    aktif: true,
  },

  // ==========================================
  // KREDİ KARTI FAİZLERİ
  // ==========================================
  {
    kod: 'FAIZT00018',
    aciklama: 'Kredi Kartı Azami Akdi Faizi (Türk Lirası)',
    kategori: 'KREDI_KARTI',
    currency: 'TRY',
    aktif: true,
  },
  {
    kod: 'FAIZT00019',
    aciklama: 'Kredi Kartı Azami Akdi Faizi (Yabancı Para)',
    kategori: 'KREDI_KARTI',
    aktif: true,
  },
  {
    kod: 'FAIZT00020',
    aciklama: 'Kredi Kartı Azami Gecikme Faizi (Yabancı Para)',
    kategori: 'KREDI_KARTI',
    aktif: true,
  },
  {
    kod: 'FAIZT00021',
    aciklama: 'Kredi Kartı Azami Gecikme Faizi (Türk Lirası)',
    kategori: 'KREDI_KARTI',
    currency: 'TRY',
    aktif: true,
  },

  // ==========================================
  // DİĞER
  // ==========================================
  {
    kod: 'FAIZT00003',
    aciklama: 'Diğer',
    kategori: 'DIGER',
    aktif: true,
  },
];

// Helper fonksiyonlar
export function getFaizTuruByKod(kod: string): UyapFaizTuru | undefined {
  return UYAP_FAIZ_TURLERI.find(f => f.kod === kod);
}

export function getAktifFaizTurleri(): UyapFaizTuru[] {
  return UYAP_FAIZ_TURLERI.filter(f => f.aktif);
}

export function getFaizTurleriByKategori(kategori: UyapFaizTuru['kategori']): UyapFaizTuru[] {
  return UYAP_FAIZ_TURLERI.filter(f => f.kategori === kategori && f.aktif);
}

export function getFaizTurleriByCurrency(currency: UyapFaizTuru['currency']): UyapFaizTuru[] {
  return UYAP_FAIZ_TURLERI.filter(f => f.currency === currency && f.aktif);
}

/**
 * İcra takibi için uygun faiz türünü belirle
 * @param currency Para birimi
 * @param isCommercial Ticari alacak mı?
 * @param isCreditCard Kredi kartı alacağı mı?
 */
export function getDefaultFaizTuru(
  currency: 'TRY' | 'USD' | 'EUR' = 'TRY',
  isCommercial: boolean = false,
  isCreditCard: boolean = false
): UyapFaizTuru | undefined {
  // Kredi kartı alacağı
  if (isCreditCard) {
    if (currency === 'TRY') {
      return getFaizTuruByKod('FAIZT00021'); // Kredi Kartı Gecikme Faizi TL
    }
    return getFaizTuruByKod('FAIZT00020'); // Kredi Kartı Gecikme Faizi YP
  }

  // Ticari alacak
  if (isCommercial) {
    return getFaizTuruByKod('FAIZT00017'); // TTK 1530 Temerrüt Faizi
  }

  // Normal alacak - Adi Kanuni Faiz
  return getFaizTuruByKod('FAIZT00002');
}

/**
 * Banka mevduat faizi için uygun türü belirle
 * @param currency Para birimi
 * @param isPublicBank Kamu bankası mı?
 * @param isLongTerm 1 yıl ve üzeri vade mi?
 */
export function getBankaMevduatFaizi(
  currency: 'TRY' | 'USD' | 'EUR' = 'TRY',
  isPublicBank: boolean = false,
  isLongTerm: boolean = false
): UyapFaizTuru | undefined {
  const kategori = isPublicBank ? 'KAMU_BANKASI' : 'BANKA';
  const vadeTuru = isLongTerm ? 'UZUN' : 'KISA';
  
  return UYAP_FAIZ_TURLERI.find(
    f => f.kategori === kategori && 
         f.currency === currency && 
         f.vadeTuru === vadeTuru && 
         f.aktif
  );
}
