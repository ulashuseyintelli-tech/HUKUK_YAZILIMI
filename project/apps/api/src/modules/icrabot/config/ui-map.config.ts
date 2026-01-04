/**
 * UYAP UI MAP CONFIG
 * 
 * v2: UYAP ekranlarının navigasyon yolları, alan ID'leri ve tablo yapıları.
 * ui_map_v2.yaml'dan TypeScript'e dönüştürülmüştür.
 * 
 * Bu konfigürasyon bot'un UYAP arayüzünde hangi ekranlara nasıl gideceğini,
 * hangi alanları okuyacağını/yazacağını ve tablo satırlarını nasıl seçeceğini tanımlar.
 */

// ==================== TYPES ====================

export interface UyapField {
  id: string;
  label: string;
  type: 'text' | 'date' | 'select' | 'checkbox' | 'number';
  required?: boolean;
}

export interface UyapTableColumn {
  id: string;
  label: string;
  type: 'text' | 'date' | 'boolean' | 'link' | 'badge';
}

export interface UyapTable {
  rowsSelector: string;
  columns: Record<string, UyapTableColumn>;
}

export interface UyapAction {
  id: string;
  label: string;
  type: 'button' | 'link' | 'row_action';
  requiresSelection?: boolean;
}

export interface UyapScreen {
  id: string;
  name: string;
  navPath: string[];
  fields?: Record<string, UyapField>;
  table?: UyapTable;
  actions?: Record<string, UyapAction>;
  outputs?: Record<string, string>;
}

// ==================== SCREEN DEFINITIONS ====================

/**
 * Hazırlanmış Elektronik Tebligatlar Ekranı
 * E-tebligat durumlarını sorgulamak için kullanılır.
 */
export const SCREEN_HAZIRLANMIS_ETEBLIGATLAR: UyapScreen = {
  id: 'hazirlanmis_elektronik_tebligatlar',
  name: 'Hazırlanmış Elektronik Tebligatlar',
  navPath: ['Tebligat', 'Hazırlanmış Elektronik Tebligatlar'],
  fields: {
    tarihAraligiBas: {
      id: 'FIELD_TARIH_BAS',
      label: 'Başlangıç Tarihi',
      type: 'date',
    },
    tarihAraligiBit: {
      id: 'FIELD_TARIH_BIT',
      label: 'Bitiş Tarihi',
      type: 'date',
    },
    muhatapFilter: {
      id: 'FIELD_MUHTAP_FILTER',
      label: 'Muhatap Filtresi',
      type: 'text',
    },
  },
  table: {
    rowsSelector: 'TABLE_ETEBLIGAT_ROWS',
    columns: {
      muhatapId: {
        id: 'COL_MUHTAP_ID',
        label: 'Muhatap ID',
        type: 'text',
      },
      tarafaTeslimTarihi: {
        id: 'COL_TESLIM_TARIHI',
        label: 'Tarafa Teslim Tarihi',
        type: 'date',
      },
      okundu: {
        id: 'COL_OKUNDU',
        label: 'Okundu',
        type: 'boolean',
      },
      mazbata: {
        id: 'COL_MAZBATA',
        label: 'Mazbata',
        type: 'link',
      },
      durum: {
        id: 'COL_DURUM',
        label: 'Durum',
        type: 'badge',
      },
    },
  },
  actions: {
    sorgula: {
      id: 'BTN_SORGULA',
      label: 'Sorgula',
      type: 'button',
    },
    selectRowByMuhatapId: {
      id: 'ACT_SELECT_ROW_BY_MUHTAP_ID',
      label: 'Muhatap ID ile Satır Seç',
      type: 'row_action',
    },
    mazbataSorgula: {
      id: 'BTN_MAZBATA_SORGULA',
      label: 'Mazbata Sorgula',
      type: 'button',
      requiresSelection: true,
    },
  },
};

/**
 * Toplu Entegrasyon Sorgu Ekranı
 * Varlık sorgularını toplu olarak yapmak için kullanılır.
 */
export const SCREEN_TOPLU_ENTEGRASYON_SORGU: UyapScreen = {
  id: 'toplu_entegrasyon_sorgu',
  name: 'Toplu Entegrasyon Sorgu',
  navPath: ['Sorgular', 'Toplu Entegrasyon Sorgu'],
  fields: {
    debtorIdsInput: {
      id: 'FIELD_DEBTOR_IDS',
      label: 'Borçlu ID\'leri',
      type: 'text',
    },
  },
  actions: {
    sorgula: {
      id: 'BTN_SORGULA',
      label: 'Sorgula',
      type: 'button',
    },
  },
  outputs: {
    sgk: 'OUT_SGK',
    tapu: 'OUT_TAKBIS',
    arac: 'OUT_ARAC',
  },
};

