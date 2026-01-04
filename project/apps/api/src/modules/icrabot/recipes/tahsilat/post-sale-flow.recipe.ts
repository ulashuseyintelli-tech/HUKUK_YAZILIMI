/**
 * POST-SALE FLOW RECIPES v9
 * 
 * Satış sonrası akış, tahsilat dağıtım simülasyonu ve borçlu davranış skoru.
 * recipes_v9_extensions.yaml'dan implement edilmiştir.
 */

import { Recipe } from '../../types/recipe.types';

/**
 * Satış tamamlanma takibi
 */
export const MONITOR_SALE_TO_COMPLETION: Recipe = {
  recipeId: 'MonitorSaleToCompletion',
  version: 9,
  name: 'Satış Tamamlanma Takibi',
  description: 'Başlatılan satışın tamamlanmasını periyodik olarak takip eder',
  
  stageTags: ['SATIS'],
  
  trigger: {
    type: 'schedule',
    when: ['EVERY_24_HOURS'],
  },
  
  preconditions: [
    'session.is_logged_in == true',
    'case.events.contains(SALE_STARTED)',
  ],
  
  uyapNavPath: ['Haciz & Mal & Satış İşlemleri', 'İhale İşlemleri'],
  
  read: {
    table: 'sale_status',
    fields: ['ihale_tarihi', 'durum', 'sonuc', 'aciklama', 'sale_price'],
  },
  
  decisions: [
    {
      if: 'any(durum == SONUCLANDI)',
      then: {
        emit: 'SALE_COMPLETED',
      },
    },
  ],
  
  actions: [
    {
      type: 'query',
      input: {
        dosya_no: '{{case.uyap_dosya_no}}',
      },
    },
  ],
  
  postconditions: [
    'case.events += SALE_STATUS_SNAPSHOT',
  ],
  
  proof: {
    store: [
      'timestamp',
      'snapshot_hash',
    ],
  },
  
  audit: {
    level: 'read_only',
  },
  
  priority: 'MEDIUM',
  requiresApproval: false,
  isActive: true,
  
  dependsOn: ['StartSale_Vehicle'],
  emits: ['SALE_COMPLETED', 'SALE_STATUS_SNAPSHOT'],
  guard: 'case.events.contains(SALE_STARTED)',
};

/**
 * Satış sonrası tahsilat dağıtım simülasyonu
 */
export const SIMULATE_TAHSILAT_DISTRIBUTION_AFTER_SALE: Recipe = {
  recipeId: 'SimulateTahsilatDistributionAfterSale',
  version: 9,
  name: 'Tahsilat Dağıtım Simülasyonu',
  description: 'Satış sonrası tahsilatın ön hacizlere göre nasıl dağılacağını simüle eder',
  
  stageTags: ['SATIS', 'TAHSILAT'],
  
  trigger: {
    type: 'event',
    when: ['SALE_COMPLETED'],
  },
  
  preconditions: [
    'facts.LienSnapshot != empty',
    'facts.ValuationEstimate != null',
  ],
  
  uyapNavPath: ['(internal)'],
  
  read: {
    fields: [
      'sale.sale_price',
      'params.recovery.cost_budgets.satis_avansi',
      'facts.LienSnapshot[*]',
      'case.claim_amount',
    ],
  },
  
  decisions: [
    {
      if: 'distribution.our_expected_recovery < params.recovery.min_net_for_cost_actions / 2',
      then: {
        enqueue: ['RequireAttorneyDecision'],
      },
    },
  ],
  
  actions: [
    {
      type: 'compute',
      formula: `
        // tahsilat_distribution_v9.yaml motorunu çağır
        emit('RUN_DISTRIBUTION_SIMULATION');
      `,
    },
  ],
  
  postconditions: [
    'case.events += DISTRIBUTION_SIMULATED',
  ],
  
  proof: {
    store: [
      'timestamp',
      'distribution.our_expected_recovery',
    ],
  },
  
  audit: {
    level: 'controlled_write',
  },
  
  priority: 'HIGH',
  requiresApproval: false,
  isActive: true,
  
  dependsOn: ['MonitorSaleToCompletion'],
  emits: ['RUN_DISTRIBUTION_SIMULATION', 'DISTRIBUTION_SIMULATED'],
  guard: 'SALE_COMPLETED',
};

