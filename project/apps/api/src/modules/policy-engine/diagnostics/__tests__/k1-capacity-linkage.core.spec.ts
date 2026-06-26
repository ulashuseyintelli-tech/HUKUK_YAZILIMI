import {
  analyzeLinkage,
  evaluateApplyGuards,
  formatReport,
  normalizeEmail,
  selectSafeWrites,
  LawyerRow,
  StaffRow,
  UserRow,
  LinkageInput,
} from "../k1-capacity-linkage.core";

/**
 * K1-1 — capacity-linkage DIAGNOSTIC core testleri (SAF; DB yok).
 * KESİN KURAL: yalnız deterministik exact-email-match; şüpheli = manual_review; çekirdek hiçbir şey yazmaz.
 */

const U = (id: string, tenantId: string, email: string): UserRow => ({ id, tenantId, email });
const L = (id: string, tenantId: string, email: string | null, rank = "LAWYER", userId: string | null = null): LawyerRow => ({ id, tenantId, email, lawyerRank: rank, userId });
const S = (id: string, tenantId: string, email: string | null, type = "SEKRETER", userId: string | null = null): StaffRow => ({ id, tenantId, email, staffType: type, userId });

const empty: LinkageInput = { users: [], lawyers: [], staff: [] };

describe("normalizeEmail", () => {
  it("trim + lowercase", () => {
    expect(normalizeEmail("  Foo@Bar.COM ")).toBe("foo@bar.com");
  });
  it("null/undefined/boş → null", () => {
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail("   ")).toBeNull();
  });
});

describe("analyzeLinkage — dev gerçeği: link yok, eşleşme yok", () => {
  it("hiç profil bağlı değil + email eşleşmesi yok → herkes UNKNOWN, safe aday 0", () => {
    const input: LinkageInput = {
      users: [U("u1", "t1", "a@x.com"), U("u2", "t1", "b@x.com")],
      lawyers: [L("l1", "t1", "lawyer-noemail-match@x.com")],
      staff: [S("s1", "t1", null)],
    };
    const r = analyzeLinkage(input);
    expect(r.users.total).toBe(2);
    expect(r.users.withLawyerProfile).toBe(0);
    expect(r.users.withStaffProfile).toBe(0);
    expect(r.users.withNeither).toBe(2);
    expect(r.users.withBoth).toBe(0);
    expect(r.capacity.unknownUsers).toBe(2);
    expect(r.conclusion.safeAutoLinkCandidates).toBe(0);
    expect(r.flags.hasAmbiguous).toBe(false);
  });

  it("tamamen boş girdi → tüm sayımlar 0", () => {
    const r = analyzeLinkage(empty);
    expect(r.users.total).toBe(0);
    expect(r.conclusion.safeAutoLinkCandidates).toBe(0);
    expect(r.conclusion.manualReviewRequired).toBe(0);
  });
});

describe("analyzeLinkage — SAFE tek-tek exact match", () => {
  it("lawyer email == user email (aynı tenant) → SAFE, FULL_AUTHORITY candidate", () => {
    const input: LinkageInput = {
      users: [U("u1", "t1", "Ali@x.com")],
      lawyers: [L("l1", "t1", "ali@x.com", "PARTNER")],
      staff: [],
    };
    const r = analyzeLinkage(input);
    const c = r.candidates.find((x) => x.profileId === "l1")!;
    expect(c.classification).toBe("SAFE");
    expect(c.matchedUserId).toBe("u1");
    expect(r.exactMatch.oneToOne).toBe(1);
    expect(r.capacity.fullAuthorityCandidates).toBe(1);
    expect(r.capacity.staffCapacityCandidates).toBe(0);
    expect(r.capacity.unknownUsers).toBe(0);
    expect(r.conclusion.safeAutoLinkCandidates).toBe(1);
    expect(selectSafeWrites(r)).toEqual([{ kind: "lawyer", profileId: "l1", userId: "u1" }]);
  });

  it("staff email == user email → SAFE, STAFF_CAPACITY candidate", () => {
    const input: LinkageInput = {
      users: [U("u1", "t1", "sek@x.com")],
      lawyers: [],
      staff: [S("s1", "t1", "sek@x.com", "MUHASEBE")],
    };
    const r = analyzeLinkage(input);
    expect(r.candidates[0].classification).toBe("SAFE");
    expect(r.capacity.staffCapacityCandidates).toBe(1);
    expect(r.exactMatch.userEqStaffEmail).toBe(1);
  });
});

