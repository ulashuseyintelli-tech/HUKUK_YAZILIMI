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

/* ---------------------------------------------------------------------------
 * listActive / listEligible — CHARACTERIZATION (test-only)
 *
 * Bu blok iki okuma metodunun BUGÜNKÜ davranışını olduğu gibi çiviler; davranış
 * üretmez, düzeltmez, iyileştirmez. Prisma mock'ları where/select/orderBy'ı
 * gerçekten uygular (filtre + projeksiyon + sıralama), böylece dışlama davranışı
 * yalnız argüman şeklinden değil dönen veriden de doğrulanır.
 *
 * BİLİNEN SAPMA — listEligible.profileType (test YAZILMADI, bilinçli):
 *   where  → OR [ staffMember.is.isActive:true , lawyer.is.isActive:true ]  (isActive FİLTRELİ)
 *   select → staffMember:{id} · lawyer:{id}                                 (isActive FİLTRESİZ)
 *   map    → profileType = u.lawyer ? "LAWYER" : u.staffMember ? "STAFF" : null
 * User hem staffMember hem lawyer taşıyabilir (schema: her ikisi de opsiyonel).
 * Aktif StaffMember + PASİF Lawyer taşıyan kullanıcı listeye doğru girer ama
 * "LAWYER" etiketlenir: etiket profilin VARLIĞINDAN türetiliyor, AKTİFLİĞİNDEN
 * değil. Owner invariant'ı etiketin aktif profili yansıtmasını bekler.
 * → CURRENT_BEHAVIOR_CONFLICTS_WITH_OWNER_INVARIANT olarak raporlandı; production
 *   kodu düzeltilmedi ve test beklenen sonuca zorlanmadı. Aşağıdaki precedence
 *   testi bu yüzden yalnız her iki profili de AKTİF olan kullanıcıyı kapsar.
 * ------------------------------------------------------------------------- */

/** Prisma `select` semantiğini taklit eder: düz alanlar + iç içe relation select. */
const project = (row: any, select: any): any => {
  const out: any = {};
  for (const [key, value] of Object.entries<any>(select)) {
    if (value === true) out[key] = row[key];
    else if (value && value.select) out[key] = row[key] ? project(row[key], value.select) : null;
  }
  return out;
};

// validFrom'lar bilerek karışık sırada: orderBy desc gerçekten gözlemlenebilsin.
const RL_ROWS: any[] = [
  { id: "rl-active-old", tenantId: TENANT, actorUserId: "a", managerUserId: "b", disposition: "MANAGED", validFrom: new Date("2026-01-01"), validUntil: null },
  { id: "rl-active-new", tenantId: TENANT, actorUserId: "b", managerUserId: null, disposition: "TOP_LEVEL", validFrom: new Date("2026-03-01"), validUntil: null },
  { id: "rl-closed", tenantId: TENANT, actorUserId: "c", managerUserId: "a", disposition: "MANAGED", validFrom: new Date("2026-02-01"), validUntil: new Date("2026-04-01") },
  { id: "rl-other-tenant", tenantId: OTHER, actorUserId: "other", managerUserId: null, disposition: "TOP_LEVEL", validFrom: new Date("2026-05-01"), validUntil: null },
];

const buildListActivePrisma = (rows: any[] = RL_ROWS) => {
  const findMany = jest.fn(({ where, select, orderBy }: any) =>
    Promise.resolve(
      rows
        .filter((r) => r.tenantId === where.tenantId)
        .filter((r) => (where.validUntil === null ? r.validUntil === null : true))
        .slice()
        .sort((x, y) =>
          orderBy?.validFrom === "desc" ? y.validFrom.getTime() - x.validFrom.getTime() : 0,
        )
        .map((r) => project(r, select)),
    ),
  );
  return { reportingLine: { findMany } } as any;
};

describe("ReportingLineService — listActive (characterization)", () => {
  it("tenant-scoped + yalnız validUntil=null sorgular (validFrom desc)", async () => {
    const prisma = buildListActivePrisma();
    const svc = new ReportingLineService(prisma, buildAudit());
    await svc.listActive(TENANT);
    const args = prisma.reportingLine.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ tenantId: TENANT, validUntil: null });
    expect(args.orderBy).toEqual({ validFrom: "desc" });
  });

  it("yalnız aktif ilişkiler döner: kapanmış ve başka-tenant kayıtlar listede yok", async () => {
    const svc = new ReportingLineService(buildListActivePrisma(), buildAudit());
    const res = await svc.listActive(TENANT);
    // { relationships: [...] } zarfı + validFrom desc sırası.
    expect(res.relationships.map((r: any) => r.id)).toEqual(["rl-active-new", "rl-active-old"]);
    expect(res.relationships.map((r: any) => r.id)).not.toContain("rl-closed");
    expect(res.relationships.map((r: any) => r.id)).not.toContain("rl-other-tenant");
  });

  it("projection kapalı-ilişki detayını sızdırmaz: validUntil select edilmez", async () => {
    const prisma = buildListActivePrisma();
    const svc = new ReportingLineService(prisma, buildAudit());
    const res = await svc.listActive(TENANT);
    // Otoriter assertion: servisin Prisma'ya verdiği select (tenantId/validUntil YOK).
    const select = prisma.reportingLine.findMany.mock.calls[0][0].select;
    expect(select).toEqual({
      id: true,
      actorUserId: true,
      managerUserId: true,
      disposition: true,
      validFrom: true,
    });
    expect(Object.keys(res.relationships[0])).toEqual([
      "id",
      "actorUserId",
      "managerUserId",
      "disposition",
      "validFrom",
    ]);
  });

  it("aktif kayıt yoksa boş liste döner (kapanmış kayıtlar sayılmaz)", async () => {
    const closedOnly = RL_ROWS.filter((r) => r.id === "rl-closed");
    const svc = new ReportingLineService(buildListActivePrisma(closedOnly), buildAudit());
    await expect(svc.listActive(TENANT)).resolves.toEqual({ relationships: [] });
  });
});

