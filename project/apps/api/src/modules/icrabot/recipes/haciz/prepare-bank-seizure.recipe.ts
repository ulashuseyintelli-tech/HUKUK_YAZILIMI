import { Recipe } from '../../types/recipe.types';

/**
 * PREPARE BANK SEIZURE
 * 
 * İİK 89/1 Banka Haciz İhbarnamesi hazırlar.
 * İnsan onayı gerektirir.
 */
export const PREPARE_BANK_SEIZURE: Recipe = {
  recipeId: 'PrepareBankSeizure',
  version: 1,
  name: 'Banka Haciz İhbarnamesi Hazırla',
  description: 'İİK 89/1 banka haciz ihbarnamesi hazırlar',
  
  stageTags: ['HACIZ'],
  
  trigger: {
    type: 'event',
    when: [
      'event:BANK_QUERY_COMPLETED',
      'event:BANK_SEIZURE_MANUAL',
    ],
  },
  
  preconditions: [
    { field: 'case.isFinalized', operator: 'eq', value: true },
    { field: 'debtor.hasBankAccount', operator: 'eq', value: true },
  ],
  
  read: {
    source: 'database',
    table: 'DebtorAsset',
    fields: [
      { name: 'bankaAdi', type: 'text' },
      { name: 'subeAdi', type: 'text' },
      { name: 'iban', type: 'text' },
      { name: 'bakiye', type: 'number' },
    ],
  },
  
  decisions: [
    {
      // Bakiye alacaktan fazla → Tam haciz
      if: 'bakiye >= totalDebt',
      thenUpdate: {
        seizureType: 'FULL',
        seizureAmount: '${totalDebt}',
      },
    },
    {
      // Bakiye alacaktan az → Kısmi haciz
      if: 'bakiye < totalDebt AND bakiye > 0',
      thenUpdate: {
        seizureType: 'PARTIAL',
        seizureAmount: '${bakiye}',
      },
    },
  ],
  
  actions: [],
  
  postconditions: [
    'case.events += BANK_SEIZURE_PREPARED',
  ],
  
  proof: {
    store: ['bankaAdi', 'iban', 'seizureAmount', 'preparedAt'],
  },
  
  audit: {
    level: 'critical',
    retainDays: 3650,
  },
  
  requiresApproval: true,
  
  priority: 'HIGH',
  isActive: true,
};
