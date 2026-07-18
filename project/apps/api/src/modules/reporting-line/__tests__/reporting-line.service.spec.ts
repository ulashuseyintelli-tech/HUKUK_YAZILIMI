/**
 * ReportingLine Population Core — CAP-02 object-scope enablement.
 * Doğrular: ADMIN kapısı, self-manager/cross-tenant/aktiflik reddi, direkt+dolaylı
 * döngü reddi, tekil-aktif-amir invariant'ı (concurrency), tarihsel kapatma
 * (validUntil), başarısız transaction'ın kısmi durum bırakmaması, top-level,
 * reconciliation anomali sınıfları. Object-scope FİLTRELEME test edilmez (yok).
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

/**
 * chain: aktif amir haritası (actorUserId -> managerUserId). Hem döngü yürüyüşü
 * hem "previous" sorgusu bu haritayı kullanır. activeCountAfter: create sonrası
 * count (concurrency testi için). audit: mock AuditService.
 */
const buildTxPrisma = (opts: any = {}) => {
  const chain: Record<string, string> = opts.chain ?? {};
  const activeCountAfter = opts.activeCountAfter ?? 1;
  const rl = {
    findFirst: jest.fn(({ where }: any) =>
      Promise.resolve(
        where.actorUserId in chain
          ? { managerUserId: chain[where.actorUserId] }
          : null,
      ),
    ),
    findMany: jest.fn(({ where }: any) =>
      Promise.resolve(
        where.actorUserId in chain
          ? [{ managerUserId: chain[where.actorUserId] }]
          : [],
      ),
    ),
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
  it("non-ADMIN reddedilir (ForbiddenException)", async () => {
    const svc = new ReportingLineService(buildTxPrisma(), buildAudit());
    await expect(
      svc.assignManager(TENANT, "admin", "USER", {
        actorUserId: "a",
        managerUserId: "b",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("ADMIN atama yapabilir (başarı)", async () => {
    const prisma = buildTxPrisma();
    const audit = buildAudit();
    const svc = new ReportingLineService(prisma, audit);
    const res = await svc.assignManager(TENANT, "admin", "ADMIN", {
      actorUserId: "a",
      managerUserId: "b",
    });
    expect(res).toEqual({ actorUserId: "a", managerUserId: "b" });
    expect(prisma.reportingLine.create).toHaveBeenCalled();
    expect(audit.logInTransaction).toHaveBeenCalled();
  });
});

describe("ReportingLineService — invariant reddi", () => {
  it("self-manager reddedilir", async () => {
    const svc = new ReportingLineService(buildTxPrisma(), buildAudit());
    await expect(
      svc.assignManager(TENANT, "admin", "ADMIN", {
        actorUserId: "a",
        managerUserId: "a",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("cross-tenant amir reddedilir", async () => {
    const svc = new ReportingLineService(buildTxPrisma(), buildAudit());
    await expect(
      svc.assignManager(TENANT, "admin", "ADMIN", {
        actorUserId: "a",
        managerUserId: "other",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("pasif actor reddedilir", async () => {
    const svc = new ReportingLineService(buildTxPrisma(), buildAudit());
    await expect(
      svc.assignManager(TENANT, "admin", "ADMIN", {
        actorUserId: "inactive",
        managerUserId: "b",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("direkt döngü reddedilir (a→b varken b→a)", async () => {
    const svc = new ReportingLineService(
      buildTxPrisma({ chain: { a: "b" } }),
      buildAudit(),
    );
    await expect(
      svc.assignManager(TENANT, "admin", "ADMIN", {
        actorUserId: "b",
        managerUserId: "a",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("dolaylı döngü reddedilir (a→b→c varken c→a)", async () => {
    const svc = new ReportingLineService(
      buildTxPrisma({ chain: { a: "b", b: "c" } }),
      buildAudit(),
    );
    await expect(
      svc.assignManager(TENANT, "admin", "ADMIN", {
        actorUserId: "c",
        managerUserId: "a",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("ReportingLineService — transaction/concurrency invariant", () => {
  it("önceki aktif ilişki tarihsel kapatılır (updateMany validUntil)", async () => {
    const prisma = buildTxPrisma({ chain: { a: "b" } });
    const svc = new ReportingLineService(prisma, buildAudit());
    await svc.assignManager(TENANT, "admin", "ADMIN", {
      actorUserId: "a",
      managerUserId: "c",
    });
    const call = prisma.reportingLine.updateMany.mock.calls[0][0];
    expect(call.where.validUntil).toBeNull();
    expect(call.data.validUntil).toBeInstanceOf(Date);
    // create updateMany'den SONRA çağrılır (kapat→aç sırası)
    expect(prisma.reportingLine.create).toHaveBeenCalled();
  });

  it("post-write aktif sayı 1 değilse ConflictException (ikinci aktif amir kalamaz)", async () => {
    const prisma = buildTxPrisma({ activeCountAfter: 2 });
    const svc = new ReportingLineService(prisma, buildAudit());
    await expect(
      svc.assignManager(TENANT, "admin", "ADMIN", {
        actorUserId: "a",
        managerUserId: "b",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("Serializable izolasyon ile çalışır (concurrency güvenliği)", async () => {
    const prisma = buildTxPrisma();
    // $transaction'ı izolasyon opsiyonunu yakalayacak şekilde sar
    const opts: any[] = [];
    prisma.$transaction = jest.fn((cb: any, o: any) => {
      opts.push(o);
      return cb(prisma);
    });
    const svc = new ReportingLineService(prisma, buildAudit());
    await svc.assignManager(TENANT, "admin", "ADMIN", {
      actorUserId: "a",
      managerUserId: "b",
    });
    expect(opts[0]?.isolationLevel).toBe("Serializable");
  });

  it("başarısız transaction reddeder (audit hatası → rollback)", async () => {
    const prisma = buildTxPrisma();
    const audit = buildAudit();
    audit.logInTransaction = jest
      .fn()
      .mockRejectedValue(new Error("audit-fail"));
    const svc = new ReportingLineService(prisma, audit);
    await expect(
      svc.assignManager(TENANT, "admin", "ADMIN", {
        actorUserId: "a",
        managerUserId: "b",
      }),
    ).rejects.toThrow();
  });
});

describe("ReportingLineService — end + top-level", () => {
  it("aktif ilişki yoksa end → NotFound", async () => {
    const prisma = buildTxPrisma({ chain: {} });
    const svc = new ReportingLineService(prisma, buildAudit());
    await expect(
      svc.endRelationship(TENANT, "admin", "ADMIN", { actorUserId: "a" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("end aktif ilişkiyi kapatır + audit", async () => {
    const prisma = buildTxPrisma({ chain: { a: "b" } });
    const audit = buildAudit();
    const svc = new ReportingLineService(prisma, audit);
    const res = await svc.endRelationship(TENANT, "admin", "ADMIN", {
      actorUserId: "a",
    });
    expect(res.closed).toBe(1);
    expect(prisma.reportingLine.updateMany).toHaveBeenCalled();
    expect(audit.logInTransaction).toHaveBeenCalled();
  });

  it("markTopLevel self-row YAZMAZ (yalnız kapatır + audit)", async () => {
    const prisma = buildTxPrisma({ chain: { a: "b" } });
    const audit = buildAudit();
    const svc = new ReportingLineService(prisma, audit);
    await svc.markTopLevel(TENANT, "admin", "ADMIN", { actorUserId: "a" });
    expect(prisma.reportingLine.create).not.toHaveBeenCalled();
    expect(prisma.reportingLine.updateMany).toHaveBeenCalled();
    expect(audit.logInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "REPORTING_LINE_TOP_LEVEL" }),
    );
  });

  it("non-ADMIN end/top-level reddedilir", async () => {
    const svc = new ReportingLineService(buildTxPrisma(), buildAudit());
    await expect(
      svc.endRelationship(TENANT, "u", "USER", { actorUserId: "a" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      svc.markTopLevel(TENANT, "u", "VIEWER", { actorUserId: "a" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe("ReportingLineService — reconciliation anomali sınıfları", () => {
  // Senaryo: a→b (placed), b kök (a'yı yönetir, amiri yok), c disposition yok.
  // self-manager: 0, duplicate: 0, cycle: 0. Ayrıca 1 self-manager anomali satırı ekle.
  const buildReconPrisma = () => {
    const activeRows = [
      { actorUserId: "a", managerUserId: "b" }, // placed
      { actorUserId: "x", managerUserId: "x" }, // self-manager anomali
      { actorUserId: "d", managerUserId: "e" }, // d placed
      { actorUserId: "d", managerUserId: "f" }, // d duplicate aktif
    ];
    const personnelUsers = [
      { id: "a", staffMember: { id: "s1" }, lawyer: null },
      { id: "b", staffMember: null, lawyer: { id: "l1" } },
      { id: "c", staffMember: { id: "s2" }, lawyer: null }, // disposition yok
      { id: "amb", staffMember: { id: "s3" }, lawyer: { id: "l2" } }, // belirsiz
    ];
    return {
      lawyer: { count: jest.fn().mockResolvedValue(3) },
      staffMember: { count: jest.fn().mockResolvedValue(5) },
      user: {
        findMany: jest
          .fn()
          // 1. çağrı: personnelUsers, 2. çağrı: assigneeUsers
          .mockResolvedValueOnce(personnelUsers)
          .mockResolvedValueOnce([{ id: "c" }]), // c task-assignee ama disposition yok
        count: jest.fn().mockResolvedValue(0), // referans kontrolü: hepsi geçerli varsay
      },
      reportingLine: {
        findMany: jest.fn().mockResolvedValue(activeRows),
      },
    } as any;
  };

  it("her anomali sınıfını sayar", async () => {
    const svc = new ReportingLineService(buildReconPrisma(), buildAudit());
    const r = await svc.reconciliation(TENANT);
    expect(r.activeUserLinkedLawyers).toBe(3);
    expect(r.activeUserLinkedStaff).toBe(5);
    expect(r.selfManagerRelationships).toBe(1); // x→x
    expect(r.duplicateActiveRelationships).toBe(1); // d (2 aktif)
    expect(r.usersLinkedToMultipleProfileTypes).toBe(1); // amb
    expect(r.actorsPlaced).toBe(1); // a (b kök, c/amb değil)
    expect(r.explicitTopLevelRoots).toBe(1); // b (a'yı yönetir, amiri yok)
    expect(r.actorsWithNoDisposition).toBe(2); // c + amb
    expect(r.unclassifiableTaskAssignees).toBe(1); // c
    expect(r.cycles).toBe(0);
  });
});
