/**
 * OFFICE-P2-IDENTITY-COMPLETION-R01 — INVITE-ISSUE KARAR ÇEKİRDEĞİ (B03 operate, CREATE yolu).
 *
 * Owner-ratified kanonik eşleme (B02) kapsamındaki üç aktif StaffMember için kişi başına
 * "davet aç / zaten uygulanmış / fail-closed" kararını verir. Yazım yolu bu çekirdek DEĞİL,
 * kanonik `UserInviteService.issue()`dur (pending User + AYNI transaction'da OWN-01 profil
 * bağı); çekirdek yalnız owner eşlemesiyle birebir uyumu ve fail-closed guard'ları sınar.
 *
 * MİMARİ İLKE: Prisma/NestJS/fs/sistem saati YOK — tüm durum dışarıdan snapshot olarak
 * verilir. Eşleştirme OTORİTESİ ÜRETMEZ: yalnız owner'ın verdiği exact
 * staffMemberId ↔ canonicalEmail çiftini doğrular veya reddeder.
 *
 * FAIL-CLOSED İLKESİ: belirsizlikte asla yazma önerme. Owner eşlemesinden her sapma
 * (profil e-posta drift'i, beklenmeyen mevcut User, başka User'a bağ) FAIL_CLOSED'tır.
 */

// ---------------------------------------------------------------------------
// Girdi paketi
// ---------------------------------------------------------------------------

export const INVITE_ALLOWED_ROLES = ['USER', 'VIEWER'] as const;
export type InviteAllowedRole = (typeof INVITE_ALLOWED_ROLES)[number];

export interface InviteIssueRecord {
  tenantSlug: string;
  staffMemberId: string;
  /** Owner-ratified kanonik adres: profil e-postası ve hesap e-postası BUNA eşit olmalı. */
  canonicalEmail: string;
  userName: string;
  userSurname: string;
  userRole: InviteAllowedRole;
}

export type InvitePackageIssueCode =
  | 'PACKAGE_NOT_ARRAY'
  | 'PACKAGE_EMPTY'
  | 'RECORD_NOT_OBJECT'
  | 'UNKNOWN_FIELD'
  | 'MISSING_REQUIRED_FIELD'
  | 'INVALID_FIELD_VALUE'
  | 'DUPLICATE_STAFF_IN_PACKAGE'
  | 'DUPLICATE_EMAIL_IN_PACKAGE';

export interface InvitePackageIssue {
  index: number;
  code: InvitePackageIssueCode;
  detail: string;
}

const REQUIRED_FIELDS = [
  'tenantSlug',
  'staffMemberId',
  'canonicalEmail',
  'userName',
  'userSurname',
  'userRole',
] as const;

const ALLOWED_FIELDS: ReadonlySet<string> = new Set(REQUIRED_FIELDS);

export const normalizeEmail = (value: string): string => value.trim().toLowerCase();

export interface ParsedInvitePackage {
  /** issues boşsa doğrulanmış kayıtlar; DEĞİLSE HER ZAMAN boş (fail-closed). */
  records: InviteIssueRecord[];
  issues: InvitePackageIssue[];
}

