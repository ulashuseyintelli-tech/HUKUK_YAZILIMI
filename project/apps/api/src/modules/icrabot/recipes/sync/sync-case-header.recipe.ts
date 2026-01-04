/**
 * SYNC CASE HEADER RECIPE
 * 
 * UYAP'tan dosya başlık bilgilerini senkronize eder.
 */

import { Recipe } from '../../types/recipe.types';

export const SYNC_CASE_HEADER: Recipe = {
  recipeId: 'SyncCaseHeader',
  version: 1,
  name: 'Dosya Başlık Senkronizasyonu',
  description: 'UYAP\'tan dosya başlık bilgilerini (taraflar, durum özeti) senkronize eder.',

  stageTags: ['ACILIS', 'TEBLIGAT', 'KESINLESME', 'VARLIK', 'HACIZ', 'TAHSILAT', 'SATIS'],
  
  trigger: {
    type: 'schedule',
    when: ['EVERY_12_HOURS'],
  },

  preconditions: [
    'session.isLoggedIn == true',
    'case.uyapDosyaNo != null',
  ],

  uyapNavPath: ['Dosya', 'Dosya Ayrıntı Bilgileri'],

  read: {
    fields: ['uyap.dosyaNo', 'uyap.taraflarSummary', 'uyap.durumSummary'],
  },

  decisions: [],

  actions: [
    {
      type: 'query',
      input: { dosyaNo: '{{case.uyapDosyaNo}}' },
    },
  ],

  postconditions: ['case.lastSyncAt=now()', 'case.headerSynced=true'],

  proof: {
    store: ['uyap.dosyaNo', 'uyap.durumSummary', 'timestamp', 'snapshotHash'],
  },

  audit: {
    level: 'read_only',
    retainDays: 365,
  },

  dependsOn: ['EnsureUYAPSession'],
  emits: ['CASE_HEADER_SYNCED'],
  guard: 'SESSION_OK && case.uyapDosyaNo != null',

  priority: 'NORMAL',
  requiresApproval: false,
  isActive: true,
};
