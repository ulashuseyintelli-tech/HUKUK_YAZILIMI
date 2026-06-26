/**
 * K1-2 — User ↔ Lawyer/StaffMember "reviewed linkage" STRATEGY core (SAF / test edilebilir).
 *
 * Bağlam: K1-1 (k1-capacity-linkage.core) ölçtü → 0 güvenli exact-email auto-link adayı,
 * 24 profil MANUEL inceleme istiyor. Email exact-match yolu bitti. K1-2 bu yüzden OTOMATİK
 * TAHMİN ÜRETMEZ; yalnız İNSAN-İNCELEMELİ (human-reviewed) bir linkage manifest'ini DOĞRULAR
 * ve sayım-temelli (counts-only) bir plan üretir. IO YOK (Prisma yok), MUTATION YOK.
 *
 * K1-2 (validate+plan) + K1-3 (guarded apply) KAPSAM SINIRI (KESİN):
 *  - K1-2 yüzeyi: validateManifest/planLinkage/formatPlan/generateManifestTemplate/parseManifest (SAF, write yok).
 *  - K1-3 yüzeyi (dosyanın altı): evaluateApplyGuards/planApply/applyLinkages/verifyAppliedState/formatApplyReport.
 *    İzin verilen TEK write: Lawyer.userId / StaffMember.userId set (LINK_EXISTING_USER). CREATE_LOGIN_USER güvenli
 *    UYGULANAMAZ → CREATE_BLOCKED_NOT_IMPLEMENTED (passwordHash NOT NULL; otomatik parola yasak). Gerçek Prisma/
 *    $transaction yalnız script'te; bu çekirdek hâlâ IO'suz (applyLinkages injected tx alır).
 *  - TAHMİN YASAK: isim-benzerliği / telefon / rol-tahmini / tenant-inference / hardcoded gizli map / fuzzy match
 *    HİÇBİR YERDE kullanılmaz. Karar yalnız manifest'te AÇIKÇA yazılı alanlardan + referans kimlik
 *    gerçeklerinden (profile.userId, user.tenantId, mevcut köprüler) çıkar.
 *  - "Yanlış kullanıcıyı profile bağlamak enforcement'tan tehlikelidir" → her şüphe HARD-FAIL (blocked).
 *
 * NOT (dürüst bulgu): manifest CREATE_LOGIN_USER.role alanı bir LOGIN UserRole'üdür
 * (ADMIN | USER | VIEWER) — StaffType DEĞİL. Spec örneğindeki "STAFF" geçerli bir UserRole değildir;
 * bu çekirdek onu CREATE_ROLE_INVALID olarak hard-fail eder (sessizce kabul etmez).
 *
 * Çağrıldığı yerler:
 *  - validateManifest()/planLinkage()/formatPlan()/generateManifestTemplate()/parseManifest()
 *      → scripts/k1-reviewed-linkage.ts (CLI; READ-ONLY validate+plan, --apply YOK)
 *  - tümü → __tests__/k1-reviewed-linkage.core.spec.ts (SAF unit testleri)
 */

import {
  LinkageInput,
  LawyerRow,
  StaffRow,
  UserRow,
  normalizeEmail,
} from "./k1-capacity-linkage.core";

/** Referans veri = K1-1 ile AYNI düz satırlar (kod tekrarından kaçınmak için yeniden kullanılır). */
export type ReferenceData = LinkageInput;

/** Geçerli login rolleri — Prisma `enum UserRole` ile birebir (ADMIN | USER | VIEWER). */
export const VALID_USER_ROLES = ["ADMIN", "USER", "VIEWER"] as const;

export type ProfileType = "LAWYER" | "STAFF";
export type LinkageStrategy = "LINK_EXISTING_USER" | "CREATE_LOGIN_USER" | "SKIP_MANUAL";

/** Runtime tip muhafızları (manifest JSON'dan gelir → değer her şey olabilir; SAVUNMACI). */
function isProfileType(v: unknown): v is ProfileType {
  return v === "LAWYER" || v === "STAFF";
}
function isStrategy(v: unknown): v is LinkageStrategy {
  return v === "LINK_EXISTING_USER" || v === "CREATE_LOGIN_USER" || v === "SKIP_MANUAL";
}

/**
 * Tek bir manuel-incelenmiş linkage niyeti. Alanlar JSON dosyasından gelir → runtime'da
 * tip ihlal edebilir; validator hepsini SAVUNMACI kontrol eder.
 */
export interface ManifestEntry {
  profileType: ProfileType;
  profileId: string;
  strategy: LinkageStrategy;
  userId?: string | null; // LINK_EXISTING_USER için zorunlu
  email?: string | null; // CREATE_LOGIN_USER için zorunlu
  role?: string | null; // CREATE_LOGIN_USER için zorunlu (UserRole)
  reviewedBy?: string | null; // TÜM entry'lerde zorunlu (skip dahil — açık reviewed karar)
  reviewNote?: string | null; // TÜM entry'lerde zorunlu
}

export interface ReviewedLinkageManifest {
  version: number;
  tenantId: string;
  entries: ManifestEntry[];
}

export type ErrorSeverity = "STRUCTURE" | "INCOMPLETE" | "CONFLICT";

export type ErrorCode =
  // manifest-level / structural
  | "UNSUPPORTED_VERSION"
  | "MANIFEST_TENANT_EMPTY"
  | "UNKNOWN_PROFILE_TYPE"
  | "UNKNOWN_STRATEGY"
  | "PROFILE_NOT_FOUND"
  | "USER_NOT_FOUND"
  // incomplete (eksik açık alan)
  | "LINK_USER_ID_MISSING"
  | "CREATE_EMAIL_MISSING"
  | "CREATE_ROLE_INVALID"
  | "REVIEWED_BY_MISSING"
  | "REVIEW_NOTE_MISSING"
  // conflict (uygulanırsa kimlik hasarı)
  | "PROFILE_TENANT_MISMATCH"
  | "PROFILE_ALREADY_LINKED"
  | "DUPLICATE_PROFILE_ENTRY"
  | "USER_TENANT_MISMATCH"
  | "USER_ALREADY_LINKED"
  | "DUPLICATE_USER_ASSIGNMENT"
  | "USER_LINKED_TO_BOTH_TYPES"
  | "CREATE_EMAIL_DUPLICATE"
  | "CREATE_EMAIL_COLLIDES_EXISTING_USER";

