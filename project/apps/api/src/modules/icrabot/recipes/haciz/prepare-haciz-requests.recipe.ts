import { Recipe } from '../../types/recipe.types';

/**
 * PREPARE HACIZ REQUESTS
 * 
 * Varlık sorguları sonucunda haciz taleplerini hazırlar.
 * İnsan onayı gerektirir (yazma işlemi).
 */
export const PREPARE_HACIZ_REQUESTS: Recipe = {
  recipeId: 'PrepareHacizRequests',
  version: 1,
  name: 'Haciz Talepleri Hazırla',
  description: 'Tespit edilen varlıklar için haciz taleplerini hazırlar',
  
  stageTags: ['HACIZ'],
  
  trigger: {
    type: 'event',
    when: [
      'event:ASSET_QUERIES_COMPLETED',
      'event:HACIZ_REQUEST_MANUAL',
    ],
  },
  
  preconditions: [
    { field: 'case.isFinalized', operator: 'eq', value: true },
    { field: 'case.hasAssets', operator: 'eq', value: true },
    { field: 'case.workflowStage', operator: 'in', value: ['ENFORCEMENT', 'KESINLESME', 'VARLIK'] },
  ],
  
  read: {
    source: 'database',
    table: 'DebtorAsset',
    fields: [
      { name: 'assetType', type: 'enum', enumValues: ['VEHICLE', 'REAL_ESTATE', 'BANK_ACCOUNT', 'WAGE', 'PENSION'] },
      { name: 'assetDetails', type: 'text' },
      { name: 'estimatedValue', type: 'number' },
      { name: 'hasRestriction', type: 'boolean' },
    ],
  },
  
  decisions: [
    {
      // Banka hesabı var → 89/1 haciz ihbarnamesi
      if: 'hasBankAccount == true',
      thenEnqueue: ['PrepareBankSeizure'],
    },
    {
      // Araç var → Araç haczi
      if: 'hasVehicle == true',
      thenEnqueue: ['PrepareVehicleSeizure'],
    },
    {
      // Taşınmaz var → Taşınmaz haczi
      if: 'hasRealEstate == true',
      thenEnqueue: ['PrepareRealEstateSeizure'],
    },
    {
      // Maaş var → Maaş haczi
      if: 'hasEmployment == true',
      thenEnqueue: ['PrepareWageGarnishment'],
    },
    {
      // Emekli maaşı var → Emekli maaşı haczi
      if: 'hasPension == true',
      thenEnqueue: ['PreparePensionGarnishment'],
    },
  ],
  
  actions: [],
  
  postconditions: [
    'case.hacizRequestsPrepared = true',
    'case.events += HACIZ_REQUESTS_PREPARED',
  ],
  
  proof: {
    store: ['assetTypes', 'requestCount', 'preparedAt'],
  },
  
  audit: {
    level: 'high',
    retainDays: 3650,
  },
  
  requiresApproval: true, // İnsan onayı gerekli
  
  priority: 'HIGH',
  isActive: true,
};
