/**
 * LOOKUP CATALOG — TEK KANONİK VERİ KAYNAĞI.
 *
 * Takip türü / mahiyet tipi / aşama / risk / borçlu tipi / durum etiketi sabit listeleri
 * SADECE burada tanımlıdır. Daha önce bu liste 3 ayrı yerde (scripts/seed-lookups.ts,
 * seed.service.ts, kısmen frontend) tutuluyordu ve drift etti (frontend'in aradığı
 * KAMBIYO_CEK/KAMBIYO_SENET/ILAMLI kodları in-app seed'de yoktu → boş Takip Türü).
 *
 * KURAL: Bu listelerin İKİNCİ bir kopyası HİÇBİR yerde tutulmaz. Tüm seed yolları
 * (lookup-seed.ts üzerinden) buradan beslenir. Frontend (apps/web) bunu import etmez;
 * onun aradığı kodlar contract-test (__tests__/lookup-catalog.contract.spec.ts) ile
 * bu katalog ile hizalanır.
 *
 * SAFLIK: Bu modül hiçbir şey import ETMEZ (Nest/Prisma yok) → leaf modül; hem Nest
 * servisi, hem standalone tsx script'leri, hem prisma/seed.ts güvenle import edebilir.
 */

export interface LookupSeedItem {
  code: string;
  name: string;
  description?: string;
  sortOrder: number;
}

export interface LookupColorSeedItem extends LookupSeedItem {
  color: string;
}

export interface MahiyetSeedItem extends LookupSeedItem {
  uyapCode: string | null;
}

export interface TakipTuruDefault {
  mahiyetKodu: string;
}

// ==================== TAKİP TÜRLERİ (11) ====================
export const TAKIP_TURU_CATALOG: readonly LookupSeedItem[] = [
  { code: 'ILAMSIZ_GENEL', name: 'İlamsız Genel Haciz', description: 'Genel alacak takibi', sortOrder: 1 },
  { code: 'ILAMSIZ_KIRA', name: 'İlamsız Kira', description: 'Kira alacağı takibi', sortOrder: 2 },
  { code: 'ILAMSIZ_TAHLIYE', name: 'İlamsız Tahliye', description: 'Kiracı tahliyesi takibi', sortOrder: 3 },
  { code: 'ILAMLI', name: 'İlamlı Takip', description: 'Mahkeme kararına dayalı takip', sortOrder: 4 },
  { code: 'NAFAKA', name: 'Nafaka', description: 'Nafaka alacağı takibi', sortOrder: 5 },
  { code: 'KAMBIYO_CEK', name: 'Kambiyo - Çek', description: 'Çeke dayalı takip', sortOrder: 6 },
  { code: 'KAMBIYO_SENET', name: 'Kambiyo - Senet', description: 'Senede dayalı takip', sortOrder: 7 },
  { code: 'REHIN_TASINIR', name: 'Rehin - Taşınır', description: 'Taşınır rehni paraya çevirme', sortOrder: 8 },
  { code: 'REHIN_TASINMAZ', name: 'Rehin - Taşınmaz (İpotek)', description: 'İpotek paraya çevirme', sortOrder: 9 },
  { code: 'IFLAS_ADI', name: 'İflas - Adi Takip', description: 'Tacir borçluya karşı adi alacak için iflas', sortOrder: 10 },
  { code: 'IFLAS_KAMBIYO', name: 'İflas - Kambiyo', description: 'Tacir borçluya karşı kambiyo senedi için iflas', sortOrder: 11 },
];

