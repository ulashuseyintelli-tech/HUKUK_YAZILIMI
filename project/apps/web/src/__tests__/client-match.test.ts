// P4-2 clientMatch unit testleri (vitest). SAF deterministik — Gorka/Şükrü GERÇEK canlı verisi dahil.
import { describe, it, expect } from "vitest";
import {
  computeClientMatch,
  matchClientToInstrument,
  stripCompanySuffix,
  matchClientToParty,
  isReliableMatch,
  isSelectedClientParty,
  clientAnchorWarning,
} from "../lib/client-match";
import type { Instrument } from "../components/debtor/ocr-instrument";

// Gorka çek 1 — P4-1 canlı taramasından gerçek veri (endorsementNames'te banka GÜRÜLTÜSÜ var).
const gorkaCheck1: Instrument = {
  type: "CEK",
  currency: "TRY",
  confidence: 95,
  drawerName: "Gorka Kozmetik Sanayi ve Ticaret Anonim Şirketi",
  amount: 400000,
  documentNo: "0265897",
  issueDate: "2025-12-30",
  endorsementNames: ["Şükrü Akdoğan", "T.C. Ziraat Bankası A.Ş."],
  sourcePages: [1, 2],
};

const cek = (over: Partial<Instrument> = {}): Instrument => ({ type: "CEK", currency: "TRY", confidence: 90, ...over });

describe("computeClientMatch — Gorka/Şükrü gerçek veri", () => {
  it("Şükrü ENDORSEMENT/EXACT bulunur; banka gürültüsü elenir", () => {
    const r = computeClientMatch(gorkaCheck1, [{ name: "Şükrü Akdoğan" }]);
    expect(r.primaryMatch?.found).toBe(true);
    expect(r.primaryMatch?.location).toBe("ENDORSEMENT");
    expect(r.primaryMatch?.matchType).toBe("EXACT");
    expect(r.primaryMatch?.matchedField).toBe("endorsementNames");
    expect(r.primaryMatch?.matchedValue).toBe("Şükrü Akdoğan"); // banka DEĞİL
    expect(r.allMatches).toHaveLength(1);
  });

  it("müvekkil = keşideci (Gorka) → FRONT_DRAWER", () => {
    const r = computeClientMatch(gorkaCheck1, [{ name: "Gorka Kozmetik Sanayi ve Ticaret Anonim Şirketi" }]);
    expect(r.primaryMatch?.location).toBe("FRONT_DRAWER");
    expect(r.primaryMatch?.matchType).toBe("EXACT");
    expect(r.primaryMatch?.matchedField).toBe("drawerName");
  });

  it("müvekkil hiçbir yerde → NOT_FOUND (primaryMatch null)", () => {
    const r = computeClientMatch(gorkaCheck1, [{ name: "Ahmet Yılmaz" }]);
    expect(r.primaryMatch).toBeNull();
    expect(r.allMatches[0].found).toBe(false);
    expect(r.allMatches[0].location).toBe("NOT_FOUND");
  });
});

describe("matchType etiketleri", () => {
  it("kimlik override: identityNo değer metninde geçerse IDENTITY (isim farkı önemsiz)", () => {
    const inst = cek({ endorsementNames: ["Şükrü Akdoğan 4029495552"] });
    const r = computeClientMatch(inst, [{ name: "Tamamen Farklı İsim", identityNo: "4029495552" }]);
    expect(r.primaryMatch?.location).toBe("ENDORSEMENT");
    expect(r.primaryMatch?.matchType).toBe("IDENTITY");
  });

  it("şirket-eki: müvekkil 'Gorka Kozmetik A.Ş.' ↔ keşideci 'Gorka Kozmetik' → SUFFIX", () => {
    const inst = cek({ drawerName: "Gorka Kozmetik" });
    const r = computeClientMatch(inst, [{ name: "Gorka Kozmetik A.Ş." }]);
    expect(r.primaryMatch?.location).toBe("FRONT_DRAWER");
    expect(r.primaryMatch?.matchType).toBe("SUFFIX");
  });

  it("Türkçe İ/ı: küçük/büyük harf EXACT eşleşir", () => {
    const inst = cek({ endorsementNames: ["ŞÜKRÜ AKDOĞAN"] });
    const r = computeClientMatch(inst, [{ name: "şükrü akdoğan" }]);
    expect(r.primaryMatch?.matchType).toBe("EXACT");
    expect(r.primaryMatch?.location).toBe("ENDORSEMENT");
  });

  it("payeeName eşleşmesi → FRONT_PAYEE", () => {
    const inst = cek({ payeeName: "Şükrü Akdoğan" });
    const r = computeClientMatch(inst, [{ name: "Şükrü Akdoğan" }]);
    expect(r.primaryMatch?.location).toBe("FRONT_PAYEE");
    expect(r.primaryMatch?.matchType).toBe("EXACT");
  });
});

