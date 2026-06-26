import * as Core from "../k1-reviewed-linkage.core";
import {
  validateManifest,
  planLinkage,
  formatPlan,
  generateManifestTemplate,
  parseManifest,
  ManifestEntry,
  ReviewedLinkageManifest,
  ReferenceData,
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
