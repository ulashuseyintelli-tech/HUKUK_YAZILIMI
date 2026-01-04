import { Recipe } from '../../types/recipe.types';

/**
 * PREPARE REAL ESTATE SEIZURE
 * 
 * Taşınmaz haczi talebi hazırlar.
 * İnsan onayı gerektirir.
 */
export const PREPARE_REAL_ESTATE_SEIZURE: Recipe = {
  recipeId: 'PrepareRealEstateSeizure',
  version: 1,
  name: 'Taşınmaz Haczi Talebi Hazırla',
  description: 'Taşınmaz (gayrimenkul) haczi talebini hazırlar',
  
  stageTags: ['HACIZ'],
  
  trigger: {
    type: 'event',
    when: [
      'event:TAKBIS_QUERY_COMPLETED',
      'event:REAL_ESTATE_SEIZURE_MANUAL',
    ],
  },
  
  preconditions: [
    { field: 'case.isFinalized', operator: 'eq', value: true },
    { field: 'debtor.hasRealEstate', operator: 'eq', value: true },
  ],
  
  read: {
    source: 'database',
    table: 'DebtorAsset',
    fields: [
      { name: 'il', type: 'text' },
      { name: 'ilce', type: 'text' },
      { name: 'mahalle', type: 'text' },
      { name: 'ada', type: 'text' },
      { name: 'parsel', type: 'text' },
      { name: 'nitelik', type: 'text' },
      { name: 'hissePay', type: 'text' },
      { name: 'takyidatVar', type: 'boolean' },
    ],
  },
  
  decisions: [
    {
      // Tam mülkiyet → Haciz talebi
      if: 'hissePay == "TAM" AND takyidatVar == false',
      thenUpdate: {
        realEstateSeizureReady: true,
        seizureType: 'FULL_OWNERSHIP',
      },
    },
    {
      // Hisseli mülkiyet → Hisse haczi
      if: 'hissePay != "TAM"',
      thenUpdate: {
        realEstateSeizureReady: true,
        seizureType: 'PARTIAL_OWNERSHIP',
      },
    },
    {
      // Takyidat var → Uyarı
      if: 'takyidatVar == true',
      thenAction: 'CREATE_WARNING',
      thenUpdate: {
        warningType: 'REAL_ESTATE_HAS_ENCUMBRANCE',
      },
    },
  ],
  
  actions: [],
  
  postconditions: [
    'case.events += REAL_ESTATE_SEIZURE_PREPARED',
  ],
  
  proof: {
    store: ['il', 'ilce', 'ada', 'parsel', 'preparedAt'],
  },
  
  audit: {
    level: 'critical',
    retainDays: 3650,
  },
  
  requiresApproval: true,
  
  priority: 'HIGH',
  isActive: true,
};