export function parseInviteIssuePackage(value: unknown): ParsedInvitePackage {
  const issues: InvitePackageIssue[] = [];

  if (!Array.isArray(value)) {
    return { records: [], issues: [{ index: -1, code: 'PACKAGE_NOT_ARRAY', detail: typeof value }] };
  }
  if (value.length === 0) {
    return { records: [], issues: [{ index: -1, code: 'PACKAGE_EMPTY', detail: 'girdi paketi boş' }] };
  }

  const records: InviteIssueRecord[] = [];
  const staffSeen = new Map<string, number>();
  const emailSeen = new Map<string, number>();

  value.forEach((raw, index) => {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      issues.push({ index, code: 'RECORD_NOT_OBJECT', detail: typeof raw });
      return;
    }
    const record = raw as Record<string, unknown>;

    for (const key of Object.keys(record)) {
      if (!ALLOWED_FIELDS.has(key)) issues.push({ index, code: 'UNKNOWN_FIELD', detail: key });
    }
    for (const field of REQUIRED_FIELDS) {
      const v = record[field];
      if (v === undefined || v === null) {
        issues.push({ index, code: 'MISSING_REQUIRED_FIELD', detail: field });
      } else if (typeof v !== 'string' || v.trim() === '') {
        issues.push({ index, code: 'INVALID_FIELD_VALUE', detail: `${field}: boş olmayan string olmalı` });
      }
    }
    const role = record.userRole;
    if (typeof role === 'string' && !INVITE_ALLOWED_ROLES.includes(role as InviteAllowedRole)) {
      issues.push({ index, code: 'INVALID_FIELD_VALUE', detail: `userRole: ${role}` });
    }

    if (typeof record.staffMemberId === 'string') {
      staffSeen.set(record.staffMemberId, (staffSeen.get(record.staffMemberId) ?? 0) + 1);
    }
    if (typeof record.canonicalEmail === 'string') {
      const e = normalizeEmail(record.canonicalEmail);
      emailSeen.set(e, (emailSeen.get(e) ?? 0) + 1);
    }

    if (issues.length === 0) {
      records.push({
        tenantSlug: record.tenantSlug as string,
        staffMemberId: record.staffMemberId as string,
        canonicalEmail: record.canonicalEmail as string,
        userName: record.userName as string,
        userSurname: record.userSurname as string,
        userRole: record.userRole as InviteAllowedRole,
      });
    }
  });

  // Owner kuralları 5/6: aynı User birden fazla personele bağlanamaz; kişi başına ayrı hesap.
  for (const [id, n] of staffSeen) {
    if (n > 1) issues.push({ index: -1, code: 'DUPLICATE_STAFF_IN_PACKAGE', detail: id });
  }
  for (const [email, n] of emailSeen) {
    if (n > 1) issues.push({ index: -1, code: 'DUPLICATE_EMAIL_IN_PACKAGE', detail: email });
  }

  return issues.length > 0 ? { records: [], issues } : { records, issues: [] };
}

// ---------------------------------------------------------------------------
// Karar
// ---------------------------------------------------------------------------

/** Runner'ın transaction dışı taze okuduğu StaffMember satırı. */
export interface StaffRowFacts {
  staffMemberId: string;
  tenantId: string;
  isActive: boolean;
  userId: string | null;
  /** Normalize edilmiş profil e-postası (yoksa null). */
  profileEmail: string | null;
}

export interface InviteIssueFacts {
  /** tenantSlug çözümü (bilinmiyorsa null). */
  tenantId: string | null;
  staff: StaffRowFacts | null;
  /** Kanonik e-postayla AYNI tenant'ta mevcut User id'si (yoksa null). */
  existingUserIdWithEmail: string | null;
  /** staff.userId doluysa bağlı User'ın normalize e-postası (yoksa null). */
  boundUserEmail: string | null;
}

export type InviteIssueDecisionKind = 'ISSUE' | 'ALREADY_APPLIED' | 'FAIL_CLOSED';

export type InviteIssueFailure =
  | 'TENANT_UNKNOWN'
  | 'STAFF_NOT_FOUND'
  | 'STAFF_TENANT_MISMATCH'
  | 'STAFF_BOUND_TO_DIFFERENT_USER'
  | 'STAFF_INACTIVE'
  | 'PROFILE_EMAIL_DRIFT'
  | 'CANONICAL_EMAIL_ALREADY_IN_USE';

export interface InviteIssueDecision {
  kind: InviteIssueDecisionKind;
  failures: InviteIssueFailure[];
  /** İnsan-okur özet; kişisel veri taşımaz. */
  reason: string;
}

/**
 * Tek kişi için kararı verir.
 *
 * Sıralama önemlidir: tenant/varlık kontrollerinden sonra ÖNCE idempotency (zaten kanonik
 * hesaba bağlıysa tekrar çalıştırmak hata değil no-op'tur — operate.core ile aynı ilke),
 * sonra fail-closed guard'lar.
 */
