/**
 * ERROR QUARANTINE RECIPE
 * 
 * Kritik hata durumunda dosyayı askıya alır.
 */

import { Recipe } from '../../types/recipe.types';

export const ERROR_QUARANTINE: Recipe = {
  recipeId: 'ErrorQuarantine',
  version: 1,
  name: 'Hata Karantinası',
  description: 'Kritik hata durumunda dosyayı askıya alır ve insan müdahalesi bekler.',

  stageTags: ['ACILIS', 'TEBLIGAT', 'KESINLESME', 'VARLIK', 'HACIZ', 'TAHSILAT', 'SATIS'],
  
  trigger: {
    type: 'event',
    when: ['TASK_FAILED_HARD'],
  },

  preconditions: ['case.lastError != null'],

  uyapNavPath: ['(internal)'],

  read: {
    fields: ['case.lastError', 'case.lastErrorCode', 'case.failedTaskId'],
  },

  decisions: [],

  actions: [
    {
      type: 'set_flag',
      formula: 'case.stage=ASKIDA',
    },
  ],

  postconditions: ['case.stage=ASKIDA', 'case.nextActions += HUMAN_REVIEW'],

  proof: {
    store: ['timestamp', 'case.lastErrorCode', 'case.failedTaskId'],
  },

  audit: {
    level: 'controlled_write',
    retainDays: 3650,
  },

  emits: ['CASE_QUARANTINED'],
  guard: 'case.lastError != null',

  priority: 'CRITICAL',
  requiresApproval: false,
  isActive: true,
};
