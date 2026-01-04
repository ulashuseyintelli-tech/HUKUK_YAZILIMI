/**
 * DETECT FINALIZATION BY ICRA TYPE RECIPE
 * 
 * İcra türüne göre kesinleşme adayı tespiti.
 * Her icra türü için farklı itiraz süreleri uygulanır.
 */

import { Recipe } from '../../types/recipe.types';

export const DETECT_FINALIZATION_BY_ICRA_TYPE: Recipe = {
  recipeId: 'DetectFinalizationCandidate_ByIcraType',
  version: 2,
  name: 'Kesinleşme Adayı Tespiti (İcra Türüne Göre)',
  description: 'İcra türüne göre itiraz sürelerini hesaplayarak kesinleşme adaylarını tespit eder.',

  stageTags: ['KESINLESME', 'TEBLIGAT'],
  
  trigger: {
    type: 'schedule',
    when: ['EVERY_24_HOURS'],
  },

  preconditions: ["case.events.contains('SERVICE_EFFECTIVE_CANDIDATE')"],

  uyapNavPath: ['(internal)'],

  read: {
    fields: ['case.icraType', 'case.serviceEffectiveDate', 'case.debtors'],
  },

  decisions: [
    {
      if: 'now() >= finalizationCandidateDate',
      then: {
        set_flag: 'case.finalizationCandidate=true',
        enqueue: ['SyncSafahatTimeline'],
      },
    },
  ],

  actions: [
    {
      type: 'compute',
      formula: `
        // İcra türüne göre itiraz süresini al
        const overrides = {
          ILAMSIZ: 7,
          KAMBIYO: 5,
          KIRA: 7,
          ILAMLI: 0,
          MTS: 7,
          DIGER: 7,
        };
        
        const deadline = overrides[case.icraType] ?? params.kesinlesme.defaultObjectionDeadlineDays;
        
        // Tüm borçluların tebliğ tarihlerini kontrol et
        const allServed = case.debtors.every(d => d.serviceEffectiveDate != null);
        
        if (allServed) {
          // En son tebliğ tarihini bul
          const latestServiceDate = Math.max(...case.debtors.map(d => d.serviceEffectiveDate));
          finalizationCandidateDate = new Date(latestServiceDate);
          finalizationCandidateDate.setDate(finalizationCandidateDate.getDate() + deadline);
        }
      `,
    },
  ],

  postconditions: ['case.finalizationCandidateDate != null'],

  proof: {
    store: ['timestamp', 'finalizationCandidateDate', 'case.icraType', 'deadlineDays'],
  },

  audit: {
    level: 'controlled_write',
    retainDays: 365,
  },

  // DAG
  dependsOn: ['ComputeServiceEffectiveDate_ETebligat_Debtor', 'MazbataSorgula_ETebligat_Debtor'],
  emits: ['FINALIZATION_CANDIDATE'],
  guard: "case.stage in ['TEBLIGAT', 'KESINLESME'] && any(debtor.serviceEffectiveDate != null)",

  // Metadata
  priority: 'NORMAL',
  requiresApproval: false,
  isActive: true,
};
