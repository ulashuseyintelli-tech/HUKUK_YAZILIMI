/**
 * MAZBATA SORGULA DEBTOR RECIPE
 * 
 * Borçlu bazlı mazbata sorgulama.
 * Tebliğ sayılma tarihi geldiyse ve mazbata yoksa tetiklenir.
 */

import { Recipe } from '../../types/recipe.types';

export const MAZBATA_SORGULA_DEBTOR: Recipe = {
  recipeId: 'MazbataSorgula_ETebligat_Debtor',
  version: 2,
  name: 'Mazbata Sorgula (Borçlu Bazlı)',
  description: 'E-tebligat için mazbata oluşumunu sorgular ve tetikler.',

  scope: 'debtor',
  stageTags: ['TEBLIGAT'],
  
  trigger: {
    type: 'schedule',
    when: ['EVERY_12_HOURS'],
  },

  preconditions: [
    'session.isLoggedIn == true',
    'runtime.debtorScopeId != null',
    'case.eTebligat[runtime.debtorScopeId].deliveredDate != null',
    'case.eTebligat[runtime.debtorScopeId].mazbataExists == false',
    'now() >= case.eTebligat[runtime.debtorScopeId].deliveredDate + params.tebligat.eTebligatDeemedDays',
  ],

  uyapNavPath: ['Tebligat', 'Hazırlanmış Elektronik Tebligatlar'],

  read: {
    fields: ['uyap.mazbataStatus'],
  },

  decisions: [],

  actions: [
    {
      type: 'select_row',
      table: 'e_tebligatlar',
      where: { muhataId: '{{runtime.debtorScopeId}}' },
    },
    {
      type: 'click',
      button: 'Mazbata Sorgula',
    },
  ],

  postconditions: ['case.events += MAZBATA_REQUESTED(debtorId=runtime.debtorScopeId)'],

  proof: {
    store: [
      'timestamp',
      'uyap.mazbataStatus',
      'runtime.debtorScopeId',
    ],
  },

  audit: {
    level: 'controlled_write',
    retainDays: 365,
  },

  // DAG
  dependsOn: ['ComputeServiceEffectiveDate_ETebligat_Debtor'],
  emits: ['MAZBATA_REQUESTED'],
  guard: 'SERVICE_EFFECTIVE_CANDIDATE && now() >= debtor.eDeliveredDate + params.tebligat.eTebligatDeemedDays && debtor.mazbataExists == false',

  // Metadata
  priority: 'NORMAL',
  requiresApproval: false,
  isActive: true,
};
