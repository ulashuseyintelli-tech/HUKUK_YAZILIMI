/**
 * SETTLEMENT FLOW RECIPES v10
 * 
 * Uzlaşma/taksit teklifi ve gerçek dağıtım hesaplama.
 * recipes_v10_extensions.yaml'dan implement edilmiştir.
 */

import { Recipe } from '../../types/recipe.types';

/**
 * Gerçek tahsilat dağıtımı hesaplama
 */
export const COMPUTE_REAL_DISTRIBUTION: Recipe = {
  recipeId: 'ComputeRealDistribution',
  version: 10,
  name: 'Gerçek Tahsilat Dağıtımı',
  description: 'Gerçekleşen tahsilat ve reddiyat verilerine göre dağıtım hesaplar',
  
  stageTags: ['TAHSILAT', 'SATIS'],
  
  trigger: {
    type: 'event',
    when: ['TAHSILAT_UPDATED', 'REDDIYAT_UPDATED', 'SALE_COMPLETED'],
  },
  
  preconditions: [
    'facts.LienSnapshot != empty',
  ],
  
  uyapNavPath: ['(internal)'],
  
  read: {
    fields: [
      'tahsilat_entries',
      'reddiyat_entries',
      'facts.LienSnapshot[*]',
      'case.claim_amount',
    ],
  },
  
  actions: [
    {
      type: 'compute',
      formula: `
        // tahsilat_real_distribution_v10.yaml motorunu çağır
        emit('RUN_REAL_DISTRIBUTION');
      `,
    },
  ],
  
  postconditions: [
    'case.events += REAL_DISTRIBUTION_COMPUTED',
  ],
  
  proof: {
    store: [
      'timestamp',
      'distribution.our_net_received',
      'distribution.remaining_claim',
    ],
  },
  
  audit: {
    level: 'controlled_write',
  },
  
  priority: 'HIGH',
  requiresApproval: false,
  isActive: true,
  
  emits: ['RUN_REAL_DISTRIBUTION', 'REAL_DISTRIBUTION_COMPUTED'],
  guard: 'TAHSILAT_UPDATED || REDDIYAT_UPDATED || SALE_COMPLETED',
};

/**
 * Anomali tespiti
 */
export const RUN_ANOMALY_DETECTION: Recipe = {
  recipeId: 'RunAnomalyDetection',
  version: 10,
  name: 'Anomali Tespiti',
  description: 'Safahat, tahsilat ve tebligat verilerinde anomali tarar',
  
  stageTags: ['TEBLIGAT', 'KESINLESME', 'VARLIK', 'HACIZ', 'TAHSILAT', 'SATIS'],
  
  trigger: {
    type: 'schedule',
    when: ['EVERY_24_HOURS'],
  },
  
  preconditions: [
    'params.anomaly.enabled == true',
  ],
  
  uyapNavPath: ['(internal)'],
  
  read: {
    fields: [
      'case.stage',
      'case.events',
      'distribution.net_in_case',
      'distribution.total_collected',
      'facts.LienSnapshot[*]',
      'case.service_effective_date',
      'case.mazbata_exists',
    ],
  },
  
  actions: [
    {
      type: 'compute',
      formula: `
        // anomaly_detection_v10.yaml motorunu çağır
        emit('RUN_ANOMALY_RULES');
      `,
    },
  ],
  
  postconditions: [
    'case.events += ANOMALY_SCAN',
  ],
  
  proof: {
    store: [
      'timestamp',
      'anomalies.count',
    ],
  },
  
  audit: {
    level: 'controlled_write',
  },
  
  priority: 'LOW',
  requiresApproval: false,
  isActive: true,
  
  emits: ['RUN_ANOMALY_RULES', 'ANOMALY_SCAN'],
  guard: 'params.anomaly.enabled == true',
};

/**
 * Uzlaşma teklifi önerisi
 */
