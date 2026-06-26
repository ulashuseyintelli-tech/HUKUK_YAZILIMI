import * as Core from "../k1-reviewed-linkage.core";
import {
  validateManifest,
  planLinkage,
  formatPlan,
  generateManifestTemplate,
  parseManifest,
  evaluateApplyGuards,
  classifyDbTarget,
  planApply,
  applyLinkages,
  verifyAppliedState,
  formatApplyReport,
  redactSecrets,
  ManifestEntry,
  ReviewedLinkageManifest,
  ReferenceData,
  ApplyOperation,
  ApplyPlan,
  LinkageApplyTx,
} from "../k1-reviewed-linkage.core";
import { UserRow, LawyerRow, StaffRow } from "../k1-capacity-linkage.core";

/**
 * K1-2 — reviewed-linkage STRATEGY core testleri (SAF; DB yok).
 * KESİN KURAL: tahmin yok (isim/telefon/rol/fuzzy/tenant-inference yok); her şüphe HARD-FAIL;
 * çekirdek hiçbir şey YAZMAZ (apply K1-3'e ertelendi); rapor yalnız sayım (PII yok).
 */

// ---- Builders (K1-1 stiliyle hizalı) ----
const U = (id: string, tenantId: string, email: string): UserRow => ({ id, tenantId, email });
const L = (id: string, tenantId: string, email: string | null, rank = "LAWYER", userId: string | null = null): LawyerRow => ({ id, tenantId, email, lawyerRank: rank, userId });
const S = (id: string, tenantId: string, email: string | null, type = "SEKRETER", userId: string | null = null): StaffRow => ({ id, tenantId, email, staffType: type, userId });
const ref = (users: UserRow[], lawyers: LawyerRow[], staff: StaffRow[]): ReferenceData => ({ users, lawyers, staff });

const entry = (over: Partial<ManifestEntry>): ManifestEntry => ({
  profileType: "LAWYER",
  profileId: "l1",
  strategy: "SKIP_MANUAL",
  reviewedBy: "av. ulas",
  reviewNote: "incelendi",
  ...over,
});
const manifest = (tenantId: string, entries: ManifestEntry[], version = 1): ReviewedLinkageManifest => ({ version, tenantId, entries });

const codesOf = (errors: { code: string }[]) => errors.map((e) => e.code);

describe("K1-2 (1) valid LINK_EXISTING_USER plan → hata yok, apply-safe 1", () => {
  it("manuel LINK kararı email-eşleşmesi GEREKTİRMEZ; geçerli → applySafe", () => {
    const r = ref([U("u1", "t1", "login@x.com")], [L("l1", "t1", "farkli@x.com")], []);
    const m = manifest("t1", [entry({ profileType: "LAWYER", profileId: "l1", strategy: "LINK_EXISTING_USER", userId: "u1" })]);
    const v = validateManifest(m, r);
    expect(v.ok).toBe(true);
    expect(v.entries[0].errors).toEqual([]);
    expect(v.entries[0].applySafe).toBe(true);
    const p = planLinkage(m, r);
    expect(p.plan.linkExistingUser).toBe(1);
    expect(p.users.existingUsersReferenced).toBe(1);
    expect(p.conclusion.applySafeEntries).toBe(1);
    expect(p.conclusion.blockedEntries).toBe(0);
    expect(p.profiles.profilesNotCovered).toBe(0);
    expect(p.ok).toBe(true);
  });
});

describe("K1-2 (2) valid CREATE_LOGIN_USER plan → hata yok, apply-safe 1", () => {
  it("yeni login planı (ADMIN|USER|VIEWER) geçerli → applySafe", () => {
    const r = ref([], [], [S("s1", "t1", null)]);
    const m = manifest("t1", [entry({ profileType: "STAFF", profileId: "s1", strategy: "CREATE_LOGIN_USER", email: "yeni@x.com", role: "USER" })]);
    const v = validateManifest(m, r);
    expect(v.ok).toBe(true);
    expect(v.entries[0].applySafe).toBe(true);
    const p = planLinkage(m, r);
    expect(p.plan.createLoginUser).toBe(1);
    expect(p.users.newUsersPlanned).toBe(1);
    expect(p.conclusion.applySafeEntries).toBe(1);
  });
});

describe("K1-2 (3) duplicate profile → hard fail", () => {
  it("aynı LAWYER iki kez → her ikisi DUPLICATE_PROFILE_ENTRY, blocked", () => {
    const r = ref([U("u1", "t1", "a@x.com"), U("u2", "t1", "b@x.com")], [L("l1", "t1", null)], []);
    const m = manifest("t1", [
      entry({ profileId: "l1", strategy: "LINK_EXISTING_USER", userId: "u1" }),
      entry({ profileId: "l1", strategy: "LINK_EXISTING_USER", userId: "u2" }),
    ]);
    const v = validateManifest(m, r);
    expect(v.ok).toBe(false);
    expect(codesOf(v.entries[0].errors)).toContain("DUPLICATE_PROFILE_ENTRY");
    expect(codesOf(v.entries[1].errors)).toContain("DUPLICATE_PROFILE_ENTRY");
    expect(planLinkage(m, r).profiles.duplicateProfileEntries).toBe(2);
  });
});

describe("K1-2 (4) duplicate user assignment → hard fail", () => {
  it("aynı userId iki farklı profile → her ikisi DUPLICATE_USER_ASSIGNMENT", () => {
    const r = ref([U("u1", "t1", "a@x.com")], [L("l1", "t1", null), L("l2", "t1", null)], []);
    const m = manifest("t1", [
      entry({ profileId: "l1", strategy: "LINK_EXISTING_USER", userId: "u1" }),
      entry({ profileId: "l2", strategy: "LINK_EXISTING_USER", userId: "u1" }),
    ]);
    const v = validateManifest(m, r);
    expect(codesOf(v.entries[0].errors)).toContain("DUPLICATE_USER_ASSIGNMENT");
    expect(codesOf(v.entries[1].errors)).toContain("DUPLICATE_USER_ASSIGNMENT");
    expect(planLinkage(m, r).users.userConflictRisks).toBe(2);
  });
});

