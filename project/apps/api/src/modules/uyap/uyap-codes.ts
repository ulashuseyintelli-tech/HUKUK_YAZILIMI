/**
 * UYAP Kodlu Bilgiler
 * Kaynak: KodluBilgilerData.xml (etakipkurulum paketi)
 * 
 * Bu dosya UYAP sisteminde kullanılan tüm kodları içerir.
 */

// ==================== FAİZ TÜRLERİ ====================

export const UYAP_FAIZ_TURLERI = {
  YASAL: { kod: '1', isim: 'Yasal Faiz', aciklama: '3095 sayılı Kanun gereği yasal faiz' },
  TICARI_TEMERRUT: { kod: '2', isim: 'Ticari Temerrüt Faizi', aciklama: 'TTK gereği ticari işlerde temerrüt faizi' },
  REESKONT: { kod: '3', isim: 'Reeskont Faizi', aciklama: 'TCMB reeskont faiz oranı' },
  AVANS: { kod: '4', isim: 'Avans Faizi', aciklama: 'TCMB avans faiz oranı' },
  MEVDUAT: { kod: '5', isim: 'Mevduat Faizi', aciklama: 'Banka mevduat faiz oranı' },
  AKIT: { kod: '6', isim: 'Akit Faizi', aciklama: 'Sözleşmede belirlenen faiz oranı' },
  DIGER: { kod: '99', isim: 'Diğer', aciklama: 'Diğer faiz türleri' },
} as const;

// ==================== PARA BİRİMLERİ ====================

export const UYAP_PARA_BIRIMLERI = {
  TRY: { kod: 'TL', isim: 'Türk Lirası', simge: '₺' },
  USD: { kod: 'USD', isim: 'Amerikan Doları', simge: '$' },
  EUR: { kod: 'EUR', isim: 'Euro', simge: '€' },
  GBP: { kod: 'GBP', isim: 'İngiliz Sterlini', simge: '£' },
  CHF: { kod: 'CHF', isim: 'İsviçre Frangı', simge: 'CHF' },
  JPY: { kod: 'JPY', isim: 'Japon Yeni', simge: '¥' },
  SAR: { kod: 'SAR', isim: 'Suudi Arabistan Riyali', simge: 'SAR' },
  AED: { kod: 'AED', isim: 'BAE Dirhemi', simge: 'AED' },
  RUB: { kod: 'RUB', isim: 'Rus Rublesi', simge: '₽' },
  CNY: { kod: 'CNY', isim: 'Çin Yuanı', simge: '¥' },
} as const;

// ==================== ADRES TÜRLERİ ====================

export const UYAP_ADRES_TURLERI = {
  EV: { kod: '1', isim: 'Ev Adresi' },
  IS: { kod: '2', isim: 'İş Adresi' },
  TEBLIGAT: { kod: '3', isim: 'Tebligat Adresi' },
  DIGER: { kod: '4', isim: 'Diğer' },
} as const;

// ==================== SÜRE BİRİMLERİ ====================

export const UYAP_SURE_BIRIMLERI = {
  GUN: { kod: '1', isim: 'Gün' },
  HAFTA: { kod: '2', isim: 'Hafta' },
  AY: { kod: '3', isim: 'Ay' },
  YIL: { kod: '4', isim: 'Yıl' },
} as const;

// ==================== TAKİP MAHİYETİ KODLARI ====================

