import { Recipe } from '../../types/recipe.types';

/**
 * FETCH E-TEBLİGAT STATUSES
 * 
 * UYAP "Hazırlanmış Elektronik Tebligatlar" ekranından
 * e-tebligat durumlarını çeker.
 * 
 * Kitap referansı: e-tebligat durum takibi, renk kodları
 * MAVİ/PEMBE/SARI/GRİ + Tarafa teslim tarihi + mazbata var mı
 */
export const FETCH_ETEBLIGAT_STATUSES: Recipe = {
  recipeId: 'FetchEtebligatStatuses',
  version: 1,
  name: 'E-Tebligat Durum Sorgula',
  description: 'UYAP üzerinden e-tebligat durumlarını kontrol eder',
  
  stageTags: ['TEBLIGAT'],
  
  trigger: {
    type: 'event',
    when: [
      'event:TEBLIGAT_SENT',
      'event:TEBLIGAT_CHECK_REQUESTED',
      'schedule:EVERY_6_HOURS',
    ],
  },
  
  preconditions: [
    { field: 'case.uyapDosyaNo', operator: 'isNotNull' },
    { field: 'case.hasPendingEtebligat', operator: 'eq', value: true },
  ],
  
  uyapNavPath: {
    menu: ['Tebligat', 'Hazırlanmış Elektronik Tebligatlar'],
    screenId: 'ETEBLIGAT_LIST',
  },
  
  read: {
    source: 'uyap',
    table: 'e-tebligat list',
    fields: [
      { name: 'tarafaTeslimTarihi', type: 'date' },
      { name: 'okundu', type: 'boolean' },
      { name: 'eTebligMazbatasiVarMi', type: 'boolean' },
      { name: 'iletimDurumuRenk', type: 'enum', enumValues: ['MAVI', 'PEMBE', 'SARI', 'GRI'] },
      { name: 'gonderimTarihi', type: 'date' },
      { name: 'aliciAdi', type: 'text' },
    ],
  },
  
  decisions: [
    {
      // Teslim edildi ama mazbata yok → Mazbata sorgula
      if: 'eTebligMazbatasiVarMi == false AND tarafaTeslimTarihi != null',
      thenEnqueue: ['MazbataSorgulaIfMissing'],
    },
    {
      // Teslim tarihi var → Tebliğ tarihi hesapla
      if: 'tarafaTeslimTarihi != null',
      thenEnqueue: ['ComputeLegalServiceDate'],
    },
    {
      // Hala gönderilmemiş (GRİ) → Uyarı oluştur
      if: 'iletimDurumuRenk == "GRI"',
      thenAction: 'CREATE_WARNING',
      thenUpdate: { warningType: 'ETEBLIGAT_NOT_SENT' },
    },
  ],
  
  actions: [
    { type: 'query', target: 'Sorgula' },
    { type: 'wait', timeout: 2000 },
  ],
  
  postconditions: [
    'case.events += ETEBLIGAT_STATUS_SNAPSHOT',
  ],
  
  proof: {
    store: ['snapshotHash', 'tarafaTeslimTarihi', 'iletimDurumuRenk'],
    screenshot: true,
  },
  
  audit: {
    level: 'high',
    retainDays: 3650, // 10 yıl
  },
  
  retry: {
    maxAttempts: 3,
    backoffMs: 60000, // 1 dakika
  },
  
  priority: 'HIGH',
  isActive: true,
};
