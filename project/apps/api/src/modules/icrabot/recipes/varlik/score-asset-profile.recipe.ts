/**
 * SCORE ASSET PROFILE RECIPE
 * 
 * Borçlu varlık profilini skorlar.
 * Haciz önerisi için eşik değerleri kontrol eder.
 */

import { Recipe } from '../../types/recipe.types';

export const SCORE_ASSET_PROFILE: Recipe = {
  recipeId: 'ScoreAssetProfile_Debtor',
  version: 2,
  name: 'Varlık Profili Skorlama',
  description: 'Borçlu varlık profilini skorlar ve haciz önerisi için değerlendirir.',

  scope: 'debtor',
  stageTags: ['VARLIK'],
  
  trigger: {
    type: 'event',
    when: ['ASSET_PROFILE_READY'],
  },

  preconditions: [
    'runtime.debtorScopeId != null',
    'case.assetProfile[runtime.debtorScopeId] != null',
  ],

  uyapNavPath: ['(internal)'],

  read: {
    fields: [
      'case.assetProfile[runtime.debtorScopeId]',
      'params.varlik.scoreThresholdHigh',
      'params.varlik.scoreThresholdLow',
    ],
  },

  decisions: [
    {
      if: 'assetScore >= params.varlik.scoreThresholdHigh',
      then: { enqueue: ['ProposeHacizPackage_Debtor'] },
    },
    {
      if: 'assetScore < params.varlik.scoreThresholdLow',
      then: { set_flag: 'case.debtor[runtime.debtorScopeId].lowRecovery=true' },
    },
  ],

  actions: [
    {
      type: 'compute',
      formula: `
        // Varlık skoru hesaplama
        let score = 0;
        
        // SGK kaydı varsa +20
        if (assetProfile.sgk?.hasActiveEmployment) score += 20;
        
        // Taşınmaz varsa +30
        if (assetProfile.takbis?.properties?.length > 0) score += 30;
        
        // Araç varsa +15
        if (assetProfile.vehicle?.vehicles?.length > 0) score += 15;
        
        // Banka hesabı varsa +20
        if (assetProfile.bank?.accounts?.length > 0) score += 20;
        
        // Ticaret sicil kaydı varsa +15
        if (assetProfile.tradeRegistry?.hasRecord) score += 15;
        
        assetScore = score;
      `,
    },
  ],

  postconditions: ['case.debtor[runtime.debtorScopeId].assetScore != null'],

  proof: {
    store: ['timestamp', 'assetScore', 'runtime.debtorScopeId', 'scoreBreakdown'],
  },

  audit: {
    level: 'controlled_write',
    retainDays: 365,
  },

  // DAG
  dependsOn: ['RunAssetQueries_Debtor'],
  emits: ['ASSET_SCORE'],
  guard: 'ASSET_PROFILE_READY',

  // Metadata
  priority: 'NORMAL',
  requiresApproval: false,
  isActive: true,
};
