/**
 * UYAP PORTALLARI KONFİGÜRASYONU
 * 
 * Kaynak: UYAP Bilişim Sistemi Kitabı (Ocak 2021) - Ünite 6
 * 
 * UYAP Bilişim Sistemi farklı kullanıcı grupları için çeşitli portallar sunar.
 * Bu dosya portal yapılarını ve erişim bilgilerini tanımlar.
 */

// ==================== TYPES ====================

export interface UyapPortal {
  id: string;
  name: string;
  url: string;
  description: string;
  targetUsers: string[];
  authMethods: ('e-devlet' | 'e-imza' | 'mobil-imza')[];
  mainFeatures: string[];
}

export interface PortalMenu {
  id: string;
  label: string;
  subMenus?: PortalMenu[];
}

// ==================== PORTALLAR ====================

/**
 * Vatandaş Portalı
 * https://vatandas.uyap.gov.tr
 */
export const PORTAL_VATANDAS: UyapPortal = {
  id: 'vatandas',
  name: 'UYAP Vatandaş Portal',
  url: 'https://vatandas.uyap.gov.tr',
  description: 'Vatandaşların yargıya elektronik ortamda erişmeleri için geliştirilen portal',
  targetUsers: ['Vatandaşlar'],
  authMethods: ['e-devlet', 'e-imza', 'mobil-imza'],
  mainFeatures: [
    'Hukuk Dava Açılış',
    'İdari Dava Açılış',
    'Trafik-İdari Para Cezasına İtiraz',
    'Dosya Sorgulama',
    'Duruşma Sorgulama',
    'Harç Hesaplama',
    'Evrak Doğrulama',
    'UYAP SMS Bilgi Sistemi (4060)',
  ],
};

/**
 * Avukat Portalı
 * https://avukat.uyap.gov.tr
 */
export const PORTAL_AVUKAT: UyapPortal = {
  id: 'avukat',
  name: 'UYAP Avukat Portal',
  url: 'https://avukat.uyap.gov.tr',
  description: 'Avukatların icra takibi başlatma, dava açma ve dosya takibi yapabildiği portal',
  targetUsers: ['Avukatlar'],
  authMethods: ['e-imza', 'mobil-imza'],
  mainFeatures: [
    'İcra Takibi Açılış',
    'MTS İşlemleri (Merkezi Takip Sistemi)',
    'Hukuk Dava Açılış',
    'İdari Dava Açılış',
    'Dosya Sorgulama',
    'Vekaletname/Cevap Dilekçesi Gönderme',
    'CBS Evrak Gönderme',
    'Duruşma Sorgulama',
    'İhale Günü Sorgulama',
    'Harç Hesaplama',
    'IBAN Bilgileri Yönetimi',
    'Barokart İşlemleri',
  ],
};

/**
 * Kurum Portalı
 * https://kurum.uyap.gov.tr
 */
export const PORTAL_KURUM: UyapPortal = {
  id: 'kurum',
  name: 'UYAP Kurum Portal',
  url: 'https://kurum.uyap.gov.tr',
  description: 'Kamu ve özel kurum yetkililerinin dosya takibi yapabildiği portal',
  targetUsers: ['Kamu Kurumları', 'Özel Şirketler'],
  authMethods: ['e-imza', 'mobil-imza'],
  mainFeatures: [
    'Dosya Sorgulama (Genel/Detaylı)',
    'Evrak Gönderme ve Takibi',
    'Dosya Birleştirme Talebi',
    'Dosya Raporlama',
    'Duruşma Sorgulama',
    'Safahat Sorgulama',
    'MTS İşlemleri',
    'Yetkili Kullanıcı Yönetimi',
  ],
};

/**
 * Arabulucu Portalı
 * https://arabulucu.uyap.gov.tr
 */
export const PORTAL_ARABULUCU: UyapPortal = {
  id: 'arabulucu',
  name: 'UYAP Arabulucu Portal',
  url: 'https://arabulucu.uyap.gov.tr',
  description: 'Arabulucuların dosya açma ve takip işlemlerini yapabildiği portal',
  targetUsers: ['Arabulucular'],
  authMethods: ['e-devlet', 'e-imza', 'mobil-imza'],
  mainFeatures: [
    'Dosya Açma (İhtiyari)',
    'Gelen İşler (Kabul/Red)',
    'Dosya Sorgulama',
    'Görev Bilgileri Yönetimi',
    'IBAN Bilgileri',
    'Arabulucu Raporu',
    'Başkanlık ile Yazışma',
  ],
};

/**
 * Uzlaştırmacı Portalı
 * https://uzlastirmaci.uyap.gov.tr
 */