describe("analyzeLinkage — ambiguous / unsafe / no-match (manual_review)", () => {
  it("aynı tenant+email'i paylaşan 2 lawyer → AMBIGUOUS_DUPLICATE_EMAIL, SAFE değil", () => {
    const input: LinkageInput = {
      users: [U("u1", "t1", "dup@x.com")],
      lawyers: [L("l1", "t1", "dup@x.com"), L("l2", "t1", "DUP@x.com")],
      staff: [],
    };
    const r = analyzeLinkage(input);
    expect(r.candidates.every((c) => c.classification === "AMBIGUOUS_DUPLICATE_EMAIL")).toBe(true);
    expect(r.lawyers.duplicateEmailCandidates).toBe(2);
    expect(r.conclusion.safeAutoLinkCandidates).toBe(0);
    expect(r.flags.hasDuplicateEmail).toBe(true);
    expect(r.flags.hasAmbiguous).toBe(true);
  });

  it("aynı tenant+email'de hem lawyer hem staff → AMBIGUOUS_BOTH_TYPES", () => {
    const input: LinkageInput = {
      users: [U("u1", "t1", "x@x.com")],
      lawyers: [L("l1", "t1", "x@x.com")],
      staff: [S("s1", "t1", "x@x.com")],
    };
    const r = analyzeLinkage(input);
    expect(r.candidates.every((c) => c.classification === "AMBIGUOUS_BOTH_TYPES")).toBe(true);
    expect(r.flags.hasBothType).toBe(true);
    expect(r.conclusion.safeAutoLinkCandidates).toBe(0);
  });

  it("eşleşen User başka profile zaten bağlı → BLOCKED_USER_ALREADY_LINKED", () => {
    const input: LinkageInput = {
      users: [U("u1", "t1", "y@x.com")],
      lawyers: [L("lExisting", "t1", "other@x.com", "LAWYER", "u1")], // u1 zaten lExisting'e bağlı
      staff: [S("s1", "t1", "y@x.com")], // s1 da u1'e eşleşiyor ama u1 dolu
    };
    const r = analyzeLinkage(input);
    const sc = r.candidates.find((c) => c.profileId === "s1")!;
    expect(sc.classification).toBe("BLOCKED_USER_ALREADY_LINKED");
    expect(r.exactMatch.unsafe).toBe(1);
    expect(r.capacity.blockedRepairCandidates).toBe(1);
  });

  it("profil email'i hiçbir User'a uymuyor → NO_USER_MATCH (manual_review)", () => {
    const input: LinkageInput = {
      users: [U("u1", "t1", "a@x.com")],
      lawyers: [L("l1", "t1", "nomatch@x.com")],
      staff: [],
    };
    const r = analyzeLinkage(input);
    expect(r.candidates[0].classification).toBe("NO_USER_MATCH");
    expect(r.conclusion.manualReviewRequired).toBe(1);
    expect(r.conclusion.safeAutoLinkCandidates).toBe(0);
  });

  it("profil email null → NO_USER_MATCH (tahmin yok)", () => {
    const r = analyzeLinkage({ users: [U("u1", "t1", "a@x.com")], lawyers: [L("l1", "t1", null)], staff: [] });
    expect(r.candidates[0].classification).toBe("NO_USER_MATCH");
  });

  it("tenant-scoped: aynı email farklı tenant → eşleşme YOK", () => {
    const input: LinkageInput = {
      users: [U("u1", "t1", "same@x.com")],
      lawyers: [L("l1", "t2", "same@x.com")], // farklı tenant
      staff: [],
    };
    const r = analyzeLinkage(input);
    expect(r.candidates[0].classification).toBe("NO_USER_MATCH");
    expect(r.conclusion.safeAutoLinkCandidates).toBe(0);
  });
});

