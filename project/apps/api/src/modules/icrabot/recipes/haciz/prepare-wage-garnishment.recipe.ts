import { Recipe } from '../../types/recipe.types';

/**
 * PREPARE WAGE GARNISHMENT
 * 
 * Maaş haczi (İİK 355) talebi hazırlar.
 * İnsan onayı gerektirir.
 */
export const PREPARE_WAGE_GARNISHMENT: Recipe = {
  recipeId: 'PrepareWageGarnishment',
  version: 1,
  name: 'Maaş Haczi Talebi Hazırla',
  description: 'İİK 355 maaş haczi talebini hazırlar',
  
  stageTags: ['HACIZ'],
  
  trigger: {
    type: 'event',
    when: [
      'event:SGK_QUERY_COMPLETED',
      'event:WAGE_GARNISHMENT_MANUAL',
    ],
  },
  
  preconditions: [
    { field: 'case.isFinalized', operator: 'eq', value: true },
    { field: 'debtor.hasEmployment', operator: 'eq', value: true },
  ],
  
  read: {
    source: 'database',
    table: 'DebtorAsset',
    fields: [
      { name: 'isyeriAdi', type: 'text' },
      { name: 'isyeriSgkNo', type: 'text' },
      { name: 'isyeriAdresi', type: 'text' },
    ],
  },
  
  decisions: [
    {
      // İşyeri bilgisi tam → Maaş haczi hazırla
      if: 'isyeriAdi != null AND isyeriAdresi != null',
      thenUpdate: {
        wageGarnishmentReady: true,
        garnishmentRate: 0.25, // Maaşın 1/4'ü (İİK 83)
      },
    },
    {
      // İşyeri adresi eksik → Adres araştırması
      if: 'isyeriAdi != null AND isyeriAdresi == null',
      thenEnqueue: ['ResearchEmployerAddress'],
    },
  ],
  
  actions: [],
  
  postconditions: [
    'case.events += WAGE_GARNISHMENT_PREPARED',
  ],
  
  proof: {
    store: ['isyeriAdi', 'isyeriSgkNo', 'garnishmentRate', 'preparedAt'],
  },
  
  audit: {
    level: 'critical',
    retainDays: 3650,
  },
  
  requiresApproval: true,
  
  priority: 'HIGH',
  isActive: true,
};
