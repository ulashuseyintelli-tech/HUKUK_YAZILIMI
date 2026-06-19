/**
 * Fix B: Vekaletname OCR → Lawyer eşleştirme (tarama anında doğru PoaLawyer bağı).
 * Forensic: Şükrü Akdoğan'ın aktif POA'sı avukatsız oluşmuştu çünkü eski eşleştirme
 * name="ULAŞ HÜSEYİN" + surname="TELLİ" kaydını OCR "Ulaş Hüseyin Telli" ile
 * eşleştiremiyordu (ad bölme + TR büyük/küçük). Merkez test: tam o vaka.
 */

import { describe, it, expect } from "vitest";
import {
  normalizePersonName,
  nameMatchKey,
  resolveLawyerIdsFromScan,
  type LawyerRecord,
} from "@/lib/lawyer-match";

describe("normalizePersonName / nameMatchKey", () => {
  it("TR diakritik + büyük/küçük: ad ve (ad,soyad) aynı anahtara iner", () => {
    // Şükrü forensic'inin tam çekirdeği
    expect(nameMatchKey("Ulaş Hüseyin Telli")).toBe("ULAS HUSEYIN TELLI");
    expect(nameMatchKey("ULAŞ HÜSEYİN", "TELLİ")).toBe("ULAS HUSEYIN TELLI");
    expect(nameMatchKey("Ulaş Hüseyin Telli")).toBe(nameMatchKey("ULAŞ HÜSEYİN", "TELLİ"));
  });

  it("noktasız/noktalı i (İ/ı) tutarlı foldlanır", () => {
    expect(normalizePersonName("İlksen", "Işık")).toBe("ILKSEN ISIK");
    expect(nameMatchKey("Fatma Uluca Telli")).toBe(nameMatchKey("FATMA", "ULUCA TELLİ"));
  });

  it('baştaki unvan ("Av.", "Avukat", "Stj. Av.") temizlenir', () => {
    expect(nameMatchKey("Av. Ulaş Telli")).toBe("ULAS TELLI");
    expect(nameMatchKey("Avukat Ulaş Telli")).toBe("ULAS TELLI");
    expect(nameMatchKey("Stj. Av. Ulaş Telli")).toBe("ULAS TELLI");
    expect(nameMatchKey("Ulaş Telli")).toBe("ULAS TELLI");
  });

  it("unvan tüm ad değilse hepsini silmez (en az 1 token kalır)", () => {
    expect(nameMatchKey("Av.")).toBe("AV");
  });
});

// Gerçek Şükrü vakasını taklit eden avukat kümesi (DB'den): kanonik Ulaş/Fatma +
// kirli (tckn/baro BOŞ) mükerrer "ulaş telli" kayıtları.
const CANONICAL_ULAS: LawyerRecord = {
  id: "cmqec04r20001l8xd2gj5qm45",
  name: "ULAŞ HÜSEYİN",
  surname: "TELLİ",
  tckn: "37405957684",
  barNumber: "34851",
  isActive: true,
  createdAt: "2026-06-01T00:00:00.000Z",
};
const CANONICAL_FATMA: LawyerRecord = {
  id: "cmqec6p3m0003l8xdob6us1xi",
  name: "FATMA",
  surname: "ULUCA TELLİ",
  tckn: "45706890548",
  barNumber: null,
  isActive: true,
  createdAt: "2026-06-01T00:00:00.000Z",
};
const POLLUTED_ULAS_1: LawyerRecord = {
  id: "cmqh6bn4z0001ji201ya51k09",
  name: "ulaş",
  surname: "telli",
  tckn: null,
  barNumber: null,
  isActive: true,
  createdAt: "2026-06-18T00:00:00.000Z",
};
const POLLUTED_ULAS_2: LawyerRecord = {
  id: "cmqh0ju7j0001wq1i4eeu3fy0",
  name: "ulaş hüseyin",
  surname: "telli",
  tckn: null,
  barNumber: null,
  isActive: true,
  createdAt: "2026-06-18T00:00:00.000Z",
};
const EGE: LawyerRecord = {
  id: "cmqfccvme0001zwm1lpmmg48u",
  name: "EGE",
  surname: "DURUSOY",
  tckn: null,
  barNumber: null,
  isActive: true,
  createdAt: "2026-06-10T00:00:00.000Z",
};

