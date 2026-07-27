/**
 * ReportingLine Population Core + Top-Level Disposition Persistence (CAP-02).
 * App-seviyesi doğrular: ADMIN kapısı, self/cross-tenant/aktiflik/direkt+dolaylı-döngü
 * reddi, MANAGED/TOP_LEVEL disposition create, MANAGED↔TOP_LEVEL atomik geçiş,
 * end→UNCLASSIFIED, tekil-aktif (concurrency), disposition-tabanlı reconciliation.
 * DB-level invariant'lar (CHECK + partial unique index + migration preflight)
 * disposable-DB rehearsal'ında doğrulanır (bu unit onları test edemez).
 *
 * Ayrıca listActive/listEligible okuma metotlarının BUGÜNKÜ davranışını çivileyen
 * characterization blokları içerir (dosya sonu); bunlar davranış üretmez/düzeltmez.
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

// ===========================================================================
// CHARACTERIZATION — listActive / listEligible (salt-okunur metotlar)
// ---------------------------------------------------------------------------
// Amaç: BUGÜNKÜ davranışı olduğu gibi çivilemek. Yeni davranış üretilmez,
// mevcut davranış düzeltilmez. Bu iki metodun daha önce hiç testi yoktu.
//
// Bu bloklardaki Prisma sahtesi "hangi argüman gönderildi" ile yetinmez;
// where/select/orderBy semantiğini bir fixture veri kümesi üzerinde UYGULAR.
// Böylece servis filtreyi düşürürse veya projeksiyonu genişletirse test kırılır.
// ===========================================================================

/**
 * Prisma `select` projeksiyonunu taklit eder (nested to-one select dahil).
 * ÖNEMLİ: to-one ilişki select'i filtre taşımadığında Prisma ilişki KAYDINI
 * varlığına göre döndürür (isActive'e bakmaz); sahte de aynısını yapar.
 */
const applySelect = (row: any, select: any): any => {
  const out: any = {};
  for (const [key, value] of Object.entries<any>(select)) {
    if (value === true) {
      out[key] = row[key];
    } else if (value && typeof value === "object" && value.select) {
      out[key] = row[key] ? applySelect(row[key], value.select) : null;
    }
  }
  return out;
};

describe("ReportingLineService — listActive (characterization)", () => {
  const REL_ACTIVE_MANAGED = {
    id: "rl-active-managed",
    tenantId: TENANT,
    actorUserId: "a",
    managerUserId: "b",
    disposition: "MANAGED",
    validFrom: new Date("2026-01-02T00:00:00.000Z"),
    validUntil: null as Date | null,
  };
  const REL_ACTIVE_TOP_LEVEL = {
    id: "rl-active-top-level",
    tenantId: TENANT,
    actorUserId: "b",
    managerUserId: null as string | null,
    disposition: "TOP_LEVEL",
    validFrom: new Date("2026-01-03T00:00:00.000Z"),
    validUntil: null as Date | null,
  };
  const REL_CLOSED = {
    id: "rl-closed",
    tenantId: TENANT,
    actorUserId: "c",
    managerUserId: "a",
    disposition: "MANAGED",
    validFrom: new Date("2026-01-01T00:00:00.000Z"),
    validUntil: new Date("2026-02-01T00:00:00.000Z") as Date | null,
  };
  const REL_OTHER_TENANT = {
    id: "rl-other-tenant",
    tenantId: OTHER,
    actorUserId: "other",
    managerUserId: null as string | null,
    disposition: "TOP_LEVEL",
    validFrom: new Date("2026-01-04T00:00:00.000Z"),
    validUntil: null as Date | null,
  };
  const RELATIONSHIPS = [
    REL_ACTIVE_MANAGED,
    REL_ACTIVE_TOP_LEVEL,
    REL_CLOSED,
    REL_OTHER_TENANT,
  ];

  const buildListPrisma = () => {
    const findMany = jest.fn(({ where, select, orderBy }: any) => {
      const rows = RELATIONSHIPS.filter((r) => r.tenantId === where.tenantId)
        // validUntil filtresi düşerse kapalı kayıtlar geri sızar ve test kırılır.
        .filter((r) =>
          "validUntil" in where ? where.validUntil === null && r.validUntil === null : true,
        )
        .sort((x, y) =>
          orderBy?.validFrom === "desc"
            ? y.validFrom.getTime() - x.validFrom.getTime()
            : x.validFrom.getTime() - y.validFrom.getTime(),
        )
        .map((r) => applySelect(r, select));
      return Promise.resolve(rows);
    });
    return { prisma: { reportingLine: { findMany } } as any, findMany };
  };

  it("yalnız validUntil=null ilişkiler döner; kapanmış ilişki listede yok", async () => {
    const { prisma, findMany } = buildListPrisma();
    const svc = new ReportingLineService(prisma, buildAudit());
    const res = await svc.listActive(TENANT);
    // validFrom desc sırası (bugünkü orderBy): önce top-level (01-03), sonra managed (01-02).
    expect(res.relationships.map((r: any) => r.id)).toEqual([
      "rl-active-top-level",
      "rl-active-managed",
    ]);
    expect(res.relationships.map((r: any) => r.id)).not.toContain("rl-closed");
    expect(findMany.mock.calls[0][0].where).toEqual({
      tenantId: TENANT,
      validUntil: null,
    });
    expect(findMany.mock.calls[0][0].orderBy).toEqual({ validFrom: "desc" });
  });

  it("tenant scope korunur: başka tenant'ın aktif ilişkisi dönmez", async () => {
    const { prisma } = buildListPrisma();
    const svc = new ReportingLineService(prisma, buildAudit());
    const mine = await svc.listActive(TENANT);
    expect(mine.relationships.map((r: any) => r.id)).not.toContain("rl-other-tenant");
    const theirs = await svc.listActive(OTHER);
    expect(theirs.relationships.map((r: any) => r.id)).toEqual(["rl-other-tenant"]);
  });

  it("projeksiyon kapalı-ilişki detayını (validUntil) ve tenantId'yi sızdırmaz", async () => {
    const { prisma, findMany } = buildListPrisma();
    const svc = new ReportingLineService(prisma, buildAudit());
    const res = await svc.listActive(TENANT);
    expect(res.relationships.length).toBeGreaterThan(0);
    for (const row of res.relationships) {
      expect(Object.keys(row).sort()).toEqual([
        "actorUserId",
        "disposition",
        "id",
        "managerUserId",
        "validFrom",
      ]);
      expect("validUntil" in row).toBe(false);
      expect("tenantId" in row).toBe(false);
    }
    // Sızıntı sınırı select'in kendisinde: validUntil/tenantId hiç istenmez.
    expect(findMany.mock.calls[0][0].select.validUntil).toBeUndefined();
    expect(findMany.mock.calls[0][0].select.tenantId).toBeUndefined();
  });

  it("aktif ilişkisi olmayan tenant için boş liste döner (null değil)", async () => {
    const prisma = { reportingLine: { findMany: jest.fn().mockResolvedValue([]) } } as any;
    const svc = new ReportingLineService(prisma, buildAudit());
    await expect(svc.listActive(TENANT)).resolves.toEqual({ relationships: [] });
  });
});