/** PII GÜVENLİĞİ: message yalnız kod/sınıf açıklamasıdır; email/isim/TCKN/telefon DEĞERİ taşımaz. */
export interface ManifestError {
  entryIndex: number; // -1 = manifest düzeyi (entry'ye bağlı değil)
  profileType?: ProfileType;
  profileId?: string;
  code: ErrorCode;
  severity: ErrorSeverity;
  message: string;
}

export interface EntryEvaluation {
  index: number;
  profileType?: ProfileType;
  profileId?: string;
  strategy?: LinkageStrategy;
  errors: ManifestError[];
  applySafe: boolean; // LINK/CREATE stratejisi + sıfır hata → K1-3 apply'ı güvenli
  blocked: boolean; // ≥1 hata
  unsafe: boolean; // ≥1 CONFLICT-sınıfı hata (uygulanırsa kimlik hasarı)
}

export interface ManifestValidation {
  manifestErrors: ManifestError[]; // entryIndex === -1
  entries: EntryEvaluation[];
  ok: boolean; // hiçbir yerde hata yok
}

const CONFLICT_CODES: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  "PROFILE_TENANT_MISMATCH",
  "PROFILE_ALREADY_LINKED",
  "DUPLICATE_PROFILE_ENTRY",
  "USER_TENANT_MISMATCH",
  "USER_ALREADY_LINKED",
  "DUPLICATE_USER_ASSIGNMENT",
  "USER_LINKED_TO_BOTH_TYPES",
  "CREATE_EMAIL_DUPLICATE",
  "CREATE_EMAIL_COLLIDES_EXISTING_USER",
]);

const USER_CONFLICT_CODES: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  "USER_ALREADY_LINKED",
  "DUPLICATE_USER_ASSIGNMENT",
  "USER_LINKED_TO_BOTH_TYPES",
  "USER_TENANT_MISMATCH",
]);

function severityOf(code: ErrorCode): ErrorSeverity {
  if (CONFLICT_CODES.has(code)) return "CONFLICT";
  if (
    code === "LINK_USER_ID_MISSING" ||
    code === "CREATE_EMAIL_MISSING" ||
    code === "CREATE_ROLE_INVALID" ||
    code === "REVIEWED_BY_MISSING" ||
    code === "REVIEW_NOTE_MISSING"
  ) {
    return "INCOMPLETE";
  }
  return "STRUCTURE";
}

const MESSAGES: Record<ErrorCode, string> = {
  UNSUPPORTED_VERSION: "manifest version desteklenmiyor (yalnız 1)",
  MANIFEST_TENANT_EMPTY: "manifest.tenantId boş",
  UNKNOWN_PROFILE_TYPE: "geçersiz profileType (yalnız LAWYER|STAFF)",
  UNKNOWN_STRATEGY: "geçersiz strategy (LINK_EXISTING_USER|CREATE_LOGIN_USER|SKIP_MANUAL)",
  PROFILE_NOT_FOUND: "profileId referans veride yok",
  USER_NOT_FOUND: "userId referans veride yok",
  LINK_USER_ID_MISSING: "LINK_EXISTING_USER için userId boş",
  CREATE_EMAIL_MISSING: "CREATE_LOGIN_USER için email boş",
  CREATE_ROLE_INVALID: "CREATE_LOGIN_USER için role belirsiz (yalnız ADMIN|USER|VIEWER)",
  REVIEWED_BY_MISSING: "reviewedBy boş",
  REVIEW_NOTE_MISSING: "reviewNote boş",
  PROFILE_TENANT_MISMATCH: "profile tenant'ı manifest tenant'ı ile uyuşmuyor",
  PROFILE_ALREADY_LINKED: "profile zaten bir userId'ye bağlı",
  DUPLICATE_PROFILE_ENTRY: "aynı profile manifest'te birden çok kez geçiyor",
  USER_TENANT_MISMATCH: "existing user tenant'ı manifest tenant'ı ile uyuşmuyor",
  USER_ALREADY_LINKED: "existing user zaten bir Lawyer/Staff profile'a bağlı",
  DUPLICATE_USER_ASSIGNMENT: "aynı userId manifest'te birden çok profile'a atanıyor",
  USER_LINKED_TO_BOTH_TYPES: "aynı login User hem Lawyer hem Staff yapılmaya çalışılıyor",
  CREATE_EMAIL_DUPLICATE: "CREATE_LOGIN_USER email'i manifest içinde birden çok kez geçiyor",
  CREATE_EMAIL_COLLIDES_EXISTING_USER: "CREATE_LOGIN_USER email'i bu tenant'ta zaten mevcut bir User ile çakışıyor",
};

function err(
  entryIndex: number,
  code: ErrorCode,
  ctx?: { profileType?: ProfileType; profileId?: string },
): ManifestError {
  return {
    entryIndex,
    profileType: ctx?.profileType,
    profileId: ctx?.profileId,
    code,
    severity: severityOf(code),
    message: MESSAGES[code],
  };
}

function isBlank(v: string | null | undefined): boolean {
  return v == null || String(v).trim().length === 0;
}

/**
 * Manifest'ten gelen email değerini SAVUNMACI normalize eder: yalnız string ise normalizeEmail uygular,
 * aksi halde (number/object/null/boş) null döner. ASLA throw etmez (bozuk JSON'a karşı). K1-1 normalizeEmail
 * DOKUNULMAZ. null dönüşü = "kullanılabilir email yok" → CREATE_EMAIL_MISSING.
 */
function safeManifestEmail(v: unknown): string | null {
  return typeof v === "string" ? normalizeEmail(v) : null;
}

/**
 * Manuel-incelenmiş manifest'i referans veriye karşı DOĞRULAR (SAF). Hiçbir tahmin yok.
 * Her şüphe HARD-FAIL üretir; çekirdek hiçbir şey yazmaz / yazma listesi DÖNDÜRMEZ.
 *
 * Çağrıldığı yerler:
 *  - planLinkage() (aşağıda)
 *  - scripts/k1-reviewed-linkage.ts → CLI validate
 *  - __tests__/k1-reviewed-linkage.core.spec.ts
 */
