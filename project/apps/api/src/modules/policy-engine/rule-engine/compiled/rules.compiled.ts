/**
 * Compiled Rules
 * 
 * Bu dosya build-time'da YAML'dan otomatik üretilir.
 * MANUEL DÜZENLEME YAPMAYIN!
 * 
 * Üretim: npm run compile:rules
 * Kaynak: config/rules/decision_rules_v4.yaml
 * 
 * @generated
 */

import { ActionCode } from '../../types/action-code.enum';
import { Scope } from '../../types/scope.enum';
import { CompiledRule } from '../rule-engine.types';
import { FactMap } from '../../fact-store';
import { StateInfo } from '../../types/policy-decision.interface';
import { ComputedMetrics } from '../rule-engine.types';

// Version hash - YAML içeriğinden üretilir
export const RULE_VERSION = 'rules-v1.0.1-compiled-2026-06-12';
export const COMPILED_AT = '2026-06-12T00:00:00.000Z';

/**
 * Compiled Rules - Priority sırasına göre
 */
export const COMPILED_RULES: CompiledRule[] = [
  // ==================== UYAP RULES ====================
  
  {
    ruleId: 'RULE_UYAP_SEND_INITIAL',
    name: 'UYAP Gönderim - Yeni Dosya',
    description: 'Yeni açılan dosyalar için UYAP gönderimi öner',
    when: (facts: FactMap, state: StateInfo) => {
      return state.currentState === 'INITIAL' &&
             facts.get('case.has_power_of_attorney') === true &&
             facts.get('expense.opening.paid') === true;
    },
    then: {
      actionCode: ActionCode.UYAP_SEND,
      priority: 10,
      reason: 'Dosya UYAP\'a gönderilmeye hazır',
      scope: Scope.CASE,
    },
    validStages: ['INITIAL'],
    isActive: true,
  },

  {
    ruleId: 'RULE_PAYMENT_ORDER_AFTER_UYAP',
    name: 'Ödeme Emri - UYAP Sonrası',
    description: 'UYAP gönderimi sonrası ödeme emri öner',
    when: (facts: FactMap, state: StateInfo) => {
      return state.currentState === 'UYAP_SENT' &&
             facts.get('case.has_article_4_request') === true;
    },
    then: {
      actionCode: ActionCode.SEND_PAYMENT_ORDER,
      priority: 15,
      reason: 'Ödeme emri gönderilmeye hazır',
      scope: Scope.CASE,
    },
    validStages: ['UYAP_SENT'],
    isActive: true,
  },

  // ==================== NOTIFICATION RULES ====================

  {
    ruleId: 'RULE_NOTIFICATION_READY',
    name: 'Tebligat - Adres Mevcut',
    description: 'Geçerli adresi olan borçlulara tebligat öner',
    when: (facts: FactMap, state: StateInfo) => {
      return state.currentState === 'PAYMENT_ORDER_SENT' &&
             facts.get('case.has_any_valid_address') === true;
    },
    then: {
      actionCode: ActionCode.SEND_NOTIFICATION,
      priority: 20,
      reason: 'Borçluya tebligat gönderilebilir',
      scope: Scope.DEBTOR,
    },
    validStages: ['PAYMENT_ORDER_SENT'],
    isActive: true,
  },

  // ==================== ENFORCEMENT RULES ====================

  {
    ruleId: 'RULE_ENFORCEMENT_AFTER_NOTIFICATION',
    name: 'Haciz Talebi - Tebligat Sonrası',
    description: 'Tebligat yapıldıktan ve itiraz süresi dolduktan sonra haciz öner',
    when: (facts: FactMap, state: StateInfo, metrics: ComputedMetrics) => {
      const daysSince = facts.get('case.min_days_since_notification');
      // İtiraz süresi icra türüne göre (kambiyo 5 / ilamsız 7); gate ile aynı fact
      const period = facts.get('case.objection_period_days');
      const threshold = typeof period === 'number' ? period : 7;
      return state.currentState === 'NOTIFICATION_DELIVERED' &&
             typeof daysSince === 'number' &&
             daysSince >= threshold &&
             facts.get('case.has_objection') !== true;
    },
    then: {
      actionCode: ActionCode.REQUEST_ENFORCEMENT,
      priority: 25,
      reason: 'İtiraz süresi doldu, haciz talep edilebilir',
      scope: Scope.CASE,
    },
    validStages: ['NOTIFICATION_DELIVERED', 'WAITING_OBJECTION_PERIOD'],
    isActive: true,
  },

  {
    ruleId: 'RULE_HACIZ_TRIGGER',
    name: 'Haciz Uygulama',
    description: 'Haciz talebi onaylandıktan sonra haciz uygulama öner',
    when: (facts: FactMap, state: StateInfo) => {
      return state.currentState === 'ENFORCEMENT_REQUESTED' &&
             facts.get('case.haciz_approved') === true;
    },
    then: {
      actionCode: ActionCode.TRIGGER_HACIZ,
      priority: 30,
      reason: 'Haciz uygulanabilir',
      scope: Scope.ASSET,
    },
    validStages: ['ENFORCEMENT_REQUESTED'],
    isActive: true,
  },

  // ==================== ASSET QUERY RULES ====================

  {
    ruleId: 'RULE_QUERY_ASSETS_AFTER_NOTIFICATION',
    name: 'Varlık Sorgulama - Tebligat Sonrası',
    description: 'Tebligat yapıldıktan sonra varlık sorgulama öner',
    when: (facts: FactMap, state: StateInfo) => {
      const lastQueryDays = facts.get('case.days_since_last_asset_query');
      return state.currentState === 'NOTIFICATION_DELIVERED' &&
             (lastQueryDays === undefined || (typeof lastQueryDays === 'number' && lastQueryDays > 30));
    },
    then: {
      actionCode: ActionCode.QUERY_ASSETS,
      priority: 40,
      reason: 'Borçlu varlıkları sorgulanabilir',
      scope: Scope.DEBTOR,
    },
    validStages: ['NOTIFICATION_DELIVERED', 'ENFORCEMENT_REQUESTED', 'HACIZ_APPLIED'],
    isActive: true,
  },

  {
    ruleId: 'RULE_QUERY_BANK_ACCOUNTS',
    name: 'Banka Hesabı Sorgulama',
    description: 'Banka hesaplarını sorgula',
    when: (facts: FactMap, state: StateInfo) => {
      const lastQueryDays = facts.get('case.days_since_last_bank_query');
      return ['NOTIFICATION_DELIVERED', 'ENFORCEMENT_REQUESTED', 'HACIZ_APPLIED'].includes(state.currentState) &&
             (lastQueryDays === undefined || (typeof lastQueryDays === 'number' && lastQueryDays > 15));
    },
    then: {
      actionCode: ActionCode.QUERY_BANK_ACCOUNTS,
      priority: 45,
      reason: 'Banka hesapları sorgulanabilir',
      scope: Scope.DEBTOR,
    },
    validStages: ['NOTIFICATION_DELIVERED', 'ENFORCEMENT_REQUESTED', 'HACIZ_APPLIED'],
    isActive: true,
  },

  // ==================== SALE RULES ====================

  {
    ruleId: 'RULE_REQUEST_SALE',
    name: 'Satış Talebi',
    description: 'Haciz uygulanan mallar için satış öner',
    when: (facts: FactMap, state: StateInfo) => {
      return state.currentState === 'HACIZ_APPLIED' &&
             facts.get('case.has_seized_assets') === true &&
             facts.get('case.sale_requested') !== true;
    },
    then: {
      actionCode: ActionCode.REQUEST_SALE,
      priority: 35,
      reason: 'Hacizli malların satışı talep edilebilir',
      scope: Scope.ASSET,
    },
    validStages: ['HACIZ_APPLIED'],
    isActive: true,
  },

  // ==================== EXPENSE RULES ====================

  {
    ruleId: 'RULE_REQUEST_EXPENSE_OPENING',
    name: 'Açılış Masrafı Talebi',
    description: 'Yeni dosyalar için açılış masrafı öner',
    when: (facts: FactMap, state: StateInfo) => {
      return state.currentState === 'INITIAL' &&
             facts.get('expense.opening.requested') !== true &&
             facts.get('expense.opening.paid') !== true;
    },
    then: {
      actionCode: ActionCode.REQUEST_EXPENSE,
      priority: 5,
      reason: 'Açılış masrafı talep edilmeli',
      scope: Scope.EXPENSE,
    },
    validStages: ['INITIAL'],
    isActive: true,
  },

  {
    ruleId: 'RULE_REQUEST_EXPENSE_HACIZ',
    name: 'Haciz Masrafı Talebi',
    description: 'Haciz öncesi masraf talebi öner',
    when: (facts: FactMap, state: StateInfo) => {
      return state.currentState === 'ENFORCEMENT_REQUESTED' &&
             facts.get('expense.haciz.requested') !== true &&
             facts.get('expense.haciz.paid') !== true;
    },
    then: {
      actionCode: ActionCode.REQUEST_EXPENSE,
      priority: 22,
      reason: 'Haciz masrafı talep edilmeli',
      scope: Scope.EXPENSE,
    },
    validStages: ['ENFORCEMENT_REQUESTED'],
    isActive: true,
  },

  // ==================== COLLECTION RULES ====================

  {
    ruleId: 'RULE_RECORD_COLLECTION',
    name: 'Tahsilat Kaydı',
    description: 'Bekleyen tahsilat varsa kayıt öner',
    when: (facts: FactMap, state: StateInfo) => {
      return facts.get('case.has_pending_collection') === true;
    },
    then: {
      actionCode: ActionCode.RECORD_COLLECTION,
      priority: 8,
      reason: 'Bekleyen tahsilat kaydedilmeli',
      scope: Scope.CASE,
    },
    isActive: true,
  },

  // ==================== FINALIZATION RULES ====================

  {
    ruleId: 'RULE_FINALIZE_FULL_COLLECTION',
    name: 'Dosya Kapatma - Tam Tahsilat',
    description: 'Tam tahsilat yapıldığında dosya kapatma öner',
    when: (facts: FactMap, state: StateInfo, metrics: ComputedMetrics) => {
      return metrics.collectionRate !== undefined &&
             metrics.collectionRate >= 100 &&
             state.currentState !== 'CLOSED_PAID';
    },
    then: {
      actionCode: ActionCode.FINALIZE_CASE,
      priority: 3,
      reason: 'Alacak tamamen tahsil edildi, dosya kapatılabilir',
      scope: Scope.CASE,
    },
    isActive: true,
  },

  // ==================== DEBTOR MESSAGE RULES ====================

  {
    ruleId: 'RULE_SEND_REMINDER',
    name: 'Borçlu Hatırlatma',
    description: 'Uzun süredir işlem yapılmayan dosyalarda hatırlatma öner',
    when: (facts: FactMap, state: StateInfo, metrics: ComputedMetrics) => {
      return metrics.daysSinceLastAction !== undefined &&
             metrics.daysSinceLastAction > 30 &&
             !['CLOSED_PAID', 'CLOSED_SETTLED', 'CLOSED_WITHDRAWN', 'ARCHIVED'].includes(state.currentState);
    },
    then: {
      actionCode: ActionCode.SEND_DEBTOR_MSG,
      priority: 50,
      reason: '30 günden fazla işlem yapılmadı, hatırlatma gönderilebilir',
      scope: Scope.DEBTOR,
    },
    isActive: true,
  },
];

/**
 * Aktif kuralları getir
 */
export function getActiveRules(): CompiledRule[] {
  return COMPILED_RULES.filter(r => r.isActive);
}

/**
 * Belirli bir aşama için geçerli kuralları getir
 */
export function getRulesForStage(stage: string): CompiledRule[] {
  return COMPILED_RULES.filter(r => 
    r.isActive && 
    (!r.validStages || r.validStages.includes(stage))
  );
}

/**
 * Belirli bir scope için kuralları getir
 */
export function getRulesForScope(scope: Scope): CompiledRule[] {
  return COMPILED_RULES.filter(r => r.isActive && r.then.scope === scope);
}
