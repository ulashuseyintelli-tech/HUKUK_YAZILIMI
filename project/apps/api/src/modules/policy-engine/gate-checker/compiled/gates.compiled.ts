/**
 * Compiled Gates
 * 
 * Bu dosya build-time'da YAML'dan otomatik üretilir.
 * MANUEL DÜZENLEME YAPMAYIN!
 * 
 * Üretim: npm run compile:rules
 * Kaynak: config/rules/locks_and_gates_v4.yaml
 * 
 * @generated
 */

import { ActionCode } from '../../types/action-code.enum';
import { CompiledGate } from '../gate-checker.types';
import { FactMap } from '../../fact-store';
import { ActionContext } from '../../types/policy-decision.interface';

// Version hash - YAML içeriğinden üretilir
export const RULE_VERSION = 'gates-v1.0.0-compiled-2026-01-13';
export const COMPILED_AT = '2026-01-13T00:00:00.000Z';

/**
 * Compiled Gates - Priority sırasına göre
 */
export const COMPILED_GATES: CompiledGate[] = [
  // ==================== HARD GATES ====================
  
  {
    gateCode: 'CASE_CLOSED',
    name: 'Dosya Kapalı',
    description: 'Kapalı dosyalarda işlem yapılamaz',
    actionCodes: '*', // Tüm aksiyonlar (REOPEN_CASE hariç - aşağıda override)
    condition: (facts: FactMap) => facts.get('case.is_closed') === true,
    severity: 'HARD',
    reason: 'Dosya kapalı. İşlem yapılamaz.',
    priority: 1,
  },

  {
    gateCode: 'CASE_ARCHIVED',
    name: 'Dosya Arşivde',
    description: 'Arşivlenmiş dosyalarda işlem yapılamaz',
    actionCodes: '*',
    condition: (facts: FactMap) => facts.get('case.is_archived') === true,
    severity: 'HARD',
    reason: 'Dosya arşivde. Önce arşivden çıkarın.',
    priority: 2,
  },

  {
    gateCode: 'EXPENSE_BLOCKING',
    name: 'Masraf Engeli',
    description: 'Ödenmemiş masraf talebi varken UYAP işlemi yapılamaz',
    actionCodes: [
      ActionCode.UYAP_SEND,
      ActionCode.SEND_NOTIFICATION,
      ActionCode.SEND_PAYMENT_ORDER,
      ActionCode.TRIGGER_HACIZ,
      ActionCode.REQUEST_SALE,
    ],
    condition: (facts: FactMap) => facts.get('case.has_unpaid_blocking_expense') === true,
    severity: 'HARD',
    reason: 'Ödenmemiş masraf talebi var. UYAP işlemi yapılamaz.',
    priority: 10,
  },

  {
    gateCode: 'UYAP_DISABLED',
    name: 'UYAP Devre Dışı',
    description: 'Bu dosya için UYAP işlemleri kapatılmış',
    actionCodes: [
      ActionCode.UYAP_SEND,
      ActionCode.UYAP_QUERY,
      ActionCode.SEND_NOTIFICATION,
      ActionCode.SEND_PAYMENT_ORDER,
    ],
    condition: (facts: FactMap) => facts.get('case.allow_uyap_actions') === false,
    severity: 'HARD',
    reason: 'Bu dosya için UYAP işlemleri devre dışı.',
    priority: 11,
  },

  {
    gateCode: 'ARTICLE_4_REQUIRED',
    name: '4. Madde Talebi Gerekli',
    description: 'Ödeme emri için 4. madde talebi zorunlu',
    actionCodes: [ActionCode.SEND_PAYMENT_ORDER],
    condition: (facts: FactMap) => facts.get('case.has_article_4_request') !== true,
    severity: 'HARD',
    reason: 'Ödeme emri için 4. madde talebi gerekli.',
    priority: 20,
  },

  {
    gateCode: 'NO_VALID_ADDRESS',
    name: 'Geçerli Adres Yok',
    description: 'Tebligat için geçerli adres gerekli',
    actionCodes: [ActionCode.SEND_NOTIFICATION],
    condition: (facts: FactMap, context?: ActionContext) => {
      if (context?.debtorId) {
        return facts.get(`debtor.${context.debtorId}.has_valid_address`) !== true;
      }
      return facts.get('case.has_any_valid_address') !== true;
    },
    severity: 'HARD',
    reason: 'Borçlunun geçerli adresi yok. Tebligat yapılamaz.',
    priority: 21,
  },

  {
    gateCode: 'NOTIFICATION_NOT_DELIVERED',
    name: 'Tebligat Yapılmamış',
    description: 'Haciz için tebligat yapılmış olmalı',
    actionCodes: [ActionCode.TRIGGER_HACIZ, ActionCode.REQUEST_ENFORCEMENT],
    condition: (facts: FactMap, context?: ActionContext) => {
      if (context?.debtorId) {
        return facts.get(`debtor.${context.debtorId}.notification_delivered`) !== true;
      }
      return facts.get('case.any_notification_delivered') !== true;
    },
    severity: 'HARD',
    reason: 'Haciz için önce tebligat yapılmalı.',
    priority: 22,
  },

  {
    gateCode: 'OBJECTION_PERIOD_NOT_PASSED',
    name: 'İtiraz Süresi Dolmamış',
    description: '7 günlük itiraz süresi geçmeli',
    actionCodes: [ActionCode.TRIGGER_HACIZ, ActionCode.REQUEST_ENFORCEMENT],
    condition: (facts: FactMap, context?: ActionContext) => {
      const daysSince = context?.debtorId
        ? facts.get(`debtor.${context.debtorId}.days_since_notification`)
        : facts.get('case.min_days_since_notification');
      
      if (typeof daysSince !== 'number') return true; // Tebligat yok
      return daysSince < 7;
    },
    severity: 'HARD',
    reason: '7 günlük itiraz süresi henüz dolmadı.',
    priority: 23,
  },

  {
    gateCode: 'NO_HACIZ_APPLIED',
    name: 'Haciz Uygulanmamış',
    description: 'Satış için haciz uygulanmış olmalı',
    actionCodes: [ActionCode.REQUEST_SALE],
    condition: (facts: FactMap, context?: ActionContext) => {
      if (context?.assetId) {
        return facts.get(`asset.${context.assetId}.haciz_applied`) !== true;
      }
      return facts.get('case.any_haciz_applied') !== true;
    },
    severity: 'HARD',
    reason: 'Satış için önce haciz uygulanmalı.',
    priority: 24,
  },

  {
    gateCode: 'POWER_OF_ATTORNEY_MISSING',
    name: 'Vekaletname Eksik',
    description: 'UYAP işlemleri için vekaletname gerekli',
    actionCodes: [ActionCode.UYAP_SEND],
    condition: (facts: FactMap) => facts.get('case.has_power_of_attorney') !== true,
    severity: 'HARD',
    reason: 'UYAP işlemi için vekaletname gerekli.',
    priority: 25,
  },

  // ==================== SOFT GATES (WARNINGS) ====================

  {
    gateCode: 'AUTOMATION_DISABLED',
    name: 'Otomasyon Kapalı',
    description: 'Otomasyon devre dışı, manuel onay gerekebilir',
    actionCodes: [
      ActionCode.REQUEST_ENFORCEMENT,
      ActionCode.PROCEED_TO_ENFORCEMENT,
      ActionCode.TRIGGER_HACIZ,
    ],
    condition: (facts: FactMap) => facts.get('case.is_automation_enabled') === false,
    severity: 'SOFT',
    reason: 'Otomasyon devre dışı. Manuel onay gerekebilir.',
    priority: 100,
  },

  {
    gateCode: 'HIGH_RISK_DEBTOR',
    name: 'Yüksek Riskli Borçlu',
    description: 'Borçlu yüksek riskli olarak işaretlenmiş',
    actionCodes: [
      ActionCode.TRIGGER_HACIZ,
      ActionCode.REQUEST_SALE,
      ActionCode.SEND_DEBTOR_MSG,
    ],
    condition: (facts: FactMap, context?: ActionContext) => {
      if (context?.debtorId) {
        return facts.get(`debtor.${context.debtorId}.risk_level`) === 'HIGH';
      }
      return false;
    },
    severity: 'SOFT',
    reason: 'Borçlu yüksek riskli. Dikkatli olun.',
    priority: 101,
  },

  {
    gateCode: 'LARGE_AMOUNT',
    name: 'Yüksek Tutarlı Dosya',
    description: 'Dosya tutarı yüksek, ekstra dikkat gerekli',
    actionCodes: [
      ActionCode.TRIGGER_HACIZ,
      ActionCode.REQUEST_SALE,
      ActionCode.FINALIZE_CASE,
    ],
    condition: (facts: FactMap) => {
      const amount = facts.get('case.total_debt_amount');
      return typeof amount === 'number' && amount > 1000000; // 1M TL üzeri
    },
    severity: 'SOFT',
    reason: 'Yüksek tutarlı dosya. Ekstra dikkat gerekli.',
    priority: 102,
  },

  {
    gateCode: 'PENDING_EXPENSE_REQUEST',
    name: 'Bekleyen Masraf Talebi',
    description: 'Onay bekleyen masraf talebi var',
    actionCodes: [ActionCode.REQUEST_EXPENSE],
    condition: (facts: FactMap) => facts.get('case.has_pending_expense_request') === true,
    severity: 'SOFT',
    reason: 'Zaten bekleyen bir masraf talebi var.',
    priority: 103,
  },

  {
    gateCode: 'MULTIPLE_DEBTORS',
    name: 'Çoklu Borçlu',
    description: 'Dosyada birden fazla borçlu var',
    actionCodes: [
      ActionCode.SEND_NOTIFICATION,
      ActionCode.TRIGGER_HACIZ,
    ],
    condition: (facts: FactMap) => {
      const count = facts.get('case.debtor_count');
      return typeof count === 'number' && count > 1;
    },
    severity: 'SOFT',
    reason: 'Dosyada birden fazla borçlu var. Tüm borçlular için işlem yapıldığından emin olun.',
    priority: 104,
  },
];

/**
 * Gate'leri actionCode'a göre filtrele
 */
export function getGatesForAction(actionCode: ActionCode): CompiledGate[] {
  return COMPILED_GATES
    .filter(gate => {
      if (gate.actionCodes === '*') {
        // REOPEN_CASE için CASE_CLOSED ve CASE_ARCHIVED gate'lerini atla
        if (actionCode === ActionCode.REOPEN_CASE) {
          return !['CASE_CLOSED', 'CASE_ARCHIVED'].includes(gate.gateCode);
        }
        return true;
      }
      return gate.actionCodes.includes(actionCode);
    })
    .sort((a, b) => a.priority - b.priority);
}

/**
 * Sadece HARD gate'leri getir
 */
export function getHardGatesForAction(actionCode: ActionCode): CompiledGate[] {
  return getGatesForAction(actionCode).filter(g => g.severity === 'HARD');
}

/**
 * Sadece SOFT gate'leri getir
 */
export function getSoftGatesForAction(actionCode: ActionCode): CompiledGate[] {
  return getGatesForAction(actionCode).filter(g => g.severity === 'SOFT');
}
