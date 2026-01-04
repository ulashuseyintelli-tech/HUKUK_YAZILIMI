/**
 * PLACE LIEN VEHICLE RECIPES v6
 * 
 * Araç haciz koyma ve ilgili workflow'lar.
 * recipes_v6_extensions.yaml'dan implement edilmiştir.
 */

import { Recipe } from '../../types/recipe.types';

/**
 * Haciz sırası hesaplama
 */
export const COMPUTE_OUR_LIEN_RANK_VEHICLE: Recipe = {
  recipeId: 'ComputeOurLienRank_Vehicle',
  version: 6,
  name: 'Araç Haciz Sırası Hesapla',
  description: 'Araç üzerindeki mevcut hacizlere göre bizim sıramızı hesaplar',
  
  scope: 'debtor',
  stageTags: ['VARLIK', 'HACIZ'],
  
  trigger: {
    type: 'event',
    when: ['LienSnapshot', 'AssetFound'],
  },
  
  preconditions: [
    'context.asset_type == vehicle',
    'context.asset_fingerprint != null',
  ],
  
  uyapNavPath: ['(internal)'],
  
  read: {
    fields: [
      'facts.LienSnapshot[*].rank_order',
      'facts.LienSnapshot[*].active_status',
      'facts.LienSnapshot[*].lien_type',
    ],
  },
  
  actions: [
    {
      type: 'compute',
      formula: `
        // Aktif haciz/rehin/takyidat listesi
        const activeLiens = liens.filter(l => 
          l.active_status === 'active' || l.active_status === 'unknown'
        );
        
        // Rank bilgisi olan en yüksek sıra
        const knownRanks = activeLiens
          .filter(l => l.rank_order != null)
          .map(l => l.rank_order);
        
        const maxRank = knownRanks.length > 0 ? Math.max(...knownRanks) : null;
        
        let ourRank: number;
        let rankConfidence: number;
        
        if (maxRank === null) {
          // Rank bilgisi yoksa sayıya göre tahmin
          ourRank = activeLiens.length + 1;
          rankConfidence = 0.5;
        } else {
          // Rank bilgisi varsa bir sonraki sıra
          ourRank = maxRank + 1;
          rankConfidence = 0.8;
        }
        
        context.our_rank = ourRank;
        context.rank_confidence = rankConfidence;
        context.active_prior_liens_count = activeLiens.length;
      `,
    },
  ],
  
  postconditions: [
    'context.our_rank != null',
    'emit:ContextUpdated(our_rank)',
  ],
  
  proof: {
    store: [
      'timestamp',
      'context.our_rank',
      'context.rank_confidence',
      'context.active_prior_liens_count',
    ],
  },
  
  audit: {
    level: 'controlled_write',
  },
  
  priority: 'HIGH',
  requiresApproval: false,
  isActive: true,
  
  dependsOn: ['FetchPriorLiens_Vehicle'],
  emits: ['ContextUpdated'],
  guard: 'LienSnapshot || AssetFound',
};

/**
 * Ön hacizlerin aktiflik kontrolü (periyodik)
 */
export const CHECK_PRIOR_LIENS_ACTIVE_VEHICLE: Recipe = {
  recipeId: 'CheckPriorLiensActive_Vehicle',
  version: 6,
  name: 'Ön Haciz Aktiflik Kontrolü',
  description: 'Ön hacizlerin hala aktif olup olmadığını periyodik kontrol eder',
  
  scope: 'debtor',
  stageTags: ['VARLIK', 'HACIZ'],
  
  trigger: {
    type: 'schedule',
    when: ['EVERY_7_DAYS'],
  },
  
  preconditions: [
    'session.is_logged_in == true',
    'context.asset_type == vehicle',
    'context.asset_fingerprint != null',
    'facts.LienSnapshot != empty',
  ],
  
  uyapNavPath: ['(Araç ekranı)', 'Araç Kısıt/Haciz/Takyidat Bilgileri'],
  
  read: {
    table: 'vehicle_lien_list',
    fields: ['creditor', 'lien_date', 'active_status', 'reference_no'],
  },
  
  actions: [
    {
      type: 'query',
      input: {
        asset_fingerprint: '{{context.asset_fingerprint}}',
        section: 'liens_and_restrictions',
      },
    },
  ],
  
  postconditions: [
    'emit:LienSnapshot delta',
    'context.prior_liens_activity_checked = true',
    'context.prior_liens_activity_checked_at = now()',
  ],
  
  proof: {
    store: [
      'timestamp',
      'snapshot_hash',
      'context.asset_fingerprint',
      'delta_count',
    ],
  },
  
  audit: {
    level: 'read_only',
  },
  
  priority: 'LOW',
  requiresApproval: false,
  isActive: true,
  
  emits: ['LienSnapshot'],
  guard: 'facts.LienSnapshot != empty',
};

