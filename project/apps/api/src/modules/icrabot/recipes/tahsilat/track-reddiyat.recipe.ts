/**
 * TRACK REDDIYAT RECIPE
 * 
 * Reddiyat (ödeme) hareketlerini UYAP'tan takip eder.
 */

import { Recipe } from '../../types/recipe.types';

export const TRACK_REDDIYAT: Recipe = {
  recipeId: 'TrackReddiyat',
  version: 1,
  name: 'Reddiyat Takibi',
  description: 'UYAP\'tan reddiyat (alacaklıya ödeme) hareketlerini takip eder.',

  stageTags: ['TAHSILAT'],
  
  trigger: {
    type: 'schedule',
    when: ['EVERY_24_HOURS'],
  },

  preconditions: ['session.isLoggedIn == true'],

  uyapNavPath: ['Harç ve Kasa İşlemleri', 'Reddiyat'],

  read: {
    table: 'reddiyat',
    fields: ['tarih', 'tutar', 'makbuzNo', 'alici', 'aciklama'],
  },

  decisions: [],

  actions: [
    {
      type: 'query',
      input: { dosyaNo: '{{case.uyapDosyaNo}}' },
    },
  ],

  postconditions: ['case.events += REDDIYAT_DELTA'],

  proof: {
    store: ['timestamp', 'deltaCount', 'totalReddiyat'],
  },

  audit: {
    level: 'read_only',
    retainDays: 365,
  },

  dependsOn: ['EnsureUYAPSession'],
  emits: ['REDDIYAT_DELTA'],
  guard: 'SESSION_OK',

  priority: 'NORMAL',
  requiresApproval: false,
  isActive: true,
};
