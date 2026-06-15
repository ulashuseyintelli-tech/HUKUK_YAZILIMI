/**
 * PR-D5-e — Borçlu export: filtre/sort where-building (liste ile uyumlu, sayfalama yok) + buffer üretimi.
 */

import { ExportImportService } from "../export-import.service";

const sampleDebtor = {
  id: "d1", type: "INDIVIDUAL", name: "Ali Veli", identityNo: "11111111111",
  tckn: "11111111111", vkn: null, detsisNo: null, phone: "0532", email: "a@b.com",
  riskLevel: "YUKSEK", deceasedName: null, institutionName: null,
  debtorAddresses: [{ id: "x", isPrimary: true, city: "İstanbul" }], estateHeirs: [],
  createdAt: new Date(2026, 0, 1),
};

const buildPrisma = () => ({ debtor: { findMany: jest.fn().mockResolvedValue([sampleDebtor]) } });

describe("ExportImportService — borçlu export (PR-D5-e)", () => {
  it("filtreler where'e + sort orderBy'a yansır (sayfalama YOK)", async () => {
    const prisma = buildPrisma() as any;
    const svc = new ExportImportService(prisma);

    await svc.exportDebtorsToExcel("t1", { search: "ali", type: "INDIVIDUAL", riskLevel: "YUKSEK", city: "İstanbul", sortBy: "name", sortOrder: "asc" });

    const args = prisma.debtor.findMany.mock.calls[0][0];
    expect(args.where.tenantId).toBe("t1");
    expect(args.where.type).toBe("INDIVIDUAL");
    expect(args.where.riskLevel).toBe("YUKSEK");
    expect(args.where.OR).toBeDefined(); // search
    expect(args.where.debtorAddresses).toBeDefined(); // city
    expect(args.orderBy).toEqual({ name: "asc" });
    expect(args.skip).toBeUndefined(); // sayfalama yok
    expect(args.take).toBeUndefined();
  });

  it("allowlist dışı sortBy → createdAt desc; type=ALL/risk=ALL filtrelenmez", async () => {
    const prisma = buildPrisma() as any;
    const svc = new ExportImportService(prisma);

    await svc.exportDebtorsToExcel("t1", { type: "ALL", riskLevel: "ALL", sortBy: "evil", sortOrder: "asc" });

    const args = prisma.debtor.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual({ createdAt: "desc" });
    expect(args.where.type).toBeUndefined();
    expect(args.where.riskLevel).toBeUndefined();
  });

  it("Excel buffer üretilir (non-empty)", async () => {
    const svc = new ExportImportService(buildPrisma() as any);
    const buf = await svc.exportDebtorsToExcel("t1", {});
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
  });

  it("PDF buffer üretilir (non-empty)", async () => {
    const svc = new ExportImportService(buildPrisma() as any);
    const buf = await svc.exportDebtorsToPdf("t1", {});
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
  });
});
