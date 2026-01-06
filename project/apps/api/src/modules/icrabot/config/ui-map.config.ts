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

// ==================== v10: UYAP KİTABI EKRANLARI ====================
// UYAP Bilişim Sistemi Kitabı (Ocak 2021) referansıyla eklenen ekranlar

/**
 * Takip Talebi Tevzi Ekranı
 * İcra takibi açılışında tevzi işlemi için kullanılır.
 * Kaynak: UYAP Kitabı Ünite-11 İcra Daireleri Modülü
 */
export const SCREEN_TAKIP_TALEBI_TEVZI: UyapScreen = {
  id: 'takip_talebi_tevzi',
  name: 'Takip Talebi Tevzi Önbilgi Kontrolü',
  navPath: ['Dosya Açılış', 'Takip Talebi Tevzi Önbilgi Kontrolü (Kota Kontrolsüz)'],
  fields: {
    dosyaTipi: {
      id: 'FIELD_DOSYA_TIPI',
      label: 'Dosya Tipi',
      type: 'select',
      required: true,
    },
    takipTipi: {
      id: 'FIELD_TAKIP_TIPI',
      label: 'Takip Tipi',
      type: 'select',
      required: true,
    },
    avukatBilgileri: {
      id: 'FIELD_AVUKAT_BILGILERI',
      label: 'Avukat Bilgileri',
      type: 'text',
    },
    kurumBilgileri: {
      id: 'FIELD_KURUM_BILGILERI',
      label: 'Kurum Bilgileri',
      type: 'text',
    },
    dosyaSayisi: {
      id: 'FIELD_DOSYA_SAYISI',
      label: 'Dosya Sayısı',
      type: 'number',
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
    tevziEdilenIcraDairesi: 'OUT_TEVZI_ICRA_DAIRESI',
  },
};

/**
 * Dosya Açılış Ekranı
 * Tevzi sonrası dosya açma işlemi için kullanılır.
 * Kaynak: UYAP Kitabı Ünite-11 İcra Daireleri Modülü
 */
export const SCREEN_DOSYA_ACILIS: UyapScreen = {
  id: 'dosya_acilis',
  name: 'Dosyanın Açılması',
  navPath: ['Dosya Açılış', 'Tevzi Yapılan Dosyaların Sorgulanması', 'Dosya Aç'],
  fields: {
    takipTuru: {
      id: 'FIELD_TAKIP_TURU',
      label: 'Takip Türü',
      type: 'select',
      required: true,
    },
    takipYolu: {
      id: 'FIELD_TAKIP_YOLU',
      label: 'Takip Yolu',
      type: 'select',
      required: true,
    },
    takipSekli: {
      id: 'FIELD_TAKIP_SEKLI',
      label: 'Takip Şekli',
      type: 'select',
      required: true,
    },
    takipMahiyeti: {
      id: 'FIELD_TAKIP_MAHIYETI',
      label: 'Takibin Mahiyeti',
      type: 'checkbox',
    },
  },
  actions: {
    tarafBilgileriGir: {
      id: 'BTN_TARAF_BILGILERI_GIR',
      label: 'Taraf Bilgileri Gir',
      type: 'button',
    },
    harcMasrafGir: {
      id: 'BTN_HARC_MASRAF_GIR',
      label: 'Harç Masraf Gir',
      type: 'button',
    },
    ilamsizBilgileriKaydet: {
      id: 'BTN_ILAMSIZ_BILGILERI_KAYDET',
      label: 'İlamsız Bilgileri Kaydet',
      type: 'button',
    },
    dosyaAc: {
      id: 'BTN_DOSYA_AC',
      label: 'Dosya Aç',
      type: 'button',
    },
  },
};

/**
 * Harç ve Masraf Tahsilatı Ekranı
 * Dosyaya ait harç ve masrafların tahsili için kullanılır.
 * Kaynak: UYAP Kitabı Ünite-11 İcra Daireleri Modülü
 */
export const SCREEN_HARC_MASRAF_TAHSILAT: UyapScreen = {
  id: 'harc_masraf_tahsilat',
  name: 'Harç ve Masraf Tahsilatının Yapılması ve Makbuzunun Kesilmesi',
  navPath: ['Harç ve Kasa', 'Harç İşlemleri', 'Harç ve Masraf Tahsilatının Yapılması ve Makbuzunun Kesilmesi'],
  fields: {
    odeyecekTaraf: {
      id: 'FIELD_ODEYECEK_TARAF',
      label: 'Ödeyecek Taraf',
      type: 'select',
      required: true,
    },
    harcTuru: {
      id: 'FIELD_HARC_TURU',
      label: 'Harç Türü',
      type: 'select',
      required: true,
    },
    harcaEsasMiktar: {
      id: 'FIELD_HARCA_ESAS_MIKTAR',
      label: 'Harca Esas Miktar (TL)',
      type: 'number',
    },
    adet: {
      id: 'FIELD_ADET',
      label: 'Adet',
      type: 'number',
    },
  },
  actions: {
    ekle: {
      id: 'BTN_EKLE',
      label: 'Ekle',
      type: 'button',
    },
    kaydet: {
      id: 'BTN_KAYDET',
      label: 'Kaydet',
      type: 'button',
    },
    makbuzHazirla: {
      id: 'BTN_MAKBUZ_HAZIRLA',
      label: 'Makbuz Hazırla',
      type: 'button',
    },
  },
};

/**
 * Tahsilat Yapılması Ekranı
 * Borç tahsilatı ve makbuz hazırlama için kullanılır.
 * Kaynak: UYAP Kitabı Ünite-11 İcra Daireleri Modülü
 */
export const SCREEN_TAHSILAT_YAPILMASI: UyapScreen = {
  id: 'tahsilat_yapilmasi',
  name: 'Tahsilat Yapılması ve Tahsilat Makbuzunun Hazırlanması',
  navPath: ['Harç ve Kasa', 'Tahsilat Yapılması ve Tahsilat Makbuzunun Hazırlanması'],
  fields: {
    odemeYapanTaraf: {
      id: 'FIELD_ODEME_YAPAN_TARAF',
      label: 'Ödeme Yapan / Adına Ödeme Yapılan Kişi',
      type: 'select',
      required: true,
    },
    tahsilatMiktari: {
      id: 'FIELD_TAHSILAT_MIKTARI',
      label: 'Tahsilat Miktarı',
      type: 'number',
      required: true,
    },
    tahsilatTipi: {
      id: 'FIELD_TAHSILAT_TIPI',
      label: 'Tahsilat Tipi',
      type: 'select',
      required: true,
    },
    tahsilatNedeni: {
      id: 'FIELD_TAHSILAT_NEDENI',
      label: 'Nedeni',
      type: 'select',
      required: true,
    },
    tahsilHarciOrani: {
      id: 'FIELD_TAHSIL_HARCI_ORANI',
      label: 'Tahsil Harcı Oranı',
      type: 'select',
      required: true,
    },
  },
  actions: {
    kaydet: {
      id: 'BTN_KAYDET',
      label: 'Kaydet',
      type: 'button',
    },
    tahsilatMakbuzHazirla: {
      id: 'BTN_TAHSILAT_MAKBUZ_HAZIRLA',
      label: 'Tahsilat Makbuz Hazırla',
      type: 'button',
    },
  },
};

/**
 * Reddiyat Yapılması Ekranı
 * Tahsil edilen paraların iadesi için kullanılır.
 * Kaynak: UYAP Kitabı Ünite-11 İcra Daireleri Modülü
 */
export const SCREEN_REDDIYAT_YAPILMASI: UyapScreen = {
  id: 'reddiyat_yapilmasi',
  name: 'Reddiyat Yapılması ve Reddiyat Makbuzunun Hazırlanması',
  navPath: ['Harç ve Kasa', 'Reddiyat Yapılması ve Reddiyat Makbuzunun Hazırlanması'],
  fields: {
    reddiyatYapilacakTaraf: {
      id: 'FIELD_REDDIYAT_TARAF',
      label: 'Reddiyat Yapılacak Taraf',
      type: 'select',
      required: true,
    },
    reddiyatMiktari: {
      id: 'FIELD_REDDIYAT_MIKTARI',
      label: 'Reddiyat Miktarı',
      type: 'number',
      required: true,
    },
    ibanNo: {
      id: 'FIELD_IBAN_NO',
      label: 'IBAN No',
      type: 'text',
    },
  },
  actions: {
    kaydet: {
      id: 'BTN_KAYDET',
      label: 'Kaydet',
      type: 'button',
    },
    reddiyatMakbuzHazirla: {
      id: 'BTN_REDDIYAT_MAKBUZ_HAZIRLA',
      label: 'Reddiyat Makbuz Hazırla',
      type: 'button',
    },
  },
};

/**
 * İhale İşlemleri Ekranı
 * Satış ihalesi oluşturma ve yönetimi için kullanılır.
 * Kaynak: UYAP Kitabı Ünite-11 İcra Daireleri Modülü
 */
export const SCREEN_IHALE_ISLEMLERI: UyapScreen = {
  id: 'ihale_islemleri',
  name: 'İhale İşlemleri',
  navPath: ['Haciz & Mal & Satış İşlemleri', 'İhale İşlemleri'],
  fields: {
    birinciIhaleTarihSaat: {
      id: 'FIELD_1_IHALE_TARIH_SAAT',
      label: '1. İhale Tarih ve Saati',
      type: 'date',
    },
    ikinciIhaleTarihSaat: {
      id: 'FIELD_2_IHALE_TARIH_SAAT',
      label: '2. İhale Tarih ve Saati',
      type: 'date',
    },
    satisYeriTuru: {
      id: 'FIELD_SATIS_YERI_TURU',
      label: 'Satış Yeri Türü',
      type: 'select',
    },
    satisYeri: {
      id: 'FIELD_SATIS_YERI',
      label: 'Satış Yeri',
      type: 'select',
    },
    duzenleyenPersonel: {
      id: 'FIELD_DUZENLEYEN_PERSONEL',
      label: 'Düzenleyen Personel',
      type: 'select',
    },
    basinIlanKurumuYayinlansin: {
      id: 'FIELD_BASIN_ILAN',
      label: 'Basın İlan Kurumunda Yayınlansın',
      type: 'checkbox',
    },
    yayinlanacakGazete: {
      id: 'FIELD_YAYINLANACAK_GAZETE',
      label: 'Yayınlanacak Gazete',
      type: 'select',
    },
  },
  table: {
    rowsSelector: 'TABLE_IHALE_MAL_LISTESI',
    columns: {
      malTuru: {
        id: 'COL_MAL_TURU',
        label: 'Mal Türü',
        type: 'text',
      },
      malAciklama: {
        id: 'COL_MAL_ACIKLAMA',
        label: 'Açıklama',
        type: 'text',
      },
      muhammenBedel: {
        id: 'COL_MUHAMMEN_BEDEL',
        label: 'Muhammen Bedel',
        type: 'text',
      },
    },
  },
  actions: {
    yeniKayit: {
      id: 'BTN_YENI_KAYIT',
      label: 'Yeni Kayıt',
      type: 'button',
    },
    kaydet: {
      id: 'BTN_KAYDET',
      label: 'Kaydet',
      type: 'button',
    },
  },
};

/**
 * İhale Sonuçlandırma Ekranı
 * İhale sonuçlarının kaydedilmesi için kullanılır.
 * Kaynak: UYAP Kitabı Ünite-11 İcra Daireleri Modülü
 */
export const SCREEN_IHALE_SONUCLANDIRMA: UyapScreen = {
  id: 'ihale_sonuclandirma',
  name: 'İhale Sonuçlandırma İşlemleri',
  navPath: ['Haciz & Mal & Satış İşlemleri', 'İhale İşlemleri', 'İhale Sonuçlandırma İşlemleri'],
  fields: {
    islemTuru: {
      id: 'FIELD_ISLEM_TURU',
      label: 'İşlem Türü',
      type: 'select',
    },
    satisKesinlesmeTarihi: {
      id: 'FIELD_SATIS_KESINLESME_TARIHI',
      label: 'Satışın Kesinleşme Tarihi',
      type: 'date',
    },
    ihaleAlicisi: {
      id: 'FIELD_IHALE_ALICISI',
      label: 'İhale Alıcısı',
      type: 'select',
    },
    teklifSatisTutari: {
      id: 'FIELD_TEKLIF_SATIS_TUTARI',
      label: 'Teklif/Satış Tutarı',
      type: 'number',
    },
    odemeSekli: {
      id: 'FIELD_ODEME_SEKLI',
      label: 'Ödeme Şekli',
      type: 'select',
    },
  },
  actions: {
    kaydet: {
      id: 'BTN_KAYDET',
      label: 'Kaydet',
      type: 'button',
    },
  },
};

/**
 * Tebligat Zarf/Davetiye Hazırlama Ekranı
 * Tebligat zarfı ve davetiye hazırlama için kullanılır.
 * Kaynak: UYAP Kitabı Ünite-11 İcra Daireleri Modülü
 */
export const SCREEN_TEBLIGAT_ZARF_DAVETIYE: UyapScreen = {
  id: 'tebligat_zarf_davetiye',
  name: 'Tebligat Zarf Davetiye Hazırlanması',
  navPath: ['Dosya Açılış', 'Tebligat Zarf Davetiye Hazırlanması'],
  fields: {
    tebligatTuru: {
      id: 'FIELD_TEBLIGAT_TURU',
      label: 'Tebligat Türü',
      type: 'select',
      required: true,
    },
    muhatap: {
      id: 'FIELD_MUHATAP',
      label: 'Muhatap',
      type: 'select',
      required: true,
    },
    adres: {
      id: 'FIELD_ADRES',
      label: 'Adres',
      type: 'text',
    },
  },
  actions: {
    hazirla: {
      id: 'BTN_HAZIRLA',
      label: 'Hazırla',
      type: 'button',
    },
    yazdir: {
      id: 'BTN_YAZDIR',
      label: 'Yazdır',
      type: 'button',
    },
  },
};

/**
 * MTS (Merkezi Takip Sistemi) İşlemleri Ekranı
 * Abonelik alacakları için merkezi takip sistemi.
 * Kaynak: UYAP Kitabı Ünite-6 Avukat Portalı
 */
export const SCREEN_MTS_ISLEMLERI: UyapScreen = {
  id: 'mts_islemleri',
  name: 'MTS İşlemleri',
  navPath: ['Avukat Portal', 'MTS İşlemleri'],
  fields: {
    alacakliVekili: {
      id: 'FIELD_ALACAKLI_VEKILI',
      label: 'Alacaklı Vekili',
      type: 'text',
    },
    borcluBilgileri: {
      id: 'FIELD_BORCLU_BILGILERI',
      label: 'Borçlu Bilgileri',
      type: 'text',
    },
    alacakKalemTutarlari: {
      id: 'FIELD_ALACAK_KALEM_TUTARLARI',
      label: 'Alacak Kalem Tutarları',
      type: 'number',
    },
  },
  actions: {
    mtsOdemeEmriOlustur: {
      id: 'BTN_MTS_ODEME_EMRI_OLUSTUR',
      label: 'MTS Ödeme Emri Oluştur',
      type: 'button',
    },
    icraTakibineCevir: {
      id: 'BTN_ICRA_TAKIBINE_CEVIR',
      label: 'İcra Takibine Çevir',
      type: 'button',
    },
  },
};

/**
 * Dosya Hesabı Ekranı
 * Dosya borç hesaplaması için kullanılır.
 * Kaynak: UYAP Kitabı Ünite-11 İcra Daireleri Modülü
 */
export const SCREEN_DOSYA_HESABI: UyapScreen = {
  id: 'dosya_hesabi',
  name: 'Dosya Hesabı',
  navPath: ['Harç ve Kasa', 'Dosya Hesabı'],
  fields: {
    hesapTarihi: {
      id: 'FIELD_HESAP_TARIHI',
      label: 'Hesap Tarihi',
      type: 'date',
    },
  },
  outputs: {
    asilAlacak: 'OUT_ASIL_ALACAK',
    islemisiFaiz: 'OUT_ISLEMIS_FAIZ',
    masraflar: 'OUT_MASRAFLAR',
    vekaletUcreti: 'OUT_VEKALET_UCRETI',
    toplamBorc: 'OUT_TOPLAM_BORC',
    tahsilatlar: 'OUT_TAHSILATLAR',
    kalanBorc: 'OUT_KALAN_BORC',
  },
  actions: {
    hesapla: {
      id: 'BTN_HESAPLA',
      label: 'Hesapla',
      type: 'button',
    },
    raporAl: {
      id: 'BTN_RAPOR_AL',
      label: 'Rapor Al',
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
  // v10 ekranları (UYAP Kitabı referansı)
  takip_talebi_tevzi: SCREEN_TAKIP_TALEBI_TEVZI,
  dosya_acilis: SCREEN_DOSYA_ACILIS,
  harc_masraf_tahsilat: SCREEN_HARC_MASRAF_TAHSILAT,
  tahsilat_yapilmasi: SCREEN_TAHSILAT_YAPILMASI,
  reddiyat_yapilmasi: SCREEN_REDDIYAT_YAPILMASI,
  ihale_islemleri: SCREEN_IHALE_ISLEMLERI,
  ihale_sonuclandirma: SCREEN_IHALE_SONUCLANDIRMA,
  tebligat_zarf_davetiye: SCREEN_TEBLIGAT_ZARF_DAVETIYE,
  mts_islemleri: SCREEN_MTS_ISLEMLERI,
  dosya_hesabi: SCREEN_DOSYA_HESABI,
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
