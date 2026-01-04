/**
 * MONITOR SALE STATUS RECIPE
 * 
 * Satış durumunu UYAP'tan izler.
 */

import { Recipe } from '../../types/recipe.types';

export const MONITOR_SALE_STATUS: Recipe = {
  recipeId: 'MonitorSaleStatus',
  version: 1,
  name: 'Satış Durumu İzleme',
  description: 'UYAP\'tan satış/ihale durumunu izler.',

  stageTags: ['SATIS'],
  
  trigger: {
    type: 'schedule',
    when: ['EVERY_72_HOURS'],
  },

  preconditions: [
    'session.isLoggedIn == true',
    "case.events.contains('SALE_STARTED')",
  ],

  uyapNavPath: ['Haciz & Mal & Satış İşlemleri', 'İhale İşlemleri'],

  read: {
    table: 'saleStatus',
    fields: ['ihaleTarihi', 'durum', 'sonuc', 'aciklama', 'kazananTeklif'],
  },

  decisions: [
    {
      if: "saleStatus.sonuc == 'SATILDI'",
      then: { enqueue: ['SyncTahsilat'] },
    },
    {
      if: "saleStatus.sonuc == 'SATILAMADI'",
      then: { set_flag: 'case.saleFailedCount += 1' },
    },
  ],

  actions: [
    {
      type: 'query',
      input: { dosyaNo: '{{case.uyapDosyaNo}}' },
    },
  ],

  postconditions: ['case.events += SALE_SNAPSHOT'],

  proof: {
    store: ['timestamp', 'snapshotHash', 'saleStatus.sonuc'],
  },

  audit: {
    level: 'read_only',
    retainDays: 365,
  },

  dependsOn: ['StartSaleWorkflow'],
  emits: ['SALE_SNAPSHOT'],
  guard: "case.events.contains('SALE_STARTED')",

  priority: 'NORMAL',
  requiresApproval: false,
  isActive: true,
};
