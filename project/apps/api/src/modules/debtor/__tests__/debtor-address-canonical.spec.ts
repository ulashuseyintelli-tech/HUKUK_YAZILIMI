/**
 * PR-D5-a — deprecated addressType/isMernis → kanonik type/source eşleme (N-a) + addAddress yazımı.
 * Frontend addressType (EV/IS/TEBLIGAT/MERNIS/KEP) gönderir; backend kanonik type/source üretir.
 */

import { DebtorService, mapAddressTypeToCanonical, canonicalToAddressType } from "../debtor.service";

describe("mapAddressTypeToCanonical (N-a enum eşleme)", () => {
  it("EV→DECLARED, IS→BUSINESS_HQ, TEBLIGAT→DECLARED, KEP→KEP (source=USER_INPUT)", () => {
    expect(mapAddressTypeToCanonical("EV", false)).toEqual({ type: "DECLARED", source: "USER_INPUT" });
    expect(mapAddressTypeToCanonical("IS", false)).toEqual({ type: "BUSINESS_HQ", source: "USER_INPUT" });
    expect(mapAddressTypeToCanonical("TEBLIGAT", false)).toEqual({ type: "DECLARED", source: "USER_INPUT" });
    expect(mapAddressTypeToCanonical("KEP", false)).toEqual({ type: "KEP", source: "USER_INPUT" });
  });

  it("MERNIS veya isMernis=true → type=source=MERNIS", () => {
    expect(mapAddressTypeToCanonical("MERNIS", false)).toEqual({ type: "MERNIS", source: "MERNIS" });
    expect(mapAddressTypeToCanonical("EV", true)).toEqual({ type: "MERNIS", source: "MERNIS" });
    expect(mapAddressTypeToCanonical("TEBLIGAT", true)).toEqual({ type: "MERNIS", source: "MERNIS" });
  });

  it("bilinmeyen/boş → DECLARED fallback", () => {
    expect(mapAddressTypeToCanonical(undefined, false)).toEqual({ type: "DECLARED", source: "USER_INPUT" });
    expect(mapAddressTypeToCanonical("BILINMEYEN", false)).toEqual({ type: "DECLARED", source: "USER_INPUT" });
  });
});

describe("canonicalToAddressType (R-a ters eşleme — görüntüleme/init)", () => {
  it("DECLARED→TEBLIGAT, BUSINESS_HQ/BRANCH/LEGAL_CENTER→IS, MERNIS→MERNIS, KEP→KEP", () => {
    expect(canonicalToAddressType("DECLARED")).toBe("TEBLIGAT");
    expect(canonicalToAddressType("BUSINESS_HQ")).toBe("IS");
    expect(canonicalToAddressType("BUSINESS_BRANCH")).toBe("IS");
    expect(canonicalToAddressType("LEGAL_CENTER")).toBe("IS");
    expect(canonicalToAddressType("MERNIS")).toBe("MERNIS");
    expect(canonicalToAddressType("KEP")).toBe("KEP");
  });

  it("bilinmeyen/boş → TEBLIGAT fallback", () => {
    expect(canonicalToAddressType(undefined)).toBe("TEBLIGAT");
    expect(canonicalToAddressType(null)).toBe("TEBLIGAT");
    expect(canonicalToAddressType("XXX")).toBe("TEBLIGAT");
  });
});

describe("DebtorService.addAddress — kanonik type/source yazımı (PR-D5-a)", () => {
  const buildPrisma = () => ({
    debtor: { findFirst: jest.fn().mockResolvedValue({ id: "d1", debtorAddresses: [], estateHeirs: [], type: "INDIVIDUAL" }) },
    debtorAddress: {
      updateMany: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockImplementation((a: any) => Promise.resolve({ id: "a1", verified: false, ...a.data })),
    },
    task: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) },
  });

  it("IS adresi → DebtorAddress.type=BUSINESS_HQ + source=USER_INPUT (deprecated kolona YAZILMAZ — D5-final-1)", async () => {
    const prisma = buildPrisma() as any;
    const svc = new DebtorService(prisma);

    await svc.addAddress("t1", "d1", { addressType: "IS", street: "X Cd.", city: "İstanbul", isMernis: false } as any);

    const data = prisma.debtorAddress.create.mock.calls[0][0].data;
    expect(data.type).toBe("BUSINESS_HQ");
    expect(data.source).toBe("USER_INPUT");
    // D5-final-1: deprecated kolonlara artık yazım yok (bağımlılık kesildi)
    expect(data.addressType).toBeUndefined();
    expect(data.isMernis).toBeUndefined();
  });

  it("isMernis=true adresi → type=source=MERNIS", async () => {
    const prisma = buildPrisma() as any;
    const svc = new DebtorService(prisma);

    await svc.addAddress("t1", "d1", { addressType: "EV", street: "Y Sk.", city: "Ankara", isMernis: true } as any);

    const data = prisma.debtorAddress.create.mock.calls[0][0].data;
    expect(data.type).toBe("MERNIS");
    expect(data.source).toBe("MERNIS");
  });
});
