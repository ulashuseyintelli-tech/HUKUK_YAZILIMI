/**
 * UYAP Takip Mahiyeti Kodları
 * 
 * Kaynak: UYAP Duyurusu 18/12/2015
 * İlamsız Örnek 7 ve İlamlı Örnek 4-5 Takip Açılışlarında Zorunlu Hale Getirilen
 * Takip Mahiyetlerine İlişkin XML Uyum Kodları
 * 
 * NOT: Bu kodlar UYAP XML dosyasında <mahiyetKodu kod="XXXX"> şeklinde kullanılır.
 */

export interface UyapMahiyetKodu {
  kod: string;
  aciklama: string;
  takipTuru: 'ILAMSIZ_ORNEK_7' | 'ILAMLI_ORNEK_4_5';
  /** Sistemdeki CaseSubCategory ile eşleşme */
  subCategory?: string;
}

/**
 * İlamsız Örnek 7 Mahiyet Kodları (13 adet)
 * takipTuru="0" takipSekli="0" takipYolu="1"
 */
export const ILAMSIZ_ORNEK_7_KODLARI: UyapMahiyetKodu[] = [
  { kod: '1007', aciklama: 'Telefon (Sabit) - Örnek 7', takipTuru: 'ILAMSIZ_ORNEK_7', subCategory: 'TELEFON_SABIT' },
  { kod: '1107', aciklama: 'Çocuk Teslimi - Örnek 7', takipTuru: 'ILAMSIZ_ORNEK_7', subCategory: 'COCUK_TESLIMI' },
  { kod: '1207', aciklama: 'Tük. Hakem Heyeti - Örnek 7', takipTuru: 'ILAMSIZ_ORNEK_7', subCategory: 'TUKETICI_HAKEM' },
  { kod: '1307', aciklama: 'Belgesiz - Örnek 7', takipTuru: 'ILAMSIZ_ORNEK_7', subCategory: 'BELGESIZ' },
  { kod: '1407', aciklama: 'Sözleşme/Protokol - Örnek 7', takipTuru: 'ILAMSIZ_ORNEK_7', subCategory: 'SOZLESME' },
  { kod: '2007', aciklama: 'Telefon (Cep) - Örnek 7', takipTuru: 'ILAMSIZ_ORNEK_7', subCategory: 'TELEFON_CEP' },
  { kod: '3007', aciklama: 'İnternet/TV - Örnek 7', takipTuru: 'ILAMSIZ_ORNEK_7', subCategory: 'INTERNET_TV' },
  { kod: '4007', aciklama: 'Su - Örnek 7', takipTuru: 'ILAMSIZ_ORNEK_7', subCategory: 'SU' },
  { kod: '5007', aciklama: 'Elektrik - Örnek 7', takipTuru: 'ILAMSIZ_ORNEK_7', subCategory: 'ELEKTRIK' },
  { kod: '6007', aciklama: 'Doğal Gaz - Örnek 7', takipTuru: 'ILAMSIZ_ORNEK_7', subCategory: 'DOGALGAZ' },
  { kod: '7007', aciklama: 'Kredi Kartı - Örnek 7', takipTuru: 'ILAMSIZ_ORNEK_7', subCategory: 'KREDI_KARTI' },
  { kod: '8008', aciklama: 'Kredi Sözleşmesi - Örnek 7', takipTuru: 'ILAMSIZ_ORNEK_7', subCategory: 'KREDI_SOZLESMESI' },
  { kod: '9009', aciklama: 'Nafaka - Örnek 7', takipTuru: 'ILAMSIZ_ORNEK_7', subCategory: 'NAFAKA' },
];

/**
 * İlamlı Örnek 4-5 Mahiyet Kodları (4 adet)
 * takipTuru="0" takipSekli="0" takipYolu="0" (ilamlı)
 */
export const ILAMLI_ORNEK_4_5_KODLARI: UyapMahiyetKodu[] = [
  { kod: '1045', aciklama: 'Nafaka - Örnek 4-5', takipTuru: 'ILAMLI_ORNEK_4_5', subCategory: 'NAFAKA' },
  { kod: '2045', aciklama: 'Çocuk Teslimi - Örnek 4-5', takipTuru: 'ILAMLI_ORNEK_4_5', subCategory: 'COCUK_TESLIMI' },
  { kod: '3045', aciklama: 'Tük. Hakem Heyeti - Örnek 4-5', takipTuru: 'ILAMLI_ORNEK_4_5', subCategory: 'TUKETICI_HAKEM' },
  { kod: '4045', aciklama: 'Para Alacağı - Örnek 4-5', takipTuru: 'ILAMLI_ORNEK_4_5', subCategory: 'PARA_ALACAGI' },
];

/**
 * Tüm mahiyet kodları
 */
export const TUM_MAHIYET_KODLARI: UyapMahiyetKodu[] = [
  ...ILAMSIZ_ORNEK_7_KODLARI,
  ...ILAMLI_ORNEK_4_5_KODLARI,
];

/**
 * Kod'dan mahiyet bilgisi getir
 */
export function getMahiyetByKod(kod: string): UyapMahiyetKodu | undefined {
  return TUM_MAHIYET_KODLARI.find(m => m.kod === kod);
}

/**
 * Takip türüne göre mahiyet kodlarını getir
 */
export function getMahiyetlerByTakipTuru(takipTuru: 'ILAMSIZ_ORNEK_7' | 'ILAMLI_ORNEK_4_5'): UyapMahiyetKodu[] {
  return TUM_MAHIYET_KODLARI.filter(m => m.takipTuru === takipTuru);
}

/**
 * SubCategory'den UYAP mahiyet kodunu bul
 */
export function getUyapKodBySubCategory(subCategory: string, isIlamli: boolean): string | undefined {
  const takipTuru = isIlamli ? 'ILAMLI_ORNEK_4_5' : 'ILAMSIZ_ORNEK_7';
  const mahiyet = TUM_MAHIYET_KODLARI.find(
    m => m.subCategory === subCategory && m.takipTuru === takipTuru
  );
  return mahiyet?.kod;
}

/**
 * XML için mahiyet kodu elementi oluştur
 * Örnek: <mahiyetKodu kod="2045">
 */
export function createMahiyetKoduXml(kod: string): string {
  const mahiyet = getMahiyetByKod(kod);
  if (!mahiyet) {
    throw new Error(`Geçersiz mahiyet kodu: ${kod}`);
  }
  return `<mahiyetKodu kod="${kod}">`;
}

/**
 * UYAP XML dosya etiketi için mahiyet kodu attribute'u
 * Örnek: mahiyetKodu="2045"
 */
export function getMahiyetKoduAttribute(kod: string): string {
  return `mahiyetKodu="${kod}"`;
}
