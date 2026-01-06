/**
 * UYAP ENTEGRASYONLARI KONFİGÜRASYONU
 * 
 * Kaynak: UYAP Bilişim Sistemi Kitabı (Ocak 2021) - Ünite 3
 * 
 * UYAP Bilişim Sistemi 48 kurum ile 143 entegrasyon gerçekleştirmektedir.
 * Bu dosya icrabot için kullanılabilecek entegrasyonları tanımlar.
 */

// ==================== TYPES ====================

export interface UyapIntegration {
  id: string;
  name: string;
  provider: string;
  description: string;
  dataTypes: string[];
  useCases: string[];
  isRealTime: boolean;
  requiresAuth?: boolean;
}

export interface IntegrationQuery {
  integrationId: string;
  queryType: string;
  inputFields: string[];
  outputFields: string[];
}

// ==================== ENTEGRASYONLAR ====================

/**
 * TAKBIS - Tapu ve Kadastro Bilgi Sistemi
 * Çevre ve Şehircilik Bakanlığı Tapu ve Kadastro Genel Müdürlüğü
 */
export const INTEGRATION_TAKBIS: UyapIntegration = {
  id: 'takbis',
  name: 'TAKBIS Entegrasyonu',
  provider: 'Tapu ve Kadastro Genel Müdürlüğü',
  description: 'Tüzel ve gerçek kişilere ait mal varlığı sorgulaması',
  dataTypes: ['tasinmaz', 'tapu_kaydi', 'haciz_bilgisi'],
  useCases: [
    'Borçlu taşınmaz sorgulaması',
    'Taşınmaz üzerine haciz konulması (e-Haciz)',
    'Veraset ilamı ve mirasçı bilgileri sorgulaması',
  ],
  isRealTime: true,
};

/**
 * Tapu e-Haciz Entegrasyonu
 */
export const INTEGRATION_TAPU_EHACIZ: UyapIntegration = {
  id: 'tapu_ehaciz',
  name: 'Tapu e-Haciz Entegrasyonu',
  provider: 'Tapu ve Kadastro Genel Müdürlüğü',
  description: 'Gerçek ve tüzel kişilere ait taşınmazlar üzerine ihtiyati haciz konulması',
  dataTypes: ['haciz_talebi', 'haciz_sonucu'],
  useCases: [
    'Taşınmaz üzerine haciz konulması',
    'Haciz kaldırma işlemleri',
  ],
  isRealTime: true,
};

/**
 * Emniyet Genel Müdürlüğü Entegrasyonu
 * Araç sorgulaması ve haciz işlemleri
 */
export const INTEGRATION_EGM: UyapIntegration = {
  id: 'egm',
  name: 'Emniyet Genel Müdürlüğü Entegrasyonu',
  provider: 'İçişleri Bakanlığı Emniyet Genel Müdürlüğü',
  description: 'Araç kayıt bilgileri ve haciz işlemleri',
  dataTypes: ['arac_bilgisi', 'plaka', 'sasi_no', 'haciz'],
  useCases: [
    'Borçlu araç sorgulaması',
    'Araç üzerine haciz konulması',
    'Yakalama kararı bildirimi',
  ],
  isRealTime: true,
  requiresAuth: true,
};

/**
 * SGK Entegrasyonu
 * Sosyal Güvenlik Kurumu
 */
export const INTEGRATION_SGK: UyapIntegration = {
  id: 'sgk',
  name: 'SGK Kayıt Sorgulama Entegrasyonu',
  provider: 'Sosyal Güvenlik Kurumu',
  description: 'Borçlunun çalıştığı iş yeri bilgisi ve sigorta kayıtları',
  dataTypes: ['isyeri_bilgisi', 'sigorta_kaydi', 'emekli_maasi'],
  useCases: [
    'Maaş haczi için işveren tespiti',
    'Emekli maaşı haczi',
    'Çalışma durumu kontrolü',
  ],
  isRealTime: true,
};

/**
 * GİB - Gelir İdaresi Başkanlığı Entegrasyonu (VEDOP)
 */
export const INTEGRATION_GIB: UyapIntegration = {
  id: 'gib',
  name: 'Gelir İdaresi Başkanlığı Entegrasyonu',
  provider: 'Maliye Bakanlığı Gelir İdaresi Başkanlığı',
  description: 'Araç bilgileri, mükellefiyet bilgileri ve vergi dairesi bilgileri',
  dataTypes: ['arac_kayit', 'mukellef_bilgisi', 'vergi_dairesi', 'adres'],
  useCases: [
    'Araç kayıt bilgileri sorgulaması',
    'Mükellefiyet durumu kontrolü',
    'İcralık araç borç bilgisi sorgulaması',
  ],
  isRealTime: true,
};

