import { Recipe } from '../../types/recipe.types';

/**
 * MAZBATA SORGULA
 * 
 * E-tebligat mazbatası yoksa UYAP'tan sorgular/oluşturur.
 * 
 * Kitap referansı: "Mazbata Sorgula" ile mazbata oluşturma
 */
export const MAZBATA_SORGULA: Recipe = {
  recipeId: 'MazbataSorgulaIfMissing',
  version: 1,
  name: 'Mazbata Sorgula',
  description: 'E-tebligat mazbatası yoksa UYAP üzerinden sorgular',
  
  stageTags: ['TEBLIGAT'],
  
  trigger: {
    type: 'event',
    when: [
      'event:MAZBATA_CHECK_REQUESTED',
      'event:ETEBLIGAT_DELIVERED_NO_MAZBATA',
    ],
  },
  
  preconditions: [
    { field: 'tebligat.tarafaTeslimTarihi', operator: 'isNotNull' },
    { field: 'tebligat.mazbataExists', operator: 'eq', value: false },
    { field: 'tebligat.type', operator: 'eq', value: 'E_TEBLIGAT' },
  ],
  
  uyapNavPath: {
    menu: ['Tebligat', 'Hazırlanmış Elektronik Tebligatlar'],
    screenId: 'ETEBLIGAT_DETAIL',
  },
  
  read: {
    source: 'uyap',
    fields: [
      { name: 'mazbataNo', type: 'text' },
      { name: 'mazbataTarihi', type: 'date' },
      { name: 'mazbataIcerigi', type: 'text' },
    ],
  },
  
  decisions: [
    {
      // Mazbata oluştu → Kaydet
      if: 'mazbataNo != null',
      thenUpdate: {
        mazbataExists: true,
        mazbataNo: '${mazbataNo}',
        mazbataTarihi: '${mazbataTarihi}',
      },
      thenEnqueue: ['DetectFinalizationCandidate'],
    },
    {
      // Mazbata hala yok → Yeniden dene (max 3 gün)
      if: 'mazbataNo == null AND daysSinceDelivery < 3',
      thenEnqueue: ['MazbataSorgulaIfMissing'], // 6 saat sonra tekrar
    },
    {
      // 3 gün geçti hala yok → Uyarı
      if: 'mazbataNo == null AND daysSinceDelivery >= 3',
      thenAction: 'CREATE_WARNING',
      thenUpdate: { warningType: 'MAZBATA_MISSING_CRITICAL' },
    },
  ],
  
  actions: [
    { type: 'click', target: 'Mazbata Sorgula' },
    { type: 'wait', timeout: 3000 },
  ],
  
  postconditions: [
    'case.events += MAZBATA_QUERY_EXECUTED',
  ],
  
  proof: {
    store: ['mazbataNo', 'mazbataTarihi', 'queryTimestamp'],
    screenshot: true,
  },
  
  audit: {
    level: 'high',
    retainDays: 3650,
  },
  
  retry: {
    maxAttempts: 5,
    backoffMs: 21600000, // 6 saat
  },
  
  priority: 'HIGH',
  isActive: true,
};