/**
 * Satış sonrası tahsilat takibi
 */
export const MONITOR_TAHSILAT_AFTER_SALE: Recipe = {
  recipeId: 'MonitorTahsilatAfterSale',
  version: 9,
  name: 'Satış Sonrası Tahsilat Takibi',
  description: 'Satış tamamlandıktan sonra tahsilat hareketlerini takip eder',
  
  stageTags: ['TAHSILAT'],
  
  trigger: {
    type: 'schedule',
    when: ['EVERY_24_HOURS'],
  },
  
  preconditions: [
    'session.is_logged_in == true',
    'case.events.contains(SALE_COMPLETED)',
  ],
  
  uyapNavPath: ['Harç ve Kasa İşlemleri', 'Tahsilat'],
  
  read: {
    table: 'tahsilat',
    fields: ['tarih', 'tutar', 'makbuz_no', 'aciklama'],
  },
  
  decisions: [
    {
      if: 'delta_count > 0',
      then: {
        emit: 'TAHSILAT_UPDATED',
      },
    },
  ],
  
  actions: [
    {
      type: 'query',
      input: {
        dosya_no: '{{case.uyap_dosya_no}}',
      },
    },
  ],
  
  postconditions: [
    'case.events += TAHSILAT_DELTA',
  ],
  
  proof: {
    store: [
      'timestamp',
      'delta_count',
    ],
  },
  
  audit: {
    level: 'read_only',
  },
  
  priority: 'MEDIUM',
  requiresApproval: false,
  isActive: true,
  
  dependsOn: ['MonitorSaleToCompletion'],
  emits: ['TAHSILAT_UPDATED', 'TAHSILAT_DELTA'],
  guard: 'case.events.contains(SALE_COMPLETED)',
};

/**
 * Borçlu davranış skoru hesaplama
 */
export const COMPUTE_DEBTOR_BEHAVIOR_SCORE: Recipe = {
  recipeId: 'ComputeDebtorBehaviorScore',
  version: 9,
  name: 'Borçlu Davranış Skoru',
  description: 'Borçlunun ödeme olasılığını ve uyumunu değerlendiren skor hesaplar',
  
  scope: 'debtor',
  stageTags: ['TEBLIGAT', 'VARLIK', 'HACIZ', 'TAHSILAT', 'SATIS'],
  
  trigger: {
    type: 'schedule',
    when: ['EVERY_7_DAYS'],
  },
  
  preconditions: [
    'runtime.debtor_scope_id != null',
  ],
  
  uyapNavPath: ['(internal)'],
  
  read: {
    fields: [
      'debtor.signals',
      'facts.AssetFound',
      'facts.ValuationEstimate',
      'facts.LienSnapshot',
      'case.events',
    ],
  },
  
  actions: [
    {
      type: 'compute',
      formula: `
        // debtor_behavior_score_v9.yaml motorunu çağır
        emit('RUN_DEBTOR_BEHAVIOR_SCORE');
      `,
    },
  ],
  
  postconditions: [
    'debtor.behavior_score != null',
  ],
  
  proof: {
    store: [
      'timestamp',
      'runtime.debtor_scope_id',
      'debtor.behavior_score',
    ],
  },
  
  audit: {
    level: 'controlled_write',
  },
  
  priority: 'LOW',
  requiresApproval: false,
  isActive: true,
  
  emits: ['RUN_DEBTOR_BEHAVIOR_SCORE', 'DEBTOR_BEHAVIOR_SCORE_COMPUTED'],
  guard: 'runtime.debtor_scope_id != null',
};

export default [
  MONITOR_SALE_TO_COMPLETION,
  SIMULATE_TAHSILAT_DISTRIBUTION_AFTER_SALE,
  MONITOR_TAHSILAT_AFTER_SALE,
  COMPUTE_DEBTOR_BEHAVIOR_SCORE,
];
