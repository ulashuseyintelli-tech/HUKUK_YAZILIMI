/**
 * TRACK HACIZ RESULTS RECIPE
 * 
 * Haciz sonuçlarını UYAP'tan takip eder.
 */

import { Recipe } from '../../types/recipe.types';

export const TRACK_HACIZ_RESULTS: Recipe = {
  recipeId: 'TrackHacizResults',
  version: 1,
  name: 'Haciz Sonuçları Takibi',
  description: 'UYAP\'tan haciz işlemlerinin sonuçlarını takip eder.',

  stageTags: ['HACIZ'],
  
  trigger: {
    type: 'schedule',
    when: ['EVERY_48_HOURS'],
  },

  preconditions: [
    'session.isLoggedIn == true',
    "case.events.contains('HACIZ_REQUESTED')",
  ],

  uyapNavPath: ['Haciz & Mal & Satış İşlemleri', 'Haciz İşlemleri'],

  read: {
    table: 'hacizList',
    fields: ['hacizTarihi', 'malTuru', 'sonuc', 'aciklama'],
  },

  decisions: [
    {
      if: "any(hacizList.sonuc == 'BASARILI')",
      then: { enqueue: ['EvaluateSaleOption'] },
    },
    {
      if: "all(hacizList.sonuc == 'BASARISIZ')",
      then: { set_flag: 'case.allHacizFailed=true' },
    },
  ],

  actions: [
    {
      type: 'query',
      input: { dosyaNo: '{{case.uyapDosyaNo}}' },
    },
  ],

  postconditions: ['case.events += HACIZ_SNAPSHOT'],

  proof: {
    store: ['timestamp', 'snapshotHash', 'successCount', 'failCount'],
  },

  audit: {
    level: 'read_only',
    retainDays: 365,
  },

  dependsOn: ['PrepareHacizRequests'],
  emits: ['HACIZ_SNAPSHOT'],
  guard: "case.events.contains('HACIZ_REQUESTED')",

  priority: 'NORMAL',
  requiresApproval: false,
  isActive: true,
};
