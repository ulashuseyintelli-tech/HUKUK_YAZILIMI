/**
 * PR-2 — POA semantik idempotency (tarama kaynaklı mükerrer vekalet bastırma).
 * Anahtar: clientId + normalizedNotaryName + dateIssued (aktif). poaNumber/yevmiyeNo OCR-gürültülü,
 * anahtar DEĞİL. Eşleşme varsa yeni kayıt AÇILMAZ, mevcut aktif döner; boş alan zenginleşir, dolu ezilmez.
 */

import { PoaService, normalizeNotaryName, sameIssueDay, buildPoaEnrichment } from "../poa.service";

describe("normalizeNotaryName (PR-2b hardening: diakritik + noktalama folding)", () => {
  it("trim + tek boşluk + uppercase + diakritik folding", () => {
    expect(normalizeNotaryName("  bülent   öven ")).toBe("BULENT OVEN");
    expect(normalizeNotaryName("BÜLENT ÖVEN")).toBe("BULENT OVEN");
  });
  it("OCR varyansları AYNI sonuca foldlanır (asıl amaç)", () => {
    const variants = ["BÜLENT ÖVEN", "BÜLENT OVEN", "BÜLENT ÖVEN.", "bülent öven", "BÜLENT  ÖVEN", "Bülent Öven,"];
    const out = variants.map((v) => normalizeNotaryName(v));
    expect(new Set(out).size).toBe(1); // hepsi tek değere foldlanır
    expect(out[0]).toBe("BULENT OVEN");
  });
  it("tüm TR diakritikleri: ş/ğ/ü/ö/ç/ı/İ → s/g/u/o/c/i/i", () => {
    expect(normalizeNotaryName("ŞAHİN ÇAĞLAR")).toBe("SAHIN CAGLAR");
    expect(normalizeNotaryName("Işıl Gökçe")).toBe("ISIL GOKCE");
  });
  it("boş/undefined → ''", () => {
    expect(normalizeNotaryName(undefined)).toBe("");
    expect(normalizeNotaryName(null)).toBe("");
  });
});

describe("sameIssueDay", () => {
  it("aynı gün (saat farkı önemsiz) → true", () => {
    expect(sameIssueDay(new Date("2026-01-12T00:00:00Z"), "2026-01-12")).toBe(true);
  });
  it("farklı gün → false; eksik → false", () => {
    expect(sameIssueDay("2026-01-12", "2026-01-13")).toBe(false);
    expect(sameIssueDay(null, "2026-01-12")).toBe(false);
  });
});

describe("buildPoaEnrichment", () => {
  it("yalnız BOŞ alanları doldurur, DOLU alanı ezmez", () => {
    const existing = { notaryCity: null, journalNo: "48", poaNumber: "48", validUntil: null, scopeDescription: "", filePath: null };
    const dto = { notaryCity: "İSTANBUL", journalNo: "00468", poaNumber: "00468", validUntil: null, scopeDescription: "Genel vekalet", filePath: "/x.pdf" };
    expect(buildPoaEnrichment(existing, dto)).toEqual({ notaryCity: "İSTANBUL", scopeDescription: "Genel vekalet", filePath: "/x.pdf" });
    // journalNo/poaNumber DOLU → ezilmez (48 kalır)
  });
});

