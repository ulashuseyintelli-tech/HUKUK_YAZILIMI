/**
 * F02 — Manuel scheduler tetikleme yetki politikasi (SAF, IO-suz).
 *
 * Owner karari (2026-09-06): manuel `POST /scheduler/*` cagrilari icin esik, OWN-13 I02-R3 ile
 * RATIFIYE edilen toplu-mutasyon esigiyle AYNIDIR:
 *   - VIEWER: DENY (coarse gate)
 *   - elevated authority: `OfficeApprovalService.isApproverEligible` (PARTNER veya
 *     canApproveOfficeActions). `UserRole.ADMIN` TEK BASINA YETMEZ.
 * Bu dosya politikayi HESAPLAMAZ; caginan `elevatedAuthority` degerini verir (I02-R3
 * `decideClientBulkMutation` ile ayni desen). CLIENT modulune bagimlilik YOKTUR.
 *
 * Manuel calismanin tenant kapsami HER ZAMAN aktorun tenant'idir (HTTP istegi global
 * kapsam SECEMEZ); bkz. SchedulerService.runManual.
 */

export type SchedulerActorRole = 'ADMIN' | 'USER' | 'VIEWER';

/** JWT ile dogrulanmis aktor baglami (req.user'dan turetilir). */
export interface SchedulerActor {
  userId: string;
  tenantId: string;
  role: string;
}

export const SCHEDULER_MANUAL_RUN_REASON = {
  ALLOWED: 'SCHEDULER_MANUAL_RUN_ALLOWED',
  NO_ACTOR: 'SCHEDULER_MANUAL_RUN_DENIED_NO_ACTOR',
  UNKNOWN_ROLE: 'SCHEDULER_MANUAL_RUN_DENIED_UNKNOWN_ROLE',
  VIEWER_DENIED: 'SCHEDULER_MANUAL_RUN_DENIED_VIEWER',
  ELEVATED_DENIED: 'SCHEDULER_MANUAL_RUN_DENIED_NOT_ELEVATED',
} as const;

export type SchedulerManualRunReason =
  (typeof SCHEDULER_MANUAL_RUN_REASON)[keyof typeof SCHEDULER_MANUAL_RUN_REASON];

export interface SchedulerManualRunDecision {
  allowed: boolean;
  reasonCode: SchedulerManualRunReason;
}

/** Manuel tetiklenebilir islemler — controller'in sunabildigi TEK kume. */
export const MANUAL_SCHEDULER_OPERATIONS = [
  'run-all',
  'payment-orders',
  'nafaka',
  'mts',
  'uyap-retry',
] as const;
export type ManualSchedulerOperation = (typeof MANUAL_SCHEDULER_OPERATIONS)[number];

function normalizeRole(role: string | null | undefined): SchedulerActorRole | null {
  if (role === 'ADMIN' || role === 'USER' || role === 'VIEWER') return role;
  return null;
}

/**
 * Cagrildigi yerler:
 *  - SchedulerService.assertCanRunManual() → her manuel tetiklemeden ONCE (hicbir DB yazimi olmadan)
 */
export function decideManualSchedulerRun(input: {
  userId: string | null | undefined;
  role: string | null | undefined;
  elevatedAuthority: boolean;
}): SchedulerManualRunDecision {
  if (!input.userId) {
    return { allowed: false, reasonCode: SCHEDULER_MANUAL_RUN_REASON.NO_ACTOR };
  }
  const role = normalizeRole(input.role);
  if (role === null) {
    return { allowed: false, reasonCode: SCHEDULER_MANUAL_RUN_REASON.UNKNOWN_ROLE };
  }
  if (role === 'VIEWER') {
    return { allowed: false, reasonCode: SCHEDULER_MANUAL_RUN_REASON.VIEWER_DENIED };
  }
  if (input.elevatedAuthority !== true) {
    return { allowed: false, reasonCode: SCHEDULER_MANUAL_RUN_REASON.ELEVATED_DENIED };
  }
  return { allowed: true, reasonCode: SCHEDULER_MANUAL_RUN_REASON.ALLOWED };
}