/**
 * Safahat Sorgula Ekranı
 * Dosya safahatını (timeline) sorgulamak için kullanılır.
 */
export const SCREEN_SAFAHAT_SORGULA: UyapScreen = {
  id: 'safahat_sorgula',
  name: 'Safahat Sorgula',
  navPath: ['Portal/Modül', 'Safahat Sorgula'],
  fields: {
    dosyaNo: {
      id: 'FIELD_DOSYA_NO',
      label: 'Dosya No',
      type: 'text',
      required: true,
    },
  },
  table: {
    rowsSelector: 'TABLE_SAFAHAT_ROWS',
    columns: {
      tarih: {
        id: 'COL_TARIH',
        label: 'Tarih',
        type: 'date',
      },
      islem: {
        id: 'COL_ISLEM',
        label: 'İşlem',
        type: 'text',
      },
      aciklama: {
        id: 'COL_ACIKLAMA',
        label: 'Açıklama',
        type: 'text',
      },
    },
  },
  actions: {
    sorgula: {
      id: 'BTN_SORGULA',
      label: 'Sorgula',
      type: 'button',
    },
  },
};

/**
 * Dosya Bilgileri Ekranı
 * Dosya header bilgilerini sorgulamak için kullanılır.
 */
export const SCREEN_DOSYA_BILGILERI: UyapScreen = {
  id: 'dosya_bilgileri',
  name: 'Dosya Bilgileri',
  navPath: ['Dosya', 'Dosya Bilgileri'],
  fields: {
    dosyaNo: {
      id: 'FIELD_DOSYA_NO',
      label: 'Dosya No',
      type: 'text',
    },
    dosyaTuru: {
      id: 'FIELD_DOSYA_TURU',
      label: 'Dosya Türü',
      type: 'text',
    },
    alacakliAdi: {
      id: 'FIELD_ALACAKLI_ADI',
      label: 'Alacaklı Adı',
      type: 'text',
    },
    borcluAdi: {
      id: 'FIELD_BORCLU_ADI',
      label: 'Borçlu Adı',
      type: 'text',
    },
    takipTarihi: {
      id: 'FIELD_TAKIP_TARIHI',
      label: 'Takip Tarihi',
      type: 'date',
    },
    asilAlacak: {
      id: 'FIELD_ASIL_ALACAK',
      label: 'Asıl Alacak',
      type: 'number',
    },
  },
};

/**
 * Evrak Listesi Ekranı
 * Dosyadaki evrakları listelemek için kullanılır.
 */
export const SCREEN_EVRAK_LISTESI: UyapScreen = {
  id: 'evrak_listesi',
  name: 'Evrak Listesi',
  navPath: ['Dosya', 'Evrak Listesi'],
  table: {
    rowsSelector: 'TABLE_EVRAK_ROWS',
    columns: {
      evrakNo: {
        id: 'COL_EVRAK_NO',
        label: 'Evrak No',
        type: 'text',
      },
      evrakTuru: {
        id: 'COL_EVRAK_TURU',
        label: 'Evrak Türü',
        type: 'text',
      },
      tarih: {
        id: 'COL_TARIH',
        label: 'Tarih',
        type: 'date',
      },
      durum: {
        id: 'COL_DURUM',
        label: 'Durum',
        type: 'badge',
      },
    },
  },
  actions: {
    indir: {
      id: 'BTN_INDIR',
      label: 'İndir',
      type: 'button',
      requiresSelection: true,
    },
    goruntule: {
      id: 'BTN_GORUNTULE',
      label: 'Görüntüle',
      type: 'button',
      requiresSelection: true,
    },
  },
};

/**
 * Haciz Talepleri Ekranı
 * Haciz taleplerini oluşturmak ve takip etmek için kullanılır.
 */
