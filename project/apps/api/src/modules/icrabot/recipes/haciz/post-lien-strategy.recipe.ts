/**
 * POST-LIEN STRATEGY RECIPES v7
 * 
 * Haciz sonrası strateji belirleme, pasif haciz temizliği ve ön haciz tutarı tahmini.
 * recipes_v7_extensions.yaml'dan implement edilmiştir.
 */

import { Recipe } from '../../types/recipe.types';

/**
 * Haciz sonrası strateji belirleme
 */
export const DECIDE_POST_LIEN_STRATEGY_VEHICLE: Recipe = {
  recipeId: 'DecidePostLienStrategy_Vehicle',
  version: 7,
  name: 'Haciz Sonrası Strateji Belirle',
  description: 'Haciz koyulduktan sonra yakalama/satış/bekleme stratejisini belirler',
  
  scope: 'debtor',
  stageTags: ['HACIZ', 'TAHSILAT', 'SATIS'],
  
  trigger: {
    type: 'event',
    when: ['HACIZ_PLACED', 'LienSnapshot'],
  },
  
  preconditions: [
    'context.asset_type == vehicle',
    'context.asset_fingerprint != null',
    'facts.ValuationEstimate != null',
  ],
  
  uyapNavPath: ['(internal)'],
  
  read: {
    fields: [
      'facts.ValuationEstimate.value_mid',
      'facts.ValuationEstimate.confidence',
      'context.participation_risk',
      'context.our_rank',
      'expected_recovery.expected_net_mid',
      'case.claim_amount',
      'params.recovery.min_net_for_cost_actions',
    ],
  },
  
  decisions: [
    {
      if: 'context.post_lien_strategy == YAKALAMA_AND_SALE',
      then: {
        enqueue: ['RequestYakalamaAvansi_Communication', 'WaitForAdvancePayment'],
      },
    },
    {
      if: 'context.post_lien_strategy in [SALE_IF_NEEDED, YAKALAMA_AND_SALE]',
      then: {
        enqueue: ['ProposeSaleStart_Vehicle'],
      },
    },
    {
      if: 'context.post_lien_strategy == WAIT_OR_NEGOTIATE',
      then: {
        enqueue: ['RequireAttorneyDecision'],
      },
    },
  ],
  
  actions: [
    {
      type: 'compute',
      formula: `
        // Basit strateji seçici
        let strategy = 'MONITOR';
        
        const minNet = params.recovery.min_net_for_cost_actions || 5000;
        const expectedNet = expected_recovery?.expected_net_mid || 0;
        
        if (context.our_rank === 1 && expectedNet >= minNet) {
          strategy = 'YAKALAMA_AND_SALE';
        } else if (context.our_rank <= 2 && expectedNet >= minNet / 2) {
          strategy = 'SALE_IF_NEEDED';
        } else if (context.participation_risk === 'HIGH') {
          strategy = 'WAIT_OR_NEGOTIATE';
        }
        
        context.post_lien_strategy = strategy;
      `,
    },
  ],
  
  postconditions: [
    'context.post_lien_strategy != null',
  ],
  
  proof: {
    store: [
      'timestamp',
      'context.post_lien_strategy',
    ],
  },
  
  audit: {
    level: 'controlled_write',
  },
  
  priority: 'HIGH',
  requiresApproval: false,
  isActive: true,
  
  dependsOn: ['PlaceLien_Vehicle', 'AnalyzeIK100ParticipationRisk'],
  emits: ['POST_LIEN_STRATEGY_READY'],
  guard: 'HACIZ_PLACED || LienSnapshot',
};

/**
 * Satış başlatma önerisi
 */
