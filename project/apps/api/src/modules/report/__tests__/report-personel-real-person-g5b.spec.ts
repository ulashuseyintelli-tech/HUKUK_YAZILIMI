/**
 * M2-G5b-1 — getPersonelReport gerçek kişi (Lawyer/Staff) + legacy User (orphan-only).
 * KRİTİK KURAL: legacy satırı yalnız responsibleLawyerId IS NULL & responsibleStaffId IS NULL olan
 * dosyaları sayar → gerçek sahibi olan dosya legacy'de SAYILMAZ (çift sayım yok); User→Lawyer/Staff map yok.
 * Shape: array + 6 eski alan KORUNUR; ownerType/ownerId ADDITIVE.
 *
 * Mock yaklaşımı: bellek-içi case kümesi; case.count where-semantiğini gerçekten filtreleyerek doğrular.
 */

import { ReportService } from "../report.service";

// Bellek-içi dosyalar. c2 KRİTİK: hem gerçek sahip (L1) hem eski legacy (u9) taşır → legacy'de sayılmamalı.
const CASES = [
  { id: "c1", responsibleLawyerId: "L1", responsibleStaffId: null, sorumluPersonelId: null, caseStatus: "DERDEST", amount: 100 },
  { id: "c2", responsibleLawyerId: "L1", responsibleStaffId: null, sorumluPersonelId: "u9", caseStatus: "HITAM", amount: 100 },
  { id: "c3", responsibleLawyerId: null, responsibleStaffId: "S1", sorumluPersonelId: null, caseStatus: "DERDEST", amount: 100 },
  { id: "c4", responsibleLawyerId: null, responsibleStaffId: null, sorumluPersonelId: "u9", caseStatus: "DERDEST", amount: 100 },
  { id: "c5", responsibleLawyerId: null, responsibleStaffId: null, sorumluPersonelId: "u9", caseStatus: "INFAZ", amount: 100 },
];

// Prisma where → bellek-içi filtre. Kolon undefined ise o kolon koşulu uygulanmaz; null ise eşitlik (IS NULL).
const matchCase = (where: any) =>
  CASES.filter((c) => {
    if (where.responsibleLawyerId !== undefined && c.responsibleLawyerId !== where.responsibleLawyerId) return false;
    if (where.responsibleStaffId !== undefined && c.responsibleStaffId !== where.responsibleStaffId) return false;
    if (where.sorumluPersonelId !== undefined && c.sorumluPersonelId !== where.sorumluPersonelId) return false;
    if (where.caseStatus?.in && !where.caseStatus.in.includes(c.caseStatus)) return false;
    return true;
  });

const build = () => {
  const prisma: any = {
    lawyer: {
      findMany: jest.fn(() =>
        Promise.resolve([{ id: "L1", name: "Ulaş", surname: "Telli", title: null, lawyerRank: "LAWYER" }])
      ),
    },
    staffMember: {
      findMany: jest.fn(() =>
        Promise.resolve([{ id: "S1", firstName: "Büşra", lastName: "Atmaca", staffType: "SEKRETER" }])
      ),
    },
    user: {
      findMany: jest.fn(() => Promise.resolve([{ id: "u9", name: "Admin", surname: "Kullanıcı" }])),
    },
    case: { count: jest.fn((args: any) => Promise.resolve(matchCase(args.where).length)) },
    collection: {
      aggregate: jest.fn((args: any) =>
        Promise.resolve({ _sum: { amount: matchCase(args.where.case).reduce((n, c) => n + c.amount, 0) } })
      ),
    },
  };
  const svc = new ReportService(prisma, {} as any, {} as any);
  return { svc };
};

const byOwner = (rows: any[], id: string) => rows.find((r) => r.ownerId === id);

describe("ReportService.getPersonelReport — G5b real-person + legacy", () => {
  it("(1) lawyer count → responsibleLawyerId kolonundan sayar (c1+c2=2, kapanan c2=1)", async () => {
    const { svc } = build();
    const rows = await svc.getPersonelReport("t1");
    const L1 = byOwner(rows, "L1");
    expect(L1).toMatchObject({ ownerType: "LAWYER", ownerId: "L1", totalCases: 2, closedCases: 1 });
    expect(L1.personel).toBe("Av. Ulaş Telli");
  });

  it("(2) staff count → responsibleStaffId kolonundan sayar (c3=1)", async () => {
    const { svc } = build();
    const rows = await svc.getPersonelReport("t1");
    const S1 = byOwner(rows, "S1");
    expect(S1).toMatchObject({ ownerType: "STAFF", ownerId: "S1", totalCases: 1, closedCases: 0 });
    expect(S1.personel).toBe("Büşra Atmaca");
  });

  it("(3) legacy orphan count → yalnız iki-FK-null dosyalar (c4+c5=2, kapanan c5=1)", async () => {
    const { svc } = build();
    const rows = await svc.getPersonelReport("t1");
    const u9 = byOwner(rows, "u9");
    expect(u9).toMatchObject({ ownerType: "LEGACY_USER", ownerId: "u9", totalCases: 2, closedCases: 1 });
    expect(u9.personel).toBe("Admin Kullanıcı");
  });

  it("(4) real-owner case legacy'de SAYILMAZ — c2 (L1 atanmış + u9 eski) legacy'ye düşmez → u9=2 (3 değil)", async () => {
    const { svc } = build();
    const rows = await svc.getPersonelReport("t1");
    // c2 hem L1 (lawyer) hem u9 (eski legacy). L1'de sayılır, u9'da SAYILMAZ → çift sayım yok.
    expect(byOwner(rows, "u9").totalCases).toBe(2);
    expect(byOwner(rows, "L1").totalCases).toBe(2);
  });

  it("(5) shape eski alanları bozmaz — 6 eski alan mevcut + array + sıralı (totalCases desc)", async () => {
    const { svc } = build();
    const rows = await svc.getPersonelReport("t1");
    expect(Array.isArray(rows)).toBe(true);
    for (const r of rows) {
      expect(r).toHaveProperty("personel");
      expect(r).toHaveProperty("personelId"); // = ownerId (back-compat)
      expect(r).toHaveProperty("totalCases");
      expect(r).toHaveProperty("closedCases");
      expect(r).toHaveProperty("totalCollection");
      expect(r).toHaveProperty("closureRate");
      expect(r.personelId).toBe(r.ownerId);
    }
    // totalCases desc sıralı
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1].totalCases >= rows[i].totalCases).toBe(true);
  });

  it("(6) personelId paramı → ownerId ile filtreler, tip bilinmeden legacy'de de çalışır", async () => {
    const { svc } = build();
    const onlyLegacy = await svc.getPersonelReport("t1", "u9");
    expect(onlyLegacy.map((r) => r.ownerId)).toEqual(["u9"]);
    const onlyLawyer = await svc.getPersonelReport("t1", "L1");
    expect(onlyLawyer.map((r) => r.ownerId)).toEqual(["L1"]);
  });

  it("(7) closureRate + totalCollection korunur (L1: 1/2=50%, tahsilat 200)", async () => {
    const { svc } = build();
    const rows = await svc.getPersonelReport("t1");
    const L1 = byOwner(rows, "L1");
    expect(L1.closureRate).toBe(50);
    expect(Number(L1.totalCollection)).toBe(200);
  });
});