export function validateManifest(
  manifest: ReviewedLinkageManifest,
  reference: ReferenceData,
): ManifestValidation {
  const manifestErrors: ManifestError[] = [];
  const manifestTenant = (manifest?.tenantId ?? "").trim();

  if (manifest?.version !== 1) manifestErrors.push(err(-1, "UNSUPPORTED_VERSION"));
  if (manifestTenant.length === 0) manifestErrors.push(err(-1, "MANIFEST_TENANT_EMPTY"));

  // ---- Referans indeksleri ----
  const lawyerById = new Map<string, LawyerRow>();
  for (const l of reference.lawyers) lawyerById.set(l.id, l);
  const staffById = new Map<string, StaffRow>();
  for (const s of reference.staff) staffById.set(s.id, s);
  const userById = new Map<string, UserRow>();
  for (const u of reference.users) userById.set(u.id, u);

  // Mevcut köprüler: zaten bir profile'a bağlı userId'ler
  const alreadyLinkedUserIds = new Set<string>();
  for (const l of reference.lawyers) if (l.userId) alreadyLinkedUserIds.add(l.userId);
  for (const s of reference.staff) if (s.userId) alreadyLinkedUserIds.add(s.userId);

  // Manifest tenant'ındaki mevcut User email'leri (CREATE çakışma kontrolü için)
  const existingEmailsInTenant = new Set<string>();
  for (const u of reference.users) {
    if (u.tenantId !== manifestTenant) continue;
    const e = normalizeEmail(u.email);
    if (e) existingEmailsInTenant.add(e);
  }

  const entries = Array.isArray(manifest?.entries) ? manifest.entries : [];

  // ---- Çapraz-entry ön-tarama (duplicate'ler) ----
  const profileKeyCount = new Map<string, number>();
  const userIdToEntries = new Map<string, number[]>();
  const userIdToTypes = new Map<string, Set<ProfileType>>();
  const createEmailCount = new Map<string, number>();

  entries.forEach((e, i) => {
    if (isProfileType(e?.profileType) && !isBlank(e?.profileId)) {
      const k = `${e.profileType}|${e.profileId}`;
      profileKeyCount.set(k, (profileKeyCount.get(k) ?? 0) + 1);
    }
    if (e?.strategy === "LINK_EXISTING_USER" && !isBlank(e?.userId)) {
      const uid = String(e.userId);
      const arr = userIdToEntries.get(uid) ?? [];
      arr.push(i);
      userIdToEntries.set(uid, arr);
      if (isProfileType(e?.profileType)) {
        const set = userIdToTypes.get(uid) ?? new Set<ProfileType>();
        set.add(e.profileType);
        userIdToTypes.set(uid, set);
      }
    }
    if (e?.strategy === "CREATE_LOGIN_USER") {
      const ne = safeManifestEmail(e?.email);
      if (ne) createEmailCount.set(ne, (createEmailCount.get(ne) ?? 0) + 1);
    }
  });

  // ---- Per-entry değerlendirme ----
  const evals: EntryEvaluation[] = entries.map((e, i) => {
    const errors: ManifestError[] = [];
    const ctx = { profileType: isProfileType(e?.profileType) ? e.profileType : undefined, profileId: isBlank(e?.profileId) ? undefined : e.profileId };

    const typeOk = isProfileType(e?.profileType);
    const stratOk = isStrategy(e?.strategy);
    if (!typeOk) errors.push(err(i, "UNKNOWN_PROFILE_TYPE", ctx));
    if (!stratOk) errors.push(err(i, "UNKNOWN_STRATEGY", ctx));

    // Tüm entry'lerde zorunlu (skip dahil)
    if (isBlank(e?.reviewedBy)) errors.push(err(i, "REVIEWED_BY_MISSING", ctx));
    if (isBlank(e?.reviewNote)) errors.push(err(i, "REVIEW_NOTE_MISSING", ctx));

    // Duplicate profile (ön-taramadan)
    if (typeOk && !isBlank(e?.profileId)) {
      const k = `${e.profileType}|${e.profileId}`;
      if ((profileKeyCount.get(k) ?? 0) > 1) errors.push(err(i, "DUPLICATE_PROFILE_ENTRY", ctx));
    }

    // Profile referans kontrolü
    if (typeOk && !isBlank(e?.profileId)) {
      const prof: LawyerRow | StaffRow | undefined =
        e.profileType === "LAWYER" ? lawyerById.get(e.profileId) : staffById.get(e.profileId);
      if (!prof) {
        errors.push(err(i, "PROFILE_NOT_FOUND", ctx));
      } else {
        if (prof.tenantId !== manifestTenant) errors.push(err(i, "PROFILE_TENANT_MISMATCH", ctx));
        if (prof.userId) errors.push(err(i, "PROFILE_ALREADY_LINKED", ctx));
      }
    } else if (typeOk && isBlank(e?.profileId)) {
      errors.push(err(i, "PROFILE_NOT_FOUND", ctx));
    }

    // Strateji-özel
    if (e?.strategy === "LINK_EXISTING_USER") {
      if (isBlank(e?.userId)) {
        errors.push(err(i, "LINK_USER_ID_MISSING", ctx));
      } else {
        const uid = String(e.userId);
        const u = userById.get(uid);
        if (!u) {
          errors.push(err(i, "USER_NOT_FOUND", ctx));
        } else {
          if (u.tenantId !== manifestTenant) errors.push(err(i, "USER_TENANT_MISMATCH", ctx));
          if (alreadyLinkedUserIds.has(uid)) errors.push(err(i, "USER_ALREADY_LINKED", ctx));
        }
        if ((userIdToEntries.get(uid)?.length ?? 0) > 1) errors.push(err(i, "DUPLICATE_USER_ASSIGNMENT", ctx));
        if ((userIdToTypes.get(uid)?.size ?? 0) > 1) errors.push(err(i, "USER_LINKED_TO_BOTH_TYPES", ctx));
      }
    } else if (e?.strategy === "CREATE_LOGIN_USER") {
      const ne = safeManifestEmail(e?.email); // wrong-type/blank → null (asla throw etmez)
      if (!ne) {
        errors.push(err(i, "CREATE_EMAIL_MISSING", ctx));
      } else {
        if ((createEmailCount.get(ne) ?? 0) > 1) errors.push(err(i, "CREATE_EMAIL_DUPLICATE", ctx));
        if (existingEmailsInTenant.has(ne)) errors.push(err(i, "CREATE_EMAIL_COLLIDES_EXISTING_USER", ctx));
      }
      const role = String(e?.role ?? "").trim().toUpperCase(); // String() → wrong-type rol throw etmez, invalid olur
      if (!VALID_USER_ROLES.includes(role as (typeof VALID_USER_ROLES)[number])) {
        errors.push(err(i, "CREATE_ROLE_INVALID", ctx));
      }
    }

    const unsafe = errors.some((x) => x.severity === "CONFLICT");
    const blocked = errors.length > 0;
    const applySafe = stratOk && e.strategy !== "SKIP_MANUAL" && !blocked;

    return {
      index: i,
      profileType: ctx.profileType,
      profileId: ctx.profileId,
      strategy: stratOk ? e.strategy : undefined,
      errors,
      applySafe,
      blocked,
      unsafe,
    };
  });

  const ok = manifestErrors.length === 0 && evals.every((ev) => ev.errors.length === 0);
  return { manifestErrors, entries: evals, ok };
}