describe("çoklu müvekkil", () => {
  it("her selectedClient ayrı; allMatches hepsini tutar; primaryMatch ilk found", () => {
    const r = computeClientMatch(gorkaCheck1, [{ name: "Ahmet Yılmaz" }, { name: "Şükrü Akdoğan" }]);
    expect(r.allMatches).toHaveLength(2);
    expect(r.allMatches[0].found).toBe(false); // Ahmet
    expect(r.allMatches[1].found).toBe(true); // Şükrü
    expect(r.primaryMatch?.client.name).toBe("Şükrü Akdoğan");
    expect(r.primaryMatch?.location).toBe("ENDORSEMENT");
  });
});

describe("kenar durumlar", () => {
  it("boş selectedClients → primaryMatch null, allMatches []", () => {
    const r = computeClientMatch(gorkaCheck1, []);
    expect(r.primaryMatch).toBeNull();
    expect(r.allMatches).toEqual([]);
  });

  it("endorsementNames yok + diğer alanlar eşleşmiyor → NOT_FOUND, crash yok", () => {
    const r = computeClientMatch(cek({ drawerName: "Başka Şirket" }), [{ name: "Şükrü Akdoğan" }]);
    expect(r.primaryMatch).toBeNull();
  });

  it("alan sırası: drawer ile payee ikisi de eşleşse drawer öncelikli (location FRONT_DRAWER)", () => {
    const inst = cek({ drawerName: "Şükrü Akdoğan", payeeName: "Şükrü Akdoğan" });
    expect(matchClientToInstrument({ name: "Şükrü Akdoğan" }, inst).location).toBe("FRONT_DRAWER");
  });
});

describe("A1-a isReliableMatch", () => {
  it("yalnız IDENTITY/EXACT güvenilir; SUFFIX/NONE zayıf", () => {
    expect(isReliableMatch("IDENTITY")).toBe(true);
    expect(isReliableMatch("EXACT")).toBe(true);
    expect(isReliableMatch("SUFFIX")).toBe(false);
    expect(isReliableMatch("NONE")).toBe(false);
  });
});

describe("A1-a matchClientToParty (party name+identityNo ↔ müvekkil; payee'ye bakmaz)", () => {
  it("yapısal identityNo eşit (10+ hane) → IDENTITY (isim farkı önemsiz)", () => {
    const m = matchClientToParty({ name: "Farklı Yazım A.Ş.", identityNo: "3961146289" }, [{ name: "Gorka", identityNo: "3961146289" }]);
    expect(m?.matchType).toBe("IDENTITY");
  });
  it("isim EXACT (Türkçe case-insensitive) → EXACT", () => {
    const m = matchClientToParty({ name: "ŞÜKRÜ AKDOĞAN" }, [{ name: "şükrü akdoğan" }]);
    expect(m?.matchType).toBe("EXACT");
  });
  it("şirket-eki farkı → SUFFIX", () => {
    const m = matchClientToParty({ name: "Gorka Kozmetik" }, [{ name: "Gorka Kozmetik A.Ş." }]);
    expect(m?.matchType).toBe("SUFFIX");
  });
  it("eşleşme yok → null", () => {
    expect(matchClientToParty({ name: "GORKA KOZMETİK A.Ş.", identityNo: "3961146289" }, [{ name: "Şükrü Akdoğan" }])).toBeNull();
  });
  it("müvekkil yok → null", () => {
    expect(matchClientToParty({ name: "Herhangi" }, [])).toBeNull();
  });
  it("geçersiz/kısa kimlik (10 hane altı) eşitliği IDENTITY SAYILMAZ → isme düşer", () => {
    // 9 hane: identity sayılmaz; isim de eşleşmiyor → null
    expect(matchClientToParty({ name: "A", identityNo: "123456789" }, [{ name: "B", identityNo: "123456789" }])).toBeNull();
  });
});

