/**
 * OFFICE-P2-IDENTITY-COMPLETION-R01 — GİRDİ PAKETİ DOĞRULAMA + OPERATE PLAN ÇEKİRDEĞİ.
 *
 * D1 zinciri "dry-run → diff owner onayına sunulur → operate"tır. Bu çekirdek zincirin
 * iki saf halkasını sağlar:
 *
 *  1) `parseBindingInputPackage()` — owner-onaylı girdi paketinin YAPISAL doğrulaması.
 *     Fail-closed: bilinmeyen alan, eksik alan, sözlük dışı değer → paket REDDEDİLİR
 *     (kayıt listesi boş döner). Gizlilik sınırı (`assertNoForbiddenSecretFields`) ayrıca
 *     çağıranın sorumluluğundadır; buradaki bilinmeyen-alan reddi ikinci savunma hattıdır.
 *
 *  2) `buildOperatePlan()` — dry-run raporunu, owner'a sunulacak DETERMİNİSTİK aksiyon
 *     planına çevirir. BIND_EXISTING_USER için operate runner'ının optimistic-concurrency
 *     preflight değerleri (expectedProfileUpdatedAt / expectedUserUpdatedAt) plana gömülür;
 *     CREATE_USER_AND_BIND için yazım yolu operate runner'ı DEĞİL, kanonik auth/invite
 *     akışıdır (UserInviteService.issue — pending User + AYNI tx'te profil bağı, OWN-01).
 *
 * MİMARİ İLKE: bu dosya Prisma/NestJS/fs/sistem saati KULLANMAZ; tüm durum dışarıdan
 * verilir. Karar OTORİTESİ ÜRETMEZ — yalnız core dry-run hükümlerini uygulanabilir
 * adımlara projeksiyonlar.
 */

import {
  ALLOWED_NEW_USER_ROLES,
  type BindingDisposition,
  type BindingInputRecord,
  type DryRunReport,
  type FailureCode,
  type ProfileType,
} from './office-cap02-identity-binding-dry-run.core';

// ---------------------------------------------------------------------------
// 1) Girdi paketi yapısal doğrulaması
// ---------------------------------------------------------------------------

export type PackageIssueCode =
  | 'PACKAGE_NOT_ARRAY'
  | 'PACKAGE_EMPTY'
  | 'RECORD_NOT_OBJECT'
  | 'UNKNOWN_FIELD'
  | 'MISSING_REQUIRED_FIELD'
  | 'INVALID_FIELD_VALUE';

export interface PackageIssue {
  /** Paket-seviyesi sorunlarda -1, kayıt sorunlarında kaydın index'i. */
  index: number;
  code: PackageIssueCode;
  detail: string;
}

const ALLOWED_DISPOSITIONS: ReadonlyArray<BindingDisposition> = [
  'ALREADY_BOUND',
  'BIND_EXISTING_USER',
  'CREATE_NEW_USER',
  'NO_USER_REQUIRED',
  'KEEP_OUTSIDE_AUTHORIZATION_GRAPH',
  'UNRESOLVED',
];

const ALLOWED_PROFILE_TYPES: ReadonlyArray<ProfileType> = ['LAWYER', 'STAFF_MEMBER'];

const REQUIRED_STRING_FIELDS = ['tenantSlug', 'profileType', 'profileId', 'disposition'] as const;
const REQUIRED_BOOLEAN_FIELDS = ['systemAccessRequired', 'authorizationGraphRequired'] as const;
const OPTIONAL_NULLABLE_STRING_FIELDS = [
  'existingUserId',
  'newUserName',
  'newUserEmail',
  'newUserRole',
] as const;

const ALLOWED_FIELDS: ReadonlySet<string> = new Set([
  ...REQUIRED_STRING_FIELDS,
  ...REQUIRED_BOOLEAN_FIELDS,
  ...OPTIONAL_NULLABLE_STRING_FIELDS,
]);