export const SCREEN_HACIZ_TALEPLERI: UyapScreen = {
  id: 'haciz_talepleri',
  name: 'Haciz Talepleri',
  navPath: ['Haciz', 'Haciz Talepleri'],
  fields: {
    hacizTuru: {
      id: 'FIELD_HACIZ_TURU',
      label: 'Haciz Türü',
      type: 'select',
      required: true,
    },
    borcluId: {
      id: 'FIELD_BORCLU_ID',
      label: 'Borçlu',
      type: 'select',
      required: true,
    },
    tutar: {
      id: 'FIELD_TUTAR',
      label: 'Tutar',
      type: 'number',
    },
  },
  table: {
    rowsSelector: 'TABLE_HACIZ_ROWS',
    columns: {
      talepNo: {
        id: 'COL_TALEP_NO',
        label: 'Talep No',
        type: 'text',
      },
      hacizTuru: {
        id: 'COL_HACIZ_TURU',
        label: 'Haciz Türü',
        type: 'text',
      },
      tarih: {
        id: 'COL_TARIH',
        label: 'Tarih',
        type: 'date',
      },
      durum: {
        id: 'COL_DURUM',
        label: 'Durum',
        type: 'badge',
      },
    },
  },
  actions: {
    yeniTalep: {
      id: 'BTN_YENI_TALEP',
      label: 'Yeni Talep',
      type: 'button',
    },
    gonder: {
      id: 'BTN_GONDER',
      label: 'Gönder',
      type: 'button',
      requiresSelection: true,
    },
  },
};

/**
 * Tahsilat Ekranı
 * Tahsilat hareketlerini görüntülemek için kullanılır.
 */
export const SCREEN_TAHSILAT: UyapScreen = {
  id: 'tahsilat',
  name: 'Tahsilat',
  navPath: ['Tahsilat', 'Tahsilat Hareketleri'],
  table: {
    rowsSelector: 'TABLE_TAHSILAT_ROWS',
    columns: {
      tarih: {
        id: 'COL_TARIH',
        label: 'Tarih',
        type: 'date',
      },
      tutar: {
        id: 'COL_TUTAR',
        label: 'Tutar',
        type: 'text',
      },
      tur: {
        id: 'COL_TUR',
        label: 'Tür',
        type: 'text',
      },
      aciklama: {
        id: 'COL_ACIKLAMA',
        label: 'Açıklama',
        type: 'text',
      },
    },
  },
};

// ==================== v5: ARAÇ VE HACİZ EKRANLARI ====================

/**
 * Araç Sorgu Sonuçları Ekranı (v5)
 * Toplu entegrasyon sorgusundan dönen araç listesi.
 */
export const SCREEN_VEHICLE_RESULTS: UyapScreen = {
  id: 'vehicle_results',
  name: 'Araç Sorgu Sonuçları',
  navPath: ['Sorgular', 'Toplu Entegrasyon Sorgu'],
  table: {
    rowsSelector: 'TABLE_VEHICLE_ROWS',
    columns: {
      plate: {
        id: 'COL_PLATE',
        label: 'Plaka',
        type: 'text',
      },
      make: {
        id: 'COL_MAKE',
        label: 'Marka',
        type: 'text',
      },
      model: {
        id: 'COL_MODEL',
        label: 'Model',
        type: 'text',
      },
      year: {
        id: 'COL_YEAR',
        label: 'Yıl',
        type: 'text',
      },
      vin: {
        id: 'COL_VIN',
        label: 'Şasi No',
        type: 'text',
      },
      notes: {
        id: 'COL_NOTES',
        label: 'Notlar',
        type: 'text',
      },
    },
  },
  actions: {
    openVehicleDetail: {
      id: 'ACT_OPEN_VEHICLE_DETAIL',
      label: 'Araç Detayı Aç',
      type: 'row_action',
      requiresSelection: true,
    },
  },
};

/**
 * Araç Haciz/Rehin/Kısıt Bilgileri Ekranı (v5)
 * Araç üzerindeki mevcut haciz, rehin ve kısıtlamaları listeler.
 */
export const SCREEN_VEHICLE_LIENS: UyapScreen = {
  id: 'vehicle_liens_and_restrictions',
  name: 'Araç Kısıt/Haciz/Takyidat Bilgileri',
  navPath: ['(Araç ekranı)', 'Araç Kısıt/Haciz/Takyidat Bilgileri'],
  table: {
    rowsSelector: 'TABLE_LIEN_ROWS',
    columns: {
      lienType: {
        id: 'COL_LIEN_TYPE',
        label: 'Haciz/Rehin Türü',
        type: 'text',
      },
      creditor: {
        id: 'COL_CREDITOR',
        label: 'Alacaklı',
        type: 'text',
      },
      lienDate: {
        id: 'COL_DATE',
        label: 'Tarih',
        type: 'date',
      },
      rankOrder: {
        id: 'COL_RANK',
        label: 'Sıra',
        type: 'text',
      },
      amountClaimed: {
        id: 'COL_AMOUNT',
        label: 'Tutar',
        type: 'text',
      },
      activeStatus: {
        id: 'COL_ACTIVE',
        label: 'Durum',
        type: 'badge',
      },
      referenceNo: {
        id: 'COL_REF',
        label: 'Referans No',
        type: 'text',
      },
    },
  },
  actions: {
    refresh: {
      id: 'BTN_REFRESH',
      label: 'Yenile',
      type: 'button',
    },
  },
};

