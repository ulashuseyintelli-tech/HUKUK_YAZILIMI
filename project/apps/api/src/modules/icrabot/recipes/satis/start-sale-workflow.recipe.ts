/**
 * START SALE WORKFLOW RECIPE
 * 
 * Satış iş akışını başlatır.
 */

import { Recipe } from '../../types/recipe.types';

export const START_SALE_WORKFLOW: Recipe = {
  recipeId: 'StartSaleWorkflow',
  version: 1,
  name: 'Satış İş Akışı Başlat',
  description: 'Hacizli mallar için satış iş akışını başlatır.',

  stageTags: ['SATIS'],
  
  trigger: {
    type: 'manual',
    when: ['USER_STARTS_SALE'],
  },

  preconditions: [
    'session.isLoggedIn == true',
    "case.events.contains('HACIZ_SNAPSHOT')",
  ],

  uyapNavPath: ['Haciz & Mal & Satış İşlemleri', 'İhale İşlemleri'],

  read: {
    fields: ['uyap.saleForms', 'case.saleAssets'],
  },

  decisions: [],

  actions: [
    {
      type: 'compute',
      formula: `
        // Satış talebi oluştur
        saleRequest = {
          assets: case.saleAssets,
          requestDate: now(),
          status: 'PENDING'
        }
      `,
    },
  ],

  postconditions: ['case.events += SALE_STARTED'],

  proof: {
    store: ['timestamp', 'saleRequestId', 'assetCount'],
  },

  audit: {
    level: 'high_impact_write',
    retainDays: 3650,
  },

  emits: ['SALE_STARTED'],
  guard: "case.events.contains('HACIZ_SNAPSHOT')",

  priority: 'HIGH',
  requiresApproval: true,
  isActive: true,
};