export interface ParsedBindingPackage {
  /** issues boşsa doğrulanmış kayıtlar; DEĞİLSE HER ZAMAN boş (fail-closed). */
  records: BindingInputRecord[];
  issues: PackageIssue[];
}

export function parseBindingInputPackage(value: unknown): ParsedBindingPackage {
  const issues: PackageIssue[] = [];

  if (!Array.isArray(value)) {
    return { records: [], issues: [{ index: -1, code: 'PACKAGE_NOT_ARRAY', detail: typeof value }] };
  }
  if (value.length === 0) {
    return { records: [], issues: [{ index: -1, code: 'PACKAGE_EMPTY', detail: 'girdi paketi boş' }] };
  }

  const records: BindingInputRecord[] = [];

  value.forEach((raw, index) => {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      issues.push({ index, code: 'RECORD_NOT_OBJECT', detail: typeof raw });
      return;
    }
    const record = raw as Record<string, unknown>;

    for (const key of Object.keys(record)) {
      if (!ALLOWED_FIELDS.has(key)) {
        issues.push({ index, code: 'UNKNOWN_FIELD', detail: key });
      }
    }

    for (const field of REQUIRED_STRING_FIELDS) {
      const v = record[field];
      if (v === undefined || v === null) {
        issues.push({ index, code: 'MISSING_REQUIRED_FIELD', detail: field });
      } else if (typeof v !== 'string' || v.trim() === '') {
        issues.push({ index, code: 'INVALID_FIELD_VALUE', detail: `${field}: boş olmayan string olmalı` });
      }
    }

    for (const field of REQUIRED_BOOLEAN_FIELDS) {
      const v = record[field];
      if (v === undefined || v === null) {
        issues.push({ index, code: 'MISSING_REQUIRED_FIELD', detail: field });
      } else if (typeof v !== 'boolean') {
        issues.push({ index, code: 'INVALID_FIELD_VALUE', detail: `${field}: boolean olmalı` });
      }
    }

    for (const field of OPTIONAL_NULLABLE_STRING_FIELDS) {
      const v = record[field];
      if (v !== undefined && v !== null && (typeof v !== 'string' || v.trim() === '')) {
        issues.push({ index, code: 'INVALID_FIELD_VALUE', detail: `${field}: null veya boş olmayan string olmalı` });
      }
    }

    const profileType = record.profileType;
    if (typeof profileType === 'string' && !ALLOWED_PROFILE_TYPES.includes(profileType as ProfileType)) {
      issues.push({ index, code: 'INVALID_FIELD_VALUE', detail: `profileType: ${profileType}` });
    }
    const disposition = record.disposition;
    if (typeof disposition === 'string' && !ALLOWED_DISPOSITIONS.includes(disposition as BindingDisposition)) {
      issues.push({ index, code: 'INVALID_FIELD_VALUE', detail: `disposition: ${disposition}` });
    }
    const newUserRole = record.newUserRole;
    if (
      typeof newUserRole === 'string' &&
      !ALLOWED_NEW_USER_ROLES.includes(newUserRole as (typeof ALLOWED_NEW_USER_ROLES)[number])
    ) {
      issues.push({ index, code: 'INVALID_FIELD_VALUE', detail: `newUserRole: ${newUserRole}` });
    }

    if (issues.length === 0) {
      records.push({
        tenantSlug: record.tenantSlug as string,
        profileType: record.profileType as ProfileType,
        profileId: record.profileId as string,
        disposition: record.disposition as BindingDisposition,
        existingUserId: (record.existingUserId as string | null | undefined) ?? null,
        newUserName: (record.newUserName as string | null | undefined) ?? null,
        newUserEmail: (record.newUserEmail as string | null | undefined) ?? null,
        newUserRole: (record.newUserRole as string | null | undefined) ?? null,
        systemAccessRequired: record.systemAccessRequired as boolean,
        authorizationGraphRequired: record.authorizationGraphRequired as boolean,
      });
    }
  });

  // Fail-closed: tek bir sorun bile varsa paketin TAMAMI reddedilir — kısmi uygulama,
  // owner'ın onayladığı paketten farklı bir şeyin çalışması demektir.
  return issues.length > 0 ? { records: [], issues } : { records, issues: [] };
}