describe("K1-2 (5) tenant mismatch → hard fail", () => {
  it("profile farklı tenant'ta → PROFILE_TENANT_MISMATCH (CONFLICT/unsafe)", () => {
    const r = ref([U("u1", "t1", "a@x.com")], [L("l1", "t2", null)], []); // l1 t2'de
    const m = manifest("t1", [entry({ profileId: "l1", strategy: "LINK_EXISTING_USER", userId: "u1" })]);
    const v = validateManifest(m, r);
    expect(codesOf(v.entries[0].errors)).toContain("PROFILE_TENANT_MISMATCH");
    expect(v.entries[0].unsafe).toBe(true);
    expect(planLinkage(m, r).profiles.tenantMismatches).toBe(1);
  });
});

describe("K1-2 (6) existing user zaten profile'a bağlı → hard fail", () => {
  it("hedef User başka profile'a bağlı → USER_ALREADY_LINKED", () => {
    const r = ref([U("u1", "t1", "a@x.com")], [L("lExisting", "t1", null, "LAWYER", "u1")], [S("s1", "t1", null)]);
    const m = manifest("t1", [entry({ profileType: "STAFF", profileId: "s1", strategy: "LINK_EXISTING_USER", userId: "u1" })]);
    const v = validateManifest(m, r);
    expect(codesOf(v.entries[0].errors)).toContain("USER_ALREADY_LINKED");
    expect(planLinkage(m, r).users.userConflictRisks).toBe(1);
  });
});

describe("K1-2 (7) existing profile zaten userId bağlı → hard fail", () => {
  it("manifest hedefi profile zaten linkli → PROFILE_ALREADY_LINKED", () => {
    const r = ref([U("u1", "t1", "a@x.com")], [L("l1", "t1", null, "LAWYER", "u9")], []);
    const m = manifest("t1", [entry({ profileId: "l1", strategy: "LINK_EXISTING_USER", userId: "u1" })]);
    const v = validateManifest(m, r);
    expect(codesOf(v.entries[0].errors)).toContain("PROFILE_ALREADY_LINKED");
    expect(v.entries[0].blocked).toBe(true);
  });
});

describe("K1-2 (8) duplicate new email → hard fail", () => {
  it("iki CREATE_LOGIN_USER aynı email → her ikisi CREATE_EMAIL_DUPLICATE", () => {
    const r = ref([], [], [S("s1", "t1", null), S("s2", "t1", null)]);
    const m = manifest("t1", [
      entry({ profileType: "STAFF", profileId: "s1", strategy: "CREATE_LOGIN_USER", email: "dup@x.com", role: "USER" }),
      entry({ profileType: "STAFF", profileId: "s2", strategy: "CREATE_LOGIN_USER", email: "DUP@x.com", role: "USER" }),
    ]);
    const v = validateManifest(m, r);
    expect(codesOf(v.entries[0].errors)).toContain("CREATE_EMAIL_DUPLICATE");
    expect(codesOf(v.entries[1].errors)).toContain("CREATE_EMAIL_DUPLICATE");
    expect(planLinkage(m, r).users.duplicateEmails).toBe(2);
  });
});

describe("K1-2 (9) eksik reviewedBy/reviewNote → hard fail", () => {
  it("boş reviewedBy + reviewNote → iki INCOMPLETE hata, applySafe değil", () => {
    const r = ref([], [L("l1", "t1", null)], []);
    const m = manifest("t1", [entry({ profileId: "l1", strategy: "SKIP_MANUAL", reviewedBy: "  ", reviewNote: "" })]);
    const v = validateManifest(m, r);
    const codes = codesOf(v.entries[0].errors);
    expect(codes).toContain("REVIEWED_BY_MISSING");
    expect(codes).toContain("REVIEW_NOTE_MISSING");
    expect(v.entries[0].blocked).toBe(true);
    expect(v.entries[0].applySafe).toBe(false);
  });
});

describe("K1-2 (10) counts-only rapor → başlık + tüm bölümler + PII YOK", () => {
  it("formatPlan email/isim sızdırmaz; tüm bölüm başlıkları var", () => {
    const r = ref([U("u1", "t1", "login@x.com")], [L("l1", "t1", null)], [S("s1", "t1", null)]);
    const m = manifest("t1", [
      entry({ profileId: "l1", strategy: "LINK_EXISTING_USER", userId: "u1" }),
      entry({ profileType: "STAFF", profileId: "s1", strategy: "CREATE_LOGIN_USER", email: "secret@x.com", role: "USER" }),
    ]);
    const text = formatPlan(planLinkage(m, r));
    expect(text).toContain("K1 REVIEWED LINKAGE PLAN");
    expect(text).toContain("Manifest:");
    expect(text).toContain("Plan:");
    expect(text).toContain("Profiles:");
    expect(text).toContain("Users:");
    expect(text).toContain("Conclusion:");
    expect(text).toContain("apply-safe entries: 2");
    // PII güvenliği: email DEĞERİ rapora girmez
    expect(text).not.toContain("secret@x.com");
    expect(text).not.toContain("login@x.com");
  });
});

describe("K1-2 (11) no default write — apply/write fonksiyonu YOK (K1-3'e ertelendi)", () => {
  it("çekirdek hiçbir apply/write fonksiyonu dışarı vermez; plan salt-okuma", () => {
    const forbidden = ["applyManifest", "apply", "executeManifest", "selectWrites", "selectSafeWrites", "writeLinks", "mutate", "persist", "commit"];
    for (const name of forbidden) {
      expect((Core as Record<string, unknown>)[name]).toBeUndefined();
    }
    const plan = planLinkage(manifest("t1", []), ref([], [], []));
    expect(plan).not.toHaveProperty("writes");
    expect(plan).not.toHaveProperty("operations");
    expect(Object.keys(plan)).toEqual(["manifest", "plan", "profiles", "users", "conclusion", "ok"]);
  });
});