/**
 * İİK 100 İştirak Riski Analizi
 */
export const ANALYZE_IK100_PARTICIPATION_RISK: Recipe = {
  recipeId: 'AnalyzeIK100ParticipationRisk',
  version: 6,
  name: 'İİK 100 İştirak Riski Analizi',
  description: 'Ön hacizler ve değerleme bilgisine göre iştirak riskini analiz eder',
  
  scope: 'debtor',
  stageTags: ['VARLIK', 'HACIZ'],
  
  trigger: {
    type: 'event',
    when: ['ContextUpdated(our_rank)', 'LienSnapshot', 'ValuationEstimate'],
  },
  
  preconditions: [
    'context.asset_type == vehicle',
    'context.our_rank != null',
    'facts.ValuationEstimate != null',
  ],
  
  uyapNavPath: ['(internal)'],
  
  read: {
    fields: [
      'context.our_rank',
      'context.active_prior_liens_count',
      'facts.LienSnapshot[*].amount_claimed',
      'facts.LienSnapshot[*].active_status',
      'facts.ValuationEstimate.value_mid',
      'facts.ValuationEstimate.confidence',
    ],
  },
  
  decisions: [
    {
      if: 'context.participation_risk == HIGH',
      then: {
        set_flag: 'locks.LOCK_COST_ACTIONS=true',
        enqueue: ['RequireAttorneyDecision'],
      },
    },
  ],
  
  actions: [
    {
      type: 'compute',
      formula: `
        // Bilinmeyen tutarlar
        const unknownAmounts = liens.filter(l => 
          l.amount_claimed == null && 
          (l.active_status === 'active' || l.active_status === 'unknown')
        ).length;
        
        // Bilinmeyen aktivite durumları
        const unknownActivity = liens.filter(l => 
          l.active_status === 'unknown'
        ).length;
        
        // Bilinen ön alacak toplamı
        const priorClaimsEstimate = liens
          .filter(l => l.amount_claimed != null && 
            (l.active_status === 'active' || l.active_status === 'unknown'))
          .reduce((sum, l) => sum + l.amount_claimed, 0);
        
        // Risk hesaplama
        let risk = 'LOW';
        
        // 4. sıra ve sonrası yüksek risk
        if (context.our_rank >= 4) {
          risk = 'HIGH';
        }
        
        // Bilinmeyen tutarlar varsa orta risk
        if (unknownAmounts > 0 || unknownActivity > 0) {
          risk = risk === 'HIGH' ? 'HIGH' : 'MED';
        }
        
        // Ön alacaklar değerin %70'ini aşıyorsa yüksek risk
        if (priorClaimsEstimate > facts.ValuationEstimate.value_mid * 0.7) {
          risk = 'HIGH';
        }
        
        context.participation_risk = risk;
        context.prior_claims_estimate = priorClaimsEstimate;
        context.unknown_amounts_count = unknownAmounts;
        context.unknown_activity_count = unknownActivity;
      `,
    },
  ],
  
  postconditions: [
    'context.participation_risk in [LOW, MED, HIGH]',
  ],
  
  proof: {
    store: [
      'timestamp',
      'context.participation_risk',
      'context.prior_claims_estimate',
      'context.unknown_amounts_count',
      'context.unknown_activity_count',
    ],
  },
  
  audit: {
    level: 'controlled_write',
  },
  
  priority: 'HIGH',
  requiresApproval: false,
  isActive: true,
  
  dependsOn: ['ComputeOurLienRank_Vehicle', 'AIValuation_Vehicle'],
  emits: ['ParticipationRiskAssessed'],
  guard: 'ContextUpdated(our_rank) && ValuationEstimate',
};

/**
 * Araç Haciz Koyma (Yüksek Etkili)
 */
