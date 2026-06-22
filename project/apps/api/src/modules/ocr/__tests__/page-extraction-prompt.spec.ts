/**
 * B-PR — Çek tarih semantiği prompt fix (PAGE_EXTRACTION_PROMPT).
 *
 * ⚠️ SINIR: Prompt'un AI ÜZERİNDEKİ etkisi burada test EDİLEMEZ (AI mock'lu, non-deterministik) —
 * bu test yalnız KURALLARIN PROMPT METNİNDE BULUNDUĞUNU doğrular (string/snapshot). Asıl doğrulama
 * = CANLI Gorka re-scan (PR gövdesinde). Bu yüzden burada davranış değil, sözleşme (kuralların varlığı) test edilir.
 */
import {
  PAGE_EXTRACTION_PROMPT,
  extractPageCandidate,
  capConfidenceForPrintDateAmbiguity,
  PageAiExtractor,
} from "../page-candidate-extractor";
import { Page } from "../pdf-segmentation";

const P = PAGE_EXTRACTION_PROMPT;
// Türkçe-güvenli küçük harf: İ→i, I→ı ÖNCE (yoksa "KEŞİDE".toLowerCase() = "keşi̇de" combining-dot tuzağı).
const lower = P.replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase();

describe("PAGE_EXTRACTION_PROMPT — çek tarih semantiği kuralları mevcut", () => {
  it("çek/keşide/vade kuralları yazılı", () => {
    expect(P).toContain("ÇEK");
    expect(lower).toContain("vade yoktur"); // çekte vade yok
    expect(lower).toContain("keşide");
  });

  it("issueDate = çek keşide; dueDate çekte vade DEĞİL", () => {
    expect(P).toContain("issueDate");
    expect(P).toContain("dueDate");
    // issueDate çekte keşide tarihi olarak tanımlı
    expect(lower).toContain("keşide tarihi");
  });

  it("basım/baskı/print tarihi DIŞLANIR (issueDate'e DE dueDate'e DE yazılmaz)", () => {
    expect(lower).toContain("basım");
    expect(lower).toContain("baskı");
    expect(lower).toContain("print date");
    expect(lower).toContain("dışla"); // basım tarihini dışla
    expect(lower).toContain("yazma"); // hiçbir alana yazma
  });

  it("keşide tarihi 'keşide yeri / tarih' alanından alınır (alan önceliği)", () => {
    expect(lower).toContain("keşide yeri");
  });

  it("B1: çek için dueDate BOŞ/null (vade yok); ikinci tarih ARTIK saklanmaz", () => {
    expect(lower).toContain("boş/null");
    // B2 kalıntısı OLMAMALI — artık basım/ikinci tarihi dueDate'te saklamıyoruz
    expect(lower).not.toContain("korunan ikinci tarih");
  });

  it("bono/senet/poliçe vade kuralı KORUNUR (regresyon koruması)", () => {
    expect(P).toContain("BONO/SENET/POLİÇE");
    // bu türlerde dueDate = VADE
    expect(P).toContain("VADE tarihi");
  });
});

describe("PR-3 PAGE_EXTRACTION_PROMPT — keşideci kimlik no (drawerIdentityNo) kuralı mevcut", () => {
  it("drawerIdentityNo JSON şemasında alan olarak var", () => {
    expect(P).toContain("drawerIdentityNo");
  });
  it("VKN(10 hane)/TCKN(11 hane) ayrımı yazılı", () => {
    expect(P).toContain("VKN");
    expect(P).toContain("TCKN");
    expect(P).toContain("10 hane");
    expect(P).toContain("11 hane");
  });
  it("IBAN/hesap/çek seri no karıştırma yasağı + UYDURMA yasağı (KVKK)", () => {
    expect(P).toContain("IBAN");
    expect(P).toContain("UYDURMA");
  });
});

describe("G1 PAGE_EXTRACTION_PROMPT — FATURA kuralı + alanlar mevcut", () => {
  it("FATURA KURALI yazılı (alıcı=borçlu, satıcı=alacaklı)", () => {
    expect(P).toContain("FATURA KURALI");
    expect(P).toContain("ALICI");
    expect(P).toContain("SATICI");
  });
  it("creditorName/creditorIdentityNo/kdvRate/kdvAmount JSON şemasında", () => {
    expect(P).toContain("creditorName");
    expect(P).toContain("creditorIdentityNo");
    expect(P).toContain("kdvRate");
    expect(P).toContain("kdvAmount");
  });
});

describe("B (deterministik enforcement) — capConfidenceForPrintDateAmbiguity (0-100; tavan 45)", () => {
  it("ÇEK + evidenceText'te basım → güven tavanlanır (Math.min → 45)", () => {
    expect(capConfidenceForPrintDateAmbiguity("CEK", "basım tarihi görüldü; keşide belirsiz", 90)).toBe(45);
  });

  it("baskı / print izi de yakalanır", () => {
    expect(capConfidenceForPrintDateAmbiguity("CEK", "baskı tarihi 2019", 95)).toBe(45);
    expect(capConfidenceForPrintDateAmbiguity("CEK", "print date 2019", 80)).toBe(45);
  });

  it("mevcut güven zaten <=45 ise KORUNUR (Math.min yükseltmez)", () => {
    expect(capConfidenceForPrintDateAmbiguity("CEK", "basım tarihi", 30)).toBe(30);
  });

  it("iz YOKSA güven AYNEN (happy-path değişmez)", () => {
    expect(capConfidenceForPrintDateAmbiguity("CEK", "keşide yeri/tarih net", 90)).toBe(90);
    expect(capConfidenceForPrintDateAmbiguity("CEK", undefined, 90)).toBe(90);
  });

  it("ÇEK DIŞI (SENET/FATURA/undefined) → tavan UYGULANMAZ (yalnız çek semantiği)", () => {
    expect(capConfidenceForPrintDateAmbiguity("SENET", "basım tarihi", 90)).toBe(90);
    expect(capConfidenceForPrintDateAmbiguity("FATURA", "basım tarihi", 90)).toBe(90);
    expect(capConfidenceForPrintDateAmbiguity(undefined, "basım tarihi", 90)).toBe(90);
  });
});

describe("B — extractPageCandidate confidence tavan entegrasyonu (issueDate'e DOKUNMADAN)", () => {
  const textPage = (text: string): Page => ({
    pageIndex: 1,
    kind: "TEXT",
    text,
    hasText: true,
    needsImageExtraction: false,
    source: "text",
  });

  it("ÇEK + AI basım notu + yüksek güven → candidate.confidence=45; issueDate KORUNUR", async () => {
    const aiExtract: PageAiExtractor = async () => ({
      documentType: "CEK",
      issueDate: "2025-12-30",
      evidenceText: "basım tarihi görüldü; keşide belirsiz",
      confidence: 92,
    });
    const cand = await extractPageCandidate(textPage("... çek ..."), { aiExtract });
    expect(cand.confidence).toBe(45); // deterministik tavan
    expect(cand.issueDate).toBe("2025-12-30"); // SINIR: issueDate'e DOKUNULMAZ
  });

  it("ÇEK + basım izi YOK → güven AYNEN (davranış-nötr)", async () => {
    const aiExtract: PageAiExtractor = async () => ({
      documentType: "CEK",
      issueDate: "2025-12-30",
      evidenceText: "keşide yeri/tarih net",
      confidence: 92,
    });
    const cand = await extractPageCandidate(textPage("... çek ..."), { aiExtract });
    expect(cand.confidence).toBe(92);
  });
});