// ---------- Ek kapsama (11 zorunlunun ötesinde) ----------

describe("K1-2 ek — role disiplini (dürüst bulgu: role = login UserRole, StaffType DEĞİL)", () => {
  it('CREATE_LOGIN_USER role="STAFF" → CREATE_ROLE_INVALID (sessizce kabul edilmez)', () => {
    const r = ref([], [], [S("s1", "t1", null)]);
    const m = manifest("t1", [entry({ profileType: "STAFF", profileId: "s1", strategy: "CREATE_LOGIN_USER", email: "a@x.com", role: "STAFF" })]);
    const v = validateManifest(m, r);
    expect(codesOf(v.entries[0].errors)).toContain("CREATE_ROLE_INVALID");
  });
  it("role ADMIN/USER/VIEWER (case-insensitive) → geçerli", () => {
    const r = ref([], [], [S("s1", "t1", null)]);
    const m = manifest("t1", [entry({ profileType: "STAFF", profileId: "s1", strategy: "CREATE_LOGIN_USER", email: "a@x.com", role: "admin" })]);
    expect(validateManifest(m, r).entries[0].errors).toEqual([]);
  });
});

describe("K1-2 ek — yasak çıkarım yolları üretmez", () => {
  it("aynı login User hem Lawyer hem Staff → USER_LINKED_TO_BOTH_TYPES", () => {
    const r = ref([U("u1", "t1", "a@x.com")], [L("l1", "t1", null)], [S("s1", "t1", null)]);
    const m = manifest("t1", [
      entry({ profileType: "LAWYER", profileId: "l1", strategy: "LINK_EXISTING_USER", userId: "u1" }),
      entry({ profileType: "STAFF", profileId: "s1", strategy: "LINK_EXISTING_USER", userId: "u1" }),
    ]);
    const v = validateManifest(m, r);
    expect(codesOf(v.entries[0].errors)).toContain("USER_LINKED_TO_BOTH_TYPES");
    expect(codesOf(v.entries[1].errors)).toContain("USER_LINKED_TO_BOTH_TYPES");
  });
  it("email mevcut User ile çakışıyor → CREATE_EMAIL_COLLIDES_EXISTING_USER", () => {
    const r = ref([U("u1", "t1", "var@x.com")], [], [S("s1", "t1", null)]);
    const m = manifest("t1", [entry({ profileType: "STAFF", profileId: "s1", strategy: "CREATE_LOGIN_USER", email: "VAR@x.com", role: "USER" })]);
    expect(codesOf(validateManifest(m, r).entries[0].errors)).toContain("CREATE_EMAIL_COLLIDES_EXISTING_USER");
  });
  it("profileId referansta yok → PROFILE_NOT_FOUND", () => {
    const r = ref([U("u1", "t1", "a@x.com")], [], []);
    const m = manifest("t1", [entry({ profileId: "yok", strategy: "LINK_EXISTING_USER", userId: "u1" })]);
    expect(codesOf(validateManifest(m, r).entries[0].errors)).toContain("PROFILE_NOT_FOUND");
  });
  it("geçersiz strategy → UNKNOWN_STRATEGY", () => {
    const r = ref([], [L("l1", "t1", null)], []);
    const m = manifest("t1", [entry({ profileId: "l1", strategy: "FUZZY_GUESS" as unknown as ManifestEntry["strategy"] })]);
    expect(codesOf(validateManifest(m, r).entries[0].errors)).toContain("UNKNOWN_STRATEGY");
  });
  it("version != 1 → manifest-level UNSUPPORTED_VERSION", () => {
    const m = manifest("t1", [], 2);
    const v = validateManifest(m, ref([], [], []));
    expect(codesOf(v.manifestErrors)).toContain("UNSUPPORTED_VERSION");
    expect(v.ok).toBe(false);
  });
});

describe("K1-2 ek — template generator (tahmin yok, PII default kapalı)", () => {
  it("bağlı olmayan profiller → SKIP_MANUAL iskelet; default'ta email basmaz", () => {
    const r = ref([], [L("l1", "t1", "gizli@x.com"), L("l2", "t1", null, "LAWYER", "uX")], [S("s1", "t1", "x@x.com")]);
    const t = generateManifestTemplate(r, { tenantId: "t1" });
    expect(t.version).toBe(1);
    expect(t.entries).toHaveLength(2); // l2 zaten linkli → dışarıda
    expect(t.entries.every((e) => e.strategy === "SKIP_MANUAL")).toBe(true);
    expect(t.entries.every((e) => e.reviewedBy === "" && e.reviewNote === "")).toBe(true);
    expect(JSON.stringify(t)).not.toContain("gizli@x.com"); // PII off
  });
  it("--verbose (includeEmailHint) → _emailHint normalize email ekler", () => {
    const r = ref([], [L("l1", "t1", "Gizli@x.com")], []);
    const t = generateManifestTemplate(r, { tenantId: "t1", includeEmailHint: true });
    expect(t.entries[0]._emailHint).toBe("gizli@x.com");
  });
});

describe("K1-2 ek — parseManifest yapısal guard", () => {
  it("geçerli şekil → tipli manifest döner", () => {
    expect(parseManifest({ version: 1, tenantId: "t1", entries: [] }).tenantId).toBe("t1");
  });
  it("bozuk şekil → net mesajla throw", () => {
    expect(() => parseManifest(null)).toThrow();
    expect(() => parseManifest({ version: "1", tenantId: "t1", entries: [] })).toThrow();
    expect(() => parseManifest({ version: 1, tenantId: "t1" })).toThrow();
  });
});

