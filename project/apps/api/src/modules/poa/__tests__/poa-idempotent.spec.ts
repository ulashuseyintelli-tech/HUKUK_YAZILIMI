/**
 * PR-2 — POA semantik idempotency (tarama kaynaklı mükerrer vekalet bastırma).
 * Anahtar: clientId + normalizedNotaryName + dateIssued (aktif). poaNumber/yevmiyeNo OCR-gürültülü,
 * anahtar DEĞİL. Eşleşme varsa yeni kayıt AÇILMAZ, mevcut aktif döner; boş alan zenginleşir, dolu ezilmez.
 */

import { PoaService, normalizeNotaryName, sameIssueDay, buildPoaEnrichment } from "../poa.service";

describe("normalizeNotaryName", () => {
  it("trim + tek boşluk + TR upper", () => {
    expect(normalizeNotaryName("  bülent   öven ")).toBe("BÜLENT ÖVEN");
    expect(normalizeNotaryName("BÜLENT ÖVEN")).toBe("BÜLENT ÖVEN");
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
