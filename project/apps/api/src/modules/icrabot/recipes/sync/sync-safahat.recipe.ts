import { Recipe } from '../../types/recipe.types';

/**
 * SYNC SAFAHAT TIMELINE
 * 
 * UYAP'tan dosya safahat (olay) bilgilerini senkronize eder.
 * 
 * Kitap referansı: Dosya arama / dosya ayrıntıları / evrak-safahat
 */
export const SYNC_SAFAHAT: Recipe = {
  recipeId: 'SyncSafahatTimeline',
  version: 1,
  name: 'Safahat Senkronizasyonu',
  description: 'UYAP dosya safahatını yerel veritabanıyla senkronize eder',
  
  stageTags: ['ACILIS', 'TEBLIGAT', 'KESINLESME', 'HACIZ', 'TAHSILAT', 'SATIS'],
  
  trigger: {
    type: 'schedule',
    when: [
      'schedule:EVERY_4_HOURS',
      'event:SYNC_REQUESTED',
      'event:CASE_OPENED',
    ],
  },
  
  preconditions: [
    { field: 'case.uyapDosyaNo', operator: 'isNotNull' },
    { field: 'case.status', operator: 'eq', value: 'ACTIVE' },
  ],
  
  uyapNavPath: {
    menu: ['Dosya', 'Dosya Ayrıntıları', 'Safahat'],
    screenId: 'SAFAHAT_LIST',
  },
  
  read: {
    source: 'uyap',
    table: 'safahat',
    fields: [
      { name: 'eventDate', type: 'date' },
      { name: 'eventType', type: 'text' },
      { name: 'eventDescription', type: 'text' },
      { name: 'documentNo', type: 'text' },
      { name: 'createdBy', type: 'text' },
    ],
  },
  
  decisions: [
    {
      // Yeni olay tespit edildi → Lifecycle'a ekle
      if: 'newEventsCount > 0',
      thenAction: 'SYNC_EVENTS',
      thenUpdate: {
        lastSyncAt: '${now()}',
        newEventsAdded: '${newEventsCount}',
      },
    },
    {
      // Tebligat olayı tespit edildi → Tebligat kontrolü tetikle
      if: 'hasNewTebligatEvent == true',
      thenEnqueue: ['FetchEtebligatStatuses'],
    },
    {
      // Haciz olayı tespit edildi → Haciz durumu güncelle
      if: 'hasNewHacizEvent == true',
      thenEnqueue: ['UpdateHacizStatus'],
    },
    {
      // Tahsilat olayı tespit edildi → Tahsilat kaydet
      if: 'hasNewTahsilatEvent == true',
      thenEnqueue: ['SyncTahsilat'],
    },
    {
      // Aşama değişikliği tespit edildi
      if: 'detectedStageChange != null',
      thenUpdate: {
        workflowStage: '${detectedStageChange}',
      },
    },
  ],
  
  actions: [
    { type: 'query', target: 'Safahat Listele' },
    { type: 'wait', timeout: 2000 },
  ],
  
  postconditions: [
    'case.lastSyncAt = now()',
    'case.events += SAFAHAT_SYNCED',
  ],
  
  proof: {
    store: ['syncTimestamp', 'newEventsCount', 'lastEventDate'],
  },
  
  audit: {
    level: 'medium',
    retainDays: 365,
  },
  
  retry: {
    maxAttempts: 3,
    backoffMs: 300000, // 5 dakika
  },
  
  priority: 'MEDIUM',
  isActive: true,
};