describe("K1-2 ek — profilesNotCovered (manuel takip boşluğu)", () => {
  it("tenant'ta 3 bağsız profil, 1 entry → 2 not covered", () => {
    const r = ref([U("u1", "t1", "a@x.com")], [L("l1", "t1", null), L("l2", "t1", null)], [S("s1", "t1", null)]);
    const m = manifest("t1", [entry({ profileId: "l1", strategy: "LINK_EXISTING_USER", userId: "u1" })]);
    const p = planLinkage(m, r);
    expect(p.profiles.profilesNotCovered).toBe(2);
    expect(p.conclusion.manualFollowUp).toBe(2);
  });
});

// ---- Adversarial verify follow-up: savunmacı crash + untested branch + metric coherence ----

describe("K1-2 ek — savunmacı: bozuk-tip girdi CRASH ETMEZ (hard-fail üretir)", () => {
  it('role wrong-type (number) → CREATE_ROLE_INVALID, throw YOK', () => {
    const r = ref([], [], [S("s1", "t1", null)]);
    const m = manifest("t1", [entry({ profileType: "STAFF", profileId: "s1", strategy: "CREATE_LOGIN_USER", email: "a@x.com", role: 123 as unknown as string })]);
    const run = () => validateManifest(m, r);
    expect(run).not.toThrow();
    expect(codesOf(run().entries[0].errors)).toContain("CREATE_ROLE_INVALID");
  });
  it('email wrong-type (number) → CREATE_EMAIL_MISSING, throw YOK', () => {
    const r = ref([], [], [S("s1", "t1", null)]);
    const m = manifest("t1", [entry({ profileType: "STAFF", profileId: "s1", strategy: "CREATE_LOGIN_USER", email: 123 as unknown as string, role: "USER" })]);
    const run = () => validateManifest(m, r);
    expect(run).not.toThrow();
    expect(codesOf(run().entries[0].errors)).toContain("CREATE_EMAIL_MISSING");
  });
  it("null / non-object entry → blocked + 4 hata, throw YOK", () => {
    const r = ref([], [L("l1", "t1", null)], []);
    const m = manifest("t1", [null as unknown as ManifestEntry, "x" as unknown as ManifestEntry]);
    const run = () => validateManifest(m, r);
    expect(run).not.toThrow();
    const v = run();
    expect(v.entries[0].blocked).toBe(true);
    expect(codesOf(v.entries[0].errors)).toEqual(
      expect.arrayContaining(["UNKNOWN_PROFILE_TYPE", "UNKNOWN_STRATEGY", "REVIEWED_BY_MISSING", "REVIEW_NOTE_MISSING"]),
    );
  });
});

describe("K1-2 ek — untested hard-fail branch'leri kapatıldı", () => {
  it("rule 7: existing user farklı tenant → USER_TENANT_MISMATCH (unsafe)", () => {
    const r = ref([U("u1", "t2", "a@x.com")], [L("l1", "t1", null)], []); // u1 t2'de
    const m = manifest("t1", [entry({ profileId: "l1", strategy: "LINK_EXISTING_USER", userId: "u1" })]);
    const v = validateManifest(m, r);
    expect(codesOf(v.entries[0].errors)).toContain("USER_TENANT_MISMATCH");
    expect(v.entries[0].unsafe).toBe(true);
  });
  it("rule 9: CREATE email whitespace → CREATE_EMAIL_MISSING", () => {
    const r = ref([], [], [S("s1", "t1", null)]);
    const m = manifest("t1", [entry({ profileType: "STAFF", profileId: "s1", strategy: "CREATE_LOGIN_USER", email: "   ", role: "USER" })]);
    expect(codesOf(validateManifest(m, r).entries[0].errors)).toContain("CREATE_EMAIL_MISSING");
  });
  it("LINK userId boş → LINK_USER_ID_MISSING", () => {
    const r = ref([], [L("l1", "t1", null)], []);
    const m = manifest("t1", [entry({ profileId: "l1", strategy: "LINK_EXISTING_USER", userId: "" })]);
    expect(codesOf(validateManifest(m, r).entries[0].errors)).toContain("LINK_USER_ID_MISSING");
  });
  it("LINK userId referansta yok → USER_NOT_FOUND", () => {
    const r = ref([], [L("l1", "t1", null)], []);
    const m = manifest("t1", [entry({ profileId: "l1", strategy: "LINK_EXISTING_USER", userId: "ghost" })]);
    expect(codesOf(validateManifest(m, r).entries[0].errors)).toContain("USER_NOT_FOUND");
  });
});

describe("K1-2 ek — manualFollowUp tutarlılığı (over/under-count düzeltmesi)", () => {
  it("blocked-LINK ile kapsanan bağsız profil HÂLÂ follow-up sayılır (undercount fix)", () => {
    const r = ref([], [L("l1", "t1", null)], []);
    const m = manifest("t1", [entry({ profileId: "l1", strategy: "LINK_EXISTING_USER", userId: "ghost" })]); // blocked
    const p = planLinkage(m, r);
    expect(p.conclusion.applySafeEntries).toBe(0);
    expect(p.conclusion.manualFollowUp).toBe(1); // eski (skip+notCovered) formülü 0 verirdi
  });
  it("aynı profile 2 SKIP entry → manualFollowUp ÇİFT saymaz (overcount fix)", () => {
    const r = ref([], [L("l1", "t1", null)], []);
    const m = manifest("t1", [
      entry({ profileId: "l1", strategy: "SKIP_MANUAL" }),
      entry({ profileId: "l1", strategy: "SKIP_MANUAL" }),
    ]);
    const p = planLinkage(m, r);
    expect(p.plan.skipManual).toBe(2);
    expect(p.conclusion.manualFollowUp).toBe(1); // eski formül 2 verirdi
  });
  it("apply-safe LINK ile çözülen profil → follow-up'tan düşer", () => {
    const r = ref([U("u1", "t1", "a@x.com")], [L("l1", "t1", null)], []);
    const m = manifest("t1", [entry({ profileId: "l1", strategy: "LINK_EXISTING_USER", userId: "u1" })]);
    expect(planLinkage(m, r).conclusion.manualFollowUp).toBe(0);
  });
});

