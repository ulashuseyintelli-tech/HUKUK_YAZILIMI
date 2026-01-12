/**
 * Avukatlık Asgari Ücret Tarifesi 2026
 * Kaynak: Türkiye Barolar Birliği (TBB)
 * Yürürlük Tarihi: 4 Kasım 2025
 * Resmi Gazete: https://www.resmigazete.gov.tr/eskiler/2025/11/20251104-9-1.pdf
 * 
 * Not: 2025-2026 yılı tarifesinde maktu ücretlere ortalama %36,15 artış uygulanmıştır.
 * Nispi tarifeye %13'lük yeni bir dilim eklenmiştir.
 */

// ============================================================================
// NİSPİ VEKALET ÜCRETİ ORANLARI (Konusu Para Olan İşler)
// ============================================================================

export interface NispiUcretDilimi {
  /** Dilim başlangıç tutarı (TL) */
  baslangic: number;
  /** Dilim bitiş tutarı (TL), null ise sınırsız */
  bitis: number | null;
  /** Dilim tutarı (TL) */
  dilimTutari: number;
  /** Uygulanacak oran (%) */
  oran: number;
}

export const NISPI_UCRET_DILIMLERI_2026: NispiUcretDilimi[] = [
  { baslangic: 0, bitis: 600_000, dilimTutari: 600_000, oran: 16 },
  { baslangic: 600_000, bitis: 1_200_000, dilimTutari: 600_000, oran: 15 },
  { baslangic: 1_200_000, bitis: 2_400_000, dilimTutari: 1_200_000, oran: 14 },
  { baslangic: 2_400_000, bitis: 3_600_000, dilimTutari: 1_200_000, oran: 13 },
  { baslangic: 3_600_000, bitis: 5_400_000, dilimTutari: 1_800_000, oran: 11 },
  { baslangic: 5_400_000, bitis: 7_800_000, dilimTutari: 2_400_000, oran: 8 },
  { baslangic: 7_800_000, bitis: 10_800_000, dilimTutari: 3_000_000, oran: 5 },
  { baslangic: 10_800_000, bitis: 14_400_000, dilimTutari: 3_600_000, oran: 3 },
  { baslangic: 14_400_000, bitis: 18_600_000, dilimTutari: 4_200_000, oran: 2 },
  { baslangic: 18_600_000, bitis: null, dilimTutari: 0, oran: 1 },
];

// ============================================================================
// MAKTU VEKALET ÜCRETLERİ (Konusu Para Olmayan İşler)
// ============================================================================

export enum MahkemeTuru {
  ICRA_DAIRESI = 'ICRA_DAIRESI',
  ICRA_MAHKEMESI = 'ICRA_MAHKEMESI',
  ICRA_MAHKEMESI_DURUSMA = 'ICRA_MAHKEMESI_DURUSMA',
  ICRA_TAHLIYE = 'ICRA_TAHLIYE',
  ICRA_MAHKEMESI_CEZA = 'ICRA_MAHKEMESI_CEZA',
  COCUK_TESLIMI = 'COCUK_TESLIMI',
  CEZA_SORUSTURMA = 'CEZA_SORUSTURMA',
  SULH_HUKUK = 'SULH_HUKUK',
  SULH_CEZA = 'SULH_CEZA',
  ASLIYE = 'ASLIYE',
  TUKETICI = 'TUKETICI',
  FIKRI_SINAI = 'FIKRI_SINAI',
  AGIR_CEZA = 'AGIR_CEZA',
  COCUK_MAHKEMESI = 'COCUK_MAHKEMESI',
  COCUK_AGIR_CEZA = 'COCUK_AGIR_CEZA',
  ASKERLIK_DISIPLIN = 'ASKERLIK_DISIPLIN',
  IDARE_VERGI_DURUSMASIZ = 'IDARE_VERGI_DURUSMASIZ',
  IDARE_VERGI_DURUSMALI = 'IDARE_VERGI_DURUSMALI',
  BOLGE_ADLIYE_ILK_DERECE = 'BOLGE_ADLIYE_ILK_DERECE',
  BOLGE_ADLIYE_ISTINAF = 'BOLGE_ADLIYE_ISTINAF',
  BOLGE_ADLIYE_ISTINAF_DURUSMALI = 'BOLGE_ADLIYE_ISTINAF_DURUSMALI',
  SAYISTAY_DURUSMASIZ = 'SAYISTAY_DURUSMASIZ',
  SAYISTAY_DURUSMALI = 'SAYISTAY_DURUSMALI',
  YARGITAY_ILK_DERECE = 'YARGITAY_ILK_DERECE',
  DANISTAY_DURUSMASIZ = 'DANISTAY_DURUSMASIZ',
  DANISTAY_DURUSMALI = 'DANISTAY_DURUSMALI',
  TEMYIZ_DURUSMA = 'TEMYIZ_DURUSMA',
  UYUSMAZLIK = 'UYUSMAZLIK',
  ANAYASA_YUCE_DIVAN = 'ANAYASA_YUCE_DIVAN',
  ANAYASA_BIREYSEL_DURUSMASIZ = 'ANAYASA_BIREYSEL_DURUSMASIZ',
  ANAYASA_BIREYSEL_DURUSMALI = 'ANAYASA_BIREYSEL_DURUSMALI',
  ANAYASA_DIGER = 'ANAYASA_DIGER',
}

