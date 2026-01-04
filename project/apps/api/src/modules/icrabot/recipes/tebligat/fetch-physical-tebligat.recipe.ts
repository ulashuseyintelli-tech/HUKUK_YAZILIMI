import { Recipe } from '../../types/recipe.types';

/**
 * FETCH PHYSICAL TEBLIGAT STATUS
 * 
 * PTT fiziki tebligat durumunu sorgular.
 */
export const FETCH_PHYSICAL_TEBLIGAT: Recipe = {
  recipeId: 'FetchPhysicalTebligatStatus',
  version: 1,
  name: 'Fiziki Tebligat Durumu Sorgula',
  description: 'PTT fiziki tebligat durumunu sorgular',
  
  stageTags: ['TEBLIGAT'],
  
  trigger: {
    type: 'event',
    when: [
      'event:PHYSICAL_TEBLIGAT_SENT',
      'event:TEBLIGAT_CHECK_REQUESTED',
      'schedule:DAILY',
    ],
  },
  
  preconditions: [
    { field: 'tebligat.channel', operator: 'eq', value: 'PTT' },
    { field: 'tebligat.barcodeNo', operator: 'isNotNull' },
    { field: 'tebligat.status', operator: 'neq', value: 'TESLIM_EDILDI' },
  ],
  
  uyapNavPath: {
    menu: ['Tebligat', 'Tebligat Sorgulama'],
    screenId: 'PTT_TEBLIGAT_QUERY',
  },
  
  read: {
    source: 'uyap',
    fields: [
      { name: 'barkodNo', type: 'text' },
      { name: 'durum', type: 'enum', enumValues: ['YOLDA', 'DAGITIMDA', 'TESLIM_EDILDI', 'IADE', 'BILA'] },
      { name: 'teslimTarihi', type: 'date' },
      { name: 'teslimAlan', type: 'text' },
      { name: 'iadeSebebi', type: 'text' },
      { name: 'pttSonucSerhi', type: 'text' },
    ],
  },
  
  decisions: [
    {
      // Teslim edildi → Tebliğ tarihi hesapla
      if: 'durum == "TESLIM_EDILDI"',
      thenUpdate: {
        status: 'TESLIM_EDILDI',
        deliveredAt: '${teslimTarihi}',
        deliveredTo: '${teslimAlan}',
      },
      thenEnqueue: ['ComputeLegalServiceDate'],
    },
    {
      // İade geldi → Yeniden tebligat değerlendir
      if: 'durum == "IADE"',
      thenUpdate: {
        status: 'IADE',
        returnReason: '${iadeSebebi}',
      },
      thenEnqueue: ['EvaluateRetebligat'],
    },
    {
      // Bila (tebliğ edilemedi) → TK 21 değerlendir
      if: 'durum == "BILA"',
      thenUpdate: {
        status: 'BILA',
        bilaReason: '${pttSonucSerhi}',
      },
      thenEnqueue: ['EvaluateTK21'],
    },
  ],
  
  actions: [
    { type: 'input', target: 'BarkodNo', value: '${tebligat.barcodeNo}' },
    { type: 'click', target: 'Sorgula' },
    { type: 'wait', timeout: 3000 },
  ],
  
  postconditions: [
    'tebligat.lastQueryAt = now()',
    'case.events += PHYSICAL_TEBLIGAT_QUERIED',
  ],
  
  proof: {
    store: ['barkodNo', 'durum', 'teslimTarihi', 'queryTimestamp'],
    screenshot: true,
  },
  
  audit: {
    level: 'high',
    retainDays: 3650,
  },
  
  retry: {
    maxAttempts: 5,
    backoffMs: 86400000, // 24 saat
  },
  
  priority: 'HIGH',
  isActive: true,
};