// ============================================================================
// K1-3 — GUARDED APPLY testleri (SAF + injected mock tx; LİVE DB YOK)
// ============================================================================

const DEV_URL = "postgresql://localhost:5432/hukuk_db";

/** In-memory mock tx (gerçek Prisma yok). failAt = o sıradaki çağrı throw eder (rollback/fail-fast testi). */
function mockTx(failAt?: number): { tx: LinkageApplyTx; calls: string[] } {
  const calls: string[] = [];
  let n = 0;
  const guard = () => {
    if (failAt === n) {
      n++;
      throw new Error("mid-apply failure");
    }
    n++;
  };
  return {
    calls,
    tx: {
      setLawyerUserId: async (profileId, userId) => {
        guard();
        calls.push(`lawyer:${profileId}:${userId}`);
      },
      setStaffUserId: async (profileId, userId) => {
        guard();
        calls.push(`staff:${profileId}:${userId}`);
      },
    },
  };
}

const reportInput = (plan: ApplyPlan, over: Partial<Parameters<typeof formatApplyReport>[0]> = {}) =>
  formatApplyReport({
    env: { head: "abc123", dbTargetMasked: "non-prod", nodeEnv: "development", manifest: "(operator file)", applyMode: "apply" },
    plan,
    transactionStarted: false,
    execution: null,
    verification: null,
    failed: 0,
    ...over,
  });

describe("K1-3 (1) dry-run salt-okuma kalır", () => {
  it("apply yokken mode=dry-run, canApply false, hardStop yok", () => {
    const g = evaluateApplyGuards({ apply: false, allowDevDbWrite: true, confirmManifestReviewed: true, nodeEnv: "development", databaseUrl: DEV_URL });
    expect(g.mode).toBe("dry-run");
    expect(g.canApply).toBe(false);
    expect(g.hardStops).toEqual([]);
  });
});

describe("K1-3 (2) --apply + --allow-dev-db-write yok → hard-fail", () => {
  it("allow-dev-db-write eksik → canApply false", () => {
    const g = evaluateApplyGuards({ apply: true, allowDevDbWrite: false, confirmManifestReviewed: true, nodeEnv: "development", databaseUrl: DEV_URL });
    expect(g.canApply).toBe(false);
    expect(g.hardStops.some((h) => h.includes("allow-dev-db-write"))).toBe(true);
  });
});

describe("K1-3 (3) --confirm-manifest-reviewed yok → hard-fail", () => {
  it("confirm eksik → canApply false", () => {
    const g = evaluateApplyGuards({ apply: true, allowDevDbWrite: true, confirmManifestReviewed: false, nodeEnv: "development", databaseUrl: DEV_URL });
    expect(g.canApply).toBe(false);
    expect(g.hardStops.some((h) => h.includes("confirm-manifest-reviewed"))).toBe(true);
  });
});

describe("K1-3 (4) NODE_ENV=production → hard-fail", () => {
  it("production → canApply false", () => {
    const g = evaluateApplyGuards({ apply: true, allowDevDbWrite: true, confirmManifestReviewed: true, nodeEnv: "production", databaseUrl: DEV_URL });
    expect(g.canApply).toBe(false);
    expect(g.hardStops.some((h) => h.includes("prod"))).toBe(true);
  });
});

describe("K1-3 (5) prod/live/customer DATABASE_URL → hard-fail", () => {
  it("prod URL → dbTarget=prod, canApply false", () => {
    const g = evaluateApplyGuards({ apply: true, allowDevDbWrite: true, confirmManifestReviewed: true, nodeEnv: "development", databaseUrl: "postgresql://prod-db.customer.live/app" });
    expect(g.dbTarget).toBe("prod");
    expect(g.canApply).toBe(false);
  });
  it("temiz dev + üçlü kapı → canApply true", () => {
    const g = evaluateApplyGuards({ apply: true, allowDevDbWrite: true, confirmManifestReviewed: true, nodeEnv: "development", databaseUrl: DEV_URL });
    expect(g.dbTarget).toBe("non-prod");
    expect(g.canApply).toBe(true);
    expect(g.hardStops).toEqual([]);
  });
});

describe("K1-3 (6) blocked manifest → zero writes", () => {
  it("eksik review alanı → blocked, canApply false, operations boş", () => {
    const r = ref([U("u1", "t1", "a@x.com")], [L("l1", "t1", null)], []);
    const m = manifest("t1", [entry({ profileId: "l1", strategy: "LINK_EXISTING_USER", userId: "u1", reviewedBy: "", reviewNote: "" })]);
    const p = planApply(m, r);
    expect(p.canApply).toBe(false);
    expect(p.operations).toHaveLength(0);
    expect(p.counts.blocked).toBe(1);
  });
});

describe("K1-3 (7) unsafe (conflict) manifest → zero writes", () => {
  it("profile başka user'a bağlı → conflict, canApply false, operations boş", () => {
    const r = ref([U("u1", "t1", "a@x.com")], [L("l1", "t1", null, "LAWYER", "u9")], []);
    const m = manifest("t1", [entry({ profileId: "l1", strategy: "LINK_EXISTING_USER", userId: "u1" })]);
    const p = planApply(m, r);
    expect(p.counts.conflict).toBe(1);
    expect(p.canApply).toBe(false);
    expect(p.operations).toHaveLength(0);
  });
});

