/**
 * Müvekkil PDF export zenginleştirmesi testleri.
 * Önce PDF yalnız isim listesiydi; şimdi tür/ad/TCKN-VKN/telefon/e-posta/adres/kayıt tarihi
 * + filtre alt-başlığı içeriyor. Saf yardımcılar + PDF/Excel buffer smoke testi.
 */

import {
  ExportImportService,
  formatClientTypeLabel,
  formatDateTR,
  buildShortAddress,
  buildPdfFilterSubtitle,
  clientDisplayName,
} from "../export-import.service";
import { parseIdsParam } from "../export-import.controller";
import { generalClientExportFilterSubtitle, presentGeneralClientExport } from '../client-export.presenter';
import * as ExcelJS from 'exceljs';

describe("formatClientTypeLabel", () => {
  it("bilinen türler → TR etiket", () => {
    expect(formatClientTypeLabel("PERSON")).toBe("Sahis");
    expect(formatClientTypeLabel("COMPANY")).toBe("Kurum");
    expect(formatClientTypeLabel("PUBLIC")).toBe("Kamu");
  });
  it("bilinmeyen → olduğu gibi, null → '-'", () => {
    expect(formatClientTypeLabel("OTHER")).toBe("OTHER");
    expect(formatClientTypeLabel(null)).toBe("-");
    expect(formatClientTypeLabel(undefined)).toBe("-");
  });
});

describe("formatDateTR", () => {
  it("Date → dd.mm.yyyy", () => {
    expect(formatDateTR(new Date(2026, 5, 15))).toBe("15.06.2026");
    expect(formatDateTR(new Date(2026, 0, 3))).toBe("03.01.2026");
  });
  it("ISO string → dd.mm.yyyy", () => {
    expect(formatDateTR("2026-06-15T10:00:00.000Z")).toBe("15.06.2026");
  });
  it("null/boş/geçersiz → '-'", () => {
    expect(formatDateTR(null)).toBe("-");
    expect(formatDateTR(undefined)).toBe("-");
    expect(formatDateTR("absürt")).toBe("-");
  });
});

describe("buildShortAddress", () => {
  it("adres/ilçe/il birleştirir", () => {
    expect(buildShortAddress({ address: "Ataturk Cad. No:10", district: "Kadikoy", city: "Istanbul" })).toBe(
      "Ataturk Cad. No:10 / Kadikoy / Istanbul"
    );
  });
  it("boş alanları atlar, hepsi boşsa '' döner", () => {
    expect(buildShortAddress({ address: "", district: null, city: "Izmir" })).toBe("Izmir");
    expect(buildShortAddress({})).toBe("");
  });
  it("maxLen aşılırsa '...' ile kısaltır", () => {
    const long = "A".repeat(100);
    const r = buildShortAddress({ address: long }, 30);
    expect(r.length).toBe(30);
    expect(r.endsWith("...")).toBe(true);
  });
});

describe("buildPdfFilterSubtitle", () => {
  it("filtre yoksa boş", () => {
    expect(buildPdfFilterSubtitle(undefined)).toBe("");
    expect(buildPdfFilterSubtitle({})).toBe("");
    expect(buildPdfFilterSubtitle({ type: "ALL" })).toBe("");
  });
  it("yalnız tür", () => {
    expect(buildPdfFilterSubtitle({ type: "PERSON" })).toBe("Filtre - Tur: Sahis");
  });
  it("yalnız arama", () => {
    expect(buildPdfFilterSubtitle({ search: "ahmet" })).toBe('Filtre - Arama: "ahmet"');
  });
  it("ikisi birden", () => {
    expect(buildPdfFilterSubtitle({ type: "COMPANY", search: "abc" })).toBe(
      'Filtre - Tur: Kurum  |  Arama: "abc"'
    );
  });
});

describe("clientDisplayName", () => {
  it("öncelik: displayName → companyName → ad soyad → '-'", () => {
    expect(clientDisplayName({ displayName: "X", companyName: "Y", firstName: "A", lastName: "B" })).toBe("X");
    expect(clientDisplayName({ companyName: "Y Ltd" })).toBe("Y Ltd");
    expect(clientDisplayName({ firstName: "Ahmet", lastName: "Yilmaz" })).toBe("Ahmet Yilmaz");
    expect(clientDisplayName({})).toBe("-");
  });
});

