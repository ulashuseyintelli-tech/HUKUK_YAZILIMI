/**
 * OFFICE-P2-CAP02-PERSONNEL-IDENTITY-BINDING-DRY-RUN-R01 — SAF ÇEKİRDEK.
 *
 * CAP-02 Population-First STEP 4. Owner-onaylı personel↔User eşleştirme paketini,
 * PRODUCTION'A HİÇBİR ŞEY YAZMADAN doğrular. Amaç: `Lawyer.userId` /
 * `StaffMember.userId` yazımı ve User oluşturma öncesinde her kaydın deterministik
 * olarak güvenli olduğunu kanıtlamak.
 *
 * MİMARİ İLKE — bu dosya:
 *  - Prisma/NestJS import ETMEZ, DB'ye erişemez → mutation riski YAPISAL olarak yoktur.
 *  - Sistem saati veya `fs` KULLANMAZ; repository durumu dışarıdan snapshot olarak geçilir.
 *  - Eşleştirme OTORİTESİ ÜRETMEZ. İsim/e-posta/TCKN/rol/rank benzerliğinden bağ ÇIKARMAZ;
 *    yalnız owner'ın verdiği exact `profileId ↔ userId` çiftini doğrular veya reddeder.
 *
 * KANONİK KARARLAR (decision-log 2026-07-28, OFFICE-P2-CAP02-OWNER-DISPOSITIONS-R01):
 *  - ReportingLine bir USER-PRINCIPAL AUTHORIZATION GRAPH'tır; personel profil kaynağı
 *    `Lawyer + StaffMember`, erişim kimliği `User`dır.
 *  - Dummy user ve toplu otomatik user oluşturma YASAKTIR.
 *  - Otomatik profil↔User eşleştirme YASAKTIR.
 *
 * GİZLİLİK SINIRI: girdi paketi ham TCKN, IBAN, parola, token veya credential TAŞIMAZ.
 * `assertNoForbiddenSecretFields()` bunu yapısal olarak reddeder.
 */

// ---------------------------------------------------------------------------
// Girdi / snapshot tipleri
// ---------------------------------------------------------------------------

export type ProfileType = 'LAWYER' | 'STAFF_MEMBER';

export type BindingDisposition =
  | 'ALREADY_BOUND'
  | 'BIND_EXISTING_USER'
  | 'CREATE_NEW_USER'
  | 'NO_USER_REQUIRED'
  | 'KEEP_OUTSIDE_AUTHORIZATION_GRAPH'
  | 'UNRESOLVED';

/** Yeni User için izin verilen roller. ADMIN owner'ın ayrı kararıdır; burada üretilmez. */
export const ALLOWED_NEW_USER_ROLES = ['USER', 'VIEWER'] as const;
export type AllowedNewUserRole = (typeof ALLOWED_NEW_USER_ROLES)[number];

export interface BindingInputRecord {
  tenantSlug: string;
  profileType: ProfileType;
  profileId: string;
  disposition: BindingDisposition;
  existingUserId?: string | null;
  newUserName?: string | null;
  newUserEmail?: string | null;
  newUserRole?: string | null;
  systemAccessRequired: boolean;
  authorizationGraphRequired: boolean;
}

export interface ProfileSnapshot {
  profileType: ProfileType;
  profileId: string;
  tenantId: string;
  isActive: boolean;
  /** Halihazırda bağlı olduğu User (yoksa null). */
  boundUserId: string | null;
}

export interface UserSnapshot {
  userId: string;
  tenantId: string;
  isActive: boolean;
  /** Normalize edilmiş (lowercase, trim) e-posta. */
  email: string;
}

export interface RepositorySnapshot {
  /** tenantSlug -> tenantId */
  tenantIdBySlug: Record<string, string>;
  profiles: ProfileSnapshot[];
  users: UserSnapshot[];
}