export interface ReviewedLinkagePlan {
  manifest: { version: number; tenantId: string; entries: number };
  plan: {
    linkExistingUser: number;
    createLoginUser: number;
    skipManual: number;
    blockedEntries: number;
    unsafeEntries: number;
  };
  profiles: {
    lawyersCovered: number;
    staffCovered: number;
    profilesNotCovered: number;
    duplicateProfileEntries: number;
    tenantMismatches: number;
  };
  users: {
    existingUsersReferenced: number;
    newUsersPlanned: number;
    duplicateEmails: number;
    userConflictRisks: number;
  };
  conclusion: {
    applySafeEntries: number;
    blockedEntries: number;
    manualFollowUp: number;
  };
  ok: boolean;
}

/**
 * Doğrulanmış manifest'ten sayım-temelli (counts-only) plan üretir (SAF). APPLY YOK — yalnız sayar.
 *
 * Çağrıldığı yerler:
 *  - scripts/k1-reviewed-linkage.ts → CLI plan
 *  - __tests__/k1-reviewed-linkage.core.spec.ts
 */
export function planLinkage(
  manifest: ReviewedLinkageManifest,
  reference: ReferenceData,
): ReviewedLinkagePlan {
  const v = validateManifest(manifest, reference);
  const manifestTenant = (manifest?.tenantId ?? "").trim();
  const entries = Array.isArray(manifest?.entries) ? manifest.entries : [];

  const byStrategy = (s: LinkageStrategy) => entries.filter((e) => e?.strategy === s).length;

  const hasCode = (ev: EntryEvaluation, codes: ReadonlySet<ErrorCode>) =>
    ev.errors.some((x) => codes.has(x.code));
  const hasOne = (ev: EntryEvaluation, code: ErrorCode) => ev.errors.some((x) => x.code === code);

  // Profiles
  const coveredLawyerIds = new Set<string>();
  const coveredStaffIds = new Set<string>();
  for (const e of entries) {
    if (e?.profileType === "LAWYER" && !isBlank(e?.profileId)) coveredLawyerIds.add(e.profileId);
    if (e?.profileType === "STAFF" && !isBlank(e?.profileId)) coveredStaffIds.add(e.profileId);
  }
  const realLawyerCovered = [...coveredLawyerIds].filter((id) => {
    const l = reference.lawyers.find((x) => x.id === id);
    return !!l && l.tenantId === manifestTenant;
  }).length;
  const realStaffCovered = [...coveredStaffIds].filter((id) => {
    const s = reference.staff.find((x) => x.id === id);
    return !!s && s.tenantId === manifestTenant;
  }).length;

  const unlinkedInTenant = [
    ...reference.lawyers.filter((l) => l.tenantId === manifestTenant && !l.userId).map((l) => ({ t: "LAWYER" as ProfileType, id: l.id })),
    ...reference.staff.filter((s) => s.tenantId === manifestTenant && !s.userId).map((s) => ({ t: "STAFF" as ProfileType, id: s.id })),
  ];
  const profilesNotCovered = unlinkedInTenant.filter(
    (p) => !(p.t === "LAWYER" ? coveredLawyerIds : coveredStaffIds).has(p.id),
  ).length;

  const duplicateProfileEntries = v.entries.filter((ev) => hasOne(ev, "DUPLICATE_PROFILE_ENTRY")).length;
  const tenantMismatches = v.entries.filter((ev) => hasOne(ev, "PROFILE_TENANT_MISMATCH")).length;

  // Users
  const existingUserIds = new Set<string>();
  for (const e of entries) {
    if (e?.strategy === "LINK_EXISTING_USER" && !isBlank(e?.userId)) existingUserIds.add(String(e.userId));
  }
  const newEmails = new Set<string>();
  for (const e of entries) {
    if (e?.strategy === "CREATE_LOGIN_USER") {
      const ne = safeManifestEmail(e?.email);
      if (ne) newEmails.add(ne);
    }
  }
  const duplicateEmails = v.entries.filter(
    (ev) => hasOne(ev, "CREATE_EMAIL_DUPLICATE") || hasOne(ev, "CREATE_EMAIL_COLLIDES_EXISTING_USER"),
  ).length;
  const userConflictRisks = v.entries.filter((ev) => hasCode(ev, USER_CONFLICT_CODES)).length;

  const blockedEntries = v.entries.filter((ev) => ev.blocked).length;
  const unsafeEntries = v.entries.filter((ev) => ev.unsafe).length;
  const applySafeEntries = v.entries.filter((ev) => ev.applySafe).length;
  const skipManual = byStrategy("SKIP_MANUAL");

  // Manuel takip = bu tenant'taki BAĞSIZ gerçek profillerden apply-safe bir entry ile ÇÖZÜLMEYENLER (deduped).
  // (skipManual + profilesNotCovered) yerine: blocked-LINK ile "kapsanan" ama çözülmeyen profili de sayar,
  // duplicate/already-linked/foreign-tenant/non-existent SKIP entry'lerini ÇİFT/yanlış saymaz.
  const applySafeProfileKeys = new Set<string>();
  for (const ev of v.entries) {
    if (ev.applySafe && ev.profileType && ev.profileId) {
      applySafeProfileKeys.add(`${ev.profileType}|${ev.profileId}`);
    }
  }
  const manualFollowUp = unlinkedInTenant.filter(
    (p) => !applySafeProfileKeys.has(`${p.t}|${p.id}`),
  ).length;

  return {
    manifest: {
      version: typeof manifest?.version === "number" ? manifest.version : 0,
      tenantId: manifestTenant,
      entries: entries.length,
    },
    plan: {
      linkExistingUser: byStrategy("LINK_EXISTING_USER"),
      createLoginUser: byStrategy("CREATE_LOGIN_USER"),
      skipManual,
      blockedEntries,
      unsafeEntries,
    },
    profiles: {
      lawyersCovered: realLawyerCovered,
      staffCovered: realStaffCovered,
      profilesNotCovered,
      duplicateProfileEntries,
      tenantMismatches,
    },
    users: {
      existingUsersReferenced: existingUserIds.size,
      newUsersPlanned: newEmails.size,
      duplicateEmails,
      userConflictRisks,
    },
    conclusion: {
      applySafeEntries,
      blockedEntries,
      manualFollowUp,
    },
    ok: v.ok,
  };
}