// ==================== v6: ARAÇ HACİZ EKLEME ====================

/**
 * Araç Haciz Ekleme Ekranı (v6)
 * Araç üzerine haciz koymak için kullanılır.
 */
export const SCREEN_VEHICLE_HACIZ_ADD: UyapScreen = {
  id: 'vehicle_haciz_add',
  name: 'Araç Haciz Ekle',
  navPath: ['(Araç ekranı)', 'Araç Haciz Ekle'],
  fields: {
    dosyaNo: {
      id: 'FIELD_DOSYA_NO',
      label: 'Dosya No',
      type: 'text',
      required: true,
    },
    alacakMiktari: {
      id: 'FIELD_ALACAK_MIKTARI',
      label: 'Alacak Miktarı',
      type: 'number',
      required: true,
    },
    alacakli: {
      id: 'FIELD_ALACAKLI',
      label: 'Alacaklı',
      type: 'text',
      required: true,
    },
  },
  actions: {
    kaydet: {
      id: 'BTN_KAYDET',
      label: 'Kaydet',
      type: 'button',
    },
    iptal: {
      id: 'BTN_IPTAL',
      label: 'İptal',
      type: 'button',
    },
  },
  outputs: {
    confirmationRef: 'OUT_CONFIRMATION_REF',
  },
};

// ==================== v7: SATIŞ ÖNERİSİ ====================

/**
 * Satış Öneri Paneli (v7)
 * Satış başlatma önerilerini görüntüler.
 */
export const SCREEN_SALE_RECOMMENDATION: UyapScreen = {
  id: 'sale_recommendation_panel',
  name: 'Satış Öneri Paneli',
  navPath: ['(internal)', 'Sales'],
  outputs: {
    taskId: 'OUT_TASK_ID',
  },
};

/**
 * Satış Talebi Formu (v7/v8)
 * UYAP'ta satış talebi oluşturmak için kullanılır.
 */
export const SCREEN_SALE_START_FORM: UyapScreen = {
  id: 'sale_start_form',
  name: 'Satış Talebi',
  navPath: ['Haciz & Mal & Satış İşlemleri', 'İhale İşlemleri', 'Satış Talebi'],
  fields: {
    dosyaNo: {
      id: 'FIELD_DOSYA_NO',
      label: 'Dosya No',
      type: 'text',
      required: true,
    },
    assetRef: {
      id: 'FIELD_ASSET_REF',
      label: 'Varlık Referansı',
      type: 'text',
      required: true,
    },
    reason: {
      id: 'FIELD_REASON',
      label: 'Sebep',
      type: 'text',
    },
  },
  actions: {
    kaydet: {
      id: 'BTN_KAYDET',
      label: 'Kaydet',
      type: 'button',
    },
  },
  outputs: {
    saleRequestId: 'OUT_SALE_REQ_ID',
  },
};

// ==================== v8: DOSYA ARAMA VE BORÇ BİLGİLERİ ====================

/**
 * Dosya Arama Ekranı (v8)
 * Referans numarasıyla dosya aramak için kullanılır.
 */
export const SCREEN_DOSYA_ARAMA: UyapScreen = {
  id: 'dosya_arama',
  name: 'Dosya Arama',
  navPath: ['Dosya', 'Dosya Arama'],
  fields: {
    referenceNo: {
      id: 'FIELD_REF_NO',
      label: 'Referans No',
      type: 'text',
      required: true,
    },
  },
  actions: {
    sorgula: {
      id: 'BTN_SORGULA',
      label: 'Sorgula',
      type: 'button',
    },
  },
};

/**
 * Dosya Kapak / Borç Bilgileri Ekranı (v8)
 * Dosyanın borç tutarı ve durumunu görüntüler.
 */
export const SCREEN_DOSYA_KAPAK_BORC: UyapScreen = {
  id: 'dosya_kapak_borc',
  name: 'Dosya Kapak / Borç Bilgileri',
  navPath: ['Dosya', 'Dosya Kapak / Borç Bilgileri'],
  outputs: {
    amount: 'OUT_BORC_TUTARI',
    caseStatus: 'OUT_DOSYA_DURUM',
  },
};

