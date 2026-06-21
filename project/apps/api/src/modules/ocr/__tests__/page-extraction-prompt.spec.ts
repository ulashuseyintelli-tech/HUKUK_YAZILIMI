/**
 * B-PR — Çek tarih semantiği prompt fix (PAGE_EXTRACTION_PROMPT).
 *
 * ⚠️ SINIR: Prompt'un AI ÜZERİNDEKİ etkisi burada test EDİLEMEZ (AI mock'lu, non-deterministik) —
 * bu test yalnız KURALLARIN PROMPT METNİNDE BULUNDUĞUNU doğrular (string/snapshot). Asıl doğrulama
 * = CANLI Gorka re-scan (PR gövdesinde). Bu yüzden burada davranış değil, sözleşme (kuralların varlığı) test edilir.
 */
import { PAGE_EXTRACTION_PROMPT } from "../page-candidate-extractor";

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
