/**
 * OPEN RETEBLIGAT BRANCH RECIPE
 * 
 * Tebligat iade geldiğinde yeniden tebligat dalı açar.
 */

import { Recipe } from '../../types/recipe.types';

export const OPEN_RETEBLIGAT_BRANCH: Recipe = {
  recipeId: 'OpenReTebligatCaseBranch',
  version: 1,
  name: 'Yeniden Tebligat Dalı Aç',
  description: 'Tebligat iade geldiğinde yeniden tebligat için değerlendirme başlatır.',

  stageTags: ['TEBLIGAT'],
  
  trigger: {
    type: 'event',
    when: ['TEBLIGAT_RETURNED'],
  },

  preconditions: ['case.needsRetebligat == true'],

  uyapNavPath: ['(internal)'],

  read: {
    fields: ['case.returnReason', 'case.lastKnownAddresses', 'debtor.addresses'],
  },

  decisions: [
    {
      if: "case.returnReason == 'ADRES_YETERSIZ'",
      then: { enqueue: ['AddressDiscovery'] },
    },
    {
      if: "case.returnReason == 'MUHATAP_TASINMIS'",
      then: { enqueue: ['MernisQuery', 'AddressDiscovery'] },
    },
  ],

  actions: [],

  postconditions: ['case.events += RETEBLIGAT_NEEDED'],

  proof: {
    store: ['timestamp', 'case.returnReason', 'suggestedActions'],
  },

  audit: {
    level: 'controlled_write',
    retainDays: 365,
  },

  emits: ['RETEBLIGAT_NEEDED'],
  guard: 'case.needsRetebligat == true',

  priority: 'HIGH',
  requiresApproval: false,
  isActive: true,
};
