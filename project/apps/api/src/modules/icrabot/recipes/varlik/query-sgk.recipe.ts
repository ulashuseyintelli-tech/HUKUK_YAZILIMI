import { Recipe } from '../../types/recipe.types';

/**
 * QUERY SGK
 * 
 * SGK (Sosyal Güvenlik Kurumu) sorgusu.
 * Borçlunun çalışma durumu, işyeri bilgisi, emekli maaşı vb.
 */
export const QUERY_SGK: Recipe = {
  recipeId: 'QuerySGK',
  version: 1,
  name: 'SGK Sorgusu',
  description: 'Borçlunun SGK kayıtlarını sorgular (çalışma durumu, işyeri, emekli maaşı)',
  
  stageTags: ['KESINLESME', 'VARLIK', 'HACIZ'],
  
  trigger: {
    type: 'event',
    when: [
      'event:ASSET_QUERY_SGK_REQUESTED',
      'event:RUN_ASSET_QUERIES_BATCH',
    ],
  },
  
  preconditions: [
    { field: 'debtor.tckn', operator: 'isNotNull' },
    { field: 'debtor.type', operator: 'eq', value: 'INDIVIDUAL' },
    { field: 'case.isFinalized', operator: 'eq', value: true },
  ],
  
  uyapNavPath: {
    menu: ['Sorgular', 'SGK Sorguları', 'Sigortalı Hizmet Dökümü'],
    screenId: 'SGK_QUERY',
  },
  
  read: {
    source: 'uyap',
    fields: [
      { name: 'isCalisiyor', type: 'boolean' },
      { name: 'isyeriAdi', type: 'text' },
      { name: 'isyeriSgkNo', type: 'text' },
      { name: 'isyeriAdresi', type: 'text' },
      { name: 'isEmekli', type: 'boolean' },
      { name: 'emekliMaasi', type: 'number' },
      { name: 'sonCalismaBaslangic', type: 'date' },
      { name: 'toplamPrimGunu', type: 'number' },
    ],
  },
  
  decisions: [
    {
      // Çalışıyor → Maaş haczi için işyeri bilgisi kaydet
      if: 'isCalisiyor == true AND isyeriAdi != null',
      thenUpdate: {
        hasEmployment: true,
        employerName: '${isyeriAdi}',
        employerSgkNo: '${isyeriSgkNo}',
        employerAddress: '${isyeriAdresi}',
      },
      thenEnqueue: ['PrepareWageGarnishment'],
    },
    {
      // Emekli → Emekli maaşı haczi değerlendir
      if: 'isEmekli == true',
      thenUpdate: {
        hasPension: true,
        pensionAmount: '${emekliMaasi}',
      },
      thenEnqueue: ['PreparePensionGarnishment'],
    },
    {
      // Çalışmıyor ve emekli değil
      if: 'isCalisiyor == false AND isEmekli == false',
      thenUpdate: {
        sgkStatus: 'NO_ACTIVE_RECORD',
      },
    },
  ],
  
  actions: [
    { type: 'input', target: 'TCKN', value: '${debtor.tckn}' },
    { type: 'click', target: 'Sorgula' },
    { type: 'wait', timeout: 3000 },
  ],
  
  postconditions: [
    'debtor.lastSgkQueryAt = now()',
    'case.events += SGK_QUERY_COMPLETED',
  ],
  
  proof: {
    store: ['isCalisiyor', 'isyeriAdi', 'isEmekli', 'queryTimestamp'],
    screenshot: true,
  },
  
  audit: {
    level: 'high',
    retainDays: 3650,
  },
  
  retry: {
    maxAttempts: 3,
    backoffMs: 300000,
  },
  
  priority: 'MEDIUM',
  isActive: true,
};