// name'ler ASCII ve alfabetik ayırt edilebilir: orderBy name asc gözlemlenebilsin.
const ELIGIBLE_USERS: any[] = [
  { id: "u-lawyer", tenantId: TENANT, isActive: true, name: "Ada", email: "ada@t1", staffMember: null, lawyer: { id: "l1", isActive: true } },
  { id: "u-staff", tenantId: TENANT, isActive: true, name: "Berk", email: "berk@t1", staffMember: { id: "s1", isActive: true }, lawyer: null },
  { id: "u-both-active", tenantId: TENANT, isActive: true, name: "Cem", email: "cem@t1", staffMember: { id: "s2", isActive: true }, lawyer: { id: "l2", isActive: true } },
  { id: "u-passive-user", tenantId: TENANT, isActive: false, name: "Deniz", email: "deniz@t1", staffMember: { id: "s3", isActive: true }, lawyer: null },
  { id: "u-no-profile", tenantId: TENANT, isActive: true, name: "Ege", email: "ege@t1", staffMember: null, lawyer: null },
  { id: "u-passive-profile", tenantId: TENANT, isActive: true, name: "Faruk", email: "faruk@t1", staffMember: { id: "s4", isActive: false }, lawyer: null },
  { id: "u-cross-tenant", tenantId: OTHER, isActive: true, name: "Gizem", email: "gizem@t2", staffMember: { id: "s5", isActive: true }, lawyer: null },
];

/** where.OR: [{ staffMember: { is: { isActive } } }, { lawyer: { is: { isActive } } }] */
const matchesProfileOr = (user: any, or: any[]) =>
  or.some((cond) => {
    if (cond.staffMember) return !!user.staffMember && user.staffMember.isActive === cond.staffMember.is.isActive;
    if (cond.lawyer) return !!user.lawyer && user.lawyer.isActive === cond.lawyer.is.isActive;
    return false;
  });

const buildEligiblePrisma = (rows: any[] = ELIGIBLE_USERS) => {
  const findMany = jest.fn(({ where, select, orderBy }: any) =>
    Promise.resolve(
      rows
        .filter((u) => u.tenantId === where.tenantId)
        .filter((u) => where.isActive === undefined || u.isActive === where.isActive)
        .filter((u) => !where.OR || matchesProfileOr(u, where.OR))
        .slice()
        .sort((x, y) =>
          orderBy?.name === "asc" ? (x.name < y.name ? -1 : x.name > y.name ? 1 : 0) : 0,
        )
        .map((u) => project(u, select)),
    ),
  );
  return { user: { findMany } } as any;
};

describe("ReportingLineService — listEligible (characterization)", () => {
  it("tenant-scoped + aktif kullanıcı + aktif profil (staff VEYA lawyer) sorgular", async () => {
    const prisma = buildEligiblePrisma();
    const svc = new ReportingLineService(prisma, buildAudit());
    await svc.listEligible(TENANT);
    const args = prisma.user.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      tenantId: TENANT,
      isActive: true,
      OR: [
        { staffMember: { is: { isActive: true } } },
        { lawyer: { is: { isActive: true } } },
      ],
    });
    expect(args.orderBy).toEqual({ name: "asc" });
  });

  it("pasif kullanıcı, cross-tenant, profilsiz ve pasif-profilli kullanıcılar dışlanır", async () => {
    const svc = new ReportingLineService(buildEligiblePrisma(), buildAudit());
    const res = await svc.listEligible(TENANT);
    // name asc sırası: Ada, Berk, Cem.
    expect(res.eligible.map((e: any) => e.userId)).toEqual([
      "u-lawyer",
      "u-staff",
      "u-both-active",
    ]);
    for (const excluded of ["u-passive-user", "u-cross-tenant", "u-no-profile", "u-passive-profile"]) {
      expect(res.eligible.map((e: any) => e.userId)).not.toContain(excluded);
    }
  });

  it("her satır { userId, name, email, profileType } olarak eşlenir", async () => {
    const svc = new ReportingLineService(buildEligiblePrisma(), buildAudit());
    const res = await svc.listEligible(TENANT);
    expect(res.eligible[1]).toEqual({
      userId: "u-staff",
      name: "Berk",
      email: "berk@t1",
      profileType: "STAFF",
    });
    expect(Object.keys(res.eligible[1])).toEqual(["userId", "name", "email", "profileType"]);
  });

  it("profileType: tek aktif profil kendi tipini verir; İKİ AKTİF profilde lawyer önceliklidir", async () => {
    const svc = new ReportingLineService(buildEligiblePrisma(), buildAudit());
    const res = await svc.listEligible(TENANT);
    const typeOf = (userId: string) =>
      res.eligible.find((e: any) => e.userId === userId)?.profileType;
    expect(typeOf("u-lawyer")).toBe("LAWYER");
    expect(typeOf("u-staff")).toBe("STAFF");
    // Yalnız her iki profil de AKTİF olan hâl: precedence lawyer > staffMember.
    // Aktif-staff + PASİF-lawyer hâli bilinçli olarak KAPSAM DIŞI (bkz. blok başı sapma notu).
    expect(typeOf("u-both-active")).toBe("LAWYER");
  });
});
