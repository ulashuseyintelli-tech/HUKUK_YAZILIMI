/**
 * Effective Permission Mapping + saf karar mantığı (Guided-Open, P2a CORE).
 *
 * Saf (IO yok) → kolay unit test. Resolver service bu fonksiyonları çağırır.
 * KESİN KURAL: kararı yalnız HESAPLAR; uygulamaz (observe-mode).
 */

import { ActionCode } from './types/action-code.enum';
import {
  ActionClass,
  Capacity,
  DecisionSource,
  GuidedOpenDecision,
} from './types/effective-permission.types';

// ============================================
// casePermissions ↔ ActionCode v1 mapping
// ============================================

/** casePermissions Json anahtarı / hasSignatureAuthority → ActionCode. */
export const CASE_PERMISSION_TO_ACTION: Readonly<Record<string, ActionCode>> = {
  canEditCase: ActionCode.EDIT_CASE,
  canGenerateDocs: ActionCode.GENERATE_DOC,
  canSyncUYAP: ActionCode.SYNC_UYAP,
  canViewFinance: ActionCode.VIEW_FINANCE,
  canEditFinance: ActionCode.EDIT_FINANCE,
  canChangeStatus: ActionCode.CHANGE_STATUS,
  canEditParties: ActionCode.EDIT_PARTIES,
  hasSignatureAuthority: ActionCode.SIGN,
  // receiveNotifications → permission DEĞİL (notification subscription); kasıtlı olarak YOK.
};

/** ActionCode → casePermissions Json anahtarı (grant okuması için ters harita; SIGN ayrı boolean alandır). */
export const ACTION_TO_CASE_PERMISSION: Readonly<Partial<Record<ActionCode, string>>> = {
  [ActionCode.EDIT_CASE]: 'canEditCase',
  [ActionCode.GENERATE_DOC]: 'canGenerateDocs',
  [ActionCode.SYNC_UYAP]: 'canSyncUYAP',
  [ActionCode.VIEW_FINANCE]: 'canViewFinance',
  [ActionCode.EDIT_FINANCE]: 'canEditFinance',
  [ActionCode.CHANGE_STATUS]: 'canChangeStatus',
  [ActionCode.EDIT_PARTIES]: 'canEditParties',
};

// ============================================
// Aksiyon sınıflandırması (action class set'leri)
// ============================================

/** Validity-route: hukuki geçerlilik → kalifiye kişi gerekir. fullAuthority AŞAMAZ. */
export const VALIDITY_ROUTE_ACTIONS: ReadonlySet<ActionCode> = new Set([ActionCode.SIGN]);

/** Hardware: devlete resmî gönderim → e-imza donanımı. fullAuthority AŞAMAZ. */
export const HARDWARE_ACTIONS: ReadonlySet<ActionCode> = new Set([
  ActionCode.UYAP_SEND,
  ActionCode.TRIGGER_HACIZ,
]);

/** Guarded-edge: onay gerektiren (geri-alınamaz finans onayı vb.). */
export const GUARDED_EDGE_APPROVAL: ReadonlySet<ActionCode> = new Set([ActionCode.APPROVE_EXPENSE]);

/** Guarded-edge: tek-yön / dış-etki → confirm. */
export const GUARDED_EDGE_CONFIRM: ReadonlySet<ActionCode> = new Set([
  ActionCode.CLOSE_CASE,
  ActionCode.FINALIZE_CASE,
  ActionCode.ARCHIVE_CASE,
  ActionCode.REQUEST_SALE,
  ActionCode.REQUEST_ENFORCEMENT,
  ActionCode.PROCEED_TO_ENFORCEMENT,
  ActionCode.EVICTION_REQUEST,
  ActionCode.SEND_NOTIFICATION,
  ActionCode.SEND_PAYMENT_ORDER,
  ActionCode.SEND_DEBTOR_MSG,
  // P2b-1 pilot (geri-alınamaz / hukuki / güvenlik → guarded-edge confirm)
  ActionCode.DELETE_CASE,
  ActionCode.ASSIGN_LEGAL_RESPONSIBLE,
  ActionCode.MANAGE_OFFICE_CREDENTIALS,
]);

/** L2 hassas mutation: case-member ise allow, değilse confirm+notify. */
export const L2_SENSITIVE_ACTIONS: ReadonlySet<ActionCode> = new Set([
  ActionCode.CHANGE_STATUS,
  ActionCode.EDIT_PARTIES,
  ActionCode.EDIT_FINANCE,
  ActionCode.REQUEST_EXPENSE,
  ActionCode.RECORD_COLLECTION,
  ActionCode.RECORD_PAYMENT,
  ActionCode.RECORD_EXPENSE_PAYMENT,
  ActionCode.REOPEN_CASE,
  ActionCode.CONVERT_FROM_MTS,
  ActionCode.NOTIFICATION_DELIVERED,
]);