describe("analyzeLinkage — mevcut köprü durumu sayımları", () => {
  it("zaten bağlı profil → ALREADY_LINKED + users.withLawyer/withStaff/withBoth doğru", () => {
    const input: LinkageInput = {
      users: [U("u1", "t1", "a@x.com"), U("u2", "t1", "b@x.com")],
      lawyers: [L("l1", "t1", "a@x.com", "LAWYER", "u1")], // u1 bağlı
      staff: [S("s1", "t1", "a@x.com", "SEKRETER", "u1")], // u1 hem staff'a da bağlı → both anomaly
    };
    const r = analyzeLinkage(input);
    expect(r.users.withLawyerProfile).toBe(1);
    expect(r.users.withStaffProfile).toBe(1);
    expect(r.users.withBoth).toBe(1); // u1 anomalisi
    expect(r.lawyers.linkedToUser).toBe(1);
    expect(r.staff.linkedToUser).toBe(1);
    expect(r.candidates.every((c) => c.classification === "ALREADY_LINKED")).toBe(true);
    expect(selectSafeWrites(r)).toHaveLength(0);
  });
});

describe("evaluateApplyGuards", () => {
  const cleanFlags = { hasAmbiguous: false, hasDuplicateEmail: false, hasBothType: false };

  it("apply yok → dry-run, canApply false, hardStops boş", () => {
    const g = evaluateApplyGuards({ apply: false, allowDevDbWrite: true, nodeEnv: "development", databaseUrl: "postgresql://localhost/hukuk_db", flags: cleanFlags });
    expect(g.mode).toBe("dry-run");
    expect(g.canApply).toBe(false);
    expect(g.hardStops).toEqual([]);
  });

  it("temiz dev + apply + allow → canApply true", () => {
    const g = evaluateApplyGuards({ apply: true, allowDevDbWrite: true, nodeEnv: "development", databaseUrl: "postgresql://localhost:5432/hukuk_db", flags: cleanFlags });
    expect(g.mode).toBe("apply");
    expect(g.canApply).toBe(true);
    expect(g.hardStops).toEqual([]);
  });

  it("NODE_ENV=production → hard-stop", () => {
    const g = evaluateApplyGuards({ apply: true, allowDevDbWrite: true, nodeEnv: "production", databaseUrl: "postgresql://localhost/hukuk_db", flags: cleanFlags });
    expect(g.canApply).toBe(false);
    expect(g.hardStops.some((h) => h.includes("production"))).toBe(true);
  });

  it("DATABASE_URL prod/live/customer → hard-stop", () => {
    const g = evaluateApplyGuards({ apply: true, allowDevDbWrite: true, nodeEnv: "development", databaseUrl: "postgresql://prod-db.customer.live/app", flags: cleanFlags });
    expect(g.canApply).toBe(false);
    expect(g.hardStops.some((h) => h.includes("prod/live/customer"))).toBe(true);
  });

  it("--allow-dev-db-write yok → hard-stop", () => {
    const g = evaluateApplyGuards({ apply: true, allowDevDbWrite: false, nodeEnv: "development", databaseUrl: "postgresql://localhost/hukuk_db", flags: cleanFlags });
    expect(g.canApply).toBe(false);
    expect(g.hardStops.some((h) => h.includes("allow-dev-db-write"))).toBe(true);
  });

  it("ambiguous/duplicate/both varsa → apply tümden durur", () => {
    const g = evaluateApplyGuards({ apply: true, allowDevDbWrite: true, nodeEnv: "development", databaseUrl: "postgresql://localhost/hukuk_db", flags: { hasAmbiguous: true, hasDuplicateEmail: true, hasBothType: true } });
    expect(g.canApply).toBe(false);
    expect(g.hardStops.length).toBeGreaterThanOrEqual(3);
  });
});

describe("formatReport", () => {
  it("K1 CAPACITY LINKAGE REPORT başlığı + tüm bölümler + yalnız sayım (PII yok)", () => {
    const r = analyzeLinkage({
      users: [U("u1", "t1", "a@x.com")],
      lawyers: [L("l1", "t1", "a@x.com", "PARTNER")],
      staff: [],
    });
    const text = formatReport(r);
    expect(text).toContain("K1 CAPACITY LINKAGE REPORT");
    expect(text).toContain("Users:");
    expect(text).toContain("Lawyers:");
    expect(text).toContain("StaffMembers:");
    expect(text).toContain("Capacity:");
    expect(text).toContain("Exact-match dry-run:");
    expect(text).toContain("Conclusion:");
    expect(text).toContain("safe auto-link candidates: 1");
    // PII güvenliği: email DEĞERİ rapora girmez
    expect(text).not.toContain("a@x.com");
  });
});
