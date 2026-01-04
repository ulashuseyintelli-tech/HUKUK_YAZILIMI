import { Recipe } from '../../types/recipe.types';

/**
 * PREPARE PENSION GARNISHMENT
 * 
 * Emekli maaşı haczi talebi hazırlar.
 * İnsan onayı gerektirir.
 * 
 * Not: Emekli maaşının 1/4'ü haczedilebilir (İİK 83).
 */
export const PREPARE_PENSION_GARNISHMENT: Recipe = {
  recipeId: 'PreparePensionGarnishment',
  version: 1,
  name: 'Emekli Maaşı Haczi Talebi Hazırla',
  description: 'Emekli maaşı haczi talebini hazırlar',
  
  stageTags: ['HACIZ'],
  
  trigger: {
    type: 'event',
    when: [
      'event:SGK_QUERY_COMPLETED',
      'event:PENSION_GARNISHMENT_MANUAL',
    ],
  },
  
  preconditions: [
    { field: 'case.isFinalized', operator: 'eq', value: true },
    { field: 'debtor.hasPension', operator: 'eq', value: true },
  ],
  
  read: {
    source: 'database',
    table: 'DebtorAsset',
    fields: [
      { name: 'emekliMaasi', type: 'number' },
      { name: 'emeklilikTuru', type: 'text' },
    ],
  },
  
  decisions: [
    {
      // Emekli maaşı var → Haciz hazırla
      if: 'emekliMaasi > 0',
      thenUpdate: {
        pensionGarnishmentReady: true,
        garnishmentRate: 0.25, // Maaşın 1/4'ü
        maxGarnishmentAmount: '${emekliMaasi * 0.25}',
      },
    },
  ],
  
  actions: [],
  
  postconditions: [
    'case.events += PENSION_GARNISHMENT_PREPARED',
  ],
  
  proof: {
    store: ['emekliMaasi', 'garnishmentRate', 'preparedAt'],
  },
  
  audit: {
    level: 'critical',
    retainDays: 3650,
  },
  
  requiresApproval: true,
  
  priority: 'HIGH',
  isActive: true,
};
