/**
 * ENSURE UYAP SESSION RECIPE
 * 
 * UYAP oturumunun aktif olduğunu kontrol eder.
 * Tüm UYAP işlemlerinden önce çalışmalıdır.
 */

import { Recipe } from '../../types/recipe.types';

export const ENSURE_UYAP_SESSION: Recipe = {
  recipeId: 'EnsureUYAPSession',
  version: 2,
  name: 'UYAP Oturum Kontrolü',
  description: 'UYAP oturumunun aktif olduğunu kontrol eder ve gerekirse uyarı üretir.',

  stageTags: ['ACILIS', 'TEBLIGAT', 'KESINLESME', 'VARLIK', 'HACIZ', 'TAHSILAT', 'SATIS'],
  
  trigger: {
    type: 'schedule',
    when: ['EVERY_15_MIN'],
  },

  preconditions: [],

  uyapNavPath: ['(session)'],

  read: {
    fields: ['session.isLoggedIn', 'session.userRole', 'session.lastActivity'],
  },

  decisions: [
    {
      if: 'session.isLoggedIn == false',
      then: {
        set_flag: 'session.required=true',
        notify: 'UYAP oturumu yok veya süresi dolmuş',
      },
    },
    {
      if: 'session.lastActivity < now() - 30min',
      then: {
        notify: 'UYAP oturumu uzun süredir aktif değil',
      },
    },
  ],

  actions: [],

  postconditions: ['session.healthChecked=true'],

  proof: {
    store: ['session.isLoggedIn', 'session.userRole', 'timestamp'],
  },

  audit: {
    level: 'read_only',
    retainDays: 30,
  },

  // DAG
  emits: ['SESSION_OK'],
  guard: 'true',

  // Metadata
  priority: 'HIGH',
  requiresApproval: false,
  isActive: true,
};
