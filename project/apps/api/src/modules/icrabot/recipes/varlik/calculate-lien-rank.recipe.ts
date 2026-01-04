/**
 * CALCULATE LIEN RANK RECIPE
 * 
 * Haciz sırası hesaplama.
 * decision_rules_v4.yaml: R3_AFTER_LIENS_AND_VALUATION_SCORE
 */

import { Recipe } from '../../types/recipe.types';

export const CalculateLienRankRecipe: Recipe = {
  recipeId: 'CalculateLienRank',
  version: 1,
  name: 'Haciz Sırası Hesapla',
  description: 'Varlık üzerindeki haciz sırasını ve beklenen payı hesaplar',
  
  scope: 'debtor',
  stageTags: ['VARLIK', 'HACIZ'],
  
  trigger: {
    type: 'event',
    when: ['LIEN_SNAPSHOT', 'VALUATION_ESTIMATE'],
  },
  
  preconditions: [
    'runtime.debtor_scope_id != null',
    'asset.prior_liens != null',
    'asset.valuation != null',
  ],
  
  uyapNavPath: ['(internal)', 'Lien Rank Calculator'],
  
  read: {
    fields: [
      'asset.prior_liens',
      'asset.valuation',
      'case.uyap_dosya_no',
      'case.total_debt',
    ],
  },
  
  decisions: [
    // 1. sıradaysak yakalama avansı iste
    {
      if: 'our_rank == 1 && asset.type == VEHICLE',
      then: {
        enqueue: ['RequestYakalamaAvansi'],
        set_flag: 'asset.first_rank=true',
      },
    },
    // 1. sıra değilsek iştirak riski değerlendir
    {
      if: 'our_rank > 1',
      then: {
        enqueue: ['AssessParticipationRisk'],
        set_flag: 'asset.has_participation_risk=true',
      },
    },
    // Risk skoru yüksekse blokla
    {
      if: 'risk_score >= params.risk.block_execution_threshold',
      then: {
        set_flag: 'locks.LOCK_EXECUTION_ACTIONS=true',
        enqueue: ['RequireAttorneyDecision'],
      },
    },
    // Beklenen net getiri düşükse masraflı işlemleri blokla
    {
      if: 'expected_net < params.recovery.min_net_for_cost_actions',
      then: {
        set_flag: 'locks.LOCK_COST_ACTIONS=true',
        enqueue: ['RequireAttorneyDecision'],
      },
    },
    // Risk kabul edilebilir seviyede
    {
      if: 'risk_score < params.risk.block_execution_threshold && expected_net >= params.recovery.min_net_for_cost_actions',
      then: {
        enqueue: ['ProposeHacizPackage_Debtor'],
      },
    },
  ],
  
  actions: [
    {
      type: 'compute',
      formula: `
        // Ön alacakları hesapla
        prior_claims_known = 0;
        prior_claims_unknown = 0;
        active_prior_liens = 0;
        our_rank = 1;
        
        for (lien of asset.prior_liens) {
          if (lien.is_active) {
            active_prior_liens++;
            
            if (lien.is_our_lien) {
              // Bizim hacizimiz - sıramızı belirle
              our_rank = active_prior_liens;
            } else if (lien.date < our_lien_date) {
              // Bizden önce konulmuş
              if (lien.amount_known) {
                prior_claims_known += lien.amount;
              } else {
                // Bilinmeyen tutarlar için tahmin
                prior_claims_unknown += lien.estimated_amount || 50000;
              }
            }
          }
        }
        
        total_prior_claims = prior_claims_known + prior_claims_unknown;
        
        // Likidite değeri
        liquidated_value = asset.valuation.value_mid * asset.liquidation_factor;
        
        // Ön alacaklar sonrası kalan
        after_prior = Math.max(0, liquidated_value - total_prior_claims);
        
        // Tahmini masraflar
        estimated_costs = calculateEstimatedCosts(asset.type);
        
        // Beklenen net getiri
        expected_net = Math.max(0, after_prior - estimated_costs);
        
        // Beklenen pay oranı
        expected_share_ratio = case.total_debt > 0 
          ? Math.min(1, expected_net / case.total_debt) 
          : 0;
        
        // Risk skoru hesapla
        risk_score = calculateRiskScore({
          our_rank,
          active_prior_liens,
          prior_claims_total: total_prior_claims,
          prior_claims_known,
          asset_value: asset.valuation.value_mid,
          value_confidence: asset.valuation.confidence,
          liquidation_factor: asset.liquidation_factor,
        });
      `,
    },
  ],
  
  postconditions: [
    'case.events += LIEN_RANK_DETERMINED(debtor_id=runtime.debtor_scope_id, asset_id=asset.id)',
    'asset.our_rank != null',
    'asset.expected_net != null',
    'asset.risk_score != null',
  ],
  
  proof: {
    store: [
      'timestamp',
      'runtime.debtor_scope_id',
      'asset.id',
      'our_rank',
      'active_prior_liens',
      'total_prior_claims',
      'prior_claims_known',
      'prior_claims_unknown',
      'liquidated_value',
      'expected_net',
      'expected_share_ratio',
      'risk_score',
    ],
  },
  
  audit: {
    level: 'controlled_write',
    retainDays: 3650,
  },
  
  priority: 'HIGH',
  requiresApproval: false,
  isActive: true,
  
  dependsOn: ['FetchPriorLiens_Vehicle', 'FetchPriorLiens_RealEstate', 'AIValuation_Vehicle', 'AIValuation_RealEstate'],
  emits: ['LIEN_RANK_DETERMINED', 'RISK_ASSESSED'],
  guard: 'LIEN_SNAPSHOT && VALUATION_ESTIMATE',
};