describe("resolveLawyerIdsFromScan — gerçek Şükrü vakası", () => {
  const lawyers = [POLLUTED_ULAS_2, CANONICAL_ULAS, POLLUTED_ULAS_1, EGE, CANONICAL_FATMA];

  it("OCR çoklu vekil tam adıyla → kanonik Ulaş ve Fatma id'leri", () => {
    const scan = {
      lawyers: [{ name: "Ulaş Hüseyin Telli" }, { name: "Fatma Uluca Telli" }],
    };
    const ids = resolveLawyerIdsFromScan(scan, lawyers);
    expect(ids).toContain(CANONICAL_ULAS.id);
    expect(ids).toContain(CANONICAL_FATMA.id);
    // kirli duplicate'ler SEÇİLMEZ
    expect(ids).not.toContain(POLLUTED_ULAS_1.id);
    expect(ids).not.toContain(POLLUTED_ULAS_2.id);
    expect(ids).toHaveLength(2);
  });

  it("eski kodun patladığı nokta: 2-kelime name alanı yine de eşleşir", () => {
    const ids = resolveLawyerIdsFromScan({ lawyers: [{ name: "Ulaş Hüseyin Telli" }] }, lawyers);
    expect(ids).toEqual([CANONICAL_ULAS.id]);
  });
});

describe("resolveLawyerIdsFromScan — kanonik tercih ve sinyaller", () => {
  it("mükerrerde tckn/baro DOLU olan kanonik kazanır", () => {
    const ids = resolveLawyerIdsFromScan(
      { lawyers: [{ name: "Ulaş Hüseyin Telli" }] },
      [POLLUTED_ULAS_1, POLLUTED_ULAS_2, CANONICAL_ULAS],
    );
    expect(ids).toEqual([CANONICAL_ULAS.id]);
  });

  it("TCKN sinyali ada bakmadan eşleşir (OCR barNumber'a TCKN koymuş)", () => {
    const ids = resolveLawyerIdsFromScan(
      { lawyers: [{ name: "Yanlış İsim", barNumber: "37405957684" }] },
      [CANONICAL_ULAS, CANONICAL_FATMA],
    );
    expect(ids).toEqual([CANONICAL_ULAS.id]);
  });

  it("baro sicil no sinyali eşleşir", () => {
    const ids = resolveLawyerIdsFromScan(
      { lawyers: [{ name: "Farklı", barNumber: "34851" }] },
      [CANONICAL_ULAS, CANONICAL_FATMA],
    );
    expect(ids).toEqual([CANONICAL_ULAS.id]);
  });

  it("tekil lawyerName fallback (lawyers[] yok) → çözülür", () => {
    const ids = resolveLawyerIdsFromScan({ lawyerName: "Fatma Uluca Telli" }, [CANONICAL_ULAS, CANONICAL_FATMA]);
    expect(ids).toEqual([CANONICAL_FATMA.id]);
  });

  it("tekil lawyerBarNumber fallback → çözülür", () => {
    const ids = resolveLawyerIdsFromScan({ lawyerBarNumber: "37405957684" }, [CANONICAL_ULAS, CANONICAL_FATMA]);
    expect(ids).toEqual([CANONICAL_ULAS.id]);
  });

  it("eşleşme yoksa boş dizi (bugünkü davranışla aynı)", () => {
    const ids = resolveLawyerIdsFromScan({ lawyers: [{ name: "Kimse Yok" }] }, [CANONICAL_ULAS]);
    expect(ids).toEqual([]);
  });

  it("hiç avukat sinyali yoksa boş dizi", () => {
    expect(resolveLawyerIdsFromScan({}, [CANONICAL_ULAS])).toEqual([]);
    expect(resolveLawyerIdsFromScan({ lawyers: [] }, [CANONICAL_ULAS])).toEqual([]);
  });

  it("aynı avukat iki adaydan eşleşirse id tek kez döner", () => {
    const ids = resolveLawyerIdsFromScan(
      { lawyers: [{ name: "Ulaş Hüseyin Telli" }, { name: "Av. Ulaş Hüseyin Telli" }] },
      [CANONICAL_ULAS],
    );
    expect(ids).toEqual([CANONICAL_ULAS.id]);
  });

  it("eşit-kanonik iki kayıtta deterministik: en eski createdAt", () => {
    const older: LawyerRecord = { id: "z_old", name: "Ali", surname: "Veli", tckn: "11111111111", createdAt: "2026-01-01T00:00:00.000Z" };
    const newer: LawyerRecord = { id: "a_new", name: "Ali", surname: "Veli", tckn: "22222222222", createdAt: "2026-05-01T00:00:00.000Z" };
    const ids = resolveLawyerIdsFromScan({ lawyers: [{ name: "Ali Veli" }] }, [newer, older]);
    expect(ids).toEqual([older.id]);
  });

  it("aktif kayıt pasiften önce gelir", () => {
    const passive: LawyerRecord = { id: "p", name: "Ali", surname: "Veli", barNumber: "100", isActive: false, createdAt: "2026-01-01T00:00:00.000Z" };
    const active: LawyerRecord = { id: "a", name: "Ali", surname: "Veli", barNumber: "200", isActive: true, createdAt: "2026-02-01T00:00:00.000Z" };
    const ids = resolveLawyerIdsFromScan({ lawyers: [{ name: "Ali Veli" }] }, [passive, active]);
    expect(ids).toEqual([active.id]);
  });
});