describe("ExportImportService export buffers (smoke)", () => {
  const sampleClients = [
    {
      type: "PERSON",
      displayName: "Ahmet Yilmaz",
      tckn: "12345678901",
      phone: "05321234567",
      email: "a@b.com",
      address: "Ataturk Cad. No:10",
      district: "Kadikoy",
      city: "Istanbul",
      createdAt: new Date(2026, 5, 15),
    },
    {
      type: "COMPANY",
      companyName: "ABC Ltd",
      vkn: "1234567890",
      phone: null,
      email: null,
      createdAt: new Date(2026, 4, 1),
    },
  ];

  const buildService = () => {
    const prisma = { user: { findFirst: jest.fn().mockResolvedValue({ id: "actor" }) }, client: { findMany: jest.fn().mockResolvedValue(sampleClients) } } as any;
    return new ExportImportService(prisma, {} as any);
  };

  it("exportClientsToPdf → %PDF imzalı Buffer", async () => {
    const buf = await buildService().exportClientsToPdf("t1", { type: "PERSON", search: "ahmet" }, "actor");
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(100);
    expect(buf.subarray(0, 4).toString("latin1")).toBe("%PDF");
  });

  it("boş listede de geçerli PDF üretir (patlamadan)", async () => {
    const prisma = { user: { findFirst: jest.fn().mockResolvedValue({ id: "actor" }) }, client: { findMany: jest.fn().mockResolvedValue([]) } } as any;
    const buf = await new ExportImportService(prisma, {} as any).exportClientsToPdf("t1", undefined, "actor");
    expect(buf.subarray(0, 4).toString("latin1")).toBe("%PDF");
  });

  it("exportClientsToExcel → PK (xlsx zip) imzalı Buffer", async () => {
    const buf = await buildService().exportClientsToExcel("t1", undefined, "actor");
    expect(buf.subarray(0, 2).toString("latin1")).toBe("PK");
  });
});