/**
 * MERNİS - Merkezi Nüfus İdaresi Sistemi
 */
export const INTEGRATION_MERNIS: UyapIntegration = {
  id: 'mernis',
  name: 'MERNİS Entegrasyonu',
  provider: 'Nüfus ve Vatandaşlık İşleri Genel Müdürlüğü',
  description: 'Nüfus kayıt bilgileri ve adres sorgulaması',
  dataTypes: ['kimlik_bilgisi', 'adres', 'aile_bilgisi'],
  useCases: [
    'Borçlu kimlik doğrulama',
    'Adres sorgulaması',
    'Mirasçı tespiti',
  ],
  isRealTime: true,
};

/**
 * AKS - Adres Kayıt Sistemi
 */
export const INTEGRATION_AKS: UyapIntegration = {
  id: 'aks',
  name: 'Adres Kayıt Sistemi Entegrasyonu',
  provider: 'Nüfus ve Vatandaşlık İşleri Genel Müdürlüğü',
  description: 'Kişi veya kurumun adres kayıt sistemindeki adresleri',
  dataTypes: ['yerlesim_yeri_adresi', 'diger_adresler'],
  useCases: [
    'Tebligat adresi tespiti',
    'Adres araştırması',
  ],
  isRealTime: true,
};

/**
 * PTT Entegrasyonları
 */
export const INTEGRATION_PTT: UyapIntegration = {
  id: 'ptt',
  name: 'PTT Entegrasyonları',
  provider: 'PTT Genel Müdürlüğü',
  description: 'Tebligat gönderimi ve posta çeki hesabı sorgulaması',
  dataTypes: ['tebligat_durumu', 'posta_ceki_hesabi', 'gonderi_takip'],
  useCases: [
    'E-tebligat gönderimi',
    'Tebligat sonuç bilgisi alma',
    'Posta çeki hesabı sorgulaması',
    'Gönderi takibi',
  ],
  isRealTime: true,
};

/**
 * KEP - Kayıtlı Elektronik Posta
 */
export const INTEGRATION_KEP: UyapIntegration = {
  id: 'kep',
  name: 'KEP e-Tebligat Entegrasyonu',
  provider: 'PTT Genel Müdürlüğü',
  description: 'Kayıtlı elektronik posta ile tebligat işlemleri',
  dataTypes: ['kep_adresi', 'etebligat_durumu'],
  useCases: [
    'KEP hesabı sahiplik sorgulaması',
    'E-tebligat gönderimi',
    'E-tebligat durum takibi',
  ],
  isRealTime: true,
};

/**
 * MKK - Merkezi Kayıt Kuruluşu
 */
export const INTEGRATION_MKK: UyapIntegration = {
  id: 'mkk',
  name: 'Merkezi Kayıt Kuruluşu Entegrasyonu',
  provider: 'Merkezi Kayıt Kuruluşu',
  description: 'Menkul kıymet sorgulaması',
  dataTypes: ['hisse_senedi', 'tahvil', 'menkul_kiymet'],
  useCases: [
    'Borçlu menkul kıymet sorgulaması',
    'Hisse senedi haczi',
  ],
  isRealTime: true,
};

/**
 * MERSİS - Merkezi Sicil Kayıt Sistemi
 */
export const INTEGRATION_MERSIS: UyapIntegration = {
  id: 'mersis',
  name: 'MERSİS Entegrasyonu',
  provider: 'Gümrük ve Ticaret Bakanlığı',
  description: 'Özel şirketlerin sicil kayıtları ve iflas bilgileri',
  dataTypes: ['sirket_sicil', 'iflas_bilgisi', 'cek_yasaklilik'],
  useCases: [
    'Şirket sicil sorgulaması',
    'İflas bilgisi sorgulaması',
    'Çek yasaklılık sorgulaması',
  ],
  isRealTime: true,
};

/**
 * Basın İlan Kurumu Entegrasyonu
 */
export const INTEGRATION_BIK: UyapIntegration = {
  id: 'bik',
  name: 'Basın İlan Kurumu Entegrasyonu',
  provider: 'Basın İlan Kurumu',
  description: 'Gazetede yayınlanacak ilanların gönderimi',
  dataTypes: ['ilan', 'fatura', 'gazete_kunyesi'],
  useCases: [
    'Satış ilanı yayınlama',
    'İlan ücreti ve fatura bilgisi alma',
  ],
  isRealTime: true,
};

/**
 * TCMB - Türkiye Cumhuriyet Merkez Bankası
 */