export interface MaktuUcret {
  kod: MahkemeTuru;
  aciklama: string;
  ucret: number;
  kategori: string;
}

export const MAKTU_UCRETLER_2026: MaktuUcret[] = [
  // İcra İşleri
  { kod: MahkemeTuru.ICRA_DAIRESI, aciklama: 'İcra Dairelerinde yapılan takipler', ucret: 9_000, kategori: 'İcra' },
  { kod: MahkemeTuru.ICRA_MAHKEMESI, aciklama: 'İcra Mahkemelerinde takip edilen işler', ucret: 11_000, kategori: 'İcra' },
  { kod: MahkemeTuru.ICRA_MAHKEMESI_DURUSMA, aciklama: 'İcra Mahkemelerinde takip edilen dava ve duruşmalı işler', ucret: 18_000, kategori: 'İcra' },
  { kod: MahkemeTuru.ICRA_TAHLIYE, aciklama: 'Tahliyeye ilişkin icra takipleri', ucret: 20_000, kategori: 'İcra' },
  { kod: MahkemeTuru.ICRA_MAHKEMESI_CEZA, aciklama: 'İcra Mahkemelerinde takip edilen ceza işleri', ucret: 15_000, kategori: 'İcra' },
  { kod: MahkemeTuru.COCUK_TESLIMI, aciklama: 'Çocuk teslimi ve çocukla kişisel ilişki kurulması işleri', ucret: 16_000, kategori: 'İcra' },
  
  // Ceza İşleri
  { kod: MahkemeTuru.CEZA_SORUSTURMA, aciklama: 'Ceza soruşturma evresinde takip edilen işler', ucret: 11_000, kategori: 'Ceza' },
  { kod: MahkemeTuru.SULH_CEZA, aciklama: 'Sulh Ceza Hakimlikleri ve İnfaz Hakimliklerinde takip edilen işler', ucret: 18_000, kategori: 'Ceza' },
  { kod: MahkemeTuru.AGIR_CEZA, aciklama: 'Ağır Ceza Mahkemelerinde takip edilen davalar', ucret: 65_000, kategori: 'Ceza' },
  { kod: MahkemeTuru.COCUK_MAHKEMESI, aciklama: 'Çocuk Mahkemelerinde takip edilen davalar', ucret: 45_000, kategori: 'Ceza' },
  { kod: MahkemeTuru.COCUK_AGIR_CEZA, aciklama: 'Çocuk Ağır Ceza Mahkemelerinde takip edilen davalar', ucret: 65_000, kategori: 'Ceza' },
  
  // Hukuk Mahkemeleri
  { kod: MahkemeTuru.SULH_HUKUK, aciklama: 'Sulh Hukuk Mahkemelerinde takip edilen davalar', ucret: 30_000, kategori: 'Hukuk' },
  { kod: MahkemeTuru.ASLIYE, aciklama: 'Asliye Mahkemelerinde takip edilen davalar', ucret: 45_000, kategori: 'Hukuk' },
  { kod: MahkemeTuru.TUKETICI, aciklama: 'Tüketici Mahkemelerinde takip edilen davalar', ucret: 22_500, kategori: 'Hukuk' },
  { kod: MahkemeTuru.FIKRI_SINAI, aciklama: 'Fikri ve Sınai Haklar Mahkemelerinde takip edilen davalar', ucret: 55_000, kategori: 'Hukuk' },
  
  // İdari Yargı
  { kod: MahkemeTuru.IDARE_VERGI_DURUSMASIZ, aciklama: 'İdare ve Vergi Mahkemelerinde (duruşmasız)', ucret: 30_000, kategori: 'İdari' },
  { kod: MahkemeTuru.IDARE_VERGI_DURUSMALI, aciklama: 'İdare ve Vergi Mahkemelerinde (duruşmalı)', ucret: 40_000, kategori: 'İdari' },
  { kod: MahkemeTuru.ASKERLIK_DISIPLIN, aciklama: 'Askerlik Kanunları uyarınca Disiplin Kurullarında', ucret: 27_000, kategori: 'İdari' },
  
  // Bölge Mahkemeleri
  { kod: MahkemeTuru.BOLGE_ADLIYE_ILK_DERECE, aciklama: 'Bölge Adliye Mahkemelerinde ilk derecede görülen davalar', ucret: 35_000, kategori: 'İstinaf' },
  { kod: MahkemeTuru.BOLGE_ADLIYE_ISTINAF, aciklama: 'İstinaf yolu ile görülen işler (tek duruşma)', ucret: 22_000, kategori: 'İstinaf' },
  { kod: MahkemeTuru.BOLGE_ADLIYE_ISTINAF_DURUSMALI, aciklama: 'İstinaf yolu ile görülen işler (birden fazla duruşma/keşif)', ucret: 42_000, kategori: 'İstinaf' },
  
  // Yüksek Mahkemeler
  { kod: MahkemeTuru.SAYISTAY_DURUSMASIZ, aciklama: 'Sayıştay\'da görülen hesap yargılamaları (duruşmasız)', ucret: 34_000, kategori: 'Yüksek' },
  { kod: MahkemeTuru.SAYISTAY_DURUSMALI, aciklama: 'Sayıştay\'da görülen hesap yargılamaları (duruşmalı)', ucret: 65_000, kategori: 'Yüksek' },
  { kod: MahkemeTuru.YARGITAY_ILK_DERECE, aciklama: 'Yargıtay\'da ilk derecede görülen davalar', ucret: 65_000, kategori: 'Yüksek' },
  { kod: MahkemeTuru.DANISTAY_DURUSMASIZ, aciklama: 'Danıştay\'da görülen davalar (duruşmasız)', ucret: 40_000, kategori: 'Yüksek' },
  { kod: MahkemeTuru.DANISTAY_DURUSMALI, aciklama: 'Danıştay\'da görülen davalar (duruşmalı)', ucret: 65_000, kategori: 'Yüksek' },
  { kod: MahkemeTuru.TEMYIZ_DURUSMA, aciklama: 'Yargıtay, Danıştay ve Sayıştay\'da temyiz duruşması', ucret: 40_000, kategori: 'Yüksek' },
  { kod: MahkemeTuru.UYUSMAZLIK, aciklama: 'Uyuşmazlık Mahkemesindeki davalar', ucret: 40_000, kategori: 'Yüksek' },
  
  // Anayasa Mahkemesi
  { kod: MahkemeTuru.ANAYASA_YUCE_DIVAN, aciklama: 'Anayasa Mahkemesi - Yüce Divan sıfatıyla bakılan davalar', ucret: 120_000, kategori: 'Anayasa' },
  { kod: MahkemeTuru.ANAYASA_BIREYSEL_DURUSMASIZ, aciklama: 'Anayasa Mahkemesi - Bireysel başvuru (duruşmasız)', ucret: 40_000, kategori: 'Anayasa' },
  { kod: MahkemeTuru.ANAYASA_BIREYSEL_DURUSMALI, aciklama: 'Anayasa Mahkemesi - Bireysel başvuru (duruşmalı)', ucret: 80_000, kategori: 'Anayasa' },
  { kod: MahkemeTuru.ANAYASA_DIGER, aciklama: 'Anayasa Mahkemesi - Diğer dava ve işler', ucret: 90_000, kategori: 'Anayasa' },
];


