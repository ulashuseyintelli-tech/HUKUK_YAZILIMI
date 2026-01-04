import { Recipe } from '../../types/recipe.types';

/**
 * COMPUTE LEGAL SERVICE DATE
 * 
 * E-tebligat için "tebliğ edilmiş sayılma" tarihini hesaplar.
 * 
 * Kural: e-tebligat, posta kutusuna bırakılmayı izleyen 5. gün sonunda
 * tebliğ edilmiş sayılır.
 * 
 * Kitap referansı: 5 gün kuralı
 */
export const COMPUTE_LEGAL_SERVICE_DATE: Recipe = {
  recipeId: 'ComputeLegalServiceDate',
  version: 1,
  name: 'Tebliğ Tarihi Hesapla',
  description: 'E-tebligat için yasal tebliğ tarihini hesaplar (+5 gün kuralı)',
  
  stageTags: ['TEBLIGAT'],
  
  trigger: {
    type: 'event',
    when: [
      'event:ETEBLIGAT_DELIVERED',
      'event:ETEBLIGAT_STATUS_UPDATED',
    ],
  },
  
  preconditions: [
    { field: 'tebligat.tarafaTeslimTarihi', operator: 'isNotNull' },
    { field: 'tebligat.type', operator: 'eq', value: 'E_TEBLIGAT' },
  ],
  
  read: {
    source: 'database',
    table: 'Tebligat',
    fields: [
      { name: 'tarafaTeslimTarihi', type: 'date' },
      { name: 'okunduTarihi', type: 'date' },
      { name: 'recipientType', type: 'text' },
    ],
  },
  
  decisions: [
    {
      // Okundu tarihi varsa → O tarih tebliğ tarihi
      if: 'okunduTarihi != null',
      thenUpdate: {
        legalServiceDate: '${okunduTarihi}',
        legalServiceReason: 'E-tebligat okundu',
      },
    },
    {
      // Okunmadı ama teslim edildi → +5 gün
      if: 'okunduTarihi == null AND tarafaTeslimTarihi != null',
      thenUpdate: {
        legalServiceDate: '${tarafaTeslimTarihi + 5 days}',
        legalServiceReason: 'E-tebligat 5. gün kuralı (okunmadı)',
      },
    },
    {
      // Tebliğ tarihi hesaplandı → Kesinleşme adayı kontrolü
      if: 'legalServiceDate != null',
      thenEnqueue: ['DetectFinalizationCandidate'],
    },
  ],
  
  actions: [
    // Veritabanı güncelleme (kod tarafında yapılacak)
  ],
  
  postconditions: [
    'tebligat.legalServiceDate != null',
    'case.events += LEGAL_SERVICE_DATE_COMPUTED',
  ],
  
  proof: {
    store: ['tarafaTeslimTarihi', 'legalServiceDate', 'legalServiceReason'],
  },
  
  audit: {
    level: 'high',
    retainDays: 3650,
  },
  
  priority: 'HIGH',
  isActive: true,
};