export const PROPOSE_SETTLEMENT_OFFER: Recipe = {
  recipeId: 'ProposeSettlementOffer',
  version: 10,
  name: 'Uzlaşma Teklifi Önerisi',
  description: 'Davranış skoru yüksek borçlulara uzlaşma teklifi önerir',
  
  scope: 'debtor',
  stageTags: ['TAHSILAT', 'VARLIK', 'HACIZ'],
  
  trigger: {
    type: 'event',
    when: ['DEBTOR_BEHAVIOR_SCORE_UPDATED', 'REAL_DISTRIBUTION_COMPUTED'],
  },
  
  preconditions: [
    'params.settlement.enabled == true',
    'debtor.behavior_score >= params.settlement.min_behavior_score',
    'distribution.remaining_claim >= params.settlement.min_remaining_claim',
    'locks.LOCK_COST_ACTIONS == false',
  ],
  
  uyapNavPath: ['(internal)'],
  
  read: {
    fields: [
      'debtor.behavior_score',
      'distribution.remaining_claim',
    ],
  },
  
  actions: [
    {
      type: 'compute',
      formula: `
        // settlement_module_v10.yaml motorunu çağır
        emit('BUILD_SETTLEMENT_PLAN');
      `,
    },
    {
      type: 'create_task',
      taskType: 'SETTLEMENT_OFFER_RECOMMENDED',
      payload: {
        debtor_id: '{{runtime.debtor_scope_id}}',
        remaining_claim: '{{distribution.remaining_claim}}',
        installments: '{{settlement.plan.installments}}',
        installment_amount: '{{settlement.plan.installment_amount}}',
      },
    },
  ],
  
  postconditions: [
    'case.next_actions += SETTLEMENT_OFFER_RECOMMENDED',
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
  
  dependsOn: ['ComputeDebtorBehaviorScore', 'ComputeRealDistribution'],
  emits: ['BUILD_SETTLEMENT_PLAN', 'SETTLEMENT_OFFER_RECOMMENDED'],
  guard: 'DEBTOR_BEHAVIOR_SCORE_UPDATED || REAL_DISTRIBUTION_COMPUTED',
};

/**
 * Uzlaşma teklifi gönderme
 */
export const SEND_SETTLEMENT_OFFER: Recipe = {
  recipeId: 'SendSettlementOffer',
  version: 10,
  name: 'Uzlaşma Teklifi Gönder',
  description: 'Onaylanan uzlaşma teklifini borçluya gönderir',
  
  scope: 'debtor',
  stageTags: ['TAHSILAT', 'VARLIK', 'HACIZ'],
  
  trigger: {
    type: 'manual',
    when: ['USER_APPROVES_SETTLEMENT_OFFER'],
  },
  
  preconditions: [
    'task.SETTLEMENT_OFFER_RECOMMENDED exists',
    'client.contact.email != null',
  ],
  
  uyapNavPath: ['(communication)'],
  
  read: {
    fields: [
      'settlement.plan',
      'distribution.remaining_claim',
    ],
  },
  
  actions: [
    {
      type: 'notify',
      formula: `
        // İletişim gönder
        sendComm({
          templateId: 'SETTLEMENT_OFFER_TR',
          channel: 'email',
          variables: {
            case_no: case.uyap_dosya_no,
            debtor_name: debtor.name,
            remaining_claim: distribution.remaining_claim,
            installments: settlement.plan.installments,
            installment_amount: settlement.plan.installment_amount,
          }
        });
      `,
    },
  ],
  
  postconditions: [
    'case.events += SETTLEMENT_OFFER_SENT',
  ],
  
  proof: {
    store: [
      'timestamp',
      'comm_id',
    ],
  },
  
  audit: {
    level: 'controlled_write',
  },
  
  priority: 'HIGH',
  requiresApproval: true,
  isActive: true,
  
  dependsOn: ['ProposeSettlementOffer'],
  emits: ['SETTLEMENT_OFFER_SENT'],
  guard: 'USER_APPROVES_SETTLEMENT_OFFER',
};

export default [
  COMPUTE_REAL_DISTRIBUTION,
  RUN_ANOMALY_DETECTION,
  PROPOSE_SETTLEMENT_OFFER,
  SEND_SETTLEMENT_OFFER,
];