describe("K1-3 (8) LINK → doğru Lawyer.userId uygular", () => {
  it("operation üretir + mock tx lawyer linkini yazar", async () => {
    const r = ref([U("u1", "t1", "a@x.com")], [L("l1", "t1", null)], []);
    const m = manifest("t1", [entry({ profileType: "LAWYER", profileId: "l1", strategy: "LINK_EXISTING_USER", userId: "u1" })]);
    const p = planApply(m, r);
    expect(p.operations).toEqual([{ profileType: "LAWYER", profileId: "l1", userId: "u1" }]);
    const mt = mockTx();
    const res = await applyLinkages(p.operations, mt.tx);
    expect(res.lawyerLinks).toBe(1);
    expect(res.staffLinks).toBe(0);
    expect(mt.calls).toEqual(["lawyer:l1:u1"]);
  });
});

describe("K1-3 (9) LINK → doğru StaffMember.userId uygular", () => {
  it("operation üretir + mock tx staff linkini yazar", async () => {
    const r = ref([U("u1", "t1", "a@x.com")], [], [S("s1", "t1", null)]);
    const m = manifest("t1", [entry({ profileType: "STAFF", profileId: "s1", strategy: "LINK_EXISTING_USER", userId: "u1" })]);
    const p = planApply(m, r);
    expect(p.operations).toEqual([{ profileType: "STAFF", profileId: "s1", userId: "u1" }]);
    const mt = mockTx();
    const res = await applyLinkages(p.operations, mt.tx);
    expect(res.staffLinks).toBe(1);
    expect(mt.calls).toEqual(["staff:s1:u1"]);
  });
});

describe("K1-3 (10) duplicate/conflicting state → preflight zero writes", () => {
  it("hedef user başka profile'a bağlı → conflict, operations boş", () => {
    const r = ref([U("u1", "t1", "a@x.com")], [L("lOther", "t1", null, "LAWYER", "u1")], [S("s1", "t1", null)]);
    const m = manifest("t1", [entry({ profileType: "STAFF", profileId: "s1", strategy: "LINK_EXISTING_USER", userId: "u1" })]);
    const p = planApply(m, r);
    expect(p.counts.conflict).toBe(1);
    expect(p.canApply).toBe(false);
    expect(p.operations).toHaveLength(0);
  });
});

describe("K1-3 (11) transaction rollback / fail-fast", () => {
  it("ortada bir op throw → applyLinkages reddeder, sonraki op denenmez", async () => {
    const ops: ApplyOperation[] = [
      { profileType: "LAWYER", profileId: "l1", userId: "u1" },
      { profileType: "LAWYER", profileId: "l2", userId: "u2" },
      { profileType: "LAWYER", profileId: "l3", userId: "u3" },
    ];
    const mt = mockTx(1); // 2. op patlar
    await expect(applyLinkages(ops, mt.tx)).rejects.toThrow("mid-apply failure");
    expect(mt.calls).toEqual(["lawyer:l1:u1"]); // yalnız op0 denendi; op1 patladı, op2 HİÇ denenmedi (fail-fast → tx rollback)
  });
});

describe("K1-3 (12) idempotent already-applied → no-op", () => {
  it("profile zaten HEDEF user'a bağlı → ALREADY_APPLIED, operations boş, canApply true", () => {
    const r = ref([U("u1", "t1", "a@x.com")], [L("l1", "t1", null, "LAWYER", "u1")], []);
    const m = manifest("t1", [entry({ profileId: "l1", strategy: "LINK_EXISTING_USER", userId: "u1" })]);
    const p = planApply(m, r);
    expect(p.counts.alreadyApplied).toBe(1);
    expect(p.counts.conflict).toBe(0);
    expect(p.operations).toHaveLength(0);
    expect(p.canApply).toBe(true);
  });
});

describe("K1-3 (13) CREATE_LOGIN_USER → açıkça blocked (not implemented)", () => {
  it("CREATE → BLOCKED_NOT_IMPLEMENTED, hiçbir operation, user create yok", () => {
    const r = ref([], [], [S("s1", "t1", null)]);
    const m = manifest("t1", [entry({ profileType: "STAFF", profileId: "s1", strategy: "CREATE_LOGIN_USER", email: "yeni@x.com", role: "USER" })]);
    const p = planApply(m, r);
    expect(p.counts.createBlockedNotImplemented).toBe(1);
    expect(p.entries[0].status).toBe("CREATE_BLOCKED_NOT_IMPLEMENTED");
    expect(p.operations).toHaveLength(0);
  });
});

describe("K1-3 (14) apply raporu default PII-safe", () => {
  it("formatApplyReport email/isim sızdırmaz; DB hedefi maskeli (sınıf, URL değil)", () => {
    const r = ref([U("u1", "t1", "gizli@x.com")], [L("l1", "t1", "gizli2@x.com")], []);
    const m = manifest("t1", [entry({ profileId: "l1", strategy: "LINK_EXISTING_USER", userId: "u1" })]);
    const text = reportInput(planApply(m, r));
    expect(text).toContain("K1 GUARDED APPLY REPORT");
    expect(text).toContain("DB target masked: non-prod");
    expect(text).not.toContain("gizli@x.com");
    expect(text).not.toContain("gizli2@x.com");
    expect(text).not.toContain("postgresql://"); // ham URL asla
  });
});

describe("K1-3 (15) yasak write yok — yalnız iki link metodu", () => {
  it("applyLinkages YALNIZ setLawyerUserId/setStaffUserId çağırır; başka mutation export'u yok", async () => {
    const ops: ApplyOperation[] = [
      { profileType: "LAWYER", profileId: "l1", userId: "u1" },
      { profileType: "STAFF", profileId: "s1", userId: "u2" },
    ];
    const seen: string[] = [];
    const tx: LinkageApplyTx = {
      setLawyerUserId: async () => { seen.push("setLawyerUserId"); },
      setStaffUserId: async () => { seen.push("setStaffUserId"); },
    };
    await applyLinkages(ops, tx);
    expect(new Set(seen)).toEqual(new Set(["setLawyerUserId", "setStaffUserId"]));
    // yasak yazma yüzeyleri export edilmez
    for (const name of ["createUser", "createLoginUser", "updateUserRole", "updateUserEmail", "deleteLawyer", "deleteStaff"]) {
      expect((Core as Record<string, unknown>)[name]).toBeUndefined();
    }
  });
});

