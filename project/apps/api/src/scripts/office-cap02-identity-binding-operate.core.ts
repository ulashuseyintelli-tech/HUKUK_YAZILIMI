/**
 * OFFICE-P2-CAP02-PERSONNEL-IDENTITY-BINDING-OPERATE-I01 — SAF KARAR ÇEKİRDEĞİ.
 *
 * Production'da `Lawyer.userId` / `StaffMember.userId` bağını kurmadan ÖNCE, transaction
 * içinde taze okunmuş satırlara bakarak "uygula / zaten uygulanmış / fail-closed" kararını
 * verir. Karar mantığı burada saftır: DB, NestJS ve sistem saati YOKTUR; runner yalnız
 * satırları okur, bu fonksiyonu çağırır ve sonucuna uyar.
 *
 * Bu ayrım kasıtlıdır: bir personel hesabını yanlış kişiye bağlamanın maliyeti yüksektir ve
 * kararın tamamı DB'siz olarak test edilebilir olmalıdır.
 *
 * FAIL-CLOSED İLKESİ: belirsizlikte asla yazma. Beklenmeyen her durum `FAIL_CLOSED`tır.
 */

export type BindingProfileType = 'LAWYER' | 'STAFF_MEMBER';

/** Transaction içinde kilitlenerek taze okunmuş profil satırı. */
export interface LockedProfileRow {
  profileType: BindingProfileType;
  profileId: string;
  tenantId: string;
  isActive: boolean;
  userId: string | null;
  /** ISO-8601; optimistic concurrency kontrolü için. */
  updatedAt: string;
}

/** Transaction içinde kilitlenerek taze okunmuş User satırı. */
export interface LockedUserRow {
  userId: string;
  tenantId: string;
  isActive: boolean;
  updatedAt: string;
}

export interface BindingOperationInput {
  tenantId: string;
  profileType: BindingProfileType;
  profileId: string;
  targetUserId: string;
  authorityRef: string;
  /** Preflight'ta görülen değerler; satır o zamandan beri değiştiyse yazma. */
  expectedProfileUpdatedAt: string;
  expectedUserUpdatedAt: string;
}

/** Transaction içinde toplanan, karar için gereken tüm gerçekler. */
export interface BindingFacts {
  profile: LockedProfileRow | null;
  targetUser: LockedUserRow | null;
  /** Hedef User'ın bağlı olduğu DİĞER Lawyer profil id'leri (bu profil hariç). */
  otherLawyerBindings: string[];
  /** Hedef User'ın bağlı olduğu StaffMember profil id'leri. */
  staffMemberBindings: string[];
}

export type BindingDecisionKind = 'APPLY' | 'ALREADY_APPLIED' | 'FAIL_CLOSED';

export type BindingFailureCode =
  | 'PROFILE_NOT_FOUND'
  | 'PROFILE_TENANT_MISMATCH'
  | 'PROFILE_INACTIVE'
  | 'PROFILE_BOUND_TO_ANOTHER_USER'
  | 'PROFILE_ROW_CHANGED_SINCE_PREFLIGHT'
  | 'TARGET_USER_NOT_FOUND'
  | 'TARGET_USER_TENANT_MISMATCH'
  | 'TARGET_USER_INACTIVE'
  | 'TARGET_USER_BOUND_TO_ANOTHER_LAWYER'
  | 'TARGET_USER_BOUND_TO_STAFF_MEMBER'
  | 'TARGET_USER_ROW_CHANGED_SINCE_PREFLIGHT'
  | 'AUTHORITY_REF_MISSING';

export interface BindingDecision {
  kind: BindingDecisionKind;
  failures: BindingFailureCode[];
  /** İnsan-okur özet; kişisel veri taşımaz. */
  reason: string;
}

/**
 * Tek bir profil↔User bağı için kararı verir.
 *
 * Sıralama önemlidir: önce "zaten uygulanmış mı" (idempotency), sonra fail-closed
 * kontrolleri. Böylece runner tekrar çalıştırıldığında gereksiz yazma yapmaz ve
 * beklenmeyen bir durumda asla sessizce üzerine yazmaz.
 */