// ==================== MAHİYET TİPLERİ / Alacak Türleri (18) ====================
export const MAHIYET_TIPI_CATALOG: readonly MahiyetSeedItem[] = [
  { code: 'PARA', name: 'Genel Para Alacağı', description: 'Genel para alacağı takibi', uyapCode: null, sortOrder: 1 },
  { code: 'KIRA', name: 'Kira Alacağı', description: 'Kira bedeli alacağı', uyapCode: null, sortOrder: 2 },
  { code: 'AIDAT', name: 'Aidat / Site Gideri', description: 'Apartman/site aidatı ve ortak giderler', uyapCode: null, sortOrder: 3 },
  { code: 'KREDI', name: 'Kredi Alacağı', description: 'Tüketici/ticari kredi alacağı', uyapCode: null, sortOrder: 4 },
  { code: 'KREDI_KARTI', name: 'Kredi Kartı Alacağı', description: 'Kredi kartı borcu', uyapCode: null, sortOrder: 5 },
  { code: 'BANKA', name: 'Banka Alacağı (İİK 68)', description: 'Banka genel kredi sözleşmesine dayalı alacak', uyapCode: null, sortOrder: 6 },
  { code: 'NAFAKA', name: 'Nafaka Alacağı', description: 'Nafaka alacağı takibi', uyapCode: '201', sortOrder: 7 },
  { code: 'KIRA_FARK', name: 'Kira Farkı / Ecrimisil', description: 'Kira farkı ve ecrimisil alacağı', uyapCode: null, sortOrder: 8 },
  { code: 'FATURA', name: 'Fatura Alacağı', description: 'Fatura ve cari hesap alacağı', uyapCode: null, sortOrder: 9 },
  { code: 'CEK', name: 'Çek Alacağı', description: 'Çeke dayalı alacak', uyapCode: null, sortOrder: 10 },
  { code: 'SENET', name: 'Senet Alacağı', description: 'Senede dayalı alacak', uyapCode: null, sortOrder: 11 },
  { code: 'TAZMINAT', name: 'Tazminat Alacağı', description: 'Mahkeme kararına dayalı tazminat', uyapCode: null, sortOrder: 12 },
  { code: 'ICRA_INKAR', name: 'İcra İnkâr Tazminatı', description: 'İcra inkâr tazminatı içeren dosya', uyapCode: null, sortOrder: 13 },
  { code: 'ISCILIK', name: 'İşçilik Alacağı', description: 'İşçilik ve kıdem tazminatı alacağı', uyapCode: null, sortOrder: 14 },
  { code: 'TAHLIYE', name: 'Tahliye', description: 'Kiracı tahliyesi takibi', uyapCode: null, sortOrder: 15 },
  { code: 'IPOTEK', name: 'İpotek Alacağı', description: 'İpotek akit tablosuna dayalı alacak', uyapCode: null, sortOrder: 16 },
  { code: 'REHIN', name: 'Rehin Alacağı', description: 'Taşınır rehni alacağı (araç, ticari işletme vb.)', uyapCode: null, sortOrder: 17 },
  { code: 'DIGER', name: 'Diğer', description: 'Diğer alacak türleri', uyapCode: null, sortOrder: 99 },
];

// ==================== AŞAMALAR (9) ====================
export const ASAMA_CATALOG: readonly LookupSeedItem[] = [
  { code: 'DOSYA_ACILDI', name: 'Dosya Açıldı', description: 'Takip başlatıldı', sortOrder: 1 },
  { code: 'ODEME_EMRI_TEBLIG', name: 'Ödeme Emri Tebliğ Aşaması', description: 'Ödeme emri gönderildi', sortOrder: 2 },
  { code: 'TEBLIGAT_IADE', name: 'Tebligat İade / Adres Araştırması', description: 'Tebligat iade geldi', sortOrder: 3 },
  { code: 'HACIZ_TALEP', name: 'Haciz Talep Edildi', description: 'Haciz talebi yapıldı', sortOrder: 4 },
  { code: 'HACIZ_YAPILDI', name: 'Haciz Yapıldı', description: 'Haciz işlemi tamamlandı', sortOrder: 5 },
  { code: 'MAAS_HACZI', name: 'Maaş Haczi', description: 'Maaş haczi uygulandı', sortOrder: 6 },
  { code: 'SATIS_ASAMASI', name: 'Satış Aşaması', description: 'Satış süreci başladı', sortOrder: 7 },
  { code: 'TAHSILAT_KAPAMA', name: 'Tahsilat / Kapama Hazırlığı', description: 'Tahsilat yapıldı', sortOrder: 8 },
  { code: 'DOSYA_KAPANDI', name: 'Dosya Kapatıldı', description: 'Takip sonlandı', sortOrder: 9 },
];

