/**
 * BIND CASE TO UYAP NUMBER RECIPE
 * 
 * Yerel dosyayı UYAP dosya numarasına bağlar.
 */

import { Recipe } from '../../types/recipe.types';

export const BIND_CASE_TO_UYAP: Recipe = {
  recipeId: 'BindCaseToUYAPNumber',
  version: 1,
  name: 'UYAP Dosya Numarası Bağla',
  description: 'Yerel dosyayı UYAP dosya numarasına bağlar.',

  stageTags: ['ACILIS'],
  
  trigger: {
    type: 'event',
    when: ['CASE_CREATED_LOCAL'],
  },

  preconditions: ['case.uyapDosyaNo == null'],

  uyapNavPath: ['(user-input or clipboard)'],

  read: {
    fields: ['user.providedUyapDosyaNo'],
  },

  decisions: [
    {
      if: 'user.providedUyapDosyaNo != null',
      then: { set: 'case.uyapDosyaNo=user.providedUyapDosyaNo' },
    },
  ],

  actions: [],

  postconditions: ['case.uyapDosyaNo != null'],

  proof: {
    store: ['case.uyapDosyaNo', 'timestamp'],
  },

  audit: {
    level: 'controlled_write',
    retainDays: 365,
  },

  emits: ['UYAP_DOSYA_BOUND'],
  guard: 'case.uyapDosyaNo == null',

  priority: 'HIGH',
  requiresApproval: false,
  isActive: true,
};
