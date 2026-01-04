/**
 * EXEMPTION RISK RECIPES v11
 * 
 * Haczedilmezlik riski ve MTS fork yönetimi.
 * recipes_v11_extensions.yaml'dan implement edilmiştir.
 */

import { Recipe } from '../../types/recipe.types';

/**
 * Haczedilmezlik riski hesaplama
 */
export const COMPUTE_EXEMPTION_RISK: Recipe = {
  recipeId: 'ComputeExemptionRisk',
  version: 11,
  name: 'Haczedilmezlik Riski',
  description: 'Varlık türü ve borçlu profiline göre haczedilmezlik riskini hesaplar',
  
  scope: 'debtor',
  stageTags: ['VARLIK', 'HACIZ'],
  
  trigger: {
    type: 'event',
    when: ['AssetFound', 'HACIZ_RECOMMENDED'],
  },
  
  preconditions: [
    'params.exemption.enabled == true',
  ],
  
  uyapNavPath: ['(internal)'],
  
  read: {
    fields: [
      'context.asset_type',
      'debtor.profile',
    ],
  },
  
  decisions: [
    {
      if: 'exemption_risk_score >= params.exemption.risk_threshold_high',
      then: {
        enqueue: ['RequireAttorneyDecision'],
      },
    },
  ],
  
  actions: [
    {
      type: 'compute',
      formula: `
        // haczedilmezlik_risk_v11.yaml motorunu çağır
        emit('RUN_EXEMPTION_RISK');
      `,
    },
  ],
  
  postconditions: [
    'context.exemption_risk_score != null',
  ],
  
  proof: {
    store: [
      'timestamp',
      'exemption_risk_score',
    ],
  },
  
  audit: {
    level: 'controlled_write',
  },
  
  priority: 'HIGH',
  requiresApproval: false,
  isActive: true,
  
  emits: ['RUN_EXEMPTION_RISK', 'EXEMPTION_RISK_COMPUTED'],
  guard: 'AssetFound || HACIZ_RECOMMENDED',
};

/**
 * MTS'den icraya fork
 */
export const FORK_CASE_FROM_MTS: Recipe = {
  recipeId: 'ForkCaseFromMTS',
  version: 11,
  name: 'MTS\'den İcraya Fork',
  description: 'MTS dosyasından icra dosyası oluşturur (case fork)',
  
  stageTags: ['ACILIS'],
  
  trigger: {
    type: 'event',
    when: ['MTS_TO_ICRA_CONVERSION'],
  },
  
  preconditions: [
    'params.fork.enabled == true',
    'case.icra_type == MTS',
  ],
  
  uyapNavPath: ['(internal)'],
  
  read: {
    fields: [
      'case.id',
      'case.fields',
    ],
  },
  
  actions: [
    {
      type: 'compute',
      formula: `
        // case_fork_mts_v11.yaml motorunu çağır
        emit('CREATE_CHILD_CASE');
      `,
    },
  ],
  
  postconditions: [
    'case.child_created=true',
  ],
  
  proof: {
    store: [
      'timestamp',
      'child_case_id',
    ],
  },
  
  audit: {
    level: 'controlled_write',
  },
  
  priority: 'HIGH',
  requiresApproval: false,
  isActive: true,
  
  emits: ['CREATE_CHILD_CASE', 'CASE_FORKED'],
  guard: 'MTS_TO_ICRA_CONVERSION',
};

export default [
  COMPUTE_EXEMPTION_RISK,
  FORK_CASE_FROM_MTS,
];