// ==================== RİSK SINIFLARI (3) ====================
export const RISK_CATALOG: readonly LookupColorSeedItem[] = [
  { code: 'DUSUK', name: 'Düşük', description: 'Tahsil ihtimali yüksek', color: '#22c55e', sortOrder: 1 },
  { code: 'ORTA', name: 'Orta', description: 'Tahsil ihtimali orta', color: '#eab308', sortOrder: 2 },
  { code: 'YUKSEK', name: 'Yüksek', description: 'Tahsil ihtimali düşük', color: '#ef4444', sortOrder: 3 },
];

// ==================== DURUM ETİKETLERİ (9) ====================
export const DURUM_ETIKETI_CATALOG: readonly LookupColorSeedItem[] = [
  { code: 'MASRAF_BEKLIYOR', name: 'Masraf Bekliyor', description: 'Masraf yatırılması bekleniyor', color: '#f97316', sortOrder: 1 },
  { code: 'MUVAFAKAT_BEKLIYOR', name: 'Muvafakat Bekliyor', description: 'Müvekkil onayı bekleniyor', color: '#8b5cf6', sortOrder: 2 },
  { code: 'ADRES_ARASTIRMA', name: 'Adres Araştırması Gerekiyor', description: 'Yeni adres araştırılacak', color: '#06b6d4', sortOrder: 3 },
  { code: 'MERNIS_BEKLIYOR', name: 'MERNİS Bekliyor', description: 'MERNİS sorgusu bekleniyor', color: '#3b82f6', sortOrder: 4 },
  { code: 'ARABULUCULUK', name: 'Arabuluculuk Süreci', description: 'Arabuluculuk görüşmesi', color: '#10b981', sortOrder: 5 },
  { code: 'SULH_GORUSMESI', name: 'Sulh Görüşmesi', description: 'Sulh görüşmesi yapılıyor', color: '#14b8a6', sortOrder: 6 },
  { code: 'KAPANACAK_TAHSIL', name: 'Kapanacak (Tahsil)', description: 'Tahsilat tamamlandı, kapatılacak', color: '#22c55e', sortOrder: 7 },
  { code: 'KAPANACAK_FERAGAT', name: 'Kapanacak (Feragat)', description: 'Feragat edildi, kapatılacak', color: '#84cc16', sortOrder: 8 },
  { code: 'BEKLEMEDE', name: 'Beklemede', description: 'Genel bekleme durumu', color: '#6b7280', sortOrder: 9 },
];

// ==================== TAKİP TÜRÜ VARSAYILANLARI ====================
// Her takip türüne göre varsayılan mahiyet tipi (id'si seed sırasında çözülür).
// Risk durumu otomatik atanmaz (dosya açıldıktan sonra manuel belirlenir).
export const TAKIP_TURU_DEFAULTS: Readonly<Record<string, TakipTuruDefault>> = {
  ILAMSIZ_GENEL: { mahiyetKodu: 'PARA' },
  ILAMSIZ_KIRA: { mahiyetKodu: 'KIRA' },
  ILAMSIZ_TAHLIYE: { mahiyetKodu: 'TAHLIYE' },
  ILAMLI: { mahiyetKodu: 'TAZMINAT' },
  NAFAKA: { mahiyetKodu: 'NAFAKA' },
  KAMBIYO_CEK: { mahiyetKodu: 'CEK' },
  KAMBIYO_SENET: { mahiyetKodu: 'SENET' },
  REHIN_TASINIR: { mahiyetKodu: 'REHIN' },
  REHIN_TASINMAZ: { mahiyetKodu: 'IPOTEK' },
  IFLAS_ADI: { mahiyetKodu: 'PARA' },
  IFLAS_KAMBIYO: { mahiyetKodu: 'SENET' },
};