// ============================================================================
// DAVA DIŞI HUKUKİ YARDIMLAR
// ============================================================================

export interface DanismanlikUcreti {
  kod: string;
  aciklama: string;
  ucret: number;
  birim: 'saat' | 'is' | 'ay';
  takipEdenSaatUcreti?: number;
}

export const DANISMANLIK_UCRETLERI_2026: DanismanlikUcreti[] = [
  { kod: 'BURODA_SOZLU', aciklama: 'Büroda sözlü danışma (ilk bir saat)', ucret: 4_000, birim: 'saat', takipEdenSaatUcreti: 1_800 },
  { kod: 'DISARIDA_SOZLU', aciklama: 'Çağrı üzerine gidilen yerde sözlü danışma (ilk bir saat)', ucret: 7_000, birim: 'saat', takipEdenSaatUcreti: 3_500 },
  { kod: 'YAZILI', aciklama: 'Yazılı danışma (ilk bir saat)', ucret: 7_000, birim: 'saat', takipEdenSaatUcreti: 3_500 },
  { kod: 'DILEKCE', aciklama: 'Her türlü dilekçe, ihbarname, ihtarname, protesto düzenlenmesi', ucret: 6_000, birim: 'is' },
  { kod: 'KIRA_SOZLESMESI', aciklama: 'Kira sözleşmesi ve benzeri', ucret: 8_000, birim: 'is' },
  { kod: 'TUZUK_YONETMELIK', aciklama: 'Tüzük, yönetmelik, miras sözleşmesi, vasiyetname, vakıf senedi vb.', ucret: 32_000, birim: 'is' },
  { kod: 'SIRKET_SOZLESMESI', aciklama: 'Şirket ana sözleşmesi, şirket devir ve birleşmesi vb.', ucret: 21_000, birim: 'is' },
  { kod: 'ARABULUCULUK', aciklama: 'Arabuluculuk faaliyetinin anlaşmazlık ile sonuçlanması', ucret: 8_000, birim: 'is' },
];

