import { Recipe } from '../../types/recipe.types';

/**
 * DETECT FINALIZATION CANDIDATE
 * 
 * Tebliğ tarihleri ve sürelerden "kesinleşebilir" durumu tespit eder.
 * 
 * Kurallar:
 * - İlamsız icra: Tebliğ + 7 gün (itiraz süresi)
 * - Kambiyo: Tebliğ + 5 gün
 * - İlamlı: Tebliğ + 10 gün (temyiz süresi - ilamlı için farklı)
 */
export const DETECT_FINALIZATION: Recipe = {
  recipeId: 'DetectFinalizationCandidate',
  version: 1,
  name: 'Kesinleşme Adayı Tespit',
  description: 'Dosyanın kesinleşme durumunu kontrol eder',
  
  stageTags: ['TEBLIGAT', 'KESINLESME'],
  
  trigger: {
    type: 'event',
    when: [
      'event:LEGAL_SERVICE_DATE_COMPUTED',
      'event:TEBLIGAT_COMPLETED',
      'schedule:DAILY_AT_9AM',
    ],
  },
  
  preconditions: [
    { field: 'case.workflowStage', operator: 'in', value: ['WAITING_RESPONSE', 'TEBLIGAT'] },
    { field: 'case.hasObjection', operator: 'eq', value: false },
  ],
  
  read: {
    source: 'database',
    table: 'Case',
    fields: [
      { name: 'type', type: 'text' },
      { name: 'subType', type: 'text' },
      { name: 'allDebtorsServed', type: 'boolean' },
      { name: 'lastServiceDate', type: 'date' },
      { name: 'hasObjection', type: 'boolean' },
      { name: 'hasPayment', type: 'boolean' },
    ],
  },
  
  decisions: [
    {
      // Tam ödeme yapıldı → Dosya kapanışı
      if: 'hasPayment == true AND totalPaid >= totalDebt',
      thenUpdate: {
        workflowStage: 'FULL_PAYMENT',
        finalizationStatus: 'PAID',
      },
      thenAction: 'CLOSE_CASE',
    },
    {
      // İtiraz var → Kesinleşme bekle
      if: 'hasObjection == true',
      thenUpdate: {
        finalizationCandidate: false,
        finalizationBlockReason: 'İtiraz mevcut',
      },
    },
    {
      // İlamsız icra - 7 gün geçti
      if: 'type == "ILAMSIZ" AND daysSinceService >= 7 AND hasObjection == false',
      thenUpdate: {
        finalizationCandidate: true,
        expectedFinalizationDate: '${lastServiceDate + 7 days}',
      },
      thenEnqueue: ['MarkAsFinalized'],
    },
    {
      // Kambiyo - 5 gün geçti
      if: 'subType == "KAMBIYO" AND daysSinceService >= 5 AND hasObjection == false',
      thenUpdate: {
        finalizationCandidate: true,
        expectedFinalizationDate: '${lastServiceDate + 5 days}',
      },
      thenEnqueue: ['MarkAsFinalized'],
    },
    {
      // Kesinleşti → Varlık sorgularını başlat
      if: 'finalizationCandidate == true AND isFinalized == true',
      thenUpdate: {
        workflowStage: 'ENFORCEMENT',
      },
      thenEnqueue: ['RunAssetQueriesBatch'],
    },
  ],
  
  actions: [],
  
  postconditions: [
    'case.finalizationCandidate != null',
    'case.events += FINALIZATION_CHECK',
  ],
  
  proof: {
    store: ['finalizationCandidate', 'expectedFinalizationDate', 'checkTimestamp'],
  },
  
  audit: {
    level: 'high',
    retainDays: 3650,
  },
  
  priority: 'HIGH',
  isActive: true,
};