export const PROPOSE_SALE_START_VEHICLE: Recipe = {
  recipeId: 'ProposeSaleStart_Vehicle',
  version: 7,
  name: 'Satış Başlatma Önerisi',
  description: 'Haciz sonrası satış başlatma önerisi oluşturur',
  
  scope: 'debtor',
  stageTags: ['SATIS', 'HACIZ'],
  
  trigger: {
    type: 'event',
    when: ['POST_LIEN_STRATEGY_READY'],
  },
  
  preconditions: [
    'context.asset_type == vehicle',
    'context.asset_fingerprint != null',
    'locks.LOCK_COST_ACTIONS == false',
  ],
  
  uyapNavPath: ['(internal)'],
  
  read: {
    fields: [
      'context.post_lien_strategy',
      'case.sale_policy',
    ],
  },
  
  actions: [
    {
      type: 'create_task',
      taskType: 'SALE_RECOMMENDED',
      payload: {
        asset_fingerprint: '{{context.asset_fingerprint}}',
        strategy: '{{context.post_lien_strategy}}',
        note: 'Satış başlatma önerisi (kontrollü)',
      },
    },
  ],
  
  postconditions: [
    'case.next_actions += SALE_RECOMMENDED',
  ],
  
  proof: {
    store: [
      'timestamp',
      'task_id',
    ],
  },
  
  audit: {
    level: 'controlled_write',
  },
  
  priority: 'MEDIUM',
  requiresApproval: false,
  isActive: true,
  
  dependsOn: ['DecidePostLienStrategy_Vehicle'],
  emits: ['SALE_RECOMMENDED'],
  guard: 'POST_LIEN_STRATEGY_READY',
};

/**
 * Pasif ön haciz tespiti (periyodik)
 */
