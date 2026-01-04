/**
 * UYAP e-Takip XML Tipleri
 * 
 * Bu dosya UYAP sistemine gönderilecek XML yapısının TypeScript tiplerini içerir.
 * Adalet Bakanlığı DTD (Document Type Definition) standartlarına uygun.
 */

// ==========================================
// TEMEL TİPLER
// ==========================================

export interface UyapAdres {
  il: string;
  ilce: string;
  mahalle?: string;
  cadde?: string;
  sokak?: string;
  apartman?: string;
  kapiNo?: string;
  postaKodu?: string;
  tamAdres: string;
}

export interface UyapKisi {
  /** Gerçek kişi için TC Kimlik No, Tüzel kişi için Vergi No */
  kimlikNo: string;
  /** GERCEK_KISI | TUZEL_KISI */
  kisiTipi: 'GERCEK_KISI' | 'TUZEL_KISI';
  /** Gerçek kişi için ad */
  ad?: string;
  /** Gerçek kişi için soyad */
  soyad?: string;
  /** Tüzel kişi için unvan */
  unvan?: string;
  /** Baba adı (gerçek kişi) */
  babaAdi?: string;
  /** Anne adı (gerçek kişi) */
  anneAdi?: string;
  /** Doğum tarihi (gerçek kişi) */
  dogumTarihi?: string;
  /** Doğum yeri (gerçek kişi) */
  dogumYeri?: string;
  adres?: UyapAdres;
  telefon?: string;
  email?: string;
}

export interface UyapVekil {
  /** Baro sicil numarası */
  baroSicilNo: string;
  /** Avukat adı */
  ad: string;
  /** Avukat soyadı */
  soyad: string;
  /** TC Kimlik No */
  tckn?: string;
  /** Vergi numarası */
  vergiNo?: string;
  /** Baro adı */
  baroAdi?: string;
  adres?: UyapAdres;
  telefon?: string;
  email?: string;
}

// ==========================================
// TARAF TİPLERİ
// ==========================================

export type UyapTarafRolu = 
  | 'ALACAKLI'
  | 'BORCLU'
  | 'KEFIL'
  | 'UCUNCU_SAHIS'
  | 'REHIN_ALACAKLISI'
  | 'IPOTEK_ALACAKLISI';

export interface UyapTaraf {
  kisi: UyapKisi;
  rol: UyapTarafRolu;
  /** Tarafın vekili (varsa) */
  vekil?: UyapVekil;
}

// ==========================================
// ALACAK KALEMİ TİPLERİ
// ==========================================

export type UyapAlacakTuru =
  | 'ASIL_ALACAK'
  | 'FAIZ'
  | 'GECMIS_GUN_FAIZI'
  | 'VEKALET_UCRETI'
  | 'YARGILAMA_GIDERI'
  | 'ICRA_INKAR_TAZMINATI'
  | 'DIGER';

export interface UyapFaizBilgisi {
  /** Faiz başlangıç tarihi (YYYY-MM-DD) */
  baslangicTarihi: string;
  /** Faiz türü kodu (FAIZT00001, FAIZT00002, vb.) */
  faizTuruKodu: string;
  /** Faiz türü açıklaması */
  faizTuruAciklama: string;
  /** Sabit faiz oranı (yıllık %) - Diğer seçilirse */
  faizOrani?: number;
  /** Faiz süre tipi: YILLIK | AYLIK | GUNLUK */
  faizSureTipi: 'YILLIK' | 'AYLIK' | 'GUNLUK';
}

export interface UyapAlacakKalemi {
  /** Alacak türü */
  tur: UyapAlacakTuru;
  /** Alacak açıklaması */
  aciklama: string;
  /** Tutar */
  tutar: number;
  /** Para birimi */
  paraBirimi: 'TRY' | 'USD' | 'EUR' | 'GBP' | 'CHF';
  /** Takip sonrası faiz bilgisi (varsa) */
  faiz?: UyapFaizBilgisi;
}

// ==========================================
// ÇEK / SENET / İLAM TİPLERİ
// ==========================================

export interface UyapCekBilgisi {
  /** Çek seri numarası */
  seriNo: string;
  /** Banka adı */
  bankaAdi: string;
  /** Şube adı */
  subeAdi?: string;
  /** Keşide tarihi (YYYY-MM-DD) */
  kesideTarihi: string;
  /** İbraz tarihi (YYYY-MM-DD) */
  ibrazTarihi?: string;
  /** Çek tutarı */
  tutar: number;
  /** Para birimi */
  paraBirimi: 'TRY' | 'USD' | 'EUR' | 'GBP' | 'CHF';
  /** Keşideci bilgisi */
  kesideci?: UyapKisi;
  /** Alacak kalemleri */
  alacakKalemleri: UyapAlacakKalemi[];
}