// ---------------------------------------------------------------------------
// Çıktı tipleri
// ---------------------------------------------------------------------------

export type RecordVerdict = 'PASS' | 'FAIL' | 'UNRESOLVED';

export type FailureCode =
  | 'TENANT_UNKNOWN'
  | 'PROFILE_NOT_FOUND'
  | 'PROFILE_INACTIVE'
  | 'PROFILE_TENANT_MISMATCH'
  | 'PROFILE_ALREADY_BOUND_TO_ANOTHER_USER'
  | 'EXISTING_USER_REQUIRED'
  | 'EXISTING_USER_NOT_FOUND'
  | 'EXISTING_USER_INACTIVE'
  | 'EXISTING_USER_TENANT_MISMATCH'
  | 'EXISTING_USER_BOUND_TO_ANOTHER_PROFILE'
  | 'DUPLICATE_TARGET_USER_IN_INPUT'
  | 'DUPLICATE_PROFILE_IN_INPUT'
  | 'ALREADY_BOUND_MISMATCH'
  | 'NEW_USER_FIELDS_REQUIRED'
  | 'NEW_USER_EMAIL_NOT_UNIQUE'
  | 'NEW_USER_EMAIL_DUPLICATE_IN_INPUT'
  | 'NEW_USER_ROLE_NOT_ALLOWED'
  | 'NEW_USER_NOT_JUSTIFIED'
  | 'EXISTING_USER_FIELDS_FORBIDDEN'
  | 'AUTHORIZATION_GRAPH_WITHOUT_USER';

export interface RecordResult {
  profileType: ProfileType;
  profileId: string;
  disposition: BindingDisposition;
  verdict: RecordVerdict;
  failures: FailureCode[];
  /** PASS ve gerçekten yazım gerektiriyorsa uygulanacak işlem; aksi halde NONE. */
  plannedMutation: 'NONE' | 'BIND_EXISTING_USER' | 'CREATE_USER_AND_BIND';
}

export interface DryRunReport {
  total: number;
  pass: number;
  fail: number;
  unresolved: number;
  /** PASS olup gerçekten production yazımı gerektiren kayıt sayısı. */
  plannedMutations: number;
  /** Tümü PASS/UNRESOLVED ise true; tek bir FAIL varsa false. */
  eligibleForOperate: boolean;
  records: RecordResult[];
}

// ---------------------------------------------------------------------------
// Gizlilik sınırı
// ---------------------------------------------------------------------------

const FORBIDDEN_INPUT_FIELDS = [
  'tckn',
  'iban',
  'password',
  'passwordhash',
  'token',
  'tokenhash',
  'credential',
  'secret',
];

/**
 * Girdi paketinde yasaklı hassas alan bulunursa fırlatır. Sessizce temizlemek YASAK:
 * paket yanlış hazırlanmışsa dry-run başlamadan durmalıdır.
 */
export function assertNoForbiddenSecretFields(
  records: ReadonlyArray<Record<string, unknown>>,
): void {
  const hits = new Set<string>();
  for (const record of records) {
    for (const key of Object.keys(record)) {
      if (FORBIDDEN_INPUT_FIELDS.includes(key.toLowerCase())) hits.add(key);
    }
  }
  if (hits.size > 0) {
    throw new Error(
      `IDENTITY_BINDING_INPUT_FORBIDDEN_FIELDS: ${[...hits].sort().join(', ')}`,
    );
  }
}

const normalizeEmail = (value: string): string => value.trim().toLowerCase();

// ---------------------------------------------------------------------------
// Doğrulama
// ---------------------------------------------------------------------------