describe("A1-a isSelectedClientParty (gate: yalnız GÜVENİLİR eşleşme)", () => {
  it("IDENTITY eşleşme → true (borçlu adayı yapılmaz)", () => {
    expect(isSelectedClientParty({ name: "X", identityNo: "3961146289" }, [{ name: "Y", identityNo: "3961146289" }])).toBe(true);
  });
  it("EXACT isim → true", () => {
    expect(isSelectedClientParty({ name: "Şükrü Akdoğan" }, [{ name: "şükrü akdoğan" }])).toBe(true);
  });
  it("yalnız SUFFIX → false (zayıf; gate yanlış borçlu düşürmez)", () => {
    expect(isSelectedClientParty({ name: "Gorka Kozmetik" }, [{ name: "Gorka Kozmetik A.Ş." }])).toBe(false);
  });
  it("Gorka (borçlu/COMPANY+VKN) ↔ müvekkil Şükrü → false (gate Gorka'yı DÜŞÜRMEZ)", () => {
    expect(isSelectedClientParty({ name: "GORKA KOZMETİK SANAYİ VE TİCARET ANONİM ŞİRKETİ", identityNo: "3961146289" }, [{ name: "Şükrü Akdoğan" }])).toBe(false);
  });
});

describe("A1-a clientAnchorWarning (non-blocking)", () => {
  const sukru = [{ name: "Şükrü Akdoğan" }];
  it("müvekkil yok → null (uyarı yok)", () => {
    expect(clientAnchorWarning([{ name: "GORKA", identityNo: "3961146289" }], [], [])).toBeNull();
  });
  it("Gorka senaryosu: müvekkil CİRODA (endorsement) bulunur → uyarı YOK (anchored)", () => {
    // parties = sadece Gorka; instrument-eşleşmesi Şükrü'yü endorsement/EXACT bulur → reliable → uyarı null
    const instr = [computeClientMatch(gorkaCheck1, sukru)];
    expect(clientAnchorWarning([{ name: "GORKA", identityNo: "3961146289" }], instr, sukru)).toBeNull();
  });
  it("müvekkil party olarak güvenilir eşleşirse → uyarı YOK", () => {
    expect(clientAnchorWarning([{ name: "Şükrü Akdoğan" }], [], sukru)).toBeNull();
  });
  it("hiçbir yerde güvenilir eşleşme yok → NET UYARI (takip bloklanmaz)", () => {
    const instr = [computeClientMatch(cek({ drawerName: "Başka Şirket" }), sukru)];
    const w = clientAnchorWarning([{ name: "GORKA", identityNo: "3961146289" }], instr, sukru);
    expect(w).toContain("güvenilir");
  });
});

describe("stripCompanySuffix (nameMatchKey-normalize sonrası UPPER ASCII)", () => {
  it("legal-form eklerini sadeleştirir, tanımlayıcı kelimeleri KORUR", () => {
    expect(stripCompanySuffix("GORKA KOZMETIK A S")).toBe("GORKA KOZMETIK");
    expect(stripCompanySuffix("X ANONIM SIRKETI")).toBe("X");
    expect(stripCompanySuffix("Y LTD STI")).toBe("Y");
    // tanımlayıcı kelimeler korunur (SANAYI VE TICARET strip EDİLMEZ) — bilinen sınır
    expect(stripCompanySuffix("GORKA KOZMETIK SANAYI VE TICARET ANONIM SIRKETI")).toBe("GORKA KOZMETIK SANAYI VE TICARET");
  });
});