export const AssessParticipationRiskRecipe: Recipe = {
  recipeId: 'AssessParticipationRisk',
  version: 1,
  name: 'İştirak Riski Değerlendir',
  description: 'İİK 100. madde kapsamında iştirak riskini değerlendirir',
  
  scope: 'debtor',
  stageTags: ['VARLIK', 'HACIZ'],
  
  trigger: {
    type: 'event',
    when: ['LIEN_RANK_DETERMINED'],
  },
  
  preconditions: [
    'runtime.debtor_scope_id != null',
    'asset.our_rank > 1',
    'asset.prior_liens != null',
  ],
  
  uyapNavPath: ['(internal)', 'Participation Risk Analyzer'],
  
  read: {
    fields: [
      'asset.our_rank',
      'asset.prior_liens',
      'asset.valuation',
      'asset.expected_net',
      'case.total_debt',
    ],
  },
  
  decisions: [
    // Yüksek iştirak riski
    {
      if: 'participation_risk == HIGH',
      then: {
        set_flag: 'locks.LOCK_COST_ACTIONS=true',
        enqueue: ['RequireAttorneyDecision'],
        notify: 'İştirak riski yüksek - masraflı işlemler bloklandı',
      },
    },
    // Orta seviye risk
    {
      if: 'participation_risk == MEDIUM',
      then: {
        notify: 'İştirak riski orta seviyede - dikkatli ilerlenmeli',
      },
    },
    // Düşük risk
    {
      if: 'participation_risk == LOW',
      then: {
        set_flag: 'asset.participation_risk_acceptable=true',
      },
    },
  ],
  
  actions: [
    {
      type: 'compute',
      formula: `
        // İştirak analizi
        liquidated_value = asset.valuation.value_mid * asset.liquidation_factor;
        total_prior_claims = calculateTotalPriorClaims(asset.prior_liens);
        
        // Ön alacaklar varlık değerini aşıyor mu?
        if (total_prior_claims >= liquidated_value) {
          participation_risk = 'HIGH';
          reasoning = 'Ön alacaklar varlık değerini aşıyor';
        }
        // Ön alacaklar %70'i aşıyor mu?
        else if (total_prior_claims >= liquidated_value * 0.7) {
          participation_risk = 'HIGH';
          reasoning = 'Ön alacaklar varlık değerinin %70\'ini aşıyor';
        }
        // Ön alacaklar %50'yi aşıyor mu?
        else if (total_prior_claims >= liquidated_value * 0.5) {
          participation_risk = 'MEDIUM';
          reasoning = 'Ön alacaklar varlık değerinin %50\'sini aşıyor';
        }
        else {
          participation_risk = 'LOW';
          reasoning = 'İştirak riski kabul edilebilir seviyede';
        }
        
        // Başabaş noktası
        break_even_point = estimated_costs;
        
        // Beklenen pay masrafları karşılıyor mu?
        if (asset.expected_net < break_even_point * 1.5) {
          participation_risk = 'HIGH';
          reasoning += '; Beklenen pay masrafları karşılamıyor';
        }
      `,
    },
  ],
  
  postconditions: [
    'case.events += PARTICIPATION_RISK_ASSESSED(debtor_id=runtime.debtor_scope_id, asset_id=asset.id)',
    'asset.participation_risk != null',
  ],
  
  proof: {
    store: [
      'timestamp',
      'runtime.debtor_scope_id',
      'asset.id',
      'participation_risk',
      'reasoning',
      'total_prior_claims',
      'liquidated_value',
      'break_even_point',
    ],
  },
  
  audit: {
    level: 'controlled_write',
    retainDays: 3650,
  },
  
  priority: 'HIGH',
  requiresApproval: false,
  isActive: true,
  
  dependsOn: ['CalculateLienRank'],
  emits: ['PARTICIPATION_RISK_ASSESSED'],
  guard: 'LIEN_RANK_DETERMINED && our_rank > 1',
};

export default [CalculateLienRankRecipe, AssessParticipationRiskRecipe];
