/**
 * INFER STAGE FROM SIGNALS RECIPE
 * 
 * Dosya event'lerinden aşama tahmini yapar.
 * Safahat ve diğer sinyallerden stage'i otomatik belirler.
 */

import { Recipe } from '../../types/recipe.types';

export const INFER_STAGE_FROM_SIGNALS: Recipe = {
  recipeId: 'InferStageFromSignals',
  version: 2,
  name: 'Aşama Tahmini',
  description: 'Dosya event\'lerinden aşama tahmini yapar ve stage\'i günceller.',

  stageTags: ['ACILIS', 'TEBLIGAT', 'KESINLESME', 'VARLIK', 'HACIZ', 'TAHSILAT', 'SATIS', 'KAPANIS'],
  
  trigger: {
    type: 'schedule',
    when: ['EVERY_6_HOURS'],
  },

  preconditions: ['case.events != empty'],

  uyapNavPath: ['(internal)'],

  read: {
    fields: ['case.events', 'case.currentStage', 'case.icraType'],
  },

  decisions: [
    {
      if: "events.contains('TEBLIGAT_SENT') && !events.contains('SERVICE_EFFECTIVE')",
      then: { set: 'case.stage=TEBLIGAT' },
    },
    {
      if: "events.contains('SERVICE_EFFECTIVE') && !events.contains('FINALIZED')",
      then: { set: 'case.stage=KESINLESME' },
    },
    {
      if: "events.contains('FINALIZED') && !events.contains('ASSET_PROFILE_READY')",
      then: { set: 'case.stage=VARLIK' },
    },
    {
      if: "events.contains('HACIZ_REQUESTED')",
      then: { set: 'case.stage=HACIZ' },
    },
    {
      if: "events.contains('TAHSILAT') || events.contains('REDDIYAT')",
      then: { set: 'case.stage=TAHSILAT' },
    },
    {
      if: "events.contains('SALE_STARTED')",
      then: { set: 'case.stage=SATIS' },
    },
    {
      if: "events.contains('CLOSED')",
      then: { set: 'case.stage=KAPANIS' },
    },
  ],

  actions: [],

  postconditions: ['case.stage in enums.stage'],

  proof: {
    store: ['timestamp', 'case.stage', 'reasonCode'],
  },

  audit: {
    level: 'controlled_write',
    retainDays: 365,
  },

  // DAG
  emits: ['STAGE_INFERRED'],
  guard: 'case.events != empty',

  // Metadata
  priority: 'NORMAL',
  requiresApproval: false,
  isActive: true,
};