export interface UyapSenetBilgisi {
  /** Senet numarası */
  senetNo?: string;
  /** Düzenleme tarihi (YYYY-MM-DD) */
  duzenlemeTarihi: string;
  /** Vade tarihi (YYYY-MM-DD) */
  vadeTarihi: string;
  /** Düzenleme yeri */
  duzenlemeYeri?: string;
  /** Ödeme yeri */
  odemeYeri?: string;
  /** Senet tutarı */
  tutar: number;
  /** Para birimi */
  paraBirimi: 'TRY' | 'USD' | 'EUR' | 'GBP' | 'CHF';
  /** Borçlu bilgisi */
  borclu?: UyapKisi;
  /** Alacak kalemleri */
  alacakKalemleri: UyapAlacakKalemi[];
}

export interface UyapIlamBilgisi {
  /** Mahkeme adı */
  mahkemeAdi: string;
  /** Esas numarası */
  esasNo: string;
  /** Karar numarası */
  kararNo: string;
  /** Karar tarihi (YYYY-MM-DD) */
  kararTarihi: string;
  /** Kesinleşme tarihi (YYYY-MM-DD) */
  kesinlesmeTarihi?: string;
  /** İlam türü */
  ilamTuru?: string;
  /** Alacak kalemleri */
  alacakKalemleri: UyapAlacakKalemi[];
  /** Para ile ölçülemeyen alacaklar */
  paraIleOlculemeyenAlacaklar?: string[];
  /** Teminat bilgisi */
  teminat?: {
    tur: string;
    tutar?: number;
    aciklama?: string;
  };
}

export interface UyapDigerAlacakBilgisi {
  /** Alacak türü açıklaması */
  turAciklama: string;
  /** Alacak kalemleri */
  alacakKalemleri: UyapAlacakKalemi[];
}

// ==========================================
// TAKİP TALEBİ TİPLERİ
// ==========================================

export type UyapDosyaTuru = 'ILAMSIZ' | 'ILAMLI' | 'ILAMLI_IPOTEK' | 'ILAMLI_REHIN';

export type UyapTakipTuru = 
  | 'GENEL_HACIZ'
  | 'KAMBIYO_CEK'
  | 'KAMBIYO_SENET'
  | 'KAMBIYO_POLICE'
  | 'KIRA'
  | 'NAFAKA'
  | 'IPOTEK'
  | 'REHIN'
  | 'IFLAS';

export type UyapTakipYolu = 'HACIZ' | 'IFLAS' | 'REHIN' | 'TAHLIYE';

export type UyapTakipSekli = 'ILAMSIZ' | 'ILAMLI';

export interface UyapTakipTalebi {
  /** Dosya belirleyicisi (internal reference) */
  dosyaBelirleyici: string;
  /** Dosya türü */
  dosyaTuru: UyapDosyaTuru;
  /** Takip türü */
  takipTuru: UyapTakipTuru;
  /** Takip yolu */
  takipYolu: UyapTakipYolu;
  /** Takip şekli */
  takipSekli: UyapTakipSekli;
  /** İİK 48/4 Açıklama - Alacak kalemleri açıklaması */
  madde48_4Aciklama: string;
  /** İİK 48/9 Açıklama - Ek bilgiler */
  madde48_9Aciklama?: string;
  /** BK 84 uygulanacak mı? */
  bk84Uygula: boolean;
  /** BSMV uygulanacak mı? */
  bsmvUygula: boolean;
  /** KKDF uygulanacak mı? */
  kkdfUygula: boolean;
  /** Taraflar */
  taraflar: UyapTaraf[];
  /** Çek bilgileri (ilamsız - kambiyo) */
  cekler?: UyapCekBilgisi[];
  /** Senet bilgileri (ilamsız - kambiyo) */
  senetler?: UyapSenetBilgisi[];
  /** İlam bilgileri (ilamlı) */
  ilamlar?: UyapIlamBilgisi[];
  /** Diğer alacak bilgileri */
  digerAlacaklar?: UyapDigerAlacakBilgisi[];
  /** Taranmış evraklar (Base64 encoded TIFF) */
  evraklar?: UyapEvrak[];
}

// ==========================================
// EVRAK TİPLERİ
// ==========================================

export type UyapEvrakTuru = 
  | 'TAKIP_TALEBI'
  | 'VEKALETNAME'
  | 'CEK'
  | 'SENET'
  | 'ILAM'
  | 'KARAR'
  | 'DIGER';

export interface UyapEvrak {
  /** Evrak türü */
  tur: UyapEvrakTuru;
  /** Evrak açıklaması */
  aciklama?: string;
  /** Dosya adı */
  dosyaAdi: string;
  /** MIME tipi (image/tiff) */
  mimeType: string;
  /** Base64 encoded içerik */
  icerik: string;
  /** Dosya boyutu (bytes) */
  boyut: number;
}

// ==========================================
// E-TAKİP DOSYASI (XML ROOT)
// ==========================================

export interface UyapETakipDosyasi {
  /** Versiyon */
  versiyon: string;
  /** Oluşturma tarihi (ISO 8601) */
  olusturmaTarihi: string;
  /** Oluşturan sistem */
  olusturanSistem: string;
  /** Ortak vekiller (tüm takip taleplerinde kullanılabilir) */
  ortakVekiller?: UyapVekil[];
  /** Ortak taraflar (tüm takip taleplerinde kullanılabilir) */
  ortakTaraflar?: UyapTaraf[];
  /** Takip talepleri */
  takipTalepleri: UyapTakipTalebi[];
}