export const PORTAL_UZLASTIRMACI: UyapPortal = {
  id: 'uzlastirmaci',
  name: 'UYAP Uzlaştırmacı Portal',
  url: 'https://uzlastirmaci.uyap.gov.tr',
  description: 'Uzlaştırmacıların dosya kabul/red ve takip işlemlerini yapabildiği portal',
  targetUsers: ['Uzlaştırmacılar'],
  authMethods: ['e-imza', 'mobil-imza'],
  mainFeatures: [
    'Gelen İşler (Kabul/Red)',
    'Dosyalarım',
    'Aktif-Pasif Tercih İşlemleri',
    'Kişisel Bilgiler',
    'Uzlaştırmacı İşlemleri',
  ],
};

/**
 * Bilirkişi Portalı
 * https://bilirkisi.uyap.gov.tr
 */
export const PORTAL_BILIRKISI: UyapPortal = {
  id: 'bilirkisi',
  name: 'UYAP Bilirkişi Portal',
  url: 'https://bilirkisi.uyap.gov.tr',
  description: 'Bilirkişilerin görevlendirme ve rapor işlemlerini yapabildiği portal',
  targetUsers: ['Bilirkişiler'],
  authMethods: ['e-imza', 'mobil-imza'],
  mainFeatures: [
    'İş Listesi',
    'Dosya Reddiyatları',
    'Önceki Görevlendirmeler',
    'Bilirkişi Başvuru İşlemleri',
  ],
};

/**
 * E-Satış Portalı
 * https://esatis.uyap.gov.tr
 */
export const PORTAL_ESATIS: UyapPortal = {
  id: 'esatis',
  name: 'UYAP E-Satış Portal',
  url: 'https://esatis.uyap.gov.tr',
  description: 'İcra satışlarının elektronik ortamda yapıldığı portal',
  targetUsers: ['Vatandaşlar', 'Kurumlar'],
  authMethods: ['e-devlet', 'e-imza', 'mobil-imza'],
  mainFeatures: [
    'İhale İlanları Görüntüleme',
    'Elektronik Teminat Verme',
    'Elektronik Teklif Verme',
    'İhale Sonuçları',
  ],
};

// ==================== AVUKAT PORTAL MENÜ YAPISI ====================

/**
 * Avukat Portalı Ana Menüleri
 * İcrabot için en önemli portal
 */
export const AVUKAT_PORTAL_MENUS: PortalMenu[] = [
  {
    id: 'uyap_bilgilerim',
    label: 'UYAP Bilgilerim',
    subMenus: [
      { id: 'kisisel_bilgilerim', label: 'Kişisel Bilgilerim' },
      { id: 'iletisim_bilgilerim', label: 'İletişim Bilgilerim' },
      { id: 'adres_bilgilerim', label: 'Adres Bilgilerim' },
      { id: 'iban_bilgilerim', label: 'IBAN Bilgilerim' },
      { id: 'sms_bilgilerim', label: 'SMS Bilgilerim' },
      { id: 'sorgu_bakiye_hareketleri', label: 'Sorgu Bakiye Hareketleri' },
      { id: 'portal_sozlesme', label: 'Portal Sözleşme' },
    ],
  },
  {
    id: 'mts_islemleri',
    label: 'MTS İşlemleri',
  },
  {
    id: 'icra_takibi',
    label: 'İcra Takibi',
    subMenus: [
      { id: 'takip_acilis', label: 'Takip Açılış' },
      { id: 'tamamlanmayan_dosyalar', label: 'Tamamlanmayan Dosyalar' },
    ],
  },
  {
    id: 'hukuk_dava_acilis',
    label: 'Hukuk Dava Açılış',
    subMenus: [
      { id: 'dava_ac', label: 'Dava Aç' },
      { id: 'tamamlanmayan_dosyalar', label: 'Tamamlanmayan Dosyalar' },
    ],
  },
  {
    id: 'idari_dava_acilis',
    label: 'İdari Dava Açılış',
    subMenus: [
      { id: 'dava_ac', label: 'Dava Aç' },
      { id: 'odeme_bekleyen_dosyalar', label: 'Ödeme Bekleyen Dosyalar' },
    ],
  },
  {
    id: 'dosya_sorgula',
    label: 'Dosya Sorgula',
  },
  {
    id: 'sik_kullanilan_dosyalar',
    label: 'Sık Kullanılan Dosyalar',
  },
  {
    id: 'aktarilan_dosyalarim',
    label: 'Aktarılan Dosyalarım',
  },
  {
    id: 'vekaletname_islemleri',
    label: 'Vekaletname İşlemleri',
  },
  {
    id: 'cbs_evrak_gonderme',
    label: 'CBS Evrak Gönderme',
  },
  {
    id: 'dosya_islemleri',
    label: 'Dosya İşlemleri',
  },
  {
    id: 'icra_dosya_islemleri',
    label: 'İcra Dosya İşlemleri',
  },
  {
    id: 'islemlerim',
    label: 'İşlemlerim',
  },
  {
    id: 'odeme_islemlerim',
    label: 'Ödeme İşlemlerim',
  },
  {
    id: 'durusma_sorgula',
    label: 'Duruşma Sorgula',
  },
  {
    id: 'ihale_gunu_sorgula',
    label: 'İhale Günü Sorgula',
  },
  {
    id: 'yargitay_dosya_sorgula',
    label: 'Yargıtay Dosya Sorgula',
  },
  {
    id: 'danistay_dosya_sorgula',
    label: 'Danıştay Dosya Sorgula',
  },
  {
    id: 'harc_hesapla',
    label: 'Harç Hesapla',
  },
  {
    id: 'duyurular',
    label: 'Duyurular',
  },
  {
    id: 'programlar',
    label: 'Programlar',
  },
];