export const DETECT_INACTIVE_PRIOR_LIENS_VEHICLE: Recipe = {
  recipeId: 'DetectInactivePriorLiens_Vehicle',
  version: 7,
  name: 'Pasif Ön Haciz Tespiti',
  description: 'Ön hacizlerin pasif olup olmadığını periyodik kontrol eder',
  
  scope: 'debtor',
  stageTags: ['VARLIK', 'HACIZ'],
  
  trigger: {
    type: 'schedule',
    when: ['EVERY_14_DAYS'],
  },
  
  preconditions: [
    'session.is_logged_in == true',
    'context.asset_type == vehicle',
    'context.asset_fingerprint != null',
  ],
  
  uyapNavPath: ['(Araç ekranı)', 'Araç Kısıt/Haciz/Takyidat Bilgileri'],
  
  read: {
    table: 'vehicle_lien_list',
    fields: ['creditor', 'lien_date', 'active_status', 'reference_no'],
  },
  
  decisions: [
    {
      if: 'any(vehicle_lien_list.active_status == inactive)',
      then: {
        enqueue: ['PruneInactiveLienFacts'],
      },
    },
  ],
  
  actions: [
    {
      type: 'open_asset',
      assetFingerprint: '{{context.asset_fingerprint}}',
    },
    {
      type: 'query',
      input: {
        section: 'liens_and_restrictions',
      },
    },
  ],
  
  postconditions: [
    'context.inactive_lien_scan_at = now()',
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
  
  priority: 'LOW',
  requiresApproval: false,
  isActive: true,
  
  emits: ['INACTIVE_LIENS_DETECTED'],
  guard: 'context.asset_fingerprint != null',
};

/**
 * Pasif haciz fact'lerini temizle
 */
export const PRUNE_INACTIVE_LIEN_FACTS: Recipe = {
  recipeId: 'PruneInactiveLienFacts',
  version: 7,
  name: 'Pasif Haciz Fact Temizliği',
  description: 'Pasif olarak tespit edilen hacizleri fact store\'da işaretler',
  
  stageTags: ['VARLIK', 'HACIZ'],
  
  trigger: {
    type: 'event',
    when: ['INACTIVE_LIENS_DETECTED'],
  },
  
  preconditions: ['true'],
  
  uyapNavPath: ['(internal)'],
  
  read: {
    fields: ['facts.LienSnapshot[*]'],
  },
  
  actions: [
    {
      type: 'compute',
      formula: `
        // inactive görünenleri işaretle (silme değil; audit için pasife çek)
        let inactiveCount = 0;
        for (const lien of liens) {
          if (lien.active_status === 'inactive') {
            lien._status = 'inactive_confirmed';
            inactiveCount++;
          }
        }
        context.inactive_count = inactiveCount;
      `,
    },
  ],
  
  postconditions: [
    'facts.LienSnapshot updated',
  ],
  
  proof: {
    store: [
      'timestamp',
      'inactive_count',
    ],
  },
  
  audit: {
    level: 'controlled_write',
  },
  
  priority: 'LOW',
  requiresApproval: false,
  isActive: true,
  
  dependsOn: ['DetectInactivePriorLiens_Vehicle'],
  emits: ['LIEN_FACTS_PRUNED'],
  guard: 'INACTIVE_LIENS_DETECTED',
};

/**
 * Ön haciz tutarı tahmini (heuristic)
 */
export const INFER_PRIOR_LIEN_AMOUNTS_HEURISTIC: Recipe = {
  recipeId: 'InferPriorLienAmounts_Heuristic',
  version: 7,
  name: 'Ön Haciz Tutarı Tahmini',
  description: 'Bilinmeyen ön haciz tutarlarını heuristic ile tahmin eder',
  
  scope: 'debtor',
  stageTags: ['VARLIK', 'HACIZ'],
  
  trigger: {
    type: 'event',
    when: ['LienSnapshot'],
  },
  
  preconditions: [
    'context.asset_type == vehicle',
    'facts.LienSnapshot != empty',
  ],
  
  uyapNavPath: ['(internal)'],
  
  read: {
    fields: [
      'facts.LienSnapshot[*].amount_claimed',
      'facts.LienSnapshot[*].creditor',
      'facts.LienSnapshot[*].lien_type',
      'facts.LienSnapshot[*].rank_order',
      'facts.ValuationEstimate.value_mid',
    ],
  },
  
  decisions: [
    {
      if: 'any(l.amount_claimed_estimate != null)',
      then: {
        enqueue: ['RefreshRiskAndRecovery'],
      },
    },
  ],
  
  actions: [
    {
      type: 'compute',
      formula: `
        // Tutar bilinmiyorsa kaba tahmin: değer mid'in %15-%35 bandı / sıra / haciz türüne göre
        const valueMid = facts.ValuationEstimate?.value_mid || 0;
        let estimatedCount = 0;
        
        for (const lien of liens) {
          if (lien.amount_claimed == null && valueMid > 0) {
            let base = valueMid * 0.25;
            
            // Sıra 3+ ise düşür
            if (lien.rank_order != null && lien.rank_order >= 3) {
              base *= 0.7;
            }
            
            // Rehin ise artır
            if (lien.lien_type === 'rehin') {
              base *= 1.2;
            }
            
            lien.amount_claimed_estimate = Math.round(base);
            lien.amount_claimed_estimate_conf = 0.35;
            estimatedCount++;
          }
        }
        
        context.estimated_amounts_count = estimatedCount;
      `,
    },
  ],
  
  postconditions: [
    'facts.LienSnapshot enriched',
  ],
  
  proof: {
    store: [
      'timestamp',
      'estimated_amounts_count',
    ],
  },
  
  audit: {
    level: 'controlled_write',
  },
  
  priority: 'MEDIUM',
  requiresApproval: false,
  isActive: true,
  
  emits: ['LIEN_AMOUNTS_ESTIMATED'],
  guard: 'LienSnapshot',
};

/**
 * Risk ve recovery yeniden hesaplama
 */
export const REFRESH_RISK_AND_RECOVERY: Recipe = {
  recipeId: 'RefreshRiskAndRecovery',
  version: 7,
  name: 'Risk ve Recovery Yenile',
  description: 'Ön haciz tutarları tahmin edildikten sonra risk ve recovery hesaplamalarını yeniler',
  
  stageTags: ['VARLIK', 'HACIZ'],
  
  trigger: {
    type: 'event',
    when: ['LIEN_AMOUNTS_ESTIMATED'],
  },
  
  preconditions: ['true'],
  
  uyapNavPath: ['(internal)'],
  
  read: {
    fields: [
      'facts.LienSnapshot[*]',
      'facts.ValuationEstimate',
    ],
  },
  
  actions: [
    {
      type: 'compute',
      formula: `
        // decision_rules_v4 içindeki RiskScoring/RecoverySimulator yeniden çalıştırılır
        emit('RECOMPUTE_RISK_AND_RECOVERY');
      `,
    },
  ],
  
  postconditions: [
    'risk/refreshed=true',
  ],
  
  proof: {
    store: [
      'timestamp',
    ],
  },
  
  audit: {
    level: 'controlled_write',
  },
  
  priority: 'MEDIUM',
  requiresApproval: false,
  isActive: true,
  
  dependsOn: ['InferPriorLienAmounts_Heuristic'],
  emits: ['RECOMPUTE_RISK_AND_RECOVERY'],
  guard: 'LIEN_AMOUNTS_ESTIMATED',
};

export default [
  DECIDE_POST_LIEN_STRATEGY_VEHICLE,
  PROPOSE_SALE_START_VEHICLE,
  DETECT_INACTIVE_PRIOR_LIENS_VEHICLE,
  PRUNE_INACTIVE_LIEN_FACTS,
  INFER_PRIOR_LIEN_AMOUNTS_HEURISTIC,
  REFRESH_RISK_AND_RECOVERY,
];
