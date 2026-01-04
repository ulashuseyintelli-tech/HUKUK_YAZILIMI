import { Recipe } from '../../types/recipe.types';

/**
 * RUN ASSET QUERIES BATCH
 * 
 * Kesinleşme sonrası varlık sorgularını toplu çalıştırır.
 * 
 * Sorgular:
 * - SGK kaydı / işyeri
 * - Tapu (TAKBİS)
 * - Araç (araç/tedbir/taşıt bilgisi)
 * - Banka/hesap/menkul kıymet
 * 
 * Kitap referansı: UYAP kurumlar arası entegrasyonlar
 */
export const RUN_ASSET_QUERIES: Recipe = {
  recipeId: 'RunAssetQueriesBatch',
  version: 1,
  name: 'Varlık Sorguları',
  description: 'Borçlu varlık sorgularını toplu çalıştırır (SGK, Tapu, Araç, Banka)',
  
  stageTags: ['KESINLESME', 'VARLIK', 'HACIZ'],
  
  trigger: {
    type: 'event',
    when: [
      'event:CASE_FINALIZED',
      'event:ASSET_QUERY_REQUESTED',
      'schedule:WEEKLY',
    ],
  },
  
  preconditions: [
    { field: 'case.isFinalized', operator: 'eq', value: true },
    { field: 'case.workflowStage', operator: 'in', value: ['ENFORCEMENT', 'KESINLESME', 'VARLIK'] },
    { field: 'case.hasActiveDebtors', operator: 'eq', value: true },
  ],
  
  read: {
    source: 'database',
    table: 'CaseDebtor',
    fields: [
      { name: 'debtorId', type: 'text' },
      { name: 'debtorType', type: 'enum', enumValues: ['INDIVIDUAL', 'COMPANY', 'PUBLIC_INSTITUTION'] },
      { name: 'tckn', type: 'text' },
      { name: 'vkn', type: 'text' },
      { name: 'lastAssetQueryAt', type: 'date' },
    ],
  },
  
  decisions: [
    {
      // Gerçek kişi → SGK + Tapu + Araç + Banka
      if: 'debtorType == "INDIVIDUAL"',
      thenEnqueue: [
        'QuerySGK',
        'QueryTakbis',
        'QueryVehicle',
        'QueryBankAccounts',
      ],
    },
    {
      // Tüzel kişi → Ticaret Sicil + Tapu + Araç + Banka
      if: 'debtorType == "COMPANY"',
      thenEnqueue: [
        'QueryTradeRegistry',
        'QueryTakbis',
        'QueryVehicle',
        'QueryBankAccounts',
      ],
    },
    {
      // Varlık bulundu → Haciz talebi hazırla
      if: 'hasAssets == true',
      thenEnqueue: ['PrepareHacizRequests'],
    },
    {
      // Varlık bulunamadı → Aciz vesikası değerlendir
      if: 'hasAssets == false AND allQueriesCompleted == true',
      thenUpdate: {
        assetStatus: 'NO_ASSETS_FOUND',
        nextAction: 'EVALUATE_ACIZ',
      },
    },
  ],
  
  actions: [],
  
  postconditions: [
    'case.lastAssetQueryAt = now()',
    'case.events += ASSET_QUERIES_BATCH',
  ],
  
  proof: {
    store: ['queryTypes', 'queryResults', 'totalAssetsFound', 'queryTimestamp'],
  },
  
  audit: {
    level: 'high',
    retainDays: 3650,
  },
  
  // Varlık sorguları onay gerektirmez (okuma işlemi)
  requiresApproval: false,
  
  retry: {
    maxAttempts: 3,
    backoffMs: 3600000, // 1 saat
  },
  
  priority: 'MEDIUM',
  isActive: true,
};
