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
    const prisma = { client: { findMany: jest.fn().mockResolvedValue(sampleClients) } } as any;
    return new ExportImportService(prisma);
  };

  it("exportClientsToPdf → %PDF imzalı Buffer", async () => {
    const buf = await buildService().exportClientsToPdf("t1", { type: "PERSON", search: "ahmet" });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(100);
    expect(buf.subarray(0, 4).toString("latin1")).toBe("%PDF");
  });

  it("boş listede de geçerli PDF üretir (patlamadan)", async () => {
    const prisma = { client: { findMany: jest.fn().mockResolvedValue([]) } } as any;
    const buf = await new ExportImportService(prisma).exportClientsToPdf("t1");
    expect(buf.subarray(0, 4).toString("latin1")).toBe("%PDF");
  });

  it("exportClientsToExcel → PK (xlsx zip) imzalı Buffer", async () => {
    const buf = await buildService().exportClientsToExcel("t1");
    expect(buf.subarray(0, 2).toString("latin1")).toBe("PK");
  });
});
