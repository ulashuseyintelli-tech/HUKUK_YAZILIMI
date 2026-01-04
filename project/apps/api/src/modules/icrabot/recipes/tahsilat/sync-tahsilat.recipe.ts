import { Recipe } from '../../types/recipe.types';

/**
 * SYNC TAHSILAT
 * 
 * UYAP'tan tahsilat/reddiyat hareketlerini senkronize eder.
 */
export const SYNC_TAHSILAT: Recipe = {
  recipeId: 'SyncTahsilat',
  version: 1,
  name: 'Tahsilat Senkronizasyonu',
  description: 'UYAP tahsilat/reddiyat hareketlerini senkronize eder',
  
  stageTags: ['TAHSILAT', 'HACIZ'],
  
  trigger: {
    type: 'event',
    when: [
      'event:SAFAHAT_TAHSILAT_DETECTED',
      'event:TAHSILAT_SYNC_MANUAL',
      'schedule:DAILY',
    ],
  },
  
  preconditions: [
    { field: 'case.uyapDosyaNo', operator: 'isNotNull' },
    { field: 'case.status', operator: 'eq', value: 'ACTIVE' },
  ],
  
  uyapNavPath: {
    menu: ['Harç ve Kasa', 'Tahsilat/Reddiyat'],
    screenId: 'TAHSILAT_LIST',
  },
  
  read: {
    source: 'uyap',
    fields: [
      { name: 'islemTarihi', type: 'date' },
      { name: 'islemTuru', type: 'enum', enumValues: ['TAHSILAT', 'REDDIYAT'] },
      { name: 'tutar', type: 'number' },
      { name: 'makbuzNo', type: 'text' },
      { name: 'aciklama', type: 'text' },
      { name: 'odeyenKisi', type: 'text' },
    ],
  },
  
  decisions: [
    {
      // Yeni tahsilat tespit edildi → Kaydet
      if: 'newTahsilatCount > 0',
      thenUpdate: {
        lastTahsilatSyncAt: '${now()}',
        totalCollected: '${totalCollected + newTahsilatAmount}',
      },
    },
    {
      // Tam ödeme yapıldı → Dosya kapanışı değerlendir
      if: 'totalCollected >= totalDebt',
      thenUpdate: {
        workflowStage: 'FULL_PAYMENT',
        paymentStatus: 'FULLY_PAID',
      },
      thenEnqueue: ['EvaluateCaseClosure'],
    },
    {
      // Kısmi ödeme → Güncelle
      if: 'totalCollected > 0 AND totalCollected < totalDebt',
      thenUpdate: {
        workflowStage: 'PARTIAL_PAYMENT',
        paymentStatus: 'PARTIALLY_PAID',
        remainingDebt: '${totalDebt - totalCollected}',
      },
    },
  ],
  
  actions: [
    { type: 'query', target: 'Tahsilat Listele' },
    { type: 'wait', timeout: 2000 },
  ],
  
  postconditions: [
    'case.lastTahsilatSyncAt = now()',
    'case.events += TAHSILAT_SYNCED',
  ],
  
  proof: {
    store: ['newTahsilatCount', 'totalCollected', 'syncTimestamp'],
  },
  
  audit: {
    level: 'high',
    retainDays: 3650,
  },
  
  priority: 'HIGH',
  isActive: true,
};
