import { Recipe } from '../../types/recipe.types';

/**
 * MARK AS FINALIZED
 * 
 * Dosyayı kesinleşmiş olarak işaretler.
 * Tüm borçlulara tebligat yapılmış ve itiraz süresi geçmiş olmalı.
 */
export const MARK_AS_FINALIZED: Recipe = {
  recipeId: 'MarkAsFinalized',
  version: 1,
  name: 'Kesinleşme İşaretle',
  description: 'Dosyayı kesinleşmiş olarak işaretler ve varlık sorgularını başlatır',
  
  stageTags: ['KESINLESME'],
  
  trigger: {
    type: 'event',
    when: [
      'event:FINALIZATION_CANDIDATE_DETECTED',
      'event:FINALIZATION_MANUAL',
    ],
  },
  
  preconditions: [
    { field: 'case.finalizationCandidate', operator: 'eq', value: true },
    { field: 'case.hasObjection', operator: 'eq', value: false },
    { field: 'case.allDebtorsServed', operator: 'eq', value: true },
  ],
  
  read: {
    source: 'database',
    table: 'Case',
    fields: [
      { name: 'type', type: 'text' },
      { name: 'lastServiceDate', type: 'date' },
      { name: 'objectionDeadline', type: 'date' },
    ],
  },
  
  decisions: [
    {
      // İtiraz süresi geçti → Kesinleştir
      if: 'objectionDeadline < now() AND hasObjection == false',
      thenUpdate: {
        isFinalized: true,
        finalizedAt: '${now()}',
        workflowStage: 'ENFORCEMENT',
      },
      thenEnqueue: ['RunAssetQueriesBatch'],
    },
    {
      // İtiraz süresi henüz geçmedi → Bekle
      if: 'objectionDeadline >= now()',
      thenUpdate: {
        finalizationStatus: 'WAITING_OBJECTION_DEADLINE',
      },
    },
  ],
  
  actions: [],
  
  postconditions: [
    'case.isFinalized == true',
    'case.events += CASE_FINALIZED',
  ],
  
  proof: {
    store: ['finalizedAt', 'lastServiceDate', 'objectionDeadline'],
  },
  
  audit: {
    level: 'critical',
    retainDays: 3650,
  },
  
  priority: 'HIGH',
  isActive: true,
};