export const INTEGRATION_TCMB: UyapIntegration = {
  id: 'tcmb',
  name: 'Merkez Bankası Entegrasyonu',
  provider: 'Türkiye Cumhuriyet Merkez Bankası',
  description: 'Faiz oranları ve döviz kurları',
  dataTypes: ['faiz_orani', 'doviz_kuru'],
  useCases: [
    'Faiz hesaplaması',
    'Döviz alacağı kur hesaplaması',
  ],
  isRealTime: true,
};

/**
 * Vakıfbank Entegrasyonu
 */
export const INTEGRATION_VAKIFBANK: UyapIntegration = {
  id: 'vakifbank',
  name: 'Vakıfbank Banka Ödemeleri Entegrasyonu',
  provider: 'Vakıfbank',
  description: 'Reddiyat ve harç ödemeleri için banka entegrasyonu',
  dataTypes: ['hesap_bilgisi', 'odeme', 'dekont'],
  useCases: [
    'Reddiyat ödemesi',
    'Harç tahsilatı',
    'IBAN ile ödeme',
  ],
  isRealTime: true,
};

/**
 * SBM - Sigorta Bilgi ve Gözetim Merkezi
 */
export const INTEGRATION_SBM: UyapIntegration = {
  id: 'sbm',
  name: 'Sigorta Bilgi Gözetim Merkezi Entegrasyonu',
  provider: 'Sigorta Bilgi ve Gözetim Merkezi',
  description: 'Sigorta poliçe bilgileri sorgulaması',
  dataTypes: ['police_bilgisi', 'hasar_bilgisi'],
  useCases: [
    'Araç sigorta sorgulaması',
    'Sigorta alacağı haczi',
  ],
  isRealTime: true,
};

// ==================== ENTEGRASYON REGISTRY ====================

export const UYAP_INTEGRATIONS: Record<string, UyapIntegration> = {
  takbis: INTEGRATION_TAKBIS,
  tapu_ehaciz: INTEGRATION_TAPU_EHACIZ,
  egm: INTEGRATION_EGM,
  sgk: INTEGRATION_SGK,
  gib: INTEGRATION_GIB,
  mernis: INTEGRATION_MERNIS,
  aks: INTEGRATION_AKS,
  ptt: INTEGRATION_PTT,
  kep: INTEGRATION_KEP,
  mkk: INTEGRATION_MKK,
  mersis: INTEGRATION_MERSIS,
  bik: INTEGRATION_BIK,
  tcmb: INTEGRATION_TCMB,
  vakifbank: INTEGRATION_VAKIFBANK,
  sbm: INTEGRATION_SBM,
};

// ==================== TOPLU ENTEGRASYON SORGU ====================

/**
 * Toplu Entegrasyon Sorgusu
 * Tek ekrandan birden fazla entegrasyonu sorgulama
 * Kaynak: UYAP Kitabı Ünite-11 İcra Daireleri Modülü
 */
export const BULK_QUERY_INTEGRATIONS = [
  'sgk',      // SGK kayıtları (çalıştığı iş yeri)
  'takbis',   // Taşınmaz bilgileri
  'egm',      // Araç bilgileri
  'gib',      // GİB kayıtları (adres, mükellefiyet)
  'aks',      // Adres kayıt sistemi
  'ptt',      // Posta çeki hesabı
];

// ==================== HELPER FUNCTIONS ====================

/**
 * Entegrasyon ID'sine göre entegrasyon bilgisi getir
 */
export function getIntegration(integrationId: string): UyapIntegration | undefined {
  return UYAP_INTEGRATIONS[integrationId];
}

/**
 * Veri tipine göre entegrasyonları bul
 */
export function getIntegrationsByDataType(dataType: string): UyapIntegration[] {
  return Object.values(UYAP_INTEGRATIONS).filter(
    integration => integration.dataTypes.includes(dataType)
  );
}

/**
 * Kullanım senaryosuna göre entegrasyonları bul
 */
export function getIntegrationsByUseCase(useCase: string): UyapIntegration[] {
  return Object.values(UYAP_INTEGRATIONS).filter(
    integration => integration.useCases.some(uc => uc.toLowerCase().includes(useCase.toLowerCase()))
  );
}

/**
 * Tüm entegrasyon ID'lerini getir
 */
export function getAllIntegrationIds(): string[] {
  return Object.keys(UYAP_INTEGRATIONS);
}

/**
 * Toplu sorgu için kullanılabilecek entegrasyonları getir
 */
export function getBulkQueryIntegrations(): UyapIntegration[] {
  return BULK_QUERY_INTEGRATIONS.map(id => UYAP_INTEGRATIONS[id]).filter(Boolean);
}