// ---- K1-3 ek kapsama ----

describe("K1-3 ek — classifyDbTarget", () => {
  it("localhost/hukuk_db → non-prod; prod/live/customer/staging → prod; boş → missing; tanınmaz → unknown", () => {
    expect(classifyDbTarget("postgresql://localhost:5432/hukuk_db")).toBe("non-prod");
    expect(classifyDbTarget("postgresql://prod-host/app")).toBe("prod");
    expect(classifyDbTarget("postgresql://staging-host/app")).toBe("prod");
    expect(classifyDbTarget("")).toBe("missing");
    expect(classifyDbTarget(undefined)).toBe("missing");
    expect(classifyDbTarget("postgresql://10.20.30.40:5432/appdb")).toBe("unknown");
  });
  it("unknown DB hedefi → apply hard-fail", () => {
    const g = evaluateApplyGuards({ apply: true, allowDevDbWrite: true, confirmManifestReviewed: true, nodeEnv: "development", databaseUrl: "postgresql://10.20.30.40/appdb" });
    expect(g.dbTarget).toBe("unknown");
    expect(g.canApply).toBe(false);
  });
});

describe("K1-3 ek — verifyAppliedState", () => {
  it("post-ref link set → verified; set değil → mismatch", () => {
    const ops: ApplyOperation[] = [{ profileType: "LAWYER", profileId: "l1", userId: "u1" }];
    const okRef = ref([], [L("l1", "t1", null, "LAWYER", "u1")], []);
    const v1 = verifyAppliedState(ops, okRef);
    expect(v1.verified).toBe(1);
    expect(v1.mismatches).toHaveLength(0);
    const badRef = ref([], [L("l1", "t1", null, "LAWYER", null)], []);
    const v2 = verifyAppliedState(ops, badRef);
    expect(v2.verified).toBe(0);
    expect(v2.mismatches).toEqual([{ profileType: "LAWYER", profileId: "l1" }]);
  });
});

describe("K1-3 ek — mixed manifest preflight (LINK uygulanır, CREATE blocked, SKIP atlanır)", () => {
  it("3 strateji bir arada: applyLink=1, createBlocked=1, skip=1, canApply true", () => {
    const r = ref([U("u1", "t1", "a@x.com")], [L("l1", "t1", null), L("l2", "t1", null)], [S("s1", "t1", null)]);
    const m = manifest("t1", [
      entry({ profileType: "LAWYER", profileId: "l1", strategy: "LINK_EXISTING_USER", userId: "u1" }),
      entry({ profileType: "STAFF", profileId: "s1", strategy: "CREATE_LOGIN_USER", email: "n@x.com", role: "USER" }),
      entry({ profileType: "LAWYER", profileId: "l2", strategy: "SKIP_MANUAL" }),
    ]);
    const p = planApply(m, r);
    expect(p.counts.applyLink).toBe(1);
    expect(p.counts.createBlockedNotImplemented).toBe(1);
    expect(p.counts.skip).toBe(1);
    expect(p.canApply).toBe(true); // CREATE-blocked tek başına durdurmaz; LINK uygulanır
    expect(p.operations).toEqual([{ profileType: "LAWYER", profileId: "l1", userId: "u1" }]);
  });
});

// ---- Adversarial verify follow-up (K1-3): prod-bypass / dual-ownership / secret-leak fix'leri ----

describe("K1-3 fix — classifyDbTarget HOST-tabanlı (DB adı non-prod KANITI değil)", () => {
  it("uzak host + DB adı hukuk_db → unknown (non-prod DEĞİL); localhost → non-prod", () => {
    expect(classifyDbTarget("postgresql://u:p@app.cluster-xyz.rds.amazonaws.com:5432/hukuk_db")).toBe("unknown");
    expect(classifyDbTarget("postgresql://postgres.default.svc:5432/hukuk_db?sslmode=require")).toBe("unknown");
    expect(classifyDbTarget("postgresql://u:p@localhost:5432/hukuk_db")).toBe("non-prod");
    expect(classifyDbTarget("postgresql://u:p@127.0.0.1:5432/hukuk_db")).toBe("non-prod");
  });
  it("uzak prod-adlı hukuk_db full-gate ile bile → apply REDDEDİLİR (unknown)", () => {
    const g = evaluateApplyGuards({ apply: true, allowDevDbWrite: true, confirmManifestReviewed: true, nodeEnv: "development", databaseUrl: "postgresql://u:p@app.rds.amazonaws.com:5432/hukuk_db" });
    expect(g.dbTarget).toBe("unknown");
    expect(g.canApply).toBe(false);
  });
});

describe("K1-3 fix — NODE_ENV prod* (whitespace/kısaltma) yakalanır", () => {
  it("' production ' ve 'prod' → hard-stop", () => {
    for (const ne of [" production ", "production\n", "prod", "PRODUCTION"]) {
      const g = evaluateApplyGuards({ apply: true, allowDevDbWrite: true, confirmManifestReviewed: true, nodeEnv: ne, databaseUrl: DEV_URL });
      expect(g.canApply).toBe(false);
    }
  });
});

describe("K1-3 fix — missing DATABASE_URL guard üzerinden hard-stop", () => {
  it("databaseUrl undefined/'' → canApply false, 'DATABASE_URL yok'", () => {
    for (const url of [undefined, ""]) {
      const g = evaluateApplyGuards({ apply: true, allowDevDbWrite: true, confirmManifestReviewed: true, nodeEnv: "development", databaseUrl: url });
      expect(g.dbTarget).toBe("missing");
      expect(g.canApply).toBe(false);
      expect(g.hardStops.some((h) => h.includes("DATABASE_URL yok"))).toBe(true);
    }
  });
});

