/**
 * Effective Permission Types — Guided-Open per-user karar katmanı (P2a CORE).
 *
 * Bağlam: docs/yetki-agaci-guided-open-final.md + docs/p2-guided-open-observe-mode-scope.md.
 *
 * KESİN KURAL (P2 / #503): Bu tipler OBSERVE-MODE içindir. Resolver hiçbir kullanıcı
 * aksiyonunu ENGELLEMEZ; yalnız kararı HESAPLAR. `enforced` her zaman `false`,
 * `mode` her zaman `'observe'`. Gerçek engel (route/confirm/approval/hardware) P3+ fazlarına aittir.
 */

import { ActionCode } from './action-code.enum';

/** Resolver kararı (hesaplanan; P2'de uygulanmaz). */
export enum GuidedOpenDecision {
  ALLOW = 'ALLOW',
  CONFIRM_REQUIRED = 'CONFIRM_REQUIRED',
  ROUTE_REQUIRED = 'ROUTE_REQUIRED',
  APPROVAL_REQUIRED = 'APPROVAL_REQUIRED',
  HARDWARE_REQUIRED = 'HARDWARE_REQUIRED',
  DENY_TENANT_BOUNDARY = 'DENY_TENANT_BOUNDARY',
}

/** Kararın kaynağı (decision_source). */
export enum DecisionSource {
  OPEN = 'OPEN',
  CASE_GRANT = 'CASE_GRANT',
  OFFICE_DEFAULT = 'OFFICE_DEFAULT',
  FULL_AUTHORITY = 'FULL_AUTHORITY',
  CONFIRM_REQUIRED = 'CONFIRM_REQUIRED',
  VALIDITY_ROUTE = 'VALIDITY_ROUTE',
  APPROVAL_REQUIRED = 'APPROVAL_REQUIRED',
  HARDWARE = 'HARDWARE',
  TENANT_BOUNDARY = 'TENANT_BOUNDARY',
}

/** Aksiyon sınıfı (L0-L4). */
export enum ActionClass {
  L0 = 'L0', // tenant boundary
  L1 = 'L1', // açık operasyon
  L2 = 'L2', // hassas mutation
  L3 = 'L3', // geri-alınamaz / guarded-edge
  L4 = 'L4', // validity / hardware
}

/**
 * Capacity = mesleki sıfat. Lawyer.lawyerRank XOR StaffMember.staffType.
 * (Tek 'role' kolonu yok; resolver ikisini ayrı okur.)
 */
export type Capacity =
  | 'PARTNER'
  | 'MANAGER'
  | 'AUTHORIZED'
  | 'LAWYER'
  | 'INTERN'
  | 'STAJYER_AVUKAT'
  | 'OFIS_KATIBI'
  | 'ADLI_KATIP'
  | 'SEKRETER'
  | 'MUHASEBE'
  | 'ARSIV'
  | 'DIGER'
  | 'UNKNOWN';

/** Resolver girdisi. caseId OPSİYONEL (office-wide action'lar: bank.transfer, credential...). */
export interface EffectivePermissionInput {
  actorUserId: string;
  tenantId: string;
  caseId?: string;
  actionCode: ActionCode;
  context?: Record<string, unknown>;
}

/**
 * Resolver çıktısı (observe-mode).
 * `enforced` her zaman false; `would_require_*` ilerideki guarded-edge davranışını ÖLÇER.
 */
export interface EffectivePermissionDecision {
  mode: 'observe';
  enforced: false;
  decision: GuidedOpenDecision;
  decisionSource: DecisionSource;
  actionClass: ActionClass;
  capacity: Capacity;
  hasCaseMembership: boolean;
  caseGrantPresent: boolean;
  fullAuthority: boolean;
  wouldRequireConfirm: boolean;
  wouldRequireRoute: boolean;
  wouldRequireApproval: boolean;
  wouldRequireHardware: boolean;
  wouldDenyTenantBoundary: boolean;
  reason: string;
}
