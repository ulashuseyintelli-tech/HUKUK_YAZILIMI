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