describe("ReportingLineService — listEligible (characterization)", () => {
  // NOT — profileType alanı BİLİNÇLİ olarak assert EDİLMEZ.
  // Bugünkü kodda `where` profil aktifliğini filtreler, `select` filtrelemez ve
  // etiket profilin VARLIĞINDAN türetilir (`u.lawyer ? "LAWYER" : ...`). Aktif
  // StaffMember + pasif Lawyer taşıyan kullanıcı listeye doğru girer ama "LAWYER"
  // etiketlenir. Bu owner invariant'ı ("profileType deterministik: lawyer >
  // staffMember", etiket AKTİF profili yansıtmalı) ile çelişir:
  // CURRENT_BEHAVIOR_CONFLICTS_WITH_OWNER_INVARIANT. Bu görev test-only'dir;
  // production kodu düzeltilmez, test beklenen sonuca zorlanmaz — bu yüzden bu
  // alan için assertion yazılmamıştır. Ayrı remediation task'ının konusudur.
  // Uygunluk (eligibility) invariant'ları aşağıda normal şekilde çivilenir.

  const U_LAWYER_ACTIVE = {
    id: "u-lawyer-active",
    tenantId: TENANT,
    isActive: true,
    name: "Ada",
    email: "ada@t1.test",
    staffMember: null as any,
    lawyer: { id: "l1", isActive: true },
  };
  const U_STAFF_ACTIVE = {
    id: "u-staff-active",
    tenantId: TENANT,
    isActive: true,
    name: "Bora",
    email: "bora@t1.test",
    staffMember: { id: "s1", isActive: true },
    lawyer: null as any,
  };
  const U_INACTIVE_USER = {
    id: "u-inactive-user",
    tenantId: TENANT,
    isActive: false,
    name: "Cem",
    email: "cem@t1.test",
    staffMember: { id: "s2", isActive: true },
    lawyer: null as any,
  };
  const U_NO_PROFILE = {
    id: "u-no-profile",
    tenantId: TENANT,
    isActive: true,
    name: "Derya",
    email: "derya@t1.test",
    staffMember: null as any,
    lawyer: null as any,
  };
  const U_INACTIVE_PROFILE = {
    id: "u-inactive-profile",
    tenantId: TENANT,
    isActive: true,
    name: "Efe",
    email: "efe@t1.test",
    staffMember: { id: "s3", isActive: false },
    lawyer: null as any,
  };
  const U_OTHER_TENANT = {
    id: "u-other-tenant",
    tenantId: OTHER,
    isActive: true,
    name: "Ferit",
    email: "ferit@t2.test",
    staffMember: null as any,
    lawyer: { id: "l2", isActive: true },
  };
  // Aktif StaffMember + PASİF Lawyer: uygunluk açısından listeye GİRER.
  // (profileType etiketi bilinçli olarak assert edilmez — yukarıdaki nota bak.)
  const U_STAFF_ACTIVE_LAWYER_INACTIVE = {
    id: "u-staff-active-lawyer-inactive",
    tenantId: TENANT,
    isActive: true,
    name: "Gizem",
    email: "gizem@t1.test",
    staffMember: { id: "s4", isActive: true },
    lawyer: { id: "l3", isActive: false },
  };
  const ALL_USERS = [
    U_LAWYER_ACTIVE,
    U_STAFF_ACTIVE,
    U_INACTIVE_USER,
    U_NO_PROFILE,
    U_INACTIVE_PROFILE,
    U_OTHER_TENANT,
    U_STAFF_ACTIVE_LAWYER_INACTIVE,
  ];

  /** where.OR üzerindeki to-one `is` filtresini uygular (profil aktifliği DAHİL). */
  const matchesWhere = (u: any, where: any): boolean => {
    if (u.tenantId !== where.tenantId) return false;
    if ("isActive" in where && u.isActive !== where.isActive) return false;
    if (!where.OR) return true;
    return where.OR.some((cond: any) =>
      Object.entries<any>(cond).every(([relation, filter]) => {
        const profile = u[relation];
        if (!profile) return false;
        return Object.entries<any>(filter.is ?? filter).every(
          ([field, expected]) => profile[field] === expected,
        );
      }),
    );
  };

  const buildEligiblePrisma = () => {
    const findMany = jest.fn(({ where, select }: any) =>
      Promise.resolve(
        ALL_USERS.filter((u) => matchesWhere(u, where)).map((u) => applySelect(u, select)),
      ),
    );
    return { prisma: { user: { findMany } } as any, findMany };
  };

  const eligibleIds = async (tenantId: string) => {
    const { prisma } = buildEligiblePrisma();
    const svc = new ReportingLineService(prisma, buildAudit());
    const res = await svc.listEligible(tenantId);
    return res.eligible.map((e: any) => e.userId).sort();
  };

  it("yalnız aktif kullanıcı + aktif StaffMember/Lawyer profili olanlar döner", async () => {
    expect(await eligibleIds(TENANT)).toEqual([
      "u-lawyer-active",
      "u-staff-active",
      "u-staff-active-lawyer-inactive",
    ]);
  });

  it("pasif kullanıcı, aktif profili olsa bile dışlanır", async () => {
    expect(await eligibleIds(TENANT)).not.toContain("u-inactive-user");
  });

  it("profilsiz ve yalnız pasif profili olan kullanıcılar dışlanır", async () => {
    const ids = await eligibleIds(TENANT);
    expect(ids).not.toContain("u-no-profile");
    expect(ids).not.toContain("u-inactive-profile");
  });

  it("tenant scope korunur: cross-tenant kullanıcı dışlanır", async () => {
    expect(await eligibleIds(TENANT)).not.toContain("u-other-tenant");
    expect(await eligibleIds(OTHER)).toEqual(["u-other-tenant"]);
  });

  it("sorgu tenant+aktiflik ile daraltılır ve isim sırası DB'ye bırakılır", async () => {
    const { prisma, findMany } = buildEligiblePrisma();
    const svc = new ReportingLineService(prisma, buildAudit());
    await svc.listEligible(TENANT);
    const args = findMany.mock.calls[0][0];
    expect(args.where.tenantId).toBe(TENANT);
    expect(args.where.isActive).toBe(true);
    expect(args.where.OR).toEqual([
      { staffMember: { is: { isActive: true } } },
      { lawyer: { is: { isActive: true } } },
    ]);
    expect(args.orderBy).toEqual({ name: "asc" });
  });

  it("dönen kayıt userId/name/email taşır; ham profil nesneleri sızmaz", async () => {
    const { prisma } = buildEligiblePrisma();
    const svc = new ReportingLineService(prisma, buildAudit());
    const res = await svc.listEligible(TENANT);
    const row = res.eligible.find((e: any) => e.userId === "u-staff-active");
    expect(row).toMatchObject({
      userId: "u-staff-active",
      name: "Bora",
      email: "bora@t1.test",
    });
    // profileType kasıtlı olarak assert edilmez (yukarıdaki NOT).
    expect(Object.keys(row as any).sort()).toEqual([
      "email",
      "name",
      "profileType",
      "userId",
    ]);
    expect("staffMember" in (row as any)).toBe(false);
    expect("lawyer" in (row as any)).toBe(false);
  });

  it("uygun kullanıcısı olmayan tenant için boş liste döner (null değil)", async () => {
    const prisma = { user: { findMany: jest.fn().mockResolvedValue([]) } } as any;
    const svc = new ReportingLineService(prisma, buildAudit());
    await expect(svc.listEligible(TENANT)).resolves.toEqual({ eligible: [] });
  });
});