describe("K1-3 fix — dual-ownership (çift-sahiplik) CONFLICT, idempotent SAYILMAZ", () => {
  it("user u0 hem lawyer hem staff'a bağlı → eşleşen entry CONFLICT (ALREADY_APPLIED değil)", () => {
    const r = ref([U("u0", "t1", "a@x.com")], [L("l0", "t1", null, "LAWYER", "u0")], [S("s0", "t1", null, "SEKRETER", "u0")]);
    const m = manifest("t1", [entry({ profileType: "STAFF", profileId: "s0", strategy: "LINK_EXISTING_USER", userId: "u0" })]);
    const p = planApply(m, r);
    expect(p.entries[0].status).toBe("CONFLICT");
    expect(p.counts.alreadyApplied).toBe(0);
    expect(p.canApply).toBe(false);
    expect(p.operations).toHaveLength(0);
  });
  it("çift-sahiplik entry + temiz LINK karışık → canApply false, SIFIR write (co-entry commit etmez)", () => {
    const r = ref(
      [U("u0", "t1", "a@x.com"), U("u1", "t1", "b@x.com")],
      [L("l0", "t1", null, "LAWYER", "u0"), L("lClean", "t1", null)],
      [S("s0", "t1", null, "SEKRETER", "u0")],
    );
    const m = manifest("t1", [
      entry({ profileType: "STAFF", profileId: "s0", strategy: "LINK_EXISTING_USER", userId: "u0" }), // çift-sahiplik → conflict
      entry({ profileType: "LAWYER", profileId: "lClean", strategy: "LINK_EXISTING_USER", userId: "u1" }), // temiz
    ]);
    const p = planApply(m, r);
    expect(p.counts.conflict).toBe(1);
    expect(p.canApply).toBe(false); // → script preflight zero-write: HİÇBİR yazma (temiz co-entry dahil)
    expect(p.counts.applyLink).toBe(1); // temiz entry plan'da APPLY_LINK ama canApply=false → uygulanmaz
  });
});

describe("K1-3 fix — redactSecrets exception sink'leri maskeler", () => {
  it("connection string + secret token → maskeli (ham URL/parola sızmaz)", () => {
    const msg = "PrismaClientInitializationError: can't reach postgresql://app:s3cr3t@db.prod.internal:5432/hukuk_db?password=topsecret";
    const out = redactSecrets(msg);
    expect(out).not.toContain("postgresql://");
    expect(out).not.toContain("s3cr3t");
    expect(out).not.toContain("db.prod.internal");
    expect(out).toContain("[redacted-url]");
  });
  it("URL içermeyen düz mesaj korunur", () => {
    expect(redactSecrets("blocked entry preflight failed")).toBe("blocked entry preflight failed");
  });
});

describe("K1-3 fix — apply raporu math (repair partial/yes/no)", () => {
  it("applied>0 + create-blocked → 'partial (LINK only)'", () => {
    const r = ref([U("u1", "t1", "a@x.com")], [L("l1", "t1", null)], [S("s1", "t1", null)]);
    const m = manifest("t1", [
      entry({ profileType: "LAWYER", profileId: "l1", strategy: "LINK_EXISTING_USER", userId: "u1" }),
      entry({ profileType: "STAFF", profileId: "s1", strategy: "CREATE_LOGIN_USER", email: "n@x.com", role: "USER" }),
    ]);
    const p = planApply(m, r);
    const text = formatApplyReport({
      env: { head: "h", dbTargetMasked: "non-prod", nodeEnv: "development", manifest: "(operator file)", applyMode: "apply" },
      plan: p,
      transactionStarted: true,
      execution: { lawyerLinks: 1, staffLinks: 0, applied: [{ profileType: "LAWYER", profileId: "l1", userId: "u1" }] },
      verification: { expected: 1, verified: 1, mismatches: [] },
      failed: 0,
    });
    expect(text).toContain("K1 repair performed?: partial (LINK only)");
    expect(text).toContain("apply completed: yes");
    expect(text).toContain("lawyer links updated: 1");
  });
});

describe("K1-3 W1 — zaten-bağlı + hedef user silinmiş → BLOCKED (USER_NOT_FOUND), idempotent DEĞİL", () => {
  // İdempotency muafiyeti YALNIZ PROFILE_ALREADY_LINKED + USER_ALREADY_LINKED'i kapsar (core ~satır 814).
  // Hedef user users[]'tan silinmişse USER_NOT_FOUND elenmez → re-run güvenle BLOCKED kalır; profile
  // "zaten u1'e bağlı" görünse bile sahte ALREADY_APPLIED no-op'una düşmez. Bu test, ileride planApply'da
  // `prof.userId === userId` kısa-devresinin validation hatalarından ÖNCE konmasına karşı regresyon guard'ıdır.
  it("LINK re-run; l1 zaten u1'e bağlı ama u1 users[]'tan silinmiş → BLOCKED, alreadyApplied=0, write yok", () => {
    const r = ref([], [L("l1", "t1", null, "LAWYER", "u1")], []); // u1 users[]'ta YOK (silinmiş)
    const m = manifest("t1", [entry({ profileId: "l1", strategy: "LINK_EXISTING_USER", userId: "u1" })]);
    const p = planApply(m, r);
    expect(p.entries[0].status).toBe("BLOCKED");
    expect(p.counts.alreadyApplied).toBe(0);
    expect(p.counts.blocked).toBe(1);
    expect(p.canApply).toBe(false);
    expect(p.operations).toHaveLength(0);
    // kök sebep: USER_NOT_FOUND (idempotency muafiyetinde değil)
    expect(codesOf(validateManifest(m, r).entries[0].errors)).toContain("USER_NOT_FOUND");
  });
});
