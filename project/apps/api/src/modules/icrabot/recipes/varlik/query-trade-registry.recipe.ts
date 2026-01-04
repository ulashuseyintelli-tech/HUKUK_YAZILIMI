import { Recipe } from '../../types/recipe.types';

/**
 * QUERY TRADE REGISTRY
 * 
 * Ticaret Sicil sorgusu.
 * Tüzel kişi borçlular için şirket bilgilerini sorgular.
 */
export const QUERY_TRADE_REGISTRY: Recipe = {
  recipeId: 'QueryTradeRegistry',
  version: 1,
  name: 'Ticaret Sicil Sorgusu',
  description: 'Tüzel kişi borçlunun ticaret sicil bilgilerini sorgular',
  
  stageTags: ['KESINLESME', 'VARLIK', 'HACIZ'],
  
  trigger: {
    type: 'event',
    when: [
      'event:ASSET_QUERY_TRADE_REGISTRY_REQUESTED',
      'event:RUN_ASSET_QUERIES_BATCH',
    ],
  },
  
  preconditions: [
    { field: 'debtor.vkn', operator: 'isNotNull' },
    { field: 'debtor.type', operator: 'eq', value: 'COMPANY' },
    { field: 'case.isFinalized', operator: 'eq', value: true },
  ],
  
  uyapNavPath: {
    menu: ['Sorgular', 'Ticaret Sicil Sorguları', 'Şirket Bilgisi'],
    screenId: 'TRADE_REGISTRY_QUERY',
  },
  
  read: {
    source: 'uyap',
    fields: [
      { name: 'sirketUnvani', type: 'text' },
      { name: 'sirketTuru', type: 'enum', enumValues: ['AS', 'LTD', 'KOLL', 'KOMAN', 'KOOP'] },
      { name: 'mersisSicilNo', type: 'text' },
      { name: 'ticaretSicilNo', type: 'text' },
      { name: 'merkez', type: 'text' },
      { name: 'sermaye', type: 'number' },
      { name: 'kurulus', type: 'date' },
      { name: 'faaliyet', type: 'boolean' },
      { name: 'tasfiyeHalinde', type: 'boolean' },
      { name: 'iflasHalinde', type: 'boolean' },
      { name: 'ortaklar', type: 'text' }, // JSON array
      { name: 'yetkililer', type: 'text' }, // JSON array
    ],
  },
  
  decisions: [
    {
      // Şirket aktif → Varlık sorgularına devam
      if: 'faaliyet == true AND tasfiyeHalinde == false AND iflasHalinde == false',
      thenUpdate: {
        companyStatus: 'ACTIVE',
        companyCapital: '${sermaye}',
      },
    },
    {
      // Tasfiye halinde → Uyarı
      if: 'tasfiyeHalinde == true',
      thenAction: 'CREATE_WARNING',
      thenUpdate: {
        warningType: 'COMPANY_IN_LIQUIDATION',
        warningMessage: 'Şirket tasfiye halinde',
        companyStatus: 'LIQUIDATION',
      },
    },
    {
      // İflas halinde → Kritik uyarı
      if: 'iflasHalinde == true',
      thenAction: 'CREATE_WARNING',
      thenUpdate: {
        warningType: 'COMPANY_BANKRUPT',
        warningMessage: 'Şirket iflas halinde - İflas masasına başvuru gerekli',
        companyStatus: 'BANKRUPT',
      },
    },
    {
      // Ortaklar tespit edildi → Kişisel sorumluluk değerlendir
      if: 'ortaklar != null AND sirketTuru == "KOLL"',
      thenEnqueue: ['EvaluatePartnerLiability'],
    },
  ],
  
  actions: [
    { type: 'input', target: 'VKN', value: '${debtor.vkn}' },
    { type: 'click', target: 'Sorgula' },
    { type: 'wait', timeout: 3000 },
  ],
  
  postconditions: [
    'debtor.lastTradeRegistryQueryAt = now()',
    'case.events += TRADE_REGISTRY_QUERY_COMPLETED',
  ],
  
  proof: {
    store: ['sirketUnvani', 'faaliyet', 'tasfiyeHalinde', 'iflasHalinde', 'queryTimestamp'],
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
