/**
 * ReportingLine Population Core + Top-Level Disposition Persistence (CAP-02).
 * App-seviyesi doğrular: ADMIN kapısı, self/cross-tenant/aktiflik/direkt+dolaylı-döngü
 * reddi, MANAGED/TOP_LEVEL disposition create, MANAGED↔TOP_LEVEL atomik geçiş,
 * end→UNCLASSIFIED, tekil-aktif (concurrency), disposition-tabanlı reconciliation.
 * DB-level invariant'lar (CHECK + partial unique index + migration preflight)
 * disposable-DB rehearsal'ında doğrulanır (bu unit onları test edemez).
 */

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { ReportingLineService } from "../reporting-line.service";

const TENANT = "t1";
const OTHER = "t2";

const USERS = [
  { id: "a", tenantId: TENANT, isActive: true },
  { id: "b", tenantId: TENANT, isActive: true },
  { id: "c", tenantId: TENANT, isActive: true },
  { id: "inactive", tenantId: TENANT, isActive: false },
  { id: "other", tenantId: OTHER, isActive: true },
];

const userFindFirst = () =>
  jest.fn(({ where }: any) =>
    Promise.resolve(
      USERS.find(
        (u) =>
          u.id === where.id &&
          u.tenantId === where.tenantId &&
          (where.isActive === undefined || u.isActive === where.isActive),
      ) ?? null,
    ),
  );

// chain: aktif amir haritası (actorUserId -> managerUserId | null[TOP_LEVEL]).
const buildTxPrisma = (opts: any = {}) => {
  const chain: Record<string, string | null> = opts.chain ?? {};
  const activeCountAfter = opts.activeCountAfter ?? 1;
  const validFrom: Date = opts.validFrom ?? new Date(0); // varsayılan geçmiş
  const rowFor = (actor: string) =>
    actor in chain
      ? {
          managerUserId: chain[actor],
          disposition: chain[actor] ? "MANAGED" : "TOP_LEVEL",
          validFrom,
        }
      : null;
  const rl = {
    findFirst: jest.fn(({ where }: any) => Promise.resolve(rowFor(where.actorUserId))),
    findMany: jest.fn(({ where }: any) => {
      const r = rowFor(where.actorUserId);
      return Promise.resolve(r ? [r] : []);
    }),
    updateMany: jest.fn().mockResolvedValue({ count: opts.closedCount ?? 1 }),
    create: jest.fn().mockResolvedValue({ id: "rl-new" }),
    count: jest.fn().mockResolvedValue(activeCountAfter),
  };
  const prisma: any = {
    user: { findFirst: userFindFirst() },
    reportingLine: rl,
    $transaction: jest.fn((cb: any) => cb(prisma)),
  };
  return prisma;
};

const buildAudit = () =>
  ({ logInTransaction: jest.fn().mockResolvedValue(undefined) }) as any;