/**
 * Planı "K1 REVIEWED LINKAGE PLAN" metin düzenine render eder (SAF; PII yok, yalnız sayım).
 *
 * Çağrıldığı yerler:
 *  - scripts/k1-reviewed-linkage.ts → stdout
 *  - __tests__/k1-reviewed-linkage.core.spec.ts
 */
export function formatPlan(plan: ReviewedLinkagePlan): string {
  const p = plan;
  return [
    "K1 REVIEWED LINKAGE PLAN",
    "",
    "Manifest:",
    `- version: ${p.manifest.version}`,
    `- tenantId: ${p.manifest.tenantId}`,
    `- entries: ${p.manifest.entries}`,
    "",
    "Plan:",
    `- link existing user: ${p.plan.linkExistingUser}`,
    `- create login user: ${p.plan.createLoginUser}`,
    `- skip manual: ${p.plan.skipManual}`,
    `- blocked entries: ${p.plan.blockedEntries}`,
    `- unsafe entries: ${p.plan.unsafeEntries}`,
    "",
    "Profiles:",
    `- lawyers covered: ${p.profiles.lawyersCovered}`,
    `- staff covered: ${p.profiles.staffCovered}`,
    `- profiles not covered: ${p.profiles.profilesNotCovered}`,
    `- duplicate profile entries: ${p.profiles.duplicateProfileEntries}`,
    `- tenant mismatches: ${p.profiles.tenantMismatches}`,
    "",
    "Users:",
    `- existing users referenced: ${p.users.existingUsersReferenced}`,
    `- new users planned: ${p.users.newUsersPlanned}`,
    `- duplicate emails: ${p.users.duplicateEmails}`,
    `- user conflict risks: ${p.users.userConflictRisks}`,
    "",
    "Conclusion:",
    `- apply-safe entries: ${p.conclusion.applySafeEntries}`,
    `- blocked entries: ${p.conclusion.blockedEntries}`,
    `- manual follow-up: ${p.conclusion.manualFollowUp}`,
  ].join("\n");
}

/** Template entry: doldurulabilir iskelet + (yalnız --verbose) PII-olmayan kapasite ipucu. */
export interface TemplateEntry extends ManifestEntry {
  _capacity?: string; // lawyerRank | staffType (PII değil) — incelemeyi kolaylaştırır
  _emailHint?: string; // YALNIZ includeEmailHint=true → normalize email (PII; default OFF)
}

export interface TemplateOptions {
  tenantId: string;
  includeEmailHint?: boolean; // --verbose; default false (PII kapalı)
}

/**
 * Verilen tenant'taki BAĞLI OLMAYAN profiller için doldurulması gereken bir manifest iskeleti üretir.
 * Hiçbir tahmin yok: her entry strategy="SKIP_MANUAL" + boş reviewedBy/reviewNote ile gelir;
 * inceleyen insan stratejiyi/alanları doldurur. Default'ta PII (email) basılmaz.
 *
 * Çağrıldığı yerler:
 *  - scripts/k1-reviewed-linkage.ts → --template
 *  - __tests__/k1-reviewed-linkage.core.spec.ts
 */
export function generateManifestTemplate(
  reference: ReferenceData,
  opts: TemplateOptions,
): ReviewedLinkageManifest & { entries: TemplateEntry[] } {
  const tenantId = (opts?.tenantId ?? "").trim();
  const includeEmailHint = opts?.includeEmailHint === true;

  const mk = (
    profileType: ProfileType,
    profileId: string,
    capacity: string,
    email: string | null,
  ): TemplateEntry => {
    const base: TemplateEntry = {
      profileType,
      profileId,
      strategy: "SKIP_MANUAL",
      reviewedBy: "",
      reviewNote: "",
      _capacity: capacity,
    };
    if (includeEmailHint) {
      const ne = normalizeEmail(email);
      if (ne) base._emailHint = ne;
    }
    return base;
  };

  const entries: TemplateEntry[] = [
    ...reference.lawyers
      .filter((l) => l.tenantId === tenantId && !l.userId)
      .map((l) => mk("LAWYER", l.id, l.lawyerRank, l.email)),
    ...reference.staff
      .filter((s) => s.tenantId === tenantId && !s.userId)
      .map((s) => mk("STAFF", s.id, s.staffType, s.email)),
  ];

  return { version: 1, tenantId, entries };
}

/**
 * Ham JSON'u (dosyadan) yapısal olarak doğrular ve tipli manifest'e çevirir (SAF).
 * Hatalı şekilde net mesajla THROW eder. İçerik doğrulaması validateManifest'in işidir.
 *
 * Çağrıldığı yerler:
 *  - scripts/k1-reviewed-linkage.ts → manifest dosyası okunduktan sonra
 *  - __tests__/k1-reviewed-linkage.core.spec.ts
 */
export function parseManifest(raw: unknown): ReviewedLinkageManifest {
  if (raw == null || typeof raw !== "object") {
    throw new Error("manifest: kök bir JSON nesnesi olmalı");
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.version !== "number") {
    throw new Error("manifest.version: number olmalı");
  }
  if (typeof obj.tenantId !== "string") {
    throw new Error("manifest.tenantId: string olmalı");
  }
  if (!Array.isArray(obj.entries)) {
    throw new Error("manifest.entries: dizi olmalı");
  }
  return obj as unknown as ReviewedLinkageManifest;
}

