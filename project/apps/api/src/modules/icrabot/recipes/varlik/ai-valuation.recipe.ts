/**
 * AI VALUATION RECIPE
 * 
 * Varlık için AI tabanlı değerleme yapar.
 * decision_rules_v4.yaml: R2_ASSET_FOUND_FETCH_LIENS_AND_VALUE
 */

import { Recipe } from '../../types/recipe.types';

export const AIValuationVehicleRecipe: Recipe = {
  recipeId: 'AIValuation_Vehicle',
  version: 1,
  name: 'Araç AI Değerleme',
  description: 'Araç için AI tabanlı piyasa değeri tahmini yapar',
  
  scope: 'debtor',
  stageTags: ['VARLIK', 'HACIZ'],
  
  trigger: {
    type: 'event',
    when: ['ASSET_FOUND(asset_type=vehicle)'],
  },
  
  preconditions: [
    'runtime.debtor_scope_id != null',
    'asset.type == VEHICLE',
    'asset.make != null',
    'asset.model != null',
    'asset.year != null',
  ],
  
  uyapNavPath: ['(internal)', 'AI Valuation Service'],
  
  read: {
    fields: [
      'asset.make',
      'asset.model',
      'asset.year',
      'asset.mileage',
      'asset.fuel_type',
      'asset.transmission',
      'asset.body_type',
      'asset.color',
      'asset.condition',
    ],
  },
  
  decisions: [
    {
      if: 'valuation.confidence >= 0.7',
      then: {
        set: 'asset.valuation_status=CONFIDENT',
        enqueue: ['AssessRecoveryRisk'],
      },
    },
    {
      if: 'valuation.confidence < 0.5',
      then: {
        set: 'asset.valuation_status=LOW_CONFIDENCE',
        notify: 'Düşük güvenli değerleme - manuel kontrol önerilir',
      },
    },
    {
      if: 'valuation.value_mid >= params.recovery.min_net_for_cost_actions',
      then: {
        set_flag: 'asset.worth_pursuing=true',
      },
    },
  ],
  
  actions: [
    {
      type: 'compute',
      formula: `
        // AI değerleme servisi çağrısı
        valuation = await aiValuationService.estimateVehicleValue({
          make: asset.make,
          model: asset.model,
          year: asset.year,
          mileage: asset.mileage,
          fuelType: asset.fuel_type,
          transmission: asset.transmission,
          bodyType: asset.body_type,
          condition: asset.condition || 'AVERAGE',
        });
        
        // Likidite faktörü (icra satışı firesi)
        liquidation_factor = 0.65; // Normal piyasa koşulları
        
        // Net değer hesapla
        expected_net = valuation.value_mid * liquidation_factor;
      `,
    },
  ],
  
  postconditions: [
    'case.events += VALUATION_ESTIMATE(debtor_id=runtime.debtor_scope_id, asset_id=asset.id)',
    'asset.valuation != null',
    'asset.valuation.estimated_at = now()',
  ],
  
  proof: {
    store: [
      'timestamp',
      'runtime.debtor_scope_id',
      'asset.id',
      'valuation.value_low',
      'valuation.value_mid',
      'valuation.value_high',
      'valuation.confidence',
      'valuation.model_version',
      'valuation.factors',
    ],
  },
  
  audit: {
    level: 'controlled_write',
    retainDays: 3650,
    includeScreenshotOnError: false,
  },
  
  priority: 'MEDIUM',
  requiresApproval: false,
  isActive: true,
  
  dependsOn: ['RunAssetQueries_Debtor'],
  emits: ['VALUATION_ESTIMATE'],
  guard: 'ASSET_FOUND && asset.type == VEHICLE',
};

export const AIValuationRealEstateRecipe: Recipe = {
  recipeId: 'AIValuation_RealEstate',
  version: 1,
  name: 'Taşınmaz AI Değerleme',
  description: 'Taşınmaz için AI tabanlı piyasa değeri tahmini yapar',
  
  scope: 'debtor',
  stageTags: ['VARLIK', 'HACIZ'],
  
  trigger: {
    type: 'event',
    when: ['ASSET_FOUND(asset_type=real_estate)'],
  },
  
  preconditions: [
    'runtime.debtor_scope_id != null',
    'asset.type == REAL_ESTATE',
    'asset.il != null',
    'asset.ilce != null',
    'asset.nitelik != null',
  ],
  
  uyapNavPath: ['(internal)', 'AI Valuation Service'],
  
  read: {
    fields: [
      'asset.il',
      'asset.ilce',
      'asset.mahalle',
      'asset.nitelik',
      'asset.yuzolcumu',
      'asset.kat_sayisi',
      'asset.bina_yasi',
      'asset.oda_sayisi',
    ],
  },
  
  decisions: [
    {
      if: 'valuation.confidence >= 0.6',
      then: {
        set: 'asset.valuation_status=CONFIDENT',
        enqueue: ['AssessRecoveryRisk'],
      },
    },
    {
      if: 'valuation.confidence < 0.4',
      then: {
        set: 'asset.valuation_status=LOW_CONFIDENCE',
        notify: 'Taşınmaz değerlemesi düşük güvenli - bilirkişi önerilir',
      },
    },
  ],
  
  actions: [
    {
      type: 'compute',
      formula: `
        // AI değerleme servisi çağrısı
        valuation = await aiValuationService.estimateRealEstateValue({
          il: asset.il,
          ilce: asset.ilce,
          mahalle: asset.mahalle,
          nitelik: asset.nitelik,
          yuzolcumu: asset.yuzolcumu,
          katSayisi: asset.kat_sayisi,
          binaYasi: asset.bina_yasi,
          odaSayisi: asset.oda_sayisi,
        });
        
        // Likidite faktörü (icra satışı firesi)
        liquidation_factor = 0.70; // Taşınmazlar için
        
        // Net değer hesapla
        expected_net = valuation.value_mid * liquidation_factor;
      `,
    },
  ],
  
  postconditions: [
    'case.events += VALUATION_ESTIMATE(debtor_id=runtime.debtor_scope_id, asset_id=asset.id)',
    'asset.valuation != null',
  ],
  
  proof: {
    store: [
      'timestamp',
      'runtime.debtor_scope_id',
      'asset.id',
      'valuation.value_low',
      'valuation.value_mid',
      'valuation.value_high',
      'valuation.confidence',
      'valuation.model_version',
      'valuation.comparable_sales',
    ],
  },
  
  audit: {
    level: 'controlled_write',
    retainDays: 3650,
  },
  
  priority: 'MEDIUM',
  requiresApproval: false,
  isActive: true,
  
  dependsOn: ['RunAssetQueries_Debtor'],
  emits: ['VALUATION_ESTIMATE'],
  guard: 'ASSET_FOUND && asset.type == REAL_ESTATE',
};

export default [AIValuationVehicleRecipe, AIValuationRealEstateRecipe];
