/**
 * PREDICT MASRAF NEEDS RECIPE
 * 
 * Sonraki masraf ihtiyaçlarını tahmin eder.
 */

import { Recipe } from '../../types/recipe.types';

export const PREDICT_MASRAF_NEEDS: Recipe = {
  recipeId: 'PredictNextMasrafNeeds',
  version: 1,
  name: 'Masraf İhtiyacı Tahmini',
  description: 'Dosya durumuna göre sonraki masraf ihtiyaçlarını tahmin eder.',

  stageTags: ['ACILIS', 'TEBLIGAT', 'HACIZ', 'SATIS'],
  
  trigger: {
    type: 'event',
    when: ['TEBLIGAT_RETURNED', 'SALE_STARTED', 'HACIZ_REQUESTED'],
  },

  preconditions: [],

  uyapNavPath: ['(internal)'],

  read: {
    fields: ['case.stage', 'case.events', 'case.debtorCount'],
  },

  decisions: [
    {
      if: "case.stage == 'TEBLIGAT' && events.contains('TEBLIGAT_RETURNED')",
      then: {
        notify: 'Yeniden tebligat için masraf gerekebilir',
        set_flag: 'case.predictedMasraf.retebligat=true',
      },
    },
    {
      if: "case.stage == 'HACIZ'",
      then: {
        notify: 'Haciz masrafları için avans gerekebilir',
        set_flag: 'case.predictedMasraf.haciz=true',
      },
    },
    {
      if: "case.stage == 'SATIS'",
      then: {
        notify: 'Satış ilanı ve ihale masrafları için avans gerekebilir',
        set_flag: 'case.predictedMasraf.satis=true',
      },
    },
  ],

  actions: [
    {
      type: 'compute',
      formula: `
        // Masraf planı hesapla
        masrafPlan = {
          stage: case.stage,
          estimatedAmount: calculateEstimate(case.stage, case.debtorCount),
          dueDate: calculateDueDate(case.stage),
          items: []
        }
      `,
    },
  ],

  postconditions: ['case.nextActions += MASRAF_REQUEST_RECOMMENDED'],

  proof: {
    store: ['timestamp', 'masrafPlanHash', 'estimatedAmount'],
  },

  audit: {
    level: 'controlled_write',
    retainDays: 365,
  },

  emits: ['MASRAF_PREDICTED'],
  guard: 'true',

  priority: 'LOW',
  requiresApproval: false,
  isActive: true,
};