// ============================================================================
// K1-3 — GUARDED APPLY (doğrulanmış manifest'i transaction-safe uygula)
// ============================================================================
//
// K1-3, K1-2'nin ÜSTÜNE oturur: K1-2 doğrular+planlar, K1-3 AÇIK/GUARD'LI uygular.
// Eklenen her şey ya SAF (planApply/verify/format/guards) ya da INJECTED-tx (applyLinkages);
// GERÇEK Prisma bağlantısı/$transaction script'tedir (k1-reviewed-linkage.ts). Bu çekirdek IO'suzdur.
//
// KESİN K1-3 ÇİZGİLERİ:
//  - İzin verilen TEK write: Lawyer.userId set + StaffMember.userId set (yalnız LINK_EXISTING_USER).
//  - CREATE_LOGIN_USER GÜVENLİ UYGULANAMAZ → CREATE_BLOCKED_NOT_IMPLEMENTED. Sebep: User.passwordHash
//    NOT NULL; tek user-create yolu auth.register = bcrypt.hash(GERÇEK parola). Otomatik CLI'nin güvenli
//    parola edinme yolu YOK; rastgele/default/tahmin parola YASAK → user create HİÇ YAPILMAZ (kod yok).
//  - Partial apply YOK: herhangi bir genuine block/conflict → SIFIR write (preflight hard-stop).
//  - Idempotent: profile zaten HEDEF userId'ye bağlıysa ALREADY_APPLIED (no-op); BAŞKA user/profile → CONFLICT.

/** DB hedef sınıflandırması: prod İŞARETİ → stop; açık non-prod gerekir; aksi UNKNOWN → stop. */
export type DbTargetClass = "missing" | "prod" | "non-prod" | "unknown";