// ==================== v9: SATIŞ DURUMU ====================

/**
 * Satış Durumu Tablosu (v9)
 * İhale sonuçlarını ve satış fiyatını görüntüler.
 */
export const SCREEN_SALE_STATUS: UyapScreen = {
  id: 'sale_status_table',
  name: 'İhale İşlemleri',
  navPath: ['Haciz & Mal & Satış İşlemleri', 'İhale İşlemleri'],
  table: {
    rowsSelector: 'TABLE_SALE_ROWS',
    columns: {
      ihaleTarihi: {
        id: 'COL_IHALE_TARIHI',
        label: 'İhale Tarihi',
        type: 'date',
      },
      durum: {
        id: 'COL_STATUS',
        label: 'Durum',
        type: 'badge',
      },
      sonuc: {
        id: 'COL_RESULT',
        label: 'Sonuç',
        type: 'text',
      },
      salePrice: {
        id: 'COL_PRICE',
        label: 'Satış Fiyatı',
        type: 'text',
      },
      aciklama: {
        id: 'COL_ACIKLAMA',
        label: 'Açıklama',
        type: 'text',
      },
    },
  },
  actions: {
    sorgula: {
      id: 'BTN_SORGULA',
      label: 'Sorgula',
      type: 'button',
    },
  },
};

// ==================== SCREEN REGISTRY ====================

export const UYAP_SCREENS: Record<string, UyapScreen> = {
  hazirlanmis_elektronik_tebligatlar: SCREEN_HAZIRLANMIS_ETEBLIGATLAR,
  toplu_entegrasyon_sorgu: SCREEN_TOPLU_ENTEGRASYON_SORGU,
  safahat_sorgula: SCREEN_SAFAHAT_SORGULA,
  dosya_bilgileri: SCREEN_DOSYA_BILGILERI,
  evrak_listesi: SCREEN_EVRAK_LISTESI,
  haciz_talepleri: SCREEN_HACIZ_TALEPLERI,
  tahsilat: SCREEN_TAHSILAT,
  // v5 ekranları
  vehicle_results: SCREEN_VEHICLE_RESULTS,
  vehicle_liens_and_restrictions: SCREEN_VEHICLE_LIENS,
  // v6 ekranları
  vehicle_haciz_add: SCREEN_VEHICLE_HACIZ_ADD,
  // v7 ekranları
  sale_recommendation_panel: SCREEN_SALE_RECOMMENDATION,
  sale_start_form: SCREEN_SALE_START_FORM,
  // v8 ekranları
  dosya_arama: SCREEN_DOSYA_ARAMA,
  dosya_kapak_borc: SCREEN_DOSYA_KAPAK_BORC,
  // v9 ekranları
  sale_status_table: SCREEN_SALE_STATUS,
};

// ==================== HELPER FUNCTIONS ====================

/**
 * Ekran ID'sine göre ekran bilgisi getir
 */
export function getScreen(screenId: string): UyapScreen | undefined {
  return UYAP_SCREENS[screenId];
}

/**
 * Navigasyon yoluna göre ekran bul
 */
export function getScreenByNavPath(navPath: string[]): UyapScreen | undefined {
  return Object.values(UYAP_SCREENS).find(
    screen => JSON.stringify(screen.navPath) === JSON.stringify(navPath)
  );
}

/**
 * Ekrandaki alan ID'sini getir
 */
export function getFieldId(screenId: string, fieldName: string): string | undefined {
  const screen = getScreen(screenId);
  return screen?.fields?.[fieldName]?.id;
}

/**
 * Ekrandaki aksiyon ID'sini getir
 */
export function getActionId(screenId: string, actionName: string): string | undefined {
  const screen = getScreen(screenId);
  return screen?.actions?.[actionName]?.id;
}

/**
 * Ekrandaki tablo kolon ID'sini getir
 */
export function getColumnId(screenId: string, columnName: string): string | undefined {
  const screen = getScreen(screenId);
  return screen?.table?.columns[columnName]?.id;
}

/**
 * Tüm ekran ID'lerini getir
 */
export function getAllScreenIds(): string[] {
  return Object.keys(UYAP_SCREENS);
}

/**
 * Ekran navigasyon yolunu string olarak getir
 */
export function getNavPathString(screenId: string): string {
  const screen = getScreen(screenId);
  return screen?.navPath.join(' > ') || '';
}