// ---------------------------------------------------------------------------
// 2) Operate planı
// ---------------------------------------------------------------------------

export type PlanAction =
  | 'RUN_OPERATE_BIND' // office-cap02-identity-binding-operate.ts ile koşullu bağ yazımı
  | 'ISSUE_INVITE_CREATE_AND_BIND' // kanonik auth/invite akışı (pending User + OWN-01 bağ)
  | 'NO_ACTION' // PASS ama yazım gerekmiyor (idempotent / User'sız disposition)
  | 'PENDING_OWNER_FACT' // UNRESOLVED — owner işletme gerçeği eksik
  | 'BLOCKED_FAIL'; // dry-run FAIL veya plan bağlamı eksik (fail-closed)

export interface OperateBindArgs {
  tenantId: string;
  profileType: ProfileType;
  profileId: string;
  targetUserId: string;
  expectedProfileUpdatedAt: string;
  expectedUserUpdatedAt: string;
  /** Runner'a --authorityRef olarak verilir; plan üretiminde verilmediyse null kalır. */
  authorityRef: string | null;
}

export interface InviteCreateArgs {
  tenantSlug: string;
  profileType: ProfileType;
  profileId: string;
  newUserEmail: string;
  newUserName: string;
  newUserRole: string;
}

export interface OperatePlanEntry {
  profileType: ProfileType;
  profileId: string;
  disposition: BindingDisposition;
  action: PlanAction;
  failures: FailureCode[];
  /** Plan bağlamı eksikse fail-closed gerekçesi (dry-run failure'ı DEĞİL). */
  planIssues: string[];
  operateArgs: OperateBindArgs | null;
  inviteArgs: InviteCreateArgs | null;
}

export interface OperatePlanContext {
  tenantIdBySlug: Record<string, string>;
  /** `${profileType}:${profileId}` → ISO-8601 updatedAt (preflight'ta okunan satır). */
  profileUpdatedAtByKey: Record<string, string>;
  /** userId → ISO-8601 updatedAt. */
  userUpdatedAtById: Record<string, string>;
  authorityRef?: string | null;
}

export interface OperatePlan {
  entries: OperatePlanEntry[];
  counts: Record<PlanAction, number>;
  /** true ⇔ hiçbir entry BLOCKED_FAIL değil (PENDING entry'ler plana engel DEĞİLDİR). */
  executable: boolean;
}

const profileKey = (t: ProfileType, id: string): string => `${t}:${id}`;

/**
 * Dry-run raporunu owner'a sunulacak aksiyon planına çevirir.
 *
 * `input` ve `report.records` core sözleşmesi gereği 1:1 ve AYNI SIRADADIR; uyuşmazlık
 * programlama hatasıdır ve fail-closed fırlatılır (yanlış kayda plan üretmek yasak).
 */
