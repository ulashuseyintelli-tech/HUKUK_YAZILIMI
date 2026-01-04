/**
 * CONSISTENCY CHECK RECIPE
 * 
 * Dosya aşaması ve event'ler arasındaki tutarlılığı kontrol eder.
 */

import { Recipe } from '../../types/recipe.types';

export const CONSISTENCY_CHECK: Recipe = {
  recipeId: 'ConsistencyCheck',
  version: 1,
  name: 'Tutarlılık Kontrolü',
  description: 'Dosya aşaması ve event\'ler arasındaki tutarlılığı kontrol eder.',

  stageTags: ['ACILIS', 'TEBLIGAT', 'KESINLESME', 'VARLIK', 'HACIZ', 'TAHSILAT', 'SATIS'],
  
  trigger: {
    type: 'schedule',
    when: ['EVERY_24_HOURS'],
  },

  preconditions: ['case.uyapDosyaNo != null'],

  uyapNavPath: ['(internal)'],

  read: {
    fields: ['case.stage', 'case.events', 'case.evidence'],
  },

  decisions: [
    {
      if: "case.stage == 'TEBLIGAT' && !events.contains('TEBLIGAT_SENT')",
      then: {
        set_flag: 'case.inconsistent=true',
        notify: 'Aşama-teyit uyuşmazlığı: TEBLIGAT aşamasında ama TEBLIGAT_SENT event\'i yok',
      },
    },
    {
      if: "events.contains('FINALIZED') && case.stage in ['TEBLIGAT', 'ACILIS']",
      then: { set: 'case.stage=VARLIK' },
    },
    {
      if: "events.contains('HACIZ_REQUESTED') && case.stage in ['TEBLIGAT', 'KESINLESME', 'VARLIK']",
      then: { set: 'case.stage=HACIZ' },
    },
  ],

  actions: [],

  postconditions: ['case.consistencyChecked=true'],

  proof: {
    store: ['timestamp', 'case.inconsistent', 'correctionsMade'],
  },

  audit: {
    level: 'read_only',
    retainDays: 365,
  },

  emits: ['CONSISTENCY_CHECKED'],
  guard: 'case.uyapDosyaNo != null',

  priority: 'LOW',
  requiresApproval: false,
  isActive: true,
};
