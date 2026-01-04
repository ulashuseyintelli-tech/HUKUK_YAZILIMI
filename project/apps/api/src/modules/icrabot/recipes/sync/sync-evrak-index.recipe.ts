/**
 * SYNC EVRAK INDEX RECIPE
 * 
 * UYAP'tan evrak listesini senkronize eder.
 */

import { Recipe } from '../../types/recipe.types';

export const SYNC_EVRAK_INDEX: Recipe = {
  recipeId: 'SyncEvrakIndex',
  version: 1,
  name: 'Evrak İndeksi Senkronizasyonu',
  description: 'UYAP\'tan dosya evrak listesini senkronize eder.',

  stageTags: ['ACILIS', 'TEBLIGAT', 'KESINLESME', 'VARLIK', 'HACIZ', 'TAHSILAT', 'SATIS'],
  
  trigger: {
    type: 'schedule',
    when: ['EVERY_24_HOURS'],
  },

  preconditions: [
    'session.isLoggedIn == true',
    'case.uyapDosyaNo != null',
  ],

  uyapNavPath: ['Dosya', 'Dosya Ayrıntı Bilgileri'],

  read: {
    table: 'dosyaEvrak',
    fields: ['evrakTuru', 'tarih', 'idOrRef'],
  },

  decisions: [],

  actions: [
    {
      type: 'query',
      input: { dosyaNo: '{{case.uyapDosyaNo}}' },
    },
  ],

  postconditions: ['case.evrakIndexUpdated=true'],

  proof: {
    store: ['timestamp', 'snapshotHash', 'evrakCount'],
  },

  audit: {
    level: 'read_only',
    retainDays: 365,
  },

  dependsOn: ['EnsureUYAPSession'],
  emits: ['EVRAK_INDEX_SYNCED'],
  guard: 'SESSION_OK && case.uyapDosyaNo != null',

  priority: 'LOW',
  requiresApproval: false,
  isActive: true,
};