export function buildOperatePlan(
  input: ReadonlyArray<BindingInputRecord>,
  report: DryRunReport,
  ctx: OperatePlanContext,
): OperatePlan {
  if (input.length !== report.records.length) {
    throw new Error(
      `IDENTITY_BINDING_PLAN_INPUT_REPORT_MISMATCH: input=${input.length} report=${report.records.length}`,
    );
  }

  const entries: OperatePlanEntry[] = report.records.map((result, i) => {
    const source = input[i];
    if (
      source.profileType !== result.profileType ||
      source.profileId !== result.profileId ||
      source.disposition !== result.disposition
    ) {
      throw new Error(
        `IDENTITY_BINDING_PLAN_RECORD_MISMATCH: index=${i} ${source.profileType}:${source.profileId} != ${result.profileType}:${result.profileId}`,
      );
    }

    const base: OperatePlanEntry = {
      profileType: result.profileType,
      profileId: result.profileId,
      disposition: result.disposition,
      action: 'NO_ACTION',
      failures: result.failures,
      planIssues: [],
      operateArgs: null,
      inviteArgs: null,
    };

    if (result.verdict === 'FAIL') {
      return { ...base, action: 'BLOCKED_FAIL' };
    }
    if (result.verdict === 'UNRESOLVED') {
      return { ...base, action: 'PENDING_OWNER_FACT' };
    }

    // PASS
    if (result.plannedMutation === 'NONE') {
      return base;
    }

    if (result.plannedMutation === 'BIND_EXISTING_USER') {
      const planIssues: string[] = [];
      const tenantId = ctx.tenantIdBySlug[source.tenantSlug];
      if (!tenantId) planIssues.push(`PLAN_TENANT_UNKNOWN: ${source.tenantSlug}`);
      const targetUserId = source.existingUserId ?? null;
      if (!targetUserId) planIssues.push('PLAN_TARGET_USER_MISSING');
      const expectedProfileUpdatedAt =
        ctx.profileUpdatedAtByKey[profileKey(source.profileType, source.profileId)];
      if (!expectedProfileUpdatedAt) planIssues.push('PLAN_PROFILE_TIMESTAMP_MISSING');
      const expectedUserUpdatedAt = targetUserId ? ctx.userUpdatedAtById[targetUserId] : undefined;
      if (targetUserId && !expectedUserUpdatedAt) planIssues.push('PLAN_USER_TIMESTAMP_MISSING');

      if (planIssues.length > 0) {
        // Fail-closed: preflight bağlamı eksik bir bağ İÇİN plan üretilmez.
        return { ...base, action: 'BLOCKED_FAIL', planIssues };
      }
      return {
        ...base,
        action: 'RUN_OPERATE_BIND',
        operateArgs: {
          tenantId: tenantId as string,
          profileType: source.profileType,
          profileId: source.profileId,
          targetUserId: targetUserId as string,
          expectedProfileUpdatedAt: expectedProfileUpdatedAt as string,
          expectedUserUpdatedAt: expectedUserUpdatedAt as string,
          authorityRef: ctx.authorityRef ?? null,
        },
      };
    }

    // CREATE_USER_AND_BIND — yazım yolu operate runner'ı DEĞİL, kanonik auth/invite
    // akışıdır (feature flag + AdminGuard + AYNI tx'te OWN-01 bağ). Dry-run PASS'i
    // alanların varlığını garanti eder; yine de fail-closed kontrol edilir.
    const missing: string[] = [];
    if (!source.newUserEmail) missing.push('PLAN_NEW_USER_EMAIL_MISSING');
    if (!source.newUserName) missing.push('PLAN_NEW_USER_NAME_MISSING');
    if (!source.newUserRole) missing.push('PLAN_NEW_USER_ROLE_MISSING');
    if (missing.length > 0) {
      return { ...base, action: 'BLOCKED_FAIL', planIssues: missing };
    }
    return {
      ...base,
      action: 'ISSUE_INVITE_CREATE_AND_BIND',
      inviteArgs: {
        tenantSlug: source.tenantSlug,
        profileType: source.profileType,
        profileId: source.profileId,
        newUserEmail: source.newUserEmail as string,
        newUserName: source.newUserName as string,
        newUserRole: source.newUserRole as string,
      },
    };
  });

  const counts: Record<PlanAction, number> = {
    RUN_OPERATE_BIND: 0,
    ISSUE_INVITE_CREATE_AND_BIND: 0,
    NO_ACTION: 0,
    PENDING_OWNER_FACT: 0,
    BLOCKED_FAIL: 0,
  };
  for (const e of entries) counts[e.action] += 1;

  return { entries, counts, executable: counts.BLOCKED_FAIL === 0 };
}