export function classifyDbTarget(databaseUrl: string | undefined): DbTargetClass {
  if (databaseUrl == null || databaseUrl.trim().length === 0) return "missing";
  const u = databaseUrl.toLowerCase();
  // prod İŞARETİ her yerde → stop (fail-safe; ÖNCE kontrol edilir).
  if (/prod|live|customer|staging/.test(u)) return "prod";
  // non-prod KANITI YALNIZ açık LOOPBACK HOST'tan gelir. DB ADI (hukuk_db) veya 'dev'/'local' substring'i
  // KANIT DEĞİLDİR: uzak bir PROD DB de `hukuk_db` adını taşıyabilir. Host loopback değilse → unknown → stop.
  const host = u.match(/^[a-z0-9+.\-]+:\/\/(?:[^@/]*@)?([^:/?#]+)/)?.[1] ?? "";
  if (host === "localhost" || host === "::1" || host === "[::1]" || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) {
    return "non-prod";
  }
  return "unknown";
}

/**
 * Hata metninden bağlantı dizgisi (postgresql://...) ve secret token'larını maskeler (SAF).
 * Catch bloklarında ham DATABASE_URL / Prisma init/constraint detayının basılmasını ÖNLER
 * (spec: ham DATABASE_URL hiçbir yolda basılmaz).
 *
 * Çağrıldığı yerler:
 *  - scripts/k1-reviewed-linkage.ts → 3 catch sink (parse / apply-failure / top-level)
 *  - __tests__/k1-reviewed-linkage.core.spec.ts
 */
export function redactSecrets(s: string): string {
  return String(s)
    .replace(/[a-z][a-z0-9+.\-]*:\/\/[^\s'"]+/gi, "[redacted-url]")
    .replace(/\b(password|pass|pwd|secret|token|apikey|api_key)\s*[=:]\s*[^\s&'"]+/gi, "$1=[redacted]");
}

export interface ApplyGuardInput {
  apply: boolean;
  allowDevDbWrite: boolean;
  confirmManifestReviewed: boolean;
  nodeEnv: string | undefined;
  databaseUrl: string | undefined;
}

export interface ApplyGuardResult {
  mode: "dry-run" | "apply";
  canApply: boolean;
  hardStops: string[];
  dbTarget: DbTargetClass;
}

/**
 * Guarded apply için ÜÇLÜ-KAPI + env/DB değerlendirmesi (SAF). Varsayılan dry-run.
 * Üçlü kapı: --apply + --allow-dev-db-write + --confirm-manifest-reviewed (üçü de gerekir).
 * Prod hard-stop: NODE_ENV=production / DATABASE_URL prod|live|customer|staging / eksik / unknown hedef.
 *
 * Çağrıldığı yerler:
 *  - scripts/k1-reviewed-linkage.ts → --apply yolu
 *  - __tests__/k1-reviewed-linkage.core.spec.ts
 */
export function evaluateApplyGuards(input: ApplyGuardInput): ApplyGuardResult {
  const dbTarget = classifyDbTarget(input.databaseUrl);
  if (!input.apply) {
    return { mode: "dry-run", canApply: false, hardStops: [], dbTarget };
  }
  const hardStops: string[] = [];
  if (!input.allowDevDbWrite) hardStops.push("--allow-dev-db-write yok → yazma reddedildi");
  if (!input.confirmManifestReviewed) hardStops.push("--confirm-manifest-reviewed yok → insan-onayı teyidi reddedildi");
  if ((input.nodeEnv ?? "").trim().toLowerCase().startsWith("prod")) hardStops.push("NODE_ENV=prod* → apply yasak");
  if (dbTarget === "missing") hardStops.push("DATABASE_URL yok → apply yasak");
  if (dbTarget === "prod") hardStops.push("DATABASE_URL prod/live/customer/staging içeriyor → apply yasak");
  if (dbTarget === "unknown") hardStops.push("DB hedefi açıkça non-prod değil (unknown) → apply yasak");
  return { mode: "apply", canApply: hardStops.length === 0, hardStops, dbTarget };
}

export type ApplyEntryStatus =
  | "APPLY_LINK" // LINK; profile.userId null + güvenli → yazılacak
  | "ALREADY_APPLIED" // LINK; profile zaten HEDEF userId'ye bağlı → no-op (idempotent)
  | "CONFLICT" // LINK; profile/user başka bağ → hard stop (idempotent DEĞİL)
  | "BLOCKED" // K1-2 genuine validation hatası (tenant/duplicate/missing/not-found/...)
  | "CREATE_BLOCKED_NOT_IMPLEMENTED" // CREATE_LOGIN_USER → güvenli user-create yok
  | "SKIP"; // SKIP_MANUAL → write yok

export interface ApplyEntryPlan {
  index: number;
  profileType?: ProfileType;
  profileId?: string;
  status: ApplyEntryStatus;
  userId?: string; // LINK hedefi (yalnız APPLY_LINK/ALREADY_APPLIED/CONFLICT anlamlı)
  reason: string; // PII yok
}

export interface ApplyOperation {
  profileType: ProfileType;
  profileId: string;
  userId: string;
}

export interface ApplyPlan {
  entries: ApplyEntryPlan[];
  operations: ApplyOperation[]; // YALNIZ APPLY_LINK (yazılacaklar)
  counts: {
    applyLink: number;
    alreadyApplied: number;
    conflict: number;
    blocked: number;
    createBlockedNotImplemented: number;
    skip: number;
  };
  hardStops: string[]; // blocked + conflict + manifest-level → varsa SIFIR write
  canApply: boolean; // hardStops.length === 0 (CREATE-blocked TEK BAŞINA durdurmaz; ayrı raporlanır)
}

/**
 * Doğrulanmış manifest'ten APPLY planı üretir (SAF; idempotency-farkında). K1-2 validateManifest'i
 * yeniden kullanır; yalnız "already-linked" boyutunu idempotency için yeniden sınıflandırır.
 * APPLY YAPMAZ — yalnız ne yazılacağını belirler. CREATE her zaman not-implemented.
 *
 * Çağrıldığı yerler:
 *  - scripts/k1-reviewed-linkage.ts → preflight (--apply ve dry-run)
 *  - __tests__/k1-reviewed-linkage.core.spec.ts
 */
export function planApply(manifest: ReviewedLinkageManifest, reference: ReferenceData): ApplyPlan {
  const v = validateManifest(manifest, reference);
  const entries = Array.isArray(manifest?.entries) ? manifest.entries : [];

  const lawyerById = new Map<string, LawyerRow>();
  for (const l of reference.lawyers) lawyerById.set(l.id, l);
  const staffById = new Map<string, StaffRow>();
  for (const s of reference.staff) staffById.set(s.id, s);
  // userId → bağlı olduğu TÜM profiller ("TYPE|id"[]); çift-sahiplik (dual ownership) tespiti için.
  // Map<string,string> last-writer-wins olurdu → bir user'ın iki profile bağlı olması (tek-asıl ihlali)
  // gizlenirdi. Dizi tutarak bunu CONFLICT olarak yüzeye çıkarırız.
  const userOwners = new Map<string, string[]>();
  const addOwner = (uid: string, key: string) => {
    const arr = userOwners.get(uid);
    if (arr) arr.push(key);
    else userOwners.set(uid, [key]);
  };
  for (const l of reference.lawyers) if (l.userId) addOwner(l.userId, `LAWYER|${l.id}`);
  for (const s of reference.staff) if (s.userId) addOwner(s.userId, `STAFF|${s.id}`);

  const plan: ApplyEntryPlan[] = entries.map((e, i) => {
    const ev = v.entries[i];
    const profileType = ev.profileType;
    const profileId = ev.profileId;
    const base = { index: i, profileType, profileId };

    if (e?.strategy === "SKIP_MANUAL") {
      if (ev.errors.length > 0) return { ...base, status: "BLOCKED", reason: "skip entry geçersiz (review alanları)" };
      return { ...base, status: "SKIP", reason: "manuel takip; write yok" };
    }
    if (e?.strategy === "CREATE_LOGIN_USER") {
      return { ...base, status: "CREATE_BLOCKED_NOT_IMPLEMENTED", reason: "güvenli login-user create yok (passwordHash NOT NULL; otomatik parola yasak)" };
    }
    if (e?.strategy === "LINK_EXISTING_USER") {
      // PROFILE_ALREADY_LINKED / USER_ALREADY_LINKED dışındaki HER hata genuine block (idempotency dışı)
      const nonIdem = ev.errors.filter((x) => x.code !== "PROFILE_ALREADY_LINKED" && x.code !== "USER_ALREADY_LINKED");
      if (nonIdem.length > 0) return { ...base, status: "BLOCKED", reason: "K1-2 validation block" };
      const userId = String(e.userId);
      const prof: LawyerRow | StaffRow | undefined =
        profileType === "LAWYER" ? lawyerById.get(profileId as string) : staffById.get(profileId as string);
      if (!prof || !profileType || !profileId) return { ...base, status: "BLOCKED", reason: "profile çözülemedi" };
      const thisKey = `${profileType}|${profileId}`;
      const otherOwners = (userOwners.get(userId) ?? []).filter((o) => o !== thisKey);
      if (prof.userId == null) {
        // profile boş; hedef user BAŞKA herhangi bir profile bağlıysa → conflict (yazma yok)
        if (otherOwners.length > 0) return { ...base, userId, status: "CONFLICT", reason: "hedef user başka profile'a bağlı" };
        return { ...base, userId, status: "APPLY_LINK", reason: "link yazılacak" };
      }
      if (prof.userId === userId) {
        // idempotent SADECE hedef user'ın TEK sahibi bu profile ise; başka profile de sahipse → çift-sahiplik CONFLICT
        if (otherOwners.length > 0) return { ...base, userId, status: "CONFLICT", reason: "hedef user birden çok profile'a bağlı (çift-sahiplik)" };
        return { ...base, userId, status: "ALREADY_APPLIED", reason: "profile zaten hedef user'a bağlı (idempotent)" };
      }
      return { ...base, userId, status: "CONFLICT", reason: "profile başka user'a bağlı" };
    }
    return { ...base, status: "BLOCKED", reason: "geçersiz strategy" };
  });

  const by = (s: ApplyEntryStatus) => plan.filter((p) => p.status === s).length;
  const counts = {
    applyLink: by("APPLY_LINK"),
    alreadyApplied: by("ALREADY_APPLIED"),
    conflict: by("CONFLICT"),
    blocked: by("BLOCKED"),
    createBlockedNotImplemented: by("CREATE_BLOCKED_NOT_IMPLEMENTED"),
    skip: by("SKIP"),
  };

  const hardStops: string[] = [];
  if (v.manifestErrors.length > 0) hardStops.push(`manifest-level: ${v.manifestErrors.map((x) => x.code).join(",")}`);
  if (counts.blocked > 0) hardStops.push(`${counts.blocked} blocked entry`);
  if (counts.conflict > 0) hardStops.push(`${counts.conflict} conflict entry`);

  const operations: ApplyOperation[] = plan
    .filter((p) => p.status === "APPLY_LINK" && p.profileType && p.profileId && p.userId)
    .map((p) => ({ profileType: p.profileType as ProfileType, profileId: p.profileId as string, userId: p.userId as string }));

  return { entries: plan, operations, counts, hardStops, canApply: hardStops.length === 0 };
}

/** INJECTED transaction arayüzü: izin verilen TEK iki yazma. Gerçek impl script'te ($transaction içinde). */
export interface LinkageApplyTx {
  setLawyerUserId(profileId: string, userId: string): Promise<void>;
  setStaffUserId(profileId: string, userId: string): Promise<void>;
}

export interface ApplyExecutionResult {
  lawyerLinks: number;
  staffLinks: number;
  applied: ApplyOperation[];
}

/**
 * Operasyonları INJECTED tx üzerinden uygular. FAIL-FAST: bir op throw ederse döngü durur, hata yukarı
 * gider → script'teki prisma.$transaction ROLLBACK eder (partial state YOK). İzin verilen TEK yazma:
 * Lawyer.userId / StaffMember.userId set. User create / role / email / başka tablo YOK.
 *
 * Çağrıldığı yerler:
 *  - scripts/k1-reviewed-linkage.ts → prisma.$transaction(ptx => applyLinkages(ops, txAdapter))
 *  - __tests__/k1-reviewed-linkage.core.spec.ts (mock tx; rollback/no-forbidden-write)
 */
export async function applyLinkages(operations: ApplyOperation[], tx: LinkageApplyTx): Promise<ApplyExecutionResult> {
  const applied: ApplyOperation[] = [];
  let lawyerLinks = 0;
  let staffLinks = 0;
  for (const op of operations) {
    if (op.profileType === "LAWYER") {
      await tx.setLawyerUserId(op.profileId, op.userId);
      lawyerLinks++;
    } else {
      await tx.setStaffUserId(op.profileId, op.userId);
      staffLinks++;
    }
    applied.push(op);
  }
  return { lawyerLinks, staffLinks, applied };
}

export interface ApplyVerification {
  expected: number;
  verified: number;
  mismatches: Array<{ profileType: ProfileType; profileId: string }>;
}

/**
 * Apply SONRASI doğrulama (SAF): operasyonların hedef profile.userId'lerinin gerçekten set olduğunu
 * YENİDEN-OKUNMUŞ referanstan teyit eder. PII yok (yalnız opak id + sayım).
 *
 * Çağrıldığı yerler:
 *  - scripts/k1-reviewed-linkage.ts → apply sonrası re-read
 *  - __tests__/k1-reviewed-linkage.core.spec.ts
 */
export function verifyAppliedState(operations: ApplyOperation[], postReference: ReferenceData): ApplyVerification {
  const lawyerById = new Map<string, LawyerRow>();
  for (const l of postReference.lawyers) lawyerById.set(l.id, l);
  const staffById = new Map<string, StaffRow>();
  for (const s of postReference.staff) staffById.set(s.id, s);
  const mismatches: Array<{ profileType: ProfileType; profileId: string }> = [];
  let verified = 0;
  for (const op of operations) {
    const prof = op.profileType === "LAWYER" ? lawyerById.get(op.profileId) : staffById.get(op.profileId);
    if (prof && prof.userId === op.userId) verified++;
    else mismatches.push({ profileType: op.profileType, profileId: op.profileId });
  }
  return { expected: operations.length, verified, mismatches };
}

export interface ApplyReportInput {
  env: { head: string; dbTargetMasked: string; nodeEnv: string; manifest: string; applyMode: "dry-run" | "apply" | "refused" };
  plan: ApplyPlan;
  transactionStarted: boolean;
  execution: ApplyExecutionResult | null; // null = dry-run / refused / no-ops
  verification: ApplyVerification | null;
  failed: number;
}

/**
 * Apply raporunu "K1 GUARDED APPLY REPORT" düzenine render eder (SAF; PII yok, yalnız sayım + maskeli meta).
 *
 * Çağrıldığı yerler:
 *  - scripts/k1-reviewed-linkage.ts → stdout
 *  - __tests__/k1-reviewed-linkage.core.spec.ts
 */
export function formatApplyReport(inp: ApplyReportInput): string {
  const c = inp.plan.counts;
  const exec = inp.execution;
  const ver = inp.verification;
  const appliedLinks = exec ? exec.applied.length : 0;
  const unknownRemaining = inp.plan.entries.length - (appliedLinks + c.alreadyApplied);
  const repair = appliedLinks > 0 ? (c.createBlockedNotImplemented > 0 ? "partial (LINK only)" : "yes") : "no";
  return [
    "K1 GUARDED APPLY REPORT",
    "",
    "Environment:",
    `- HEAD: ${inp.env.head}`,
    `- DB target masked: ${inp.env.dbTargetMasked}`,
    `- NODE_ENV: ${inp.env.nodeEnv}`,
    `- manifest: ${inp.env.manifest}`,
    `- apply mode: ${inp.env.applyMode}`,
    "",
    "Preflight:",
    `- entries: ${inp.plan.entries.length}`,
    `- link existing: ${c.applyLink}`,
    `- create login user: ${c.createBlockedNotImplemented}   // BLOCKED_NOT_IMPLEMENTED`,
    `- skip manual: ${c.skip}`,
    `- blocked: ${c.blocked}`,
    `- unsafe: ${c.conflict}`,
    "",
    "Apply:",
    `- transaction started: ${inp.transactionStarted ? "yes" : "no"}`,
    `- users created: 0   // CREATE_LOGIN_USER not implemented (no password path)`,
    `- lawyer links updated: ${exec ? exec.lawyerLinks : 0}`,
    `- staff links updated: ${exec ? exec.staffLinks : 0}`,
    `- already applied: ${c.alreadyApplied}`,
    `- skipped manual: ${c.skip}`,
    `- failed: ${inp.failed}`,
    "",
    "Post-verify:",
    `- expected links: ${ver ? ver.expected : 0}`,
    `- verified links: ${ver ? ver.verified : 0}`,
    `- mismatches: ${ver ? ver.mismatches.length : 0}`,
    `- unknown capacity remaining for covered entries: ${unknownRemaining}`,
    "",
    "Conclusion:",
    `- apply completed: ${exec ? "yes" : "no"}`,
    `- partial writes?: no`,
    `- K1 repair performed?: ${repair}`,
    `- P3 enforcement ready?: no`,
  ].join("\n");
}