export const UYAP_MAHIYET_KODLARI = {
  // İlamsız Takip - Genel
  GENEL_HACIZ: { kod: '1007', isim: 'Genel Haciz Yoluyla Takip', takipTuru: 'ILAMSIZ' },
  
  // İlamsız Takip - Kambiyo
  KAMBIYO_CEK: { kod: '1107', isim: 'Kambiyo Senetlerine Özgü Haciz Yoluyla Takip (Çek)', takipTuru: 'KAMBIYO' },
  KAMBIYO_SENET: { kod: '1207', isim: 'Kambiyo Senetlerine Özgü Haciz Yoluyla Takip (Senet)', takipTuru: 'KAMBIYO' },
  KAMBIYO_POLICE: { kod: '1307', isim: 'Kambiyo Senetlerine Özgü Haciz Yoluyla Takip (Poliçe)', takipTuru: 'KAMBIYO' },
  
  // İlamsız Takip - Kira
  KIRA_ALACAGI: { kod: '1407', isim: 'Kira Alacağı Takibi', takipTuru: 'ILAMSIZ' },
  KIRA_TAHLIYE: { kod: '1507', isim: 'Kira Alacağı ve Tahliye Takibi', takipTuru: 'ILAMSIZ' },
  
  // İlamlı Takip
  ILAMLI_GENEL: { kod: '2007', isim: 'İlamlı Takip', takipTuru: 'ILAMLI' },
  ILAMLI_PARA: { kod: '2107', isim: 'Para Alacağına İlişkin İlamlı Takip', takipTuru: 'ILAMLI' },
  ILAMLI_TASINIR: { kod: '2207', isim: 'Taşınır Teslimine İlişkin İlamlı Takip', takipTuru: 'ILAMLI' },
  ILAMLI_TASINMAZ: { kod: '2307', isim: 'Taşınmaz Teslimine İlişkin İlamlı Takip', takipTuru: 'ILAMLI' },
  ILAMLI_COCUK: { kod: '2407', isim: 'Çocuk Teslimine İlişkin İlamlı Takip', takipTuru: 'ILAMLI' },
  
  // Nafaka
  NAFAKA: { kod: '3007', isim: 'Nafaka Alacağı Takibi', takipTuru: 'ILAMLI' },
  NAFAKA_BIRIKIMIS: { kod: '3107', isim: 'Birikmiş Nafaka Alacağı Takibi', takipTuru: 'ILAMLI' },
  
  // Rehin/İpotek
  REHIN_PARAYA_CEVIRME: { kod: '4007', isim: 'Rehnin Paraya Çevrilmesi Yoluyla Takip', takipTuru: 'REHIN' },
  IPOTEK_PARAYA_CEVIRME: { kod: '5007', isim: 'İpoteğin Paraya Çevrilmesi Yoluyla Takip', takipTuru: 'IPOTEK' },
  GEMI_IPOTEGI: { kod: '5107', isim: 'Gemi İpoteğinin Paraya Çevrilmesi', takipTuru: 'IPOTEK' },
  
  // Tahliye
  TAHLIYE: { kod: '6007', isim: 'Tahliye Takibi', takipTuru: 'ILAMSIZ' },
  HACIZ_TAHLIYE: { kod: '7007', isim: 'Haciz ve Tahliye Takibi', takipTuru: 'ILAMSIZ' },
  
  // İflas
  IFLAS: { kod: '8008', isim: 'İflas Yoluyla Takip', takipTuru: 'IFLAS' },
  IFLAS_ERTELEME: { kod: '8108', isim: 'İflas Erteleme', takipTuru: 'IFLAS' },
  KONKORDATO: { kod: '8208', isim: 'Konkordato', takipTuru: 'IFLAS' },
  
  // Diğer
  DIGER: { kod: '9009', isim: 'Diğer Takip', takipTuru: 'ILAMSIZ' },
  
  // Özel Mahiyetler (Alt kategoriler)
  FATURA: { kod: '1045', isim: 'Fatura Alacağı', takipTuru: 'ILAMSIZ' },
  SOZLESME: { kod: '2045', isim: 'Sözleşme Alacağı', takipTuru: 'ILAMSIZ' },
  KREDI: { kod: '3045', isim: 'Kredi Alacağı', takipTuru: 'ILAMSIZ' },
  TEMINAT_MEKTUBU: { kod: '4045', isim: 'Teminat Mektubu Alacağı', takipTuru: 'ILAMSIZ' },
  CARI_HESAP: { kod: '5045', isim: 'Cari Hesap Alacağı', takipTuru: 'ILAMSIZ' },
  HIZMET_BEDELI: { kod: '6045', isim: 'Hizmet Bedeli Alacağı', takipTuru: 'ILAMSIZ' },
  AIDAT: { kod: '7045', isim: 'Aidat Alacağı', takipTuru: 'ILAMSIZ' },
} as const;

// ==================== TARAF ROL TÜRLERİ ====================

export const UYAP_ROL_TURLERI = {
  // Alacaklı tarafı
  ALACAKLI: { kod: '1', isim: 'Alacaklı', taraf: 'ALACAKLI' },
  ALACAKLI_VEKILI: { kod: '11', isim: 'Alacaklı Vekili', taraf: 'ALACAKLI' },
  
  // Borçlu tarafı
  BORCLU: { kod: '2', isim: 'Borçlu', taraf: 'BORCLU' },
  KEFIL: { kod: '3', isim: 'Kefil', taraf: 'BORCLU' },
  MUSTEREN_BORCLU: { kod: '4', isim: 'Müşterek Borçlu', taraf: 'BORCLU' },
  MÜTESELSIL_BORCLU: { kod: '5', isim: 'Müteselsil Borçlu', taraf: 'BORCLU' },
  MIRASCI: { kod: '6', isim: 'Mirasçı', taraf: 'BORCLU' },
  
  // Kambiyo senedi tarafları
  KESIDECI: { kod: '10', isim: 'Keşideci', taraf: 'BORCLU' },
  CIRANTA: { kod: '11', isim: 'Ciranta', taraf: 'BORCLU' },
  AVALCI: { kod: '12', isim: 'Avalci', taraf: 'BORCLU' },
  LEHTAR: { kod: '13', isim: 'Lehtar', taraf: 'ALACAKLI' },
  MUHATAP: { kod: '14', isim: 'Muhatap', taraf: 'BORCLU' },
  
  // Diğer
  UCUNCU_SAHIS: { kod: '20', isim: 'Üçüncü Şahıs', taraf: 'DIGER' },
  MALIK: { kod: '21', isim: 'Malik', taraf: 'DIGER' },
} as const;