describe("PoaService.create — idempotency", () => {
  const build = (activePoas: any[]) => {
    const prisma: any = {
      client: { findFirst: jest.fn().mockResolvedValue({ id: "cli1", displayName: "ŞÜKRÜ AKDOĞAN" }) },
      clientPowerOfAttorney: {
        findMany: jest.fn().mockResolvedValue(activePoas),
        findFirst: jest.fn().mockImplementation(({ where }: any) => Promise.resolve({ id: where.id })), // findOne
        create: jest.fn().mockImplementation((a: any) => Promise.resolve({ id: "new1", ...a.data })),
        update: jest.fn().mockResolvedValue({}),
      },
      poaLawyer: { createMany: jest.fn() },
    };
    const svc = new PoaService(prisma);
    return { svc, prisma };
  };

  const baseDto = { clientId: "cli1", notaryName: "BÜLENT ÖVEN", dateIssued: new Date("2026-01-12") };

  it("aynı client+noter+tarih aktif varsa → YENİ kayıt AÇMAZ, mevcut döner + _suppressedDuplicate bayrağı (PR-2a)", async () => {
    const { svc, prisma } = build([
      { id: "poa-existing", notaryName: "BÜLENT ÖVEN", dateIssued: new Date("2026-01-12"), poaNumber: "48", notaryCity: null },
    ]);

    const res = await svc.create({ ...baseDto, poaNumber: "00468" } as any, "t1");

    expect(prisma.clientPowerOfAttorney.create).not.toHaveBeenCalled();
    expect((res as any)._suppressedDuplicate).toBe(true); // PR-2a: UX sinyali
    expect((res as any).id).toBe("poa-existing"); // mevcut kayıt döner
  });

  it("eşleşmede BOŞ alan zenginleşir (update çağrılır), poaNumber DOLU ezilmez", async () => {
    const { svc, prisma } = build([
      { id: "poa-existing", notaryName: "BÜLENT ÖVEN", dateIssued: new Date("2026-01-12"), poaNumber: "48", notaryCity: null },
    ]);

    await svc.create({ ...baseDto, poaNumber: "00468", notaryCity: "İSTANBUL" } as any, "t1");

    const upd = prisma.clientPowerOfAttorney.update.mock.calls[0][0];
    expect(upd.where).toEqual({ id: "poa-existing" });
    expect(upd.data).toEqual({ notaryCity: "İSTANBUL" }); // poaNumber EZİLMEZ
  });

  it("farklı tarih → idempotency tetiklenmez, YENİ kayıt açılır", async () => {
    const { svc, prisma } = build([
      { id: "poa-existing", notaryName: "BÜLENT ÖVEN", dateIssued: new Date("2026-01-12") },
    ]);

    await svc.create({ ...baseDto, dateIssued: new Date("2026-02-01") } as any, "t1");

    expect(prisma.clientPowerOfAttorney.create).toHaveBeenCalled();
  });

  it("anahtar eksik (noter yok) → güvenli taraf: YENİ kayıt açılır", async () => {
    const { svc, prisma } = build([]);

    await svc.create({ clientId: "cli1", dateIssued: new Date("2026-01-12") } as any, "t1");

    expect(prisma.clientPowerOfAttorney.create).toHaveBeenCalled();
    expect(prisma.clientPowerOfAttorney.findMany).not.toHaveBeenCalled(); // dedupe sorgusu bile çalışmaz
  });

  it("hiç aktif POA yok → YENİ kayıt açılır", async () => {
    const { svc, prisma } = build([]);

    await svc.create(baseDto as any, "t1");

    expect(prisma.clientPowerOfAttorney.create).toHaveBeenCalled();
  });
});