export function decideInviteIssue(
  record: InviteIssueRecord,
  facts: InviteIssueFacts,
): InviteIssueDecision {
  const failures: InviteIssueFailure[] = [];
  const fail = (reason: string): InviteIssueDecision => ({ kind: 'FAIL_CLOSED', failures, reason });
  const canonical = normalizeEmail(record.canonicalEmail);

  if (!facts.tenantId) {
    failures.push('TENANT_UNKNOWN');
    return fail('tenant slug çözülemedi');
  }
  const staff = facts.staff;
  if (!staff) {
    failures.push('STAFF_NOT_FOUND');
    return fail('personel bulunamadı');
  }
  if (staff.tenantId !== facts.tenantId) {
    failures.push('STAFF_TENANT_MISMATCH');
    return fail('personel beklenen tenant dışında');
  }

  // IDEMPOTENCY: kanonik hesaba bağ zaten kuruluysa yazım gerekmez.
  if (staff.userId !== null) {
    if (facts.boundUserEmail === canonical) {
      return {
        kind: 'ALREADY_APPLIED',
        failures: [],
        reason: 'personel zaten kanonik e-postalı hesaba bağlı; yazım gerekmiyor',
      };
    }
    failures.push('STAFF_BOUND_TO_DIFFERENT_USER');
    return fail('personel farklı bir hesaba bağlı; üzerine yazılmaz');
  }

  if (!staff.isActive) {
    failures.push('STAFF_INACTIVE');
    return fail('personel pasif — pilot kapsamı yalnız aktif personel');
  }

  // Owner kuralı 7: profil e-postası ↔ giriş kimliği drift'i yasak. Profil e-postası
  // kanonik adrese eşit değilse owner eşlemesiyle uyum bozulmuştur — yazma, bildir.
  if (staff.profileEmail !== canonical) {
    failures.push('PROFILE_EMAIL_DRIFT');
    return fail('profil e-postası kanonik adrese eşit değil');
  }

  // Beklenmeyen satır: kanonik adres tenant içinde zaten bir User taşıyorsa (orphan pending
  // dahi olsa) owner eşlemesinde olmayan bir durum vardır — adoption kararı owner'a döner.
  if (facts.existingUserIdWithEmail !== null) {
    failures.push('CANONICAL_EMAIL_ALREADY_IN_USE');
    return fail('kanonik e-posta tenant içinde zaten bir User taşıyor');
  }

  return { kind: 'ISSUE', failures: [], reason: 'tüm kontroller geçti; davet açılabilir' };
}

// ---------------------------------------------------------------------------
// Plan / diff projeksiyonu
// ---------------------------------------------------------------------------

export interface InviteIssuePlanEntry {
  staffMemberId: string;
  canonicalEmail: string;
  decision: InviteIssueDecisionKind;
  failures: InviteIssueFailure[];
  /** Owner'a sunulan exact before/after diff (yalnız ISSUE kararlarında dolu). */
  diff: {
    before: { staffUserId: string | null; userExists: boolean; inviteExists: boolean };
    after: {
      staffUserId: 'NEW_PENDING_USER_ID';
      user: { email: string; role: InviteAllowedRole; isActive: false; passwordHash: null };
      invite: { email: string; state: 'OPEN' };
    };
  } | null;
}

export function buildInviteIssuePlan(
  records: ReadonlyArray<InviteIssueRecord>,
  decisions: ReadonlyArray<InviteIssueDecision>,
  factsByStaffId: Readonly<Record<string, InviteIssueFacts>>,
): { entries: InviteIssuePlanEntry[]; counts: Record<InviteIssueDecisionKind, number>; executable: boolean } {
  if (records.length !== decisions.length) {
    throw new Error(
      `INVITE_ISSUE_PLAN_MISMATCH: records=${records.length} decisions=${decisions.length}`,
    );
  }
  const entries: InviteIssuePlanEntry[] = records.map((record, i) => {
    const decision = decisions[i];
    const facts = factsByStaffId[record.staffMemberId];
    return {
      staffMemberId: record.staffMemberId,
      canonicalEmail: normalizeEmail(record.canonicalEmail),
      decision: decision.kind,
      failures: decision.failures,
      diff:
        decision.kind === 'ISSUE'
          ? {
              before: {
                staffUserId: facts?.staff?.userId ?? null,
                userExists: facts?.existingUserIdWithEmail !== null && facts?.existingUserIdWithEmail !== undefined,
                inviteExists: false,
              },
              after: {
                staffUserId: 'NEW_PENDING_USER_ID',
                user: {
                  email: normalizeEmail(record.canonicalEmail),
                  role: record.userRole,
                  isActive: false,
                  passwordHash: null,
                },
                invite: { email: normalizeEmail(record.canonicalEmail), state: 'OPEN' },
              },
            }
          : null,
    };
  });

  const counts: Record<InviteIssueDecisionKind, number> = {
    ISSUE: 0,
    ALREADY_APPLIED: 0,
    FAIL_CLOSED: 0,
  };
  for (const e of entries) counts[e.decision] += 1;

  return { entries, counts, executable: counts.FAIL_CLOSED === 0 };
}