// ==================== İCRA TAKİBİ AÇILIŞ SEKMELERI ====================

/**
 * İcra Takibi Açılış Ekranı Sekmeleri
 * Avukat Portalı > İcra Takibi > Takip Açılış
 */
export const ICRA_TAKIBI_ACILIS_TABS = [
  {
    id: 'dosya_takip_bilgileri',
    label: 'Dosya/Takip Bilgileri',
    fields: [
      'Kota Kullanım Şekli',
      'İl',
      'Adliyesi',
      'Takibin Türü',
      'Takibin Yolu',
      'Takibin Şekli',
      '1/9 Açıklaması',
      '1/4 Açıklaması',
      'Vekalet Ücretine KDV/BSMV/KKDF',
      'Takip Mahiyeti',
    ],
  },
  {
    id: 'taraf_bilgileri',
    label: 'Taraf Bilgileri',
    fields: [
      'Taraf Sıfatı',
      'Kişi/Kurum',
      'T.C. Kimlik No',
      'Vergi No',
    ],
  },
  {
    id: 'ilam_ilamsiz_bilgileri',
    label: 'İlam/İlamsız Bilgileri',
    fields: [
      'Çek',
      'Senet',
      'Kontrat',
      'Poliçe',
      'Diğer',
      'Alacak Türü',
      'Alacak Açıklama',
      'Tutar/Para Birimi',
      'Faiz Türü',
      'Faiz Süre Tipi',
      'Faiz Oranı',
    ],
  },
  {
    id: 'harc_masraf_bilgileri',
    label: 'Harç/Masraf Bilgileri',
    fields: [
      'Tahsil Edilecek Harç/Masraf Bilgileri',
    ],
  },
  {
    id: 'tevzi_numarasi_al',
    label: 'Tevzi Numarası Al',
    fields: [
      'Veri Girişi Kontrolü',
    ],
  },
  {
    id: 'evrak_gonder',
    label: 'Evrak Gönder',
    fields: [
      'Evrak Türü',
      'Evrak',
      'Açıklama',
    ],
  },
  {
    id: 'odeme_yap',
    label: 'Ödeme Yap',
    fields: [
      'Ödeme Tipi (Vakıfbank/Barokart)',
    ],
  },
];

// ==================== PORTAL REGISTRY ====================

export const UYAP_PORTALS: Record<string, UyapPortal> = {
  vatandas: PORTAL_VATANDAS,
  avukat: PORTAL_AVUKAT,
  kurum: PORTAL_KURUM,
  arabulucu: PORTAL_ARABULUCU,
  uzlastirmaci: PORTAL_UZLASTIRMACI,
  bilirkisi: PORTAL_BILIRKISI,
  esatis: PORTAL_ESATIS,
};

// ==================== HELPER FUNCTIONS ====================

/**
 * Portal ID'sine göre portal bilgisi getir
 */
export function getPortal(portalId: string): UyapPortal | undefined {
  return UYAP_PORTALS[portalId];
}

/**
 * Hedef kullanıcıya göre portalları bul
 */
export function getPortalsByTargetUser(targetUser: string): UyapPortal[] {
  return Object.values(UYAP_PORTALS).filter(
    portal => portal.targetUsers.some(tu => tu.toLowerCase().includes(targetUser.toLowerCase()))
  );
}

/**
 * Kimlik doğrulama yöntemine göre portalları bul
 */
export function getPortalsByAuthMethod(authMethod: 'e-devlet' | 'e-imza' | 'mobil-imza'): UyapPortal[] {
  return Object.values(UYAP_PORTALS).filter(
    portal => portal.authMethods.includes(authMethod)
  );
}

/**
 * Tüm portal ID'lerini getir
 */
export function getAllPortalIds(): string[] {
  return Object.keys(UYAP_PORTALS);
}

/**
 * Avukat portalı menülerini getir
 */
export function getAvukatPortalMenus(): PortalMenu[] {
  return AVUKAT_PORTAL_MENUS;
}

/**
 * İcra takibi açılış sekmelerini getir
 */
export function getIcraTakibiAcilisTabs() {
  return ICRA_TAKIBI_ACILIS_TABS;
}