// ==================== DOSYA TİPLERİ ====================

export const UYAP_DOSYA_TIPLERI = {
  ICRA: { kod: '1', isim: 'İcra Dosyası' },
  IFLAS: { kod: '2', isim: 'İflas Dosyası' },
} as const;

// ==================== TAKİP TÜRLERİ ====================

export const UYAP_TAKIP_TURLERI = {
  ILAMSIZ: { kod: '1', isim: 'İlamsız Takip' },
  ILAMLI: { kod: '2', isim: 'İlamlı Takip' },
  KAMBIYO: { kod: '3', isim: 'Kambiyo Senetlerine Özgü Takip' },
  REHIN: { kod: '4', isim: 'Rehnin Paraya Çevrilmesi' },
  IPOTEK: { kod: '5', isim: 'İpoteğin Paraya Çevrilmesi' },
  IFLAS: { kod: '6', isim: 'İflas Yoluyla Takip' },
} as const;

// ==================== TAKİP YOLLARI ====================

export const UYAP_TAKIP_YOLLARI = {
  HACIZ: { kod: '1', isim: 'Haciz Yolu' },
  IFLAS: { kod: '2', isim: 'İflas Yolu' },
  REHIN: { kod: '3', isim: 'Rehin/İpotek Yolu' },
  TAHLIYE: { kod: '4', isim: 'Tahliye Yolu' },
} as const;

// ==================== TAKİP ŞEKİLLERİ ====================

export const UYAP_TAKIP_SEKILLERI = {
  ADI: { kod: '1', isim: 'Adi Takip' },
  KAMBIYO: { kod: '2', isim: 'Kambiyo Takibi' },
} as const;

// ==================== SENET TÜRLERİ ====================

export const UYAP_SENET_TURLERI = {
  CEK: { kod: '1', isim: 'Çek' },
  BONO: { kod: '2', isim: 'Bono (Emre Muharrer Senet)' },
  POLICE: { kod: '3', isim: 'Poliçe' },
} as const;

// ==================== İL KODLARI ====================

