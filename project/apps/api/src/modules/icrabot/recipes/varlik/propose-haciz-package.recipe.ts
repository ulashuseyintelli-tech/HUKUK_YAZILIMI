/**
 * PROPOSE HACIZ PACKAGE RECIPE
 * 
 * Yüksek skorlu borçlular için haciz paketi önerir.
 * Kullanıcı onayı gerektirir.
 */

import { Recipe } from '../../types/recipe.types';

export const PROPOSE_HACIZ_PACKAGE: Recipe = {
  recipeId: 'ProposeHacizPackage_Debtor',
  version: 2,
  name: 'Haciz Paketi Önerisi',
  description: 'Varlık skoru yüksek borçlular için haciz paketi önerir.',

  scope: 'debtor',
  stageTags: ['VARLIK'],
  
  trigger: {
    type: 'event',
    when: ['ASSET_SCORE_HIGH'],
  },

  preconditions: [
    'runtime.debtorScopeId != null',
    'case.debtor[runtime.debtorScopeId].assetScore >= params.varlik.scoreThresholdHigh',
  ],

  uyapNavPath: ['(internal)'],

  read: {
    fields: [
      'case.assetProfile[runtime.debtorScopeId]',
      'case.debtor[runtime.debtorScopeId].assetScore',
    ],
  },

  decisions: [],

  actions: [
    {
      type: 'compute',
      formula: `
        // Haciz paketi oluştur
        const hacizPackage = {
          debtorId: runtime.debtorScopeId,
          recommendations: [],
        };
        
        // Banka haczi öner
        if (assetProfile.bank?.accounts?.length > 0) {
          hacizPackage.recommendations.push({
            type: 'BANK_SEIZURE',
            priority: 'HIGH',
            accounts: assetProfile.bank.accounts,
          });
        }
        
        // Maaş haczi öner
        if (assetProfile.sgk?.hasActiveEmployment) {
          hacizPackage.recommendations.push({
            type: 'WAGE_GARNISHMENT',
            priority: 'HIGH',
            employer: assetProfile.sgk.employer,
          });
        }
        
        // Araç haczi öner
        if (assetProfile.vehicle?.vehicles?.length > 0) {
          hacizPackage.recommendations.push({
            type: 'VEHICLE_SEIZURE',
            priority: 'MEDIUM',
            vehicles: assetProfile.vehicle.vehicles,
          });
        }
        
        // Taşınmaz haczi öner
        if (assetProfile.takbis?.properties?.length > 0) {
          hacizPackage.recommendations.push({
            type: 'REAL_ESTATE_SEIZURE',
            priority: 'MEDIUM',
            properties: assetProfile.takbis.properties,
          });
        }
        
        case.hacizPackage = hacizPackage;
      `,
    },
  ],

  postconditions: [
    'case.nextActions += HACIZ_RECOMMENDED(debtorId=runtime.debtorScopeId)',
    'case.stage=HACIZ',
  ],

  proof: {
    store: ['timestamp', 'runtime.debtorScopeId', 'hacizPackage'],
  },

  audit: {
    level: 'controlled_write',
    retainDays: 365,
  },

  // DAG
  dependsOn: ['ScoreAssetProfile_Debtor'],
  emits: ['HACIZ_RECOMMENDED'],
  guard: 'ASSET_SCORE >= params.varlik.scoreThresholdHigh',

  // Metadata
  priority: 'HIGH',
  requiresApproval: true, // Kullanıcı onayı gerekli
  isActive: true,
};
