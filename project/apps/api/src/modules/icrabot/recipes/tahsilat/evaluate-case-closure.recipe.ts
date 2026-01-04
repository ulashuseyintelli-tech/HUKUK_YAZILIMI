import { Recipe } from '../../types/recipe.types';

/**
 * EVALUATE CASE CLOSURE
 * 
 * Dosya kapanış değerlendirmesi yapar.
 * Tam ödeme, feragat veya aciz vesikası durumlarını değerlendirir.
 */
export const EVALUATE_CASE_CLOSURE: Recipe = {
  recipeId: 'EvaluateCaseClosure',
  version: 1,
  name: 'Dosya Kapanış Değerlendirmesi',
  description: 'Dosyanın kapatılıp kapatılamayacağını değerlendirir',
  
  stageTags: ['TAHSILAT', 'KAPANIS'],
  
  trigger: {
    type: 'event',
    when: [
      'event:FULL_PAYMENT_DETECTED',
      'event:CLOSURE_EVALUATION_MANUAL',
    ],
  },
  
  preconditions: [
    { field: 'case.status', operator: 'eq', value: 'ACTIVE' },
  ],
  
  read: {
    source: 'database',
    table: 'Case',
    fields: [
      { name: 'totalDebt', type: 'number' },
      { name: 'totalCollected', type: 'number' },
      { name: 'totalExpenses', type: 'number' },
      { name: 'hasActiveSeizure', type: 'boolean' },
    ],
  },
  
  decisions: [
    {
      // Tam ödeme + masraflar karşılandı → Kapanış hazır
      if: 'totalCollected >= (totalDebt + totalExpenses)',
      thenUpdate: {
        closureReady: true,
        closureReason: 'FULL_PAYMENT',
      },
    },
    {
      // Alacak karşılandı ama masraflar eksik → Uyarı
      if: 'totalCollected >= totalDebt AND totalCollected < (totalDebt + totalExpenses)',
      thenAction: 'CREATE_WARNING',
      thenUpdate: {
        warningType: 'EXPENSES_NOT_COVERED',
        remainingExpenses: '${(totalDebt + totalExpenses) - totalCollected}',
      },
    },
    {
      // Aktif haciz var → Haciz kaldırma gerekli
      if: 'hasActiveSeizure == true AND closureReady == true',
      thenEnqueue: ['PrepareSeizureRelease'],
    },
  ],
  
  actions: [],
  
  postconditions: [
    'case.events += CLOSURE_EVALUATED',
  ],
  
  proof: {
    store: ['closureReady', 'closureReason', 'evaluatedAt'],
  },
  
  audit: {
    level: 'high',
    retainDays: 3650,
  },
  
  requiresApproval: true,
  
  priority: 'MEDIUM',
  isActive: true,
};