describe("ReportingLineService — ADMIN kapısı", () => {
  it("non-ADMIN tüm mutasyonlarda reddedilir", async () => {
    const svc = new ReportingLineService(buildTxPrisma(), buildAudit());
    await expect(svc.assignManager(TENANT, "u", "USER", { actorUserId: "a", managerUserId: "b" })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.endRelationship(TENANT, "u", "USER", { actorUserId: "a" })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.markTopLevel(TENANT, "u", "VIEWER", { actorUserId: "a" })).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe("ReportingLineService — assignManager (MANAGED)", () => {
  it("MANAGED disposition + manager ile create + audit", async () => {
    const prisma = buildTxPrisma();
    const audit = buildAudit();
    const svc = new ReportingLineService(prisma, audit);
    const res = await svc.assignManager(TENANT, "admin", "ADMIN", { actorUserId: "a", managerUserId: "b" });
    expect(res).toEqual({ actorUserId: "a", managerUserId: "b", disposition: "MANAGED" });
    const data = prisma.reportingLine.create.mock.calls[0][0].data;
    expect(data.disposition).toBe("MANAGED");
    expect(data.managerUserId).toBe("b");
    expect(audit.logInTransaction).toHaveBeenCalled();
  });

  it("self-manager / cross-tenant / pasif actor reddedilir", async () => {
    const svc = new ReportingLineService(buildTxPrisma(), buildAudit());
    await expect(svc.assignManager(TENANT, "admin", "ADMIN", { actorUserId: "a", managerUserId: "a" })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.assignManager(TENANT, "admin", "ADMIN", { actorUserId: "a", managerUserId: "other" })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.assignManager(TENANT, "admin", "ADMIN", { actorUserId: "inactive", managerUserId: "b" })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("direkt + dolaylı döngü reddedilir", async () => {
    const s1 = new ReportingLineService(buildTxPrisma({ chain: { a: "b" } }), buildAudit());
    await expect(s1.assignManager(TENANT, "admin", "ADMIN", { actorUserId: "b", managerUserId: "a" })).rejects.toBeInstanceOf(BadRequestException);
    const s2 = new ReportingLineService(buildTxPrisma({ chain: { a: "b", b: "c" } }), buildAudit());
    await expect(s2.assignManager(TENANT, "admin", "ADMIN", { actorUserId: "c", managerUserId: "a" })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("TOP_LEVEL aktör → MANAGED atomik geçiş (kapat→aç)", async () => {
    // a şu an TOP_LEVEL (chain[a]=null); assign a→b: TOP_LEVEL kapanır, MANAGED açılır.
    const prisma = buildTxPrisma({ chain: { a: null } });
    const svc = new ReportingLineService(prisma, buildAudit());
    await svc.assignManager(TENANT, "admin", "ADMIN", { actorUserId: "a", managerUserId: "b" });
    expect(prisma.reportingLine.updateMany).toHaveBeenCalled();
    expect(prisma.reportingLine.create.mock.calls[0][0].data.disposition).toBe("MANAGED");
  });
});

describe("ReportingLineService — markTopLevel (TOP_LEVEL)", () => {
  it("TOP_LEVEL disposition + managerUserId null ile KALICI create + audit", async () => {
    const prisma = buildTxPrisma({ chain: { a: "b" } }); // a şu an MANAGED
    const audit = buildAudit();
    const svc = new ReportingLineService(prisma, audit);
    const res = await svc.markTopLevel(TENANT, "admin", "ADMIN", { actorUserId: "a" });
    expect(res).toEqual({ actorUserId: "a", disposition: "TOP_LEVEL" });
    const data = prisma.reportingLine.create.mock.calls[0][0].data;
    expect(data.disposition).toBe("TOP_LEVEL");
    expect(data.managerUserId).toBeNull();
    expect(prisma.reportingLine.updateMany).toHaveBeenCalled(); // MANAGED→TOP_LEVEL atomik
    expect(audit.logInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "REPORTING_LINE_TOP_LEVEL" }),
    );
  });

  it("pasif actor reddedilir", async () => {
    const svc = new ReportingLineService(buildTxPrisma(), buildAudit());
    await expect(svc.markTopLevel(TENANT, "admin", "ADMIN", { actorUserId: "inactive" })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("ReportingLineService — concurrency + end", () => {
  it("post-write aktif sayı 1 değilse ConflictException (assign)", async () => {
    const svc = new ReportingLineService(buildTxPrisma({ activeCountAfter: 2 }), buildAudit());
    await expect(svc.assignManager(TENANT, "admin", "ADMIN", { actorUserId: "a", managerUserId: "b" })).rejects.toBeInstanceOf(ConflictException);
  });

  it("post-write aktif sayı 1 değilse ConflictException (markTopLevel)", async () => {
    const svc = new ReportingLineService(buildTxPrisma({ activeCountAfter: 2 }), buildAudit());
    await expect(svc.markTopLevel(TENANT, "admin", "ADMIN", { actorUserId: "a" })).rejects.toBeInstanceOf(ConflictException);
  });

  it("Serializable izolasyon ile çalışır", async () => {
    const prisma = buildTxPrisma();
    const opts: any[] = [];
    prisma.$transaction = jest.fn((cb: any, o: any) => { opts.push(o); return cb(prisma); });
    const svc = new ReportingLineService(prisma, buildAudit());
    await svc.assignManager(TENANT, "admin", "ADMIN", { actorUserId: "a", managerUserId: "b" });
    expect(opts[0]?.isolationLevel).toBe("Serializable");
  });

  it("end aktif disposition'ı kapatır → UNCLASSIFIED (yeni kayıt YOK)", async () => {
    const prisma = buildTxPrisma({ chain: { a: "b" } });
    const svc = new ReportingLineService(prisma, buildAudit());
    const res = await svc.endRelationship(TENANT, "admin", "ADMIN", { actorUserId: "a" });
    expect(res.closed).toBe(1);
    expect(prisma.reportingLine.updateMany).toHaveBeenCalled();
    expect(prisma.reportingLine.create).not.toHaveBeenCalled();
  });

  it("aktif disposition yoksa end → NotFound", async () => {
    const svc = new ReportingLineService(buildTxPrisma({ chain: {} }), buildAudit());
    await expect(svc.endRelationship(TENANT, "admin", "ADMIN", { actorUserId: "a" })).rejects.toBeInstanceOf(NotFoundException);
  });

  it("başarısız transaction reddeder (audit hatası → rollback)", async () => {
    const prisma = buildTxPrisma();
    const audit = buildAudit();
    audit.logInTransaction = jest.fn().mockRejectedValue(new Error("audit-fail"));
    const svc = new ReportingLineService(prisma, audit);
    await expect(svc.assignManager(TENANT, "admin", "ADMIN", { actorUserId: "a", managerUserId: "b" })).rejects.toThrow();
  });
});

describe("ReportingLineService — date-range integrity (service guard)", () => {
  it("validFrom gelecekte olan aktif kaydı kapatma → validFrom>validUntil reddi (assign)", async () => {
    const future = new Date(Date.now() + 24 * 3600 * 1000);
    const prisma = buildTxPrisma({ chain: { a: "b" }, validFrom: future });
    const svc = new ReportingLineService(prisma, buildAudit());
    await expect(
      svc.assignManager(TENANT, "admin", "ADMIN", { actorUserId: "a", managerUserId: "c" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.reportingLine.updateMany).not.toHaveBeenCalled(); // kapatma yapılmadı
  });

  it("validFrom gelecekte olan aktif kaydı kapatma → reddi (end)", async () => {
    const future = new Date(Date.now() + 24 * 3600 * 1000);
    const prisma = buildTxPrisma({ chain: { a: "b" }, validFrom: future });
    const svc = new ReportingLineService(prisma, buildAudit());
    await expect(
      svc.endRelationship(TENANT, "admin", "ADMIN", { actorUserId: "a" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("normal geçmiş validFrom → close geçerli (guard tetiklenmez)", async () => {
    const prisma = buildTxPrisma({ chain: { a: "b" } }); // validFrom=epoch (geçmiş)
    const svc = new ReportingLineService(prisma, buildAudit());
    await expect(
      svc.endRelationship(TENANT, "admin", "ADMIN", { actorUserId: "a" }),
    ).resolves.toEqual({ actorUserId: "a", closed: 1 });
  });
});

describe("ReportingLineService — reconciliation (disposition-tabanlı)", () => {
  const buildReconPrisma = () => {
    const activeRows = [
      { actorUserId: "a", managerUserId: "b", disposition: "MANAGED" },
      { actorUserId: "b", managerUserId: null, disposition: "TOP_LEVEL" }, // explicit top-level
      { actorUserId: "x", managerUserId: "x", disposition: "MANAGED" }, // self-manager anomali
      { actorUserId: "m", managerUserId: null, disposition: "MANAGED" }, // invalid MANAGED-without-manager
      { actorUserId: "n", managerUserId: "b", disposition: "TOP_LEVEL" }, // invalid TOP_LEVEL-with-manager
      { actorUserId: "d", managerUserId: "e", disposition: "MANAGED" },
      { actorUserId: "d", managerUserId: "f", disposition: "MANAGED" }, // duplicate active
    ];
    const personnelUsers = [
      { id: "a", staffMember: { id: "s1" }, lawyer: null },
      { id: "b", staffMember: null, lawyer: { id: "l1" } },
      { id: "c", staffMember: { id: "s2" }, lawyer: null }, // UNCLASSIFIED (aktif kayıt yok)
      { id: "amb", staffMember: { id: "s3" }, lawyer: { id: "l2" } }, // belirsiz profil
    ];
    return {
      lawyer: { count: jest.fn().mockResolvedValue(3) },
      staffMember: { count: jest.fn().mockResolvedValue(5) },
      user: {
        findMany: jest.fn().mockResolvedValueOnce(personnelUsers).mockResolvedValueOnce([{ id: "c" }]),
        count: jest.fn().mockResolvedValue(0),
      },
      reportingLine: { findMany: jest.fn().mockResolvedValue(activeRows) },
      // invalid-date-range $queryRaw sayacı: 2 malformed kayıt döndür.
      $queryRaw: jest.fn().mockResolvedValue([{ count: BigInt(2) }]),
    } as any;
  };

  it("MANAGED / TOP_LEVEL / UNCLASSIFIED ayırır + invalid legacy + anomali sayar", async () => {
    const svc = new ReportingLineService(buildReconPrisma(), buildAudit());
    const r = await svc.reconciliation(TENANT);
    expect(r.invalidDateRangeRelationships).toBe(2); // $queryRaw sayacı, diğerlerinden bağımsız
    expect(r.managedActors).toBe(5); // a, x, m, d, d (satır-bazlı)
    expect(r.explicitTopLevelActors).toBe(2); // b, n
    expect(r.unclassifiedActors).toBe(2); // c, amb (aktif kaydı yok)
    expect(r.invalidManagedWithoutManager).toBe(1); // m
    expect(r.invalidTopLevelWithManager).toBe(1); // n
    expect(r.selfManagerRelationships).toBe(1); // x
    expect(r.duplicateActiveDispositions).toBe(1); // d
    expect(r.usersLinkedToMultipleProfileTypes).toBe(1); // amb
    expect(r.cycles).toBe(0);
    expect(r.unclassifiableTaskAssignees).toBe(1); // c
  });
});

// ---------------------------------------------------------------------------
// CHARACTERIZATION — listActive / listEligible (salt-okunur okuma yüzeyi).
// Bu bloklar BUGÜNKÜ davranışı olduğu gibi çivilemek içindir; yeni davranış
// üretmez, mevcut davranışı düzeltmez. İki katman birlikte assert edilir:
//   (1) servisin Prisma'ya gönderdiği HAM argüman (where/select/orderBy) —
//       fake'in sadakatinden bağımsız, sorgu kontratını doğrudan sabitler;
//   (2) fake store üzerinden dönen sonuç — filtreleme/sıralama/map davranışı.
// ---------------------------------------------------------------------------

/**
 * Prisma `select` projeksiyonunu yaklaşık uygular: yalnız `true` veya nested
 * `select` ile istenen alanlar döner. "Projection sızdırmaz" iddiasının fake
 * tarafındaki dayanağı budur; (1) katmanı bunu bağımsız olarak da doğrular.
 * Nested relation `isActive` DEĞERİNE göre filtrelenmez — Prisma'da da öyle.
 */
const projectSelect = (row: any, select: any): any => {
  const out: any = {};
  for (const [key, spec] of Object.entries<any>(select ?? {})) {
    if (spec === true) out[key] = row[key];
    else if (spec && spec.select) {
      out[key] = row[key] == null ? null : projectSelect(row[key], spec.select);
    }
  }
  return out;
};

/** Tek alanlı `orderBy` (string/Date) uygular. */
const applyOrderBy = (rows: any[], orderBy: any): any[] => {
  if (!orderBy) return rows;
  const key = Object.keys(orderBy)[0];
  const dir = orderBy[key];
  return [...rows].sort((x, y) => {
    const a = x[key];
    const b = y[key];
    const cmp =
      typeof a === "string" ? a.localeCompare(b) : a > b ? 1 : a < b ? -1 : 0;
    return dir === "desc" ? -cmp : cmp;
  });
};

describe("ReportingLineService — listActive (characterization)", () => {
  // validUntil dolu = kapanmış ilişki. Farklı tenant + kapalı kayıt kasten var.
  const REL_ROWS = [
    {
      id: "rl-managed",
      tenantId: TENANT,
      actorUserId: "a",
      managerUserId: "b",
      disposition: "MANAGED",
      validFrom: new Date("2026-01-02T00:00:00.000Z"),
      validUntil: null,
    },
    {
      id: "rl-top",
      tenantId: TENANT,
      actorUserId: "b",
      managerUserId: null,
      disposition: "TOP_LEVEL",
      validFrom: new Date("2026-01-03T00:00:00.000Z"),
      validUntil: null,
    },
    {
      id: "rl-closed",
      tenantId: TENANT,
      actorUserId: "c",
      managerUserId: "b",
      disposition: "MANAGED",
      validFrom: new Date("2026-01-05T00:00:00.000Z"), // en yeni: sıralamada ilk OLMAMALI
      validUntil: new Date("2026-02-01T00:00:00.000Z"),
    },
    {
      id: "rl-other-tenant",
      tenantId: OTHER,
      actorUserId: "other",
      managerUserId: null,
      disposition: "TOP_LEVEL",
      validFrom: new Date("2026-01-04T00:00:00.000Z"),
      validUntil: null,
    },
  ];

  const buildListPrisma = (rows: any[] = REL_ROWS) => {
    const findMany = jest.fn(({ where, select, orderBy }: any) => {
      const matched = rows.filter(
        (r) =>
          r.tenantId === where.tenantId &&
          (where.validUntil === undefined || r.validUntil === where.validUntil),
      );
      return Promise.resolve(
        applyOrderBy(matched, orderBy).map((r) => projectSelect(r, select)),
      );
    });
    return { reportingLine: { findMany } } as any;
  };

  it("Prisma'ya tenant-scoped + validUntil:null sorgusu gönderir (sorgu kontratı)", async () => {
    const prisma = buildListPrisma();
    const svc = new ReportingLineService(prisma, buildAudit());
    await svc.listActive(TENANT);
    expect(prisma.reportingLine.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT, validUntil: null },
      select: {
        id: true,
        actorUserId: true,
        managerUserId: true,
        disposition: true,
        validFrom: true,
      },
      orderBy: { validFrom: "desc" },
    });
  });

  it("tenant scope korunur: başka tenant'ın aktif kaydı dönmez", async () => {
    const svc = new ReportingLineService(buildListPrisma(), buildAudit());
    const { relationships } = await svc.listActive(TENANT);
    expect(relationships.map((r: any) => r.id)).not.toContain("rl-other-tenant");
    expect(relationships.map((r: any) => r.actorUserId)).not.toContain("other");
  });

  it("yalnız validUntil=null aktif sayılır; kapanmış ilişki listede görünmez", async () => {
    const svc = new ReportingLineService(buildListPrisma(), buildAudit());
    const { relationships } = await svc.listActive(TENANT);
    expect(relationships.map((r: any) => r.id)).toEqual(["rl-top", "rl-managed"]);
    expect(relationships.map((r: any) => r.id)).not.toContain("rl-closed");
  });

  it("validFrom desc sıralanır (en yeni aktif kayıt başta)", async () => {
    const svc = new ReportingLineService(buildListPrisma(), buildAudit());
    const { relationships } = await svc.listActive(TENANT);
    expect(relationships[0].validFrom).toEqual(new Date("2026-01-03T00:00:00.000Z"));
    expect(relationships[1].validFrom).toEqual(new Date("2026-01-02T00:00:00.000Z"));
  });

  it("projection dar: validUntil ve tenantId sızmaz, MANAGED/TOP_LEVEL alanları aynen döner", async () => {
    const svc = new ReportingLineService(buildListPrisma(), buildAudit());
    const { relationships } = await svc.listActive(TENANT);
    for (const r of relationships) {
      expect(Object.keys(r).sort()).toEqual([
        "actorUserId",
        "disposition",
        "id",
        "managerUserId",
        "validFrom",
      ]);
      expect(r).not.toHaveProperty("validUntil");
      expect(r).not.toHaveProperty("tenantId");
    }
    expect(relationships).toEqual([
      {
        id: "rl-top",
        actorUserId: "b",
        managerUserId: null, // TOP_LEVEL kökü: manager null olarak korunur
        disposition: "TOP_LEVEL",
        validFrom: new Date("2026-01-03T00:00:00.000Z"),
      },
      {
        id: "rl-managed",
        actorUserId: "a",
        managerUserId: "b",
        disposition: "MANAGED",
        validFrom: new Date("2026-01-02T00:00:00.000Z"),
      },
    ]);
  });

  it("aktif kayıt yoksa boş relationships döner (hata atmaz)", async () => {
    const svc = new ReportingLineService(buildListPrisma([]), buildAudit());
    await expect(svc.listActive(TENANT)).resolves.toEqual({ relationships: [] });
  });
});

describe("ReportingLineService — listEligible (characterization)", () => {
  // NOT: "aktif StaffMember + PASİF Lawyer" fixture'ı KASTEN yoktur; o durum
  // owner invariant'ı ile çelişen bilinen bir sapmadır ve rapor edilir,
  // teste çivilenmez (yanlış yeşil üretmemek için).
  const ELIGIBLE_USERS = [
    {
      id: "u-both",
      tenantId: TENANT,
      isActive: true,
      name: "Ali Both",
      email: "both@t1.test",
      staffMember: { id: "s-both", isActive: true },
      lawyer: { id: "l-both", isActive: true },
    },
    {
      id: "u-lawyer",
      tenantId: TENANT,
      isActive: true,
      name: "Berk Lawyer",
      email: "lawyer@t1.test",
      staffMember: null,
      lawyer: { id: "l-1", isActive: true },
    },
    {
      id: "u-staff",
      tenantId: TENANT,
      isActive: true,
      name: "Cem Staff",
      email: "staff@t1.test",
      staffMember: { id: "s-1", isActive: true },
      lawyer: null,
    },
    {
      id: "u-passive",
      tenantId: TENANT,
      isActive: false, // pasif User
      name: "Ayse Passive",
      email: "passive@t1.test",
      staffMember: { id: "s-2", isActive: true },
      lawyer: null,
    },
    {
      id: "u-no-profile",
      tenantId: TENANT,
      isActive: true,
      name: "Ahmet NoProfile",
      email: "noprofile@t1.test",
      staffMember: null,
      lawyer: null,
    },
    {
      id: "u-passive-profile",
      tenantId: TENANT,
      isActive: true,
      name: "Ayhan PassiveProfile",
      email: "passiveprofile@t1.test",
      staffMember: { id: "s-3", isActive: false }, // profil pasif → uygun değil
      lawyer: null,
    },
    {
      id: "u-other-tenant",
      tenantId: OTHER,
      isActive: true,
      name: "Aaa OtherTenant",
      email: "other@t2.test",
      staffMember: { id: "s-4", isActive: true },
      lawyer: null,
    },
  ];

  const buildEligiblePrisma = (users: any[] = ELIGIBLE_USERS) => {
    const matchesOr = (u: any, or: any[]) =>
      or.some((cond) => {
        const relation = Object.keys(cond)[0]; // "staffMember" | "lawyer"
        const expected = cond[relation].is; // { isActive: true }
        const profile = u[relation];
        return profile != null && profile.isActive === expected.isActive;
      });
    const findMany = jest.fn(({ where, select, orderBy }: any) => {
      const matched = users.filter(
        (u) =>
          u.tenantId === where.tenantId &&
          u.isActive === where.isActive &&
          matchesOr(u, where.OR),
      );
      return Promise.resolve(
        applyOrderBy(matched, orderBy).map((u) => projectSelect(u, select)),
      );
    });
    return { user: { findMany } } as any;
  };

  it("Prisma'ya tenant + isActive + aktif-profil OR sorgusu gönderir (sorgu kontratı)", async () => {
    const prisma = buildEligiblePrisma();
    const svc = new ReportingLineService(prisma, buildAudit());
    await svc.listEligible(TENANT);
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: TENANT,
        isActive: true,
        OR: [
          { staffMember: { is: { isActive: true } } },
          { lawyer: { is: { isActive: true } } },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
        staffMember: { select: { id: true } },
        lawyer: { select: { id: true } },
      },
      orderBy: { name: "asc" },
    });
  });

  it("tenant scope korunur: başka tenant'ın aktif personeli dönmez", async () => {
    const svc = new ReportingLineService(buildEligiblePrisma(), buildAudit());
    const { eligible } = await svc.listEligible(TENANT);
    expect(eligible.map((e: any) => e.userId)).not.toContain("u-other-tenant");
  });

  it("pasif User dışlanır", async () => {
    const svc = new ReportingLineService(buildEligiblePrisma(), buildAudit());
    const { eligible } = await svc.listEligible(TENANT);
    expect(eligible.map((e: any) => e.userId)).not.toContain("u-passive");
  });

  it("aktif StaffMember/Lawyer profili olmayan User dışlanır (profilsiz + profili pasif)", async () => {
    const svc = new ReportingLineService(buildEligiblePrisma(), buildAudit());
    const ids = (await svc.listEligible(TENANT)).eligible.map((e: any) => e.userId);
    expect(ids).not.toContain("u-no-profile");
    expect(ids).not.toContain("u-passive-profile");
  });

  it("yalnız uygun Users döner ve name asc sıralanır", async () => {
    const svc = new ReportingLineService(buildEligiblePrisma(), buildAudit());
    const { eligible } = await svc.listEligible(TENANT);
    expect(eligible.map((e: any) => e.userId)).toEqual([
      "u-both", // Ali Both
      "u-lawyer", // Berk Lawyer
      "u-staff", // Cem Staff
    ]);
  });

  it("profileType deterministik: iki profili de AKTİF olan User'da lawyer > staffMember", async () => {
    const svc = new ReportingLineService(buildEligiblePrisma(), buildAudit());
    const { eligible } = await svc.listEligible(TENANT);
    const byId = Object.fromEntries(eligible.map((e: any) => [e.userId, e]));
    expect(byId["u-both"].profileType).toBe("LAWYER"); // lawyer önceliklidir
    expect(byId["u-lawyer"].profileType).toBe("LAWYER");
    expect(byId["u-staff"].profileType).toBe("STAFF");
  });

  it("projection dar: id/staffMember/lawyer ham alanları sızmaz, userId'ye map'lenir", async () => {
    const svc = new ReportingLineService(buildEligiblePrisma(), buildAudit());
    const { eligible } = await svc.listEligible(TENANT);
    for (const e of eligible) {
      expect(Object.keys(e).sort()).toEqual([
        "email",
        "name",
        "profileType",
        "userId",
      ]);
      expect(e).not.toHaveProperty("id");
      expect(e).not.toHaveProperty("staffMember");
      expect(e).not.toHaveProperty("lawyer");
      expect(e).not.toHaveProperty("tenantId");
    }
    expect(eligible[2]).toEqual({
      userId: "u-staff",
      name: "Cem Staff",
      email: "staff@t1.test",
      profileType: "STAFF",
    });
  });

  it("uygun User yoksa boş eligible döner (hata atmaz)", async () => {
    const svc = new ReportingLineService(buildEligiblePrisma([]), buildAudit());
    await expect(svc.listEligible(TENANT)).resolves.toEqual({ eligible: [] });
  });
});