describe('K16 general client export field boundary', () => {
  const raw = () => ({
    id: 'client-secret-id', tenantId: 'tenant-secret-id', type: 'PERSON',
    displayName: 'Allowed Client', name: 'Allowed Client',
    tckn: '12345678901', vkn: '9876543210', identityNo: 'LEGACY-987654321',
    phone: '05321234567', email: 'person@example.test',
    address: 'PRIVATE LEGACY STREET', postalCode: 'PRIVATE POSTAL',
    city: 'Legacy City', district: 'Legacy District', notes: 'PRIVATE NOTE',
    addresses: [{ isPrimary: true, street: 'PRIVATE CANONICAL STREET', city: 'Izmir', district: 'Konak', postalCode: 'PRIVATE STRUCTURED POSTAL' }],
    bankAccounts: [{ iban: 'TR120000000000000000000001' }],
    metadata: { secret: 'PRIVATE METADATA' },
    createdAt: new Date('2026-06-15T10:00:00.000Z'),
  });

  it('masks identities and contact fields with the existing list formats', () => {
    expect(presentGeneralClientExport(raw())).toMatchObject({
      tckn: '123****01', vkn: '987****10', identityNo: 'LEG****21',
      phone: '0532****67', email: 'pe****@example.test',
    });
  });

  it('uses an allowlist and keeps only canonical coarse location', () => {
    const view = presentGeneralClientExport(raw());
    expect(view).toMatchObject({ displayName: 'Allowed Client', city: 'Izmir', district: 'Konak' });
    for (const key of ['id', 'tenantId', 'address', 'postalCode', 'notes', 'addresses', 'bankAccounts', 'metadata']) {
      expect(view).not.toHaveProperty(key);
    }
    expect(JSON.stringify(view)).not.toMatch(/PRIVATE|TR120000000000000000000001/);
  });

  it('does not mask or mutate the raw source used by separate authorized document consumers', () => {
    const source = raw();
    const before = JSON.stringify(source);
    presentGeneralClientExport(source);
    expect(JSON.stringify(source)).toBe(before);
    expect(source.tckn).toBe('12345678901');
    expect(source.bankAccounts[0].iban).toBe('TR120000000000000000000001');
    expect(buildShortAddress(source)).toBe('PRIVATE CANONICAL STREET / Konak / Izmir');
  });

  it('preserves missing contact values without inventing export data', () => {
    expect(presentGeneralClientExport({ tckn: null, vkn: '', email: undefined, phone: null })).toMatchObject({
      tckn: null, vkn: '', email: undefined, phone: null, city: null, district: null,
    });
  });

  it('does not echo raw search or an unknown type in a PDF filter caption', () => {
    const filters = { search: '12345678901 person@example.test PRIVATE NOTE', type: 'PRIVATE TYPE' };
    expect(generalClientExportFilterSubtitle(filters)).toBe('Filtre - Tur filtresi uygulandi  |  Arama filtresi uygulandi');
    expect(generalClientExportFilterSubtitle({ type: 'COMPANY', search: '  ' })).toBe('Filtre - Tur: Kurum');
    expect(generalClientExportFilterSubtitle({ type: 'ALL' })).toBe('');
  });

  it('writes masked cells into the real generated XLSX, without changing the source', async () => {
    const source = raw();
    const service = new ExportImportService({ user: { findFirst: jest.fn().mockResolvedValue({ id: "actor" }) }, client: { findMany: jest.fn().mockResolvedValue([source]) } } as any, {} as any);
    const bytes = await service.exportClientsToExcel('test-tenant', undefined, 'actor');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as any);
    const row = workbook.worksheets[0].getRow(2);
    expect([row.getCell(2).value, row.getCell(3).value, row.getCell(4).value, row.getCell(5).value])
      .toEqual(['Allowed Client', '123****01', '0532****67', 'pe****@example.test']);
    expect(source.tckn).toBe('12345678901');
    expect(JSON.stringify(row.values)).not.toContain('PRIVATE');
  });

  it('masks the real generated PDF text and omits full address, notes and raw search input', async () => {
    const source = raw();
    const service = new ExportImportService({ user: { findFirst: jest.fn().mockResolvedValue({ id: "actor" }) }, client: { findMany: jest.fn().mockResolvedValue([source]) } } as any, {} as any);
    const bytes = await service.exportClientsToPdf('test-tenant', { search: 'FILTER SECRET 12345678901' }, 'actor');
    // The same locked reader parses this buffer outside Jest; keep it outside
    // the Jest VM. A timeout, parser error or malformed output must still fail.
    const reader = require('child_process').spawnSync(process.execPath, [
      '-e',
      "require(process.argv[1])(require('fs').readFileSync(0),{version:'v2.0.550'}).then(r=>process.stdout.write(JSON.stringify({text:r.text,numpages:r.numpages}))).catch(e=>{console.error(e.message);process.exitCode=1;})",
      require.resolve('pdf-parse/lib/pdf-parse.js'),
    ], { input: bytes, encoding: 'utf8', timeout: 10000, maxBuffer: 256 * 1024, env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=256' } });
    expect(reader.error).toBeUndefined();
    expect(reader.status).toBe(0);
    const document = JSON.parse(reader.stdout);
    expect(document.text).toContain('Allowed Client');
    expect(document.text).toContain('123****01');
    expect(document.text).toContain('0532****67');
    expect(document.text).toContain('pe****@example.test');
    expect(document.text).toContain('Konak / Izmir');
    expect(document.text).not.toMatch(/12345678901|05321234567|person@example\.test|PRIVATE|FILTER SECRET/);
  });
});

describe("Takip (cases) export ids filtresi", () => {
  const buildSvc = (rows: any[] = []) => {
    const findMany = jest.fn().mockResolvedValue(rows);
    const svc = new ExportImportService({ user: { findFirst: jest.fn().mockResolvedValue({ id: "actor" }) }, case: { findMany } } as any, {} as any);
    return { svc, findMany };
  };

  it("ids verilince prisma.case.findMany where.id={in} + tenantId ile çağrılır (seçili export)", async () => {
    const { svc, findMany } = buildSvc();
    await svc.exportCasesToExcel("t1", { ids: ["c1", "c2"] }, "actor");
    expect(findMany).toHaveBeenCalledTimes(1);
    const arg = findMany.mock.calls[0][0];
    expect(arg.where.tenantId).toBe("t1"); // tenant izolasyonu korunur
    expect(arg.where.AND[0].caseClients.some.client).toEqual({ tenantId: "t1", isActive: true });
    expect(arg.where.AND[0].OR).toHaveLength(2);
    expect(arg.where.id).toEqual({ in: ["c1", "c2"] });
  });

  it("ids yoksa where.id EKLENMEZ (nesne kapsamı ayrıca korunur)", async () => {
    const { svc, findMany } = buildSvc();
    await svc.exportCasesToPdf("t1", {}, "actor");
    const arg = findMany.mock.calls[0][0];
    expect(arg.where.id).toBeUndefined();
    expect(arg.where.tenantId).toBe("t1");
  });

  it("exportCasesToPdf → %PDF imzalı Buffer", async () => {
    const { svc } = buildSvc([
      { fileNumber: "2024/1", caseClients: [{ client: { name: "X Ltd" } }], caseStatus: "ACIK", debtors: [] },
    ]);
    const buf = await svc.exportCasesToPdf("t1", { ids: ["c1"] }, "actor");
    expect(buf.subarray(0, 4).toString("latin1")).toBe("%PDF");
  });
});

describe("parseIdsParam", () => {
  it("virgüllü liste → dizi", () => {
    expect(parseIdsParam("a,b,c")).toEqual(["a", "b", "c"]);
  });
  it("trim + boş parçaları atar", () => {
    expect(parseIdsParam(" a , , b ")).toEqual(["a", "b"]);
  });
  it("undefined/boş/sadece-virgül → undefined (ID filtresi yok)", () => {
    expect(parseIdsParam(undefined)).toBeUndefined();
    expect(parseIdsParam("")).toBeUndefined();
    expect(parseIdsParam(" , , ")).toBeUndefined();
  });
});