export const PLACE_LIEN_VEHICLE: Recipe = {
  recipeId: 'PlaceLien_Vehicle',
  version: 6,
  name: 'Araç Haciz Koy',
  description: 'UYAP üzerinden araç haczi koyar (yüksek etkili işlem)',
  
  scope: 'debtor',
  stageTags: ['HACIZ'],
  
  trigger: {
    type: 'manual',
    when: ['USER_APPROVES_PLACE_LIEN'],
  },
  
  preconditions: [
    'session.is_logged_in == true',
    'gates.GATE_PLACE_LIEN == true',
    'context.asset_type == vehicle',
    'context.asset_fingerprint != null',
    'case.isFinalized == true',
    'case.poaValid == true',
  ],
  
  uyapNavPath: ['(Araç ekranı)', 'Araç Haciz Ekle'],
  
  read: {
    fields: [
      'uyap.form_fields_ready',
      'case.uyap_dosya_no',
      'case.claim_amount',
      'case.creditor_name',
    ],
  },
  
  actions: [
    {
      type: 'compute',
      formula: `
        // Form alanlarını hazırla
        formData = {
          dosya_no: case.uyap_dosya_no,
          alacak_miktari: case.claim_amount,
          alacakli: case.creditor_name,
        };
      `,
    },
  ],
  
  postconditions: [
    'case.events += HACIZ_PLACED(asset_fingerprint=context.asset_fingerprint)',
    'emit:LienSnapshot (our lien)',
  ],
  
  proof: {
    store: [
      'timestamp',
      'context.asset_fingerprint',
      'uyap.confirmation_ref',
      'formData',
    ],
  },
  
  audit: {
    level: 'high_impact_write',
    retainDays: 3650,
    includeScreenshotOnError: true,
  },
  
  retry: {
    maxAttempts: 1, // Yüksek etkili işlem, retry yok
    backoffSeconds: [],
  },
  
  priority: 'CRITICAL',
  requiresApproval: true, // Manuel onay gerekli
  isActive: true,
  
  dependsOn: ['ComputeOurLienRank_Vehicle', 'AnalyzeIK100ParticipationRisk'],
  emits: ['HACIZ_PLACED', 'LienSnapshot'],
  guard: 'gates.GATE_PLACE_LIEN == true && USER_APPROVES_PLACE_LIEN',
};

/**
 * Yakalama Avansı Akış Kararı
 */
export const DECIDE_YAKALAMA_AVANSI_FLOW: Recipe = {
  recipeId: 'DecideYakalamaAvansiFlow',
  version: 6,
  name: 'Yakalama Avansı Akış Kararı',
  description: 'Haciz sırasına göre yakalama avansı veya iştirak riski akışına yönlendirir',
  
  scope: 'debtor',
  stageTags: ['HACIZ'],
  
  trigger: {
    type: 'event',
    when: ['HACIZ_RECOMMENDED', 'ContextUpdated(our_rank)'],
  },
  
  preconditions: [
    'context.our_rank != null',
    'context.asset_type == vehicle',
  ],
  
  uyapNavPath: ['(internal)'],
  
  read: {
    fields: [
      'context.our_rank',
      'locks.LOCK_COST_ACTIONS',
    ],
  },
  
  decisions: [
    // 1. sıradaysak ve masraf kilidi yoksa avans akışı
    {
      if: 'context.our_rank == 1 && locks.LOCK_COST_ACTIONS == false',
      then: {
        enqueue: ['RequestYakalamaAvansi_Communication', 'WaitForAdvancePayment'],
      },
    },
    // 1. sıra değilsek iştirak riski analizi
    {
      if: 'context.our_rank > 1',
      then: {
        enqueue: ['AnalyzeIK100ParticipationRisk'],
      },
    },
  ],
  
  actions: [],
  
  postconditions: [
    'case.next_actions updated',
  ],
  
  proof: {
    store: [
      'timestamp',
      'context.our_rank',
      'decision_path',
    ],
  },
  
  audit: {
    level: 'controlled_write',
  },
  
  priority: 'HIGH',
  requiresApproval: false,
  isActive: true,
  
  dependsOn: ['ComputeOurLienRank_Vehicle'],
  emits: ['FlowDecided'],
  guard: 'HACIZ_RECOMMENDED || ContextUpdated(our_rank)',
};

export default [
  COMPUTE_OUR_LIEN_RANK_VEHICLE,
  CHECK_PRIOR_LIENS_ACTIVE_VEHICLE,
  ANALYZE_IK100_PARTICIPATION_RISK,
  PLACE_LIEN_VEHICLE,
  DECIDE_YAKALAMA_AVANSI_FLOW,
];