export function dryRunIdentityBinding(
  input: ReadonlyArray<BindingInputRecord>,
  snapshot: RepositorySnapshot,
): DryRunReport {
  const profileKey = (t: ProfileType, id: string) => `${t}:${id}`;

  const profileIndex = new Map(
    snapshot.profiles.map((p) => [profileKey(p.profileType, p.profileId), p]),
  );
  const userIndex = new Map(snapshot.users.map((u) => [u.userId, u]));
  const existingEmails = new Set(snapshot.users.map((u) => normalizeEmail(u.email)));
  // Bir User'ın halihazırda hangi profile bağlı olduğu (ters index).
  const userBoundToProfile = new Map<string, ProfileSnapshot>();
  for (const p of snapshot.profiles) {
    if (p.boundUserId) userBoundToProfile.set(p.boundUserId, p);
  }

  // Girdi-içi tekrar tespiti (idempotency + çakışma).
  const profileSeen = new Map<string, number>();
  const targetUserSeen = new Map<string, number>();
  const newEmailSeen = new Map<string, number>();
  for (const r of input) {
    const pk = profileKey(r.profileType, r.profileId);
    profileSeen.set(pk, (profileSeen.get(pk) ?? 0) + 1);
    if (r.existingUserId) {
      targetUserSeen.set(r.existingUserId, (targetUserSeen.get(r.existingUserId) ?? 0) + 1);
    }
    if (r.newUserEmail) {
      const e = normalizeEmail(r.newUserEmail);
      newEmailSeen.set(e, (newEmailSeen.get(e) ?? 0) + 1);
    }
  }

  const records: RecordResult[] = input.map((r) => {
    const failures: FailureCode[] = [];
    let plannedMutation: RecordResult['plannedMutation'] = 'NONE';

    const tenantId = snapshot.tenantIdBySlug[r.tenantSlug];
    const profile = profileIndex.get(profileKey(r.profileType, r.profileId));

    if (!tenantId) failures.push('TENANT_UNKNOWN');
    if (!profile) failures.push('PROFILE_NOT_FOUND');

    if (profile) {
      if (!profile.isActive) failures.push('PROFILE_INACTIVE');
      if (tenantId && profile.tenantId !== tenantId) failures.push('PROFILE_TENANT_MISMATCH');
    }

    if ((profileSeen.get(profileKey(r.profileType, r.profileId)) ?? 0) > 1) {
      failures.push('DUPLICATE_PROFILE_IN_INPUT');
    }

    // Yeni User alanları yalnız CREATE_NEW_USER'da anlamlıdır.
    const hasNewUserFields = Boolean(r.newUserEmail || r.newUserName || r.newUserRole);

    switch (r.disposition) {
      case 'ALREADY_BOUND': {
        // Mevcut bağ korunur; yazım YOK. Beyan edilen User gerçekten bağlı olmalı.
        if (profile) {
          if (!profile.boundUserId) failures.push('ALREADY_BOUND_MISMATCH');
          else if (r.existingUserId && r.existingUserId !== profile.boundUserId) {
            failures.push('ALREADY_BOUND_MISMATCH');
          }
          const bound = profile.boundUserId ? userIndex.get(profile.boundUserId) : undefined;
          if (bound) {
            if (!bound.isActive) failures.push('EXISTING_USER_INACTIVE');
            if (tenantId && bound.tenantId !== tenantId) {
              failures.push('EXISTING_USER_TENANT_MISMATCH');
            }
          } else if (profile.boundUserId) {
            failures.push('EXISTING_USER_NOT_FOUND');
          }
        }
        if (hasNewUserFields) failures.push('EXISTING_USER_FIELDS_FORBIDDEN');
        break;
      }

      case 'BIND_EXISTING_USER': {
        if (!r.existingUserId) {
          failures.push('EXISTING_USER_REQUIRED');
          break;
        }
        if (hasNewUserFields) failures.push('EXISTING_USER_FIELDS_FORBIDDEN');

        const user = userIndex.get(r.existingUserId);
        if (!user) failures.push('EXISTING_USER_NOT_FOUND');
        else {
          if (!user.isActive) failures.push('EXISTING_USER_INACTIVE');
          if (tenantId && user.tenantId !== tenantId) failures.push('EXISTING_USER_TENANT_MISMATCH');
          const otherProfile = userBoundToProfile.get(user.userId);
          if (
            otherProfile &&
            profileKey(otherProfile.profileType, otherProfile.profileId) !==
              profileKey(r.profileType, r.profileId)
          ) {
            failures.push('EXISTING_USER_BOUND_TO_ANOTHER_PROFILE');
          }
        }
        if ((targetUserSeen.get(r.existingUserId) ?? 0) > 1) {
          failures.push('DUPLICATE_TARGET_USER_IN_INPUT');
        }
        if (profile?.boundUserId && profile.boundUserId !== r.existingUserId) {
          failures.push('PROFILE_ALREADY_BOUND_TO_ANOTHER_USER');
        }
        // Idempotency: zaten aynı User'a bağlıysa yazım gerekmez.
        if (failures.length === 0) {
          plannedMutation =
            profile?.boundUserId === r.existingUserId ? 'NONE' : 'BIND_EXISTING_USER';
        }
        break;
      }

      case 'CREATE_NEW_USER': {
        if (!r.systemAccessRequired && !r.authorizationGraphRequired) {
          // Dummy user yasağı: gerekçesiz hesap açılamaz.
          failures.push('NEW_USER_NOT_JUSTIFIED');
        }
        if (!r.newUserEmail || !r.newUserName || !r.newUserRole) {
          failures.push('NEW_USER_FIELDS_REQUIRED');
        }
        if (r.existingUserId) failures.push('EXISTING_USER_FIELDS_FORBIDDEN');
        if (r.newUserRole && !ALLOWED_NEW_USER_ROLES.includes(r.newUserRole as AllowedNewUserRole)) {
          failures.push('NEW_USER_ROLE_NOT_ALLOWED');
        }
        if (r.newUserEmail) {
          const email = normalizeEmail(r.newUserEmail);
          if (existingEmails.has(email)) failures.push('NEW_USER_EMAIL_NOT_UNIQUE');
          if ((newEmailSeen.get(email) ?? 0) > 1) failures.push('NEW_USER_EMAIL_DUPLICATE_IN_INPUT');
        }
        if (profile?.boundUserId) failures.push('PROFILE_ALREADY_BOUND_TO_ANOTHER_USER');
        if (failures.length === 0) plannedMutation = 'CREATE_USER_AND_BIND';
        break;
      }

      case 'NO_USER_REQUIRED':
      case 'KEEP_OUTSIDE_AUTHORIZATION_GRAPH': {
        // Authorization graph'a girecek biri User'sız bırakılamaz.
        if (r.authorizationGraphRequired) failures.push('AUTHORIZATION_GRAPH_WITHOUT_USER');
        if (r.existingUserId || hasNewUserFields) failures.push('EXISTING_USER_FIELDS_FORBIDDEN');
        break;
      }

      case 'UNRESOLVED':
        // İşletme gerçeği eksik; tahminle karar verilmez, yazım da yapılmaz.
        break;
    }

    const verdict: RecordVerdict =
      failures.length > 0 ? 'FAIL' : r.disposition === 'UNRESOLVED' ? 'UNRESOLVED' : 'PASS';

    return {
      profileType: r.profileType,
      profileId: r.profileId,
      disposition: r.disposition,
      verdict,
      failures,
      plannedMutation: verdict === 'PASS' ? plannedMutation : 'NONE',
    };
  });

  const pass = records.filter((r) => r.verdict === 'PASS').length;
  const fail = records.filter((r) => r.verdict === 'FAIL').length;
  const unresolved = records.filter((r) => r.verdict === 'UNRESOLVED').length;

  return {
    total: records.length,
    pass,
    fail,
    unresolved,
    plannedMutations: records.filter((r) => r.plannedMutation !== 'NONE').length,
    eligibleForOperate: fail === 0,
    records,
  };
}
