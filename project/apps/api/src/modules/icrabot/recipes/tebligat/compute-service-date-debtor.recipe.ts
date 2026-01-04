/**
 * COMPUTE SERVICE EFFECTIVE DATE DEBTOR RECIPE
 * 
 * Borçlu bazlı tebliğ tarihi hesaplama.
 * E-tebligat için: teslim + 5 gün kuralı.
 */

import { Recipe } from '../../types/recipe.types';

export const COMPUTE_SERVICE_DATE_DEBTOR: Recipe = {
  recipeId: 'ComputeServiceEffectiveDate_ETebligat_Debtor',
  version: 2,
  name: 'Tebliğ Tarihi Hesapla (Borçlu Bazlı)',
  description: 'E-tebligat için tebliğ edilmiş sayılma tarihini hesaplar (teslim + 5 gün).',

  scope: 'debtor',
  stageTags: ['TEBLIGAT'],
  
  trigger: {
    type: 'event',
    when: ['ETEBLIGAT_DELIVERED'],
  },

  preconditions: [
    'runtime.debtorScopeId != null',
    'case.eTebligat[runtime.debtorScopeId].deliveredDate != null',
  ],

  uyapNavPath: ['(internal)'],

  read: {
    fields: [
      'case.icraType',
      'case.eTebligat[runtime.debtorScopeId].deliveredDate',
    ],
  },

  decisions: [],

  actions: [
    {
      type: 'compute',
      formula: `
        // E-tebligat için 5 gün kuralı
        // "Posta kutusuna bırakıldığı günü takip eden 5. gün tebliğ edilmiş sayılır"
        const deemedDays = params.tebligat.eTebligatDeemedDays; // 5
        
        const deliveredDate = new Date(case.eTebligat[runtime.debtorScopeId].deliveredDate);
        const serviceEffectiveDate = new Date(deliveredDate);
        serviceEffectiveDate.setDate(serviceEffectiveDate.getDate() + deemedDays);
        
        // Borçlu için tebliğ tarihini kaydet
        case.debtor[runtime.debtorScopeId].serviceEffectiveDate = serviceEffectiveDate;
      `,
    },
  ],

  postconditions: ['case.events += SERVICE_EFFECTIVE_CANDIDATE(debtorId=runtime.debtorScopeId)'],

  proof: {
    store: [
      'timestamp',
      'serviceEffectiveDate',
      'runtime.debtorScopeId',
      'deliveredDate',
      'deemedDays',
    ],
  },

  audit: {
    level: 'controlled_write',
    retainDays: 365,
  },

  // DAG
  dependsOn: ['FetchPreparedETebligatlar_Debtor'],
  emits: ['SERVICE_EFFECTIVE_CANDIDATE'],
  guard: 'ETEBLIGAT_SNAPSHOT && debtor.eDeliveredDate != null',

  // Metadata
  priority: 'HIGH',
  requiresApproval: false,
  isActive: true,
};
