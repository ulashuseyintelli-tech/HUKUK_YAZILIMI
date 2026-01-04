/**
 * FETCH E-TEBLIGAT DEBTOR RECIPE
 * 
 * Borçlu bazlı e-tebligat durumu sorgulama.
 * Her borçlu için ayrı job olarak çalışır.
 */

import { Recipe } from '../../types/recipe.types';

export const FETCH_ETEBLIGAT_DEBTOR: Recipe = {
  recipeId: 'FetchPreparedETebligatlar_Debtor',
  version: 2,
  name: 'E-Tebligat Durumu Sorgula (Borçlu Bazlı)',
  description: 'Belirli bir borçlu için e-tebligat durumunu UYAP\'tan sorgular.',

  scope: 'debtor',
  stageTags: ['TEBLIGAT'],
  
  trigger: {
    type: 'schedule',
    when: ['EVERY_6_HOURS'],
  },

  preconditions: [
    'session.isLoggedIn == true',
    'case.uyapDosyaNo != null',
    'runtime.debtorScopeId != null',
  ],

  uyapNavPath: ['Tebligat', 'Hazırlanmış Elektronik Tebligatlar'],

  read: {
    table: 'e_tebligatlar',
    fields: [
      'tarafaTeslimTarihi',
      'okundu',
      'eTebligMazbatasiVar',
      'durumRenkKodu',
      'muhataId',
    ],
    filters: {
      muhataId: '{{runtime.debtorScopeId}}',
    },
  },

  decisions: [
    {
      if: 'any(e_tebligatlar.tarafaTeslimTarihi != null)',
      then: { enqueue: ['ComputeServiceEffectiveDate_ETebligat_Debtor'] },
    },
    {
      if: 'any(e_tebligatlar.tarafaTeslimTarihi != null && e_tebligatlar.eTebligMazbatasiVar == false)',
      then: { enqueue: ['MazbataSorgula_ETebligat_Debtor'] },
    },
  ],

  actions: [
    {
      type: 'query',
      input: {
        tarihAraligi: 'last_30_days',
        dosyaNo: '{{case.uyapDosyaNo}}',
        muhataId: '{{runtime.debtorScopeId}}',
      },
    },
  ],

  postconditions: ['case.events += ETEBLIGAT_SNAPSHOT(debtorId=runtime.debtorScopeId)'],

  proof: {
    store: ['timestamp', 'snapshotHash', 'runtime.debtorScopeId', 'recordCount'],
  },

  audit: {
    level: 'read_only',
    retainDays: 365,
  },

  // DAG
  dependsOn: ['SyncSafahatTimeline'],
  emits: ['ETEBLIGAT_SNAPSHOT'],
  guard: "case.stage == 'TEBLIGAT' && SESSION_OK && debtor.tebligatChannel in ['E_TEBLIGAT', 'KARMA']",

  // Metadata
  priority: 'NORMAL',
  requiresApproval: false,
  isActive: true,
};