// ============================================================================
// İŞ TAKİBİ ÜCRETLERİ
// ============================================================================

export const IS_TAKIBI_UCRETLERI_2026 = {
  belgelendirme: { aciklama: 'Bir durumun belgelendirilmesi, ödeme aşamasındaki paranın tahsili', ucret: 6_000 },
  hakTescil: { aciklama: 'Bir hakkın doğumu, tespiti, tescili, nakli, değiştirilmesi vb.', ucret: 12_000 },
  bankaIslemleri: { aciklama: 'Bankalar ve finans kuruluşlarına verilen her bir hukuki yardım', ucret: 3_000 },
  tuzelKisiRuhsat: { aciklama: 'Tüzel kişi tacirlerin ruhsat ve imtiyaz işlemleri', ucret: 60_000 },
  vergiUzlasma: { aciklama: 'Vergi uzlaşma komisyonlarında takip edilen işler', ucret: 23_000 },
  uluslararasiDurusmasiz: { aciklama: 'Uluslararası yargı yerlerinde (duruşmasız)', ucret: 110_000 },
  uluslararasiDurusmali: { aciklama: 'Uluslararası yargı yerlerinde (duruşmalı)', ucret: 200_000 },
  tuketiciHakemHeyeti: { aciklama: 'Tüketici hakem heyetleri nezdinde hukuki yardımlar (asgari)', ucret: 7_000 },
};

// ============================================================================
// SÖZLEŞMELİ AVUKAT ÜCRETLERİ
// ============================================================================

export const SOZLESMELI_AVUKAT_UCRETLERI_2026 = {
  yapiKooperatifi: { aciklama: 'Yapı kooperatiflerinde zorunlu avukat', ucret: 27_000, birim: 'ay' },
  anonimSirket: { aciklama: 'Anonim şirketlerde zorunlu avukat', ucret: 45_000, birim: 'ay' },
  ozelKisi: { aciklama: 'Özel kişi ve tüzel kişilerin sözleşmeli avukatları', ucret: 33_000, birim: 'ay' },
  kamuKurumu: { aciklama: 'Kamu kurum ve kuruluşlarının sözleşmeli avukatları', ucret: 33_000, birim: 'ay' },
};

// ============================================================================
// ÖZEL DURUMLAR
// ============================================================================

export const OZEL_DURUMLAR_2026 = {
  ihtiyatiHacizDurusmasiz: { aciklama: 'İhtiyati haciz, ihtiyati tedbir, delillerin tespiti vb. (duruşmasız)', ucret: 10_000 },
  ihtiyatiHacizDurusmali: { aciklama: 'İhtiyati haciz, ihtiyati tedbir, delillerin tespiti vb. (duruşmalı)', ucret: 12_500 },
  ortaklikGiderilmesiSatis: { aciklama: 'Ortaklığın giderilmesi satış memurluğunda yapılacak işler', ucret: 18_000 },
  ortaklikGiderilmesiDava: { aciklama: 'Ortaklığın giderilmesi ve taksim davaları', ucret: 40_000 },
  vergiMahkemesiDurusmasiz: { aciklama: 'Vergi Mahkemelerinde (duruşmasız)', ucret: 30_000 },
  vergiMahkemesiDurusmali: { aciklama: 'Vergi Mahkemelerinde (duruşmalı)', ucret: 40_000 },
  tuketiciKrediUyarlama: { aciklama: 'Tüketici Mahkemelerinde kredi taksit/faiz uyarlama davaları', ucret: 20_000 },
};