export function decideIdentityBinding(
  input: BindingOperationInput,
  facts: BindingFacts,
): BindingDecision {
  const failures: BindingFailureCode[] = [];
  const fail = (r: string): BindingDecision => ({ kind: 'FAIL_CLOSED', failures, reason: r });

  if (!input.authorityRef) {
    failures.push('AUTHORITY_REF_MISSING');
    return fail('owner authority referansi olmadan production binding yapilmaz');
  }

  const { profile, targetUser } = facts;

  if (!profile) {
    failures.push('PROFILE_NOT_FOUND');
    return fail('profil bulunamadi');
  }
  if (profile.tenantId !== input.tenantId) {
    failures.push('PROFILE_TENANT_MISMATCH');
    return fail('profil beklenen tenant disinda');
  }

  // IDEMPOTENCY: tam olarak istenen bag zaten varsa yazma. Bu kontrol, profilin
  // aktifligi veya satir tazeligi gibi kosullardan ONCE gelir — cunku dogru bag
  // zaten kuruluyken tekrar calistirmak hata degil, no-op olmalidir.
  if (profile.userId === input.targetUserId) {
    return {
      kind: 'ALREADY_APPLIED',
      failures: [],
      reason: 'profil zaten tam olarak bu User a bagli; yazim gerekmiyor',
    };
  }

  // Farkli bir User'a bagliysa asla uzerine yazma.
  if (profile.userId !== null) {
    failures.push('PROFILE_BOUND_TO_ANOTHER_USER');
    return fail('profil baska bir User a bagli; uzerine yazilmaz');
  }

  if (!profile.isActive) {
    failures.push('PROFILE_INACTIVE');
    return fail('profil pasif');
  }
  if (profile.updatedAt !== input.expectedProfileUpdatedAt) {
    failures.push('PROFILE_ROW_CHANGED_SINCE_PREFLIGHT');
    return fail('profil satiri preflight ten sonra degismis');
  }

  if (!targetUser) {
    failures.push('TARGET_USER_NOT_FOUND');
    return fail('hedef User bulunamadi');
  }
  if (targetUser.tenantId !== input.tenantId) {
    failures.push('TARGET_USER_TENANT_MISMATCH');
    return fail('hedef User beklenen tenant disinda');
  }
  if (!targetUser.isActive) {
    failures.push('TARGET_USER_INACTIVE');
    return fail('hedef User pasif — pasif duplicate hesap hedef alinamaz');
  }
  if (targetUser.updatedAt !== input.expectedUserUpdatedAt) {
    failures.push('TARGET_USER_ROW_CHANGED_SINCE_PREFLIGHT');
    return fail('hedef User satiri preflight ten sonra degismis');
  }

  const otherLawyers = facts.otherLawyerBindings.filter((id) => id !== input.profileId);
  if (otherLawyers.length > 0) {
    failures.push('TARGET_USER_BOUND_TO_ANOTHER_LAWYER');
    return fail('hedef User baska bir Lawyer profiline bagli');
  }
  if (facts.staffMemberBindings.length > 0) {
    failures.push('TARGET_USER_BOUND_TO_STAFF_MEMBER');
    return fail('hedef User bir StaffMember profiline bagli');
  }

  return { kind: 'APPLY', failures: [], reason: 'tum kontroller gecti; bag kurulabilir' };
}

// ---------------------------------------------------------------------------
// Audit kanıtı
// ---------------------------------------------------------------------------

export interface IdentityBindingAuditEvent {
  eventType: 'OFFICE_CAP02_PERSONNEL_IDENTITY_BINDING';
  tenantId: string;
  profileType: BindingProfileType;
  profileId: string;
  targetUserId: string;
  authorityRef: string;
  decision: BindingDecisionKind;
  failures: BindingFailureCode[];
  /** Çağıran verir; bu modül sistem saatini okumaz. */
  occurredAt: string;
  /** Yalnız APPLY sonucunda gerçek bir satır değişti. */
  mutated: boolean;
}

export function toIdentityBindingAuditEvent(
  input: BindingOperationInput,
  decision: BindingDecision,
  occurredAt: string,
): IdentityBindingAuditEvent {
  return {
    eventType: 'OFFICE_CAP02_PERSONNEL_IDENTITY_BINDING',
    tenantId: input.tenantId,
    profileType: input.profileType,
    profileId: input.profileId,
    targetUserId: input.targetUserId,
    authorityRef: input.authorityRef,
    decision: decision.kind,
    failures: decision.failures,
    occurredAt,
    mutated: decision.kind === 'APPLY',
  };
}

// ---------------------------------------------------------------------------
// Post-commit reconciliation
// ---------------------------------------------------------------------------

export interface ReconciliationFacts {
  /** Commit sonrası profilin gerçek userId'si. */
  profileUserId: string | null;
  /** Hedef User'a bağlı TÜM Lawyer profilleri. */
  lawyerBindingsForTargetUser: string[];
  /** Hedef User'a bağlı TÜM StaffMember profilleri. */
  staffBindingsForTargetUser: string[];
  /** Cross-tenant bağ sayısı (tüm tablo). */
  crossTenantBindingCount: number;
  /** Aynı User'a bağlı birden fazla Lawyer sayısı (tüm tablo). */
  duplicateUserBindingCount: number;
  /** Pasif duplicate hesabın durumu — değişmemiş olmalı. */
  inactiveDuplicateStillInactiveAndUnbound: boolean;
}

export interface ReconciliationResult {
  pass: boolean;
  problems: string[];
}

export function reconcileIdentityBinding(
  input: BindingOperationInput,
  facts: ReconciliationFacts,
): ReconciliationResult {
  const problems: string[] = [];

  if (facts.profileUserId !== input.targetUserId) {
    problems.push('profil beklenen User a bagli degil');
  }
  if (facts.lawyerBindingsForTargetUser.length !== 1) {
    problems.push('hedef User tam olarak bir Lawyer profiline bagli degil');
  }
  if (facts.staffBindingsForTargetUser.length !== 0) {
    problems.push('hedef User bir StaffMember profiline de bagli');
  }
  if (facts.crossTenantBindingCount !== 0) {
    problems.push('cross-tenant bag tespit edildi');
  }
  if (facts.duplicateUserBindingCount !== 0) {
    problems.push('ayni User a birden fazla profil bagli');
  }
  if (!facts.inactiveDuplicateStillInactiveAndUnbound) {
    problems.push('pasif duplicate hesap degismis');
  }

  return { pass: problems.length === 0, problems };
}