/** Diğer her şey (EDIT_CASE/GENERATE_DOC/SYNC_UYAP/VIEW_FINANCE/UYAP_QUERY/QUERY_*...) = L1 açık. */
export function classifyAction(actionCode: ActionCode): ActionClass {
  if (VALIDITY_ROUTE_ACTIONS.has(actionCode) || HARDWARE_ACTIONS.has(actionCode)) return ActionClass.L4;
  if (GUARDED_EDGE_APPROVAL.has(actionCode) || GUARDED_EDGE_CONFIRM.has(actionCode)) return ActionClass.L3;
  if (L2_SENSITIVE_ACTIONS.has(actionCode)) return ActionClass.L2;
  return ActionClass.L1;
}

// ============================================
// Capacity yardımcıları
// ============================================

/** SIGN/validity için kalifiye = avukat rütbesi (INTERN HARİÇ; stajyer imza atamaz). */
export function isQualifiedForValidity(capacity: Capacity): boolean {
  return (
    capacity === 'PARTNER' ||
    capacity === 'MANAGER' ||
    capacity === 'AUTHORIZED' ||
    capacity === 'LAWYER'
  );
}

/** Office-admin = PARTNER veya MANAGER (cross-case müdahale istisnası). */
export function isOfficeAdminCapacity(capacity: Capacity): boolean {
  return capacity === 'PARTNER' || capacity === 'MANAGER';
}

// ============================================
// Saf karar fonksiyonu (4-katman: tenant > validity-route > guarded-edge > guided-open)
// ============================================

export interface DecideParams {
  actionCode: ActionCode;
  actionClass: ActionClass;
  capacity: Capacity;
  tenantOk: boolean;
  hasCaseMembership: boolean;
  caseGrantPresent: boolean;
  isOfficeAdmin: boolean;
  fullAuthority: boolean;
}

export interface DecideResult {
  decision: GuidedOpenDecision;
  decisionSource: DecisionSource;
}

export function decide(p: DecideParams): DecideResult {
  // 1) TENANT BOUNDARY — tek mutlak yazılım güvenlik sınırı.
  if (!p.tenantOk) {
    return { decision: GuidedOpenDecision.DENY_TENANT_BOUNDARY, decisionSource: DecisionSource.TENANT_BOUNDARY };
  }

  // 2) VALIDITY ROUTE — kanun; fullAuthority AŞAMAZ.
  if (VALIDITY_ROUTE_ACTIONS.has(p.actionCode)) {
    if (!isQualifiedForValidity(p.capacity)) {
      return { decision: GuidedOpenDecision.ROUTE_REQUIRED, decisionSource: DecisionSource.VALIDITY_ROUTE };
    }
    return {
      decision: GuidedOpenDecision.ALLOW,
      decisionSource: p.caseGrantPresent ? DecisionSource.CASE_GRANT : DecisionSource.OFFICE_DEFAULT,
    };
  }

  // 3) HARDWARE — devlete resmî gönderim donanımda; fullAuthority AŞAMAZ.
  if (HARDWARE_ACTIONS.has(p.actionCode)) {
    return { decision: GuidedOpenDecision.HARDWARE_REQUIRED, decisionSource: DecisionSource.HARDWARE };
  }

  // 4) FULL AUTHORITY — guarded-edge confirm'i kaldırır (validity/hardware HARİÇ, yukarıda ele alındı).
  if (p.fullAuthority) {
    return { decision: GuidedOpenDecision.ALLOW, decisionSource: DecisionSource.FULL_AUTHORITY };
  }

  // 5) GUARDED-EDGE approval.
  if (GUARDED_EDGE_APPROVAL.has(p.actionCode)) {
    return { decision: GuidedOpenDecision.APPROVAL_REQUIRED, decisionSource: DecisionSource.APPROVAL_REQUIRED };
  }

  // 6) GUARDED-EDGE confirm (tek-yön / dış-etki).
  if (GUARDED_EDGE_CONFIRM.has(p.actionCode)) {
    return { decision: GuidedOpenDecision.CONFIRM_REQUIRED, decisionSource: DecisionSource.CONFIRM_REQUIRED };
  }

  // 7) L2 hassas mutation.
  if (p.actionClass === ActionClass.L2) {
    if (p.hasCaseMembership || p.isOfficeAdmin) {
      return {
        decision: GuidedOpenDecision.ALLOW,
        decisionSource: p.caseGrantPresent ? DecisionSource.CASE_GRANT : DecisionSource.OFFICE_DEFAULT,
      };
    }
    return { decision: GuidedOpenDecision.CONFIRM_REQUIRED, decisionSource: DecisionSource.CONFIRM_REQUIRED };
  }

  // 8) GUIDED-OPEN (L1/L0 açık) — varsayılan ALLOW + audit.
  return {
    decision: GuidedOpenDecision.ALLOW,
    decisionSource: p.caseGrantPresent ? DecisionSource.CASE_GRANT : DecisionSource.OPEN,
  };
}