// ============================================================================
// YASAL SINIRLAR
// ============================================================================

export const YASAL_SINIRLAR = {
  /** Nispi vekalet ücreti üst sınırı (dava değerinin yüzdesi) */
  nispiUstSinirOrani: 25,
  /** İcra vekalet ücreti asgari tutarı */
  icraVekaletAsgarisi: 9_000,
  /** Tarife yürürlük tarihi */
  yururlukTarihi: '2025-11-04',
  /** Tarife geçerlilik yılı */
  tarifeyili: 2026,
};

// ============================================================================
// YARDIMCI FONKSİYONLAR
// ============================================================================

/**
 * Nispi vekalet ücreti hesaplar
 * @param davaDegeri Dava değeri (TL)
 * @returns Hesaplanan vekalet ücreti (TL)
 */
export function hesaplaNispiVekaletUcreti(davaDegeri: number): number {
  if (davaDegeri <= 0) return 0;
  
  let kalanDeger = davaDegeri;
  let toplamUcret = 0;
  
  for (const dilim of NISPI_UCRET_DILIMLERI_2026) {
    if (kalanDeger <= 0) break;
    
    const dilimMax = dilim.bitis !== null 
      ? dilim.bitis - dilim.baslangic 
      : kalanDeger;
    
    const buDilimdekiDeger = Math.min(kalanDeger, dilimMax);
    toplamUcret += buDilimdekiDeger * (dilim.oran / 100);
    kalanDeger -= buDilimdekiDeger;
  }
  
  return Math.round(toplamUcret * 100) / 100;
}

/**
 * İcra vekalet ücreti hesaplar (asgari 9.000 TL, takip değerini geçemez)
 * @param takipDegeri İcra takip değeri (TL)
 * @returns Hesaplanan icra vekalet ücreti (TL)
 */
export function hesaplaIcraVekaletUcreti(takipDegeri: number): number {
  if (takipDegeri <= 0) return 0;
  
  const nispiUcret = hesaplaNispiVekaletUcreti(takipDegeri);
  const asgariBedel = YASAL_SINIRLAR.icraVekaletAsgarisi;
  
  // Takip değerinden fazla olamaz
  if (takipDegeri < asgariBedel) {
    return takipDegeri;
  }
  
  // Asgari bedelden az olamaz
  return Math.max(nispiUcret, asgariBedel);
}

/**
 * Mahkeme türüne göre maktu vekalet ücreti getirir
 * @param mahkemeTuru Mahkeme türü kodu
 * @returns Maktu ücret bilgisi veya undefined
 */
export function getMaktuUcret(mahkemeTuru: MahkemeTuru): MaktuUcret | undefined {
  return MAKTU_UCRETLER_2026.find(m => m.kod === mahkemeTuru);
}

/**
 * Kategoriye göre maktu ücretleri filtreler
 * @param kategori Kategori adı (İcra, Ceza, Hukuk, İdari, İstinaf, Yüksek, Anayasa)
 * @returns Filtrelenmiş maktu ücret listesi
 */
export function getMaktuUcretlerByKategori(kategori: string): MaktuUcret[] {
  return MAKTU_UCRETLER_2026.filter(m => m.kategori === kategori);
}

/**
 * Kısmi kabul/ret durumunda vekalet ücreti hesaplar
 * @param davaDegeri Toplam dava değeri
 * @param kabulEdilenMiktar Kabul edilen miktar
 * @returns Davacı ve davalı lehine vekalet ücretleri
 */
export function hesaplaKismiKabulVekaletUcreti(davaDegeri: number, kabulEdilenMiktar: number): {
  davaciLehine: number;
  davaliLehine: number;
} {
  const reddedilenMiktar = davaDegeri - kabulEdilenMiktar;
  
  const davaciLehine = hesaplaNispiVekaletUcreti(kabulEdilenMiktar);
  let davaliLehine = hesaplaNispiVekaletUcreti(reddedilenMiktar);
  
  // Reddedilen miktar üzerinden vekalet ücreti, kabul edilen miktarın vekalet ücretinden fazla olamaz
  if (davaliLehine > davaciLehine) {
    davaliLehine = davaciLehine;
  }
  
  return { davaciLehine, davaliLehine };
}
