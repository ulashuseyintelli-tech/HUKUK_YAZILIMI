import { Recipe } from '../../types/recipe.types';

/**
 * UPDATE HACIZ STATUS
 * 
 * Haciz durumunu günceller.
 * Safahattan tespit edilen haciz olaylarını işler.
 */
export const UPDATE_HACIZ_STATUS: Recipe = {
  recipeId: 'UpdateHacizStatus',
  version: 1,
  name: 'Haciz Durumu Güncelle',
  description: 'Haciz durumunu safahat bilgilerine göre günceller',
  
  stageTags: ['HACIZ'],
  
  trigger: {
    type: 'event',
    when: [
      'event:SAFAHAT_HACIZ_DETECTED',
      'event:HACIZ_STATUS_MANUAL',
    ],
  },
  
  preconditions: [
    { field: 'case.uyapDosyaNo', operator: 'isNotNull' },
  ],
  
  read: {
    source: 'database',
    table: 'CaseLifecycle',
    fields: [
      { name: 'action', type: 'text' },
      { name: 'description', type: 'text' },
      { name: 'createdAt', type: 'date' },
    ],
  },
  
  decisions: [
    {
      // Haciz konuldu
      if: 'action == "HACIZ_KONULDU"',
      thenUpdate: {
        hasActiveSeizure: true,
        lastSeizureAt: '${createdAt}',
      },
    },
    {
      // Haciz kaldırıldı
      if: 'action == "HACIZ_KALDIRILDI"',
      thenUpdate: {
        hasActiveSeizure: false,
        seizureReleasedAt: '${createdAt}',
      },
    },
    {
      // Haciz satışa çıkarıldı
      if: 'action == "SATIS_ILANI"',
      thenUpdate: {
        workflowStage: 'SALE_REQUEST',
        saleAnnouncedAt: '${createdAt}',
      },
    },
  ],
  
  actions: [],
  
  postconditions: [
    'case.events += HACIZ_STATUS_UPDATED',
  ],
  
  proof: {
    store: ['action', 'createdAt', 'updatedAt'],
  },
  
  audit: {
    level: 'high',
    retainDays: 3650,
  },
  
  priority: 'HIGH',
  isActive: true,
};