describe("PoaService.create — suppress lawyer reconcile (Fix E)", () => {
  const build = (activePoas: any[], opts: any = {}) => {
    const prisma: any = {
      client: { findFirst: jest.fn().mockResolvedValue({ id: "cli1", displayName: "ŞÜKRÜ AKDOĞAN" }) },
      clientPowerOfAttorney: {
        findMany: jest.fn().mockResolvedValue(activePoas),
        findFirst: jest.fn().mockImplementation(({ where }) => Promise.resolve({ id: where.id })),
        create: jest.fn().mockImplementation((a) => Promise.resolve({ id: "new1", ...a.data })),
        update: jest.fn().mockResolvedValue({}),
      },
      poaLawyer: {
        createMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue(opts.existingLinks ?? []),
      },
      lawyer: { findMany: jest.fn().mockResolvedValue(opts.validLawyers ?? []) },
    };
    return { svc: new PoaService(prisma), prisma };
  };

  const dupDto = { clientId: "cli1", notaryName: "BÜLENT ÖVEN", dateIssued: new Date("2026-01-12") };
  const activeMatch = [{ id: "poa-existing", notaryName: "BÜLENT ÖVEN", dateIssued: new Date("2026-01-12") }];

  it("1) duplicate POA + yeni lawyerIds → eksik PoaLawyer eklenir (ilk=primary, skipDuplicates)", async () => {
    const { svc, prisma } = build(activeMatch, { existingLinks: [], validLawyers: [{ id: "law1" }, { id: "law2" }] });
    const res = await svc.create({ ...dupDto, lawyerIds: ["law1", "law2"] }, "t1");
    expect(res._suppressedDuplicate).toBe(true);
    expect(prisma.clientPowerOfAttorney.create).not.toHaveBeenCalled();
    expect(prisma.poaLawyer.createMany).toHaveBeenCalledTimes(1);
    const arg = prisma.poaLawyer.createMany.mock.calls[0][0];
    expect(arg.skipDuplicates).toBe(true);
    expect(arg.data).toEqual([
      { poaId: "poa-existing", lawyerId: "law1", isPrimary: true },
      { poaId: "poa-existing", lawyerId: "law2", isPrimary: false },
    ]);
  });

  it("2) duplicate POA + zaten bağlı lawyerIds → createMany ÇAĞRILMAZ (duplicate yok)", async () => {
    const { svc, prisma } = build(activeMatch, { existingLinks: [{ lawyerId: "law1", isPrimary: true }], validLawyers: [{ id: "law1" }] });
    await svc.create({ ...dupDto, lawyerIds: ["law1"] }, "t1");
    expect(prisma.poaLawyer.createMany).not.toHaveBeenCalled();
    expect(prisma.lawyer.findMany).not.toHaveBeenCalled();
  });

  it("3) empty lawyerIds → NO-OP", async () => {
    const { svc, prisma } = build(activeMatch);
    await svc.create({ ...dupDto, lawyerIds: [] }, "t1");
    expect(prisma.poaLawyer.findMany).not.toHaveBeenCalled();
    expect(prisma.poaLawyer.createMany).not.toHaveBeenCalled();
  });

  it("3b) lawyerIds undefined → NO-OP", async () => {
    const { svc, prisma } = build(activeMatch);
    await svc.create({ ...dupDto }, "t1");
    expect(prisma.poaLawyer.findMany).not.toHaveBeenCalled();
    expect(prisma.poaLawyer.createMany).not.toHaveBeenCalled();
  });

  it("4) cross-tenant/invalid lawyerId → eklenmez, suppress PATLAMAZ", async () => {
    const { svc, prisma } = build(activeMatch, { existingLinks: [], validLawyers: [{ id: "law1" }] });
    const res = await svc.create({ ...dupDto, lawyerIds: ["law1", "foreign"] }, "t1");
    expect(res._suppressedDuplicate).toBe(true);
    const arg = prisma.poaLawyer.createMany.mock.calls[0][0];
    expect(arg.data).toEqual([{ poaId: "poa-existing", lawyerId: "law1", isPrimary: true }]);
  });

  it("4b) hepsi cross-tenant → createMany çağrılmaz, suppress döner (throw yok)", async () => {
    const { svc, prisma } = build(activeMatch, { existingLinks: [], validLawyers: [] });
    const res = await svc.create({ ...dupDto, lawyerIds: ["foreign"] }, "t1");
    expect(res._suppressedDuplicate).toBe(true);
    expect(prisma.poaLawyer.createMany).not.toHaveBeenCalled();
  });

  it("5) mevcut bağ varsa yeni eklenen primary OLMAZ", async () => {
    const { svc, prisma } = build(activeMatch, { existingLinks: [{ lawyerId: "lawX", isPrimary: true }], validLawyers: [{ id: "law2" }] });
    await svc.create({ ...dupDto, lawyerIds: ["law2"] }, "t1");
    const arg = prisma.poaLawyer.createMany.mock.calls[0][0];
    expect(arg.data).toEqual([{ poaId: "poa-existing", lawyerId: "law2", isPrimary: false }]);
  });
});