export const UYAP_IL_KODLARI: Record<string, { kod: string; isim: string }> = {
  'ADANA': { kod: '01', isim: 'Adana' },
  'ADIYAMAN': { kod: '02', isim: 'Adıyaman' },
  'AFYONKARAHİSAR': { kod: '03', isim: 'Afyonkarahisar' },
  'AĞRI': { kod: '04', isim: 'Ağrı' },
  'AMASYA': { kod: '05', isim: 'Amasya' },
  'ANKARA': { kod: '06', isim: 'Ankara' },
  'ANTALYA': { kod: '07', isim: 'Antalya' },
  'ARTVİN': { kod: '08', isim: 'Artvin' },
  'AYDIN': { kod: '09', isim: 'Aydın' },
  'BALIKESİR': { kod: '10', isim: 'Balıkesir' },
  'BİLECİK': { kod: '11', isim: 'Bilecik' },
  'BİNGÖL': { kod: '12', isim: 'Bingöl' },
  'BİTLİS': { kod: '13', isim: 'Bitlis' },
  'BOLU': { kod: '14', isim: 'Bolu' },
  'BURDUR': { kod: '15', isim: 'Burdur' },
  'BURSA': { kod: '16', isim: 'Bursa' },
  'ÇANAKKALE': { kod: '17', isim: 'Çanakkale' },
  'ÇANKIRI': { kod: '18', isim: 'Çankırı' },
  'ÇORUM': { kod: '19', isim: 'Çorum' },
  'DENİZLİ': { kod: '20', isim: 'Denizli' },
  'DİYARBAKIR': { kod: '21', isim: 'Diyarbakır' },
  'EDİRNE': { kod: '22', isim: 'Edirne' },
  'ELAZIĞ': { kod: '23', isim: 'Elazığ' },
  'ERZİNCAN': { kod: '24', isim: 'Erzincan' },
  'ERZURUM': { kod: '25', isim: 'Erzurum' },
  'ESKİŞEHİR': { kod: '26', isim: 'Eskişehir' },
  'GAZİANTEP': { kod: '27', isim: 'Gaziantep' },
  'GİRESUN': { kod: '28', isim: 'Giresun' },
  'GÜMÜŞHANE': { kod: '29', isim: 'Gümüşhane' },
  'HAKKARİ': { kod: '30', isim: 'Hakkari' },
  'HATAY': { kod: '31', isim: 'Hatay' },
  'ISPARTA': { kod: '32', isim: 'Isparta' },
  'MERSİN': { kod: '33', isim: 'Mersin' },
  'İSTANBUL': { kod: '34', isim: 'İstanbul' },
  'İZMİR': { kod: '35', isim: 'İzmir' },
  'KARS': { kod: '36', isim: 'Kars' },
  'KASTAMONU': { kod: '37', isim: 'Kastamonu' },
  'KAYSERİ': { kod: '38', isim: 'Kayseri' },
  'KIRKLARELİ': { kod: '39', isim: 'Kırklareli' },
  'KIRŞEHİR': { kod: '40', isim: 'Kırşehir' },
  'KOCAELİ': { kod: '41', isim: 'Kocaeli' },
  'KONYA': { kod: '42', isim: 'Konya' },
  'KÜTAHYA': { kod: '43', isim: 'Kütahya' },
  'MALATYA': { kod: '44', isim: 'Malatya' },
  'MANİSA': { kod: '45', isim: 'Manisa' },
  'KAHRAMANMARAŞ': { kod: '46', isim: 'Kahramanmaraş' },
  'MARDİN': { kod: '47', isim: 'Mardin' },
  'MUĞLA': { kod: '48', isim: 'Muğla' },
  'MUŞ': { kod: '49', isim: 'Muş' },
  'NEVŞEHİR': { kod: '50', isim: 'Nevşehir' },
  'NİĞDE': { kod: '51', isim: 'Niğde' },
  'ORDU': { kod: '52', isim: 'Ordu' },
  'RİZE': { kod: '53', isim: 'Rize' },
  'SAKARYA': { kod: '54', isim: 'Sakarya' },
  'SAMSUN': { kod: '55', isim: 'Samsun' },
  'SİİRT': { kod: '56', isim: 'Siirt' },
  'SİNOP': { kod: '57', isim: 'Sinop' },
  'SİVAS': { kod: '58', isim: 'Sivas' },
  'TEKİRDAĞ': { kod: '59', isim: 'Tekirdağ' },
  'TOKAT': { kod: '60', isim: 'Tokat' },
  'TRABZON': { kod: '61', isim: 'Trabzon' },
  'TUNCELİ': { kod: '62', isim: 'Tunceli' },
  'ŞANLIURFA': { kod: '63', isim: 'Şanlıurfa' },
  'UŞAK': { kod: '64', isim: 'Uşak' },
  'VAN': { kod: '65', isim: 'Van' },
  'YOZGAT': { kod: '66', isim: 'Yozgat' },
  'ZONGULDAK': { kod: '67', isim: 'Zonguldak' },
  'AKSARAY': { kod: '68', isim: 'Aksaray' },
  'BAYBURT': { kod: '69', isim: 'Bayburt' },
  'KARAMAN': { kod: '70', isim: 'Karaman' },
  'KIRIKKALE': { kod: '71', isim: 'Kırıkkale' },
  'BATMAN': { kod: '72', isim: 'Batman' },
  'ŞIRNAK': { kod: '73', isim: 'Şırnak' },
  'BARTIN': { kod: '74', isim: 'Bartın' },
  'ARDAHAN': { kod: '75', isim: 'Ardahan' },
  'IĞDIR': { kod: '76', isim: 'Iğdır' },
  'YALOVA': { kod: '77', isim: 'Yalova' },
  'KARABÜK': { kod: '78', isim: 'Karabük' },
  'KİLİS': { kod: '79', isim: 'Kilis' },
  'OSMANİYE': { kod: '80', isim: 'Osmaniye' },
  'DÜZCE': { kod: '81', isim: 'Düzce' },
};

// ==================== HELPER FUNCTIONS ====================

/**
 * İl adından UYAP il kodunu al
 */
export function getUyapIlKodu(ilAdi: string): string {
  const normalized = ilAdi.toUpperCase().trim();
  return UYAP_IL_KODLARI[normalized]?.kod || '34'; // Default: İstanbul
}

/**
 * Mahiyet kodundan mahiyet bilgisini al
 */
export function getMahiyetByKod(kod: string): typeof UYAP_MAHIYET_KODLARI[keyof typeof UYAP_MAHIYET_KODLARI] | undefined {
  return Object.values(UYAP_MAHIYET_KODLARI).find(m => m.kod === kod);
}

/**
 * Takip türüne göre uygun mahiyet kodlarını listele
 */
export function getMahiyetlerByTakipTuru(takipTuru: string): Array<typeof UYAP_MAHIYET_KODLARI[keyof typeof UYAP_MAHIYET_KODLARI]> {
  return Object.values(UYAP_MAHIYET_KODLARI).filter(m => m.takipTuru === takipTuru);
}
