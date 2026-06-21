/**
 * PR-2b-2 — Page → PageCandidate (per-page AI/Vision aday üretimi).
 *
 * 🔴 KIRMIZI ÇİZGİ (üç katman):
 *  1) YAPISAL: TEK Page alır → TEK PageCandidate döner. AI çağrısına yalnız O SAYFANIN
 *     içeriği girer; başka sayfa GÖRÜNMEZ.
 *  2) PROMPT: anti-grouping (PAGE_EXTRACTION_PROMPT) — gruplama/sayma/önü-arkası kararı YASAK.
 *  3) ÇIKTI: tek nesne; gruplama alanı yok. Gruplama DETERMİNİSTİK motorda (PR-2a-1).
 *
 * SINIRLAR: AI gruplamaz/saymaz · scanDebtDocument wiring YOK (PR-2b-3) · grouping YOK ·
 *  gerçek AI unit-test'te YOK (mock) · IMAGE imageRef yoksa graceful düşük-güven ·
 *  AI throw → throw DIŞARI taşmaz · pageIndex 1-BASED korunur (AI'dan değil, Page'ten).
 */

import { Logger } from "@nestjs/common";
import { Page } from "./pdf-segmentation";
import { PageCandidate, InstrumentType, Currency } from "./debt-instrument.types";

const logger = new Logger("PageCandidateExtractor");

/**
 * Anti-grouping system prompt. AI yalnız BU sayfayı işler; gruplama/sayma yapmaz.
 */
export const PAGE_EXTRACTION_PROMPT = `Sen bir Türk icra hukuku belge analiz uzmanısın. Sana TEK BİR SAYFA verilecek.

KURALLAR (kesin):
- YALNIZ bu sayfada GÖRDÜĞÜNÜ çıkar. Başka sayfayla İLİŞKİLENDİRME/BİRLEŞTİRME yapma.
- KAÇ çek/senet/belge olduğunu SÖYLEME. Sayma yapma. Tek belge varmış gibi düşünme.
- Bu sayfanın başka bir belgenin önü/arkası olup olmadığına KARAR VERME. Sadece bu sayfada görünen sinyalleri işaretle.
- face = bu sayfa bir belge YÜZÜ gibi mi görünüyor (tutar/belge no/banka görünür).
  back = bu sayfa ARKA/ciro gibi mi görünüyor (ciro/imza/aval, tutar yok).
  Bunlar bu sayfanın KENDİ görünümüdür; "şu belgenin arkasıdır" DEME.

KİMLİK NO KURALI (keşideci/borçlu): Sayfada AÇIKÇA yazılıysa drawerIdentityNo'ya yaz —
  VERGİ KİMLİK NO (VKN) = 10 hane (tüzel kişi / şirket) · TC KİMLİK NO (TCKN) = 11 hane (gerçek kişi).
  Banka HESAP NO / IBAN / ÇEK SERİ NO / müşteri no / telefon DEĞİL. Görünmüyorsa BOŞ bırak — UYDURMA.

TARİH KURALLARI (belge türüne göre — ÇOK ÖNEMLİ):
- ÇEK: Çekte VADE YOKTUR (çek görüldüğünde ödenir). Çekin tek meşru tarihi KEŞİDE tarihidir.
  • issueDate = YALNIZ gerçek KEŞİDE tarihi. Çek için dueDate'i BOŞ/null bırak (çekte vade yok).
  • Keşide tarihi genellikle çekin SAĞ tarafındaki "keşide yeri / tarih" alanında bulunur — onu kullan.
  • "Basım tarihi / baskı tarihi / print date / basım" olarak etiketli tarihler KEŞİDE DEĞİLDİR → DIŞLA.
    Basım tarihini issueDate'e DE dueDate'e DE YAZMA (hiçbir alana koyma).
  • Tarih belirsizse: en olası keşideyi issueDate'e koy AMA confidence'ı DÜŞÜR ve evidenceText'e
    "basım tarihi görüldü / keşide tarihi belirsiz" notu ekle. Basım tarihini yine de hiçbir alana KOYMA.
- BONO/SENET/POLİÇE: issueDate = düzenleme tarihi; dueDate = VADE tarihi (mevcut anlam KORUNUR).
- FATURA/DIGER: gördüğün tarihleri uygun alana yaz.

FATURA KURALI (yalnız documentType=FATURA): Faturada İKİ taraf vardır —
  • ALICI (müşteri) = BORÇLU → drawerName + drawerIdentityNo (VKN/TCKN)
  • SATICI (düzenleyen) = ALACAKLI → creditorName + creditorIdentityNo (VKN)
  Tutarlar: amount = GENEL TOPLAM (KDV dahil) · kdvRate = KDV oranı (% sayı, ör. 20) · kdvAmount = KDV tutarı.
  Yalnız sayfada AÇIKÇA yazılanı al; net + KDV ≈ toplam tutmuyorsa KDV alanlarını BOŞ bırak (UYDURMA).
  Çek/senet/poliçede creditorName/creditorIdentityNo/kdvRate/kdvAmount BOŞ.

Yalnız bu sayfa için TEK JSON nesnesi döndür (dizi DEĞİL):
{
  "documentType": "CEK|SENET|POLICE|FATURA|DIGER",
  "documentNo": "bu sayfada görünüyorsa",
  "amount": 12345.67,
  "currency": "TRY|USD|EUR|GBP|CHF",
  "issueDate": "YYYY-MM-DD (ÇEK: yalnız KEŞİDE tarihi — basım tarihi DEĞİL · bono/senet/poliçe: düzenleme tarihi)",
  "dueDate": "YYYY-MM-DD (bono/senet/poliçe: VADE · ÇEK: BOŞ/null — çekte vade yok, basım tarihi de buraya yazılmaz)",
  "bankName": "...",
  "drawerName": "keşideci/borçlu adı (bu sayfada görünüyorsa)",
  "drawerIdentityNo": "keşidecinin VKN(10 hane) veya TCKN(11 hane) kimlik no'su — yalnız sayfada açıkça yazılıysa; IBAN/hesap/çek seri no DEĞİL; yoksa boş",
  "creditorName": "FATURA: alacaklı/satıcı adı (çek/senet'te boş)",
  "creditorIdentityNo": "FATURA: alacaklının VKN(10)/TCKN(11)'si — açıkça yazılıysa; yoksa boş",
  "kdvRate": "FATURA: KDV oranı (% sayı, ör. 20) — yazılıysa; yoksa boş",
  "kdvAmount": "FATURA: KDV tutarı (sayı) — yazılıysa; yoksa boş",
  "debtorCandidates": ["..."],
  "face": true,
  "back": false,
  "endorsementMarkers": true,
  "evidenceText": "bu sayfadan KISA kanıt alıntısı (tüm metin DEĞİL, en çok ~200 karakter)",
  "confidence": 0-100
}`;

export interface RawPageFields {
  documentType?: InstrumentType;
  documentNo?: string;
  amount?: number;
  currency?: Currency;
  issueDate?: string;
  dueDate?: string;
  bankName?: string;
  drawerName?: string;
  drawerIdentityNo?: string;
  debtorCandidates?: string[];
  creditorName?: string; // FATURA: alacaklı/satıcı
  creditorIdentityNo?: string; // FATURA: alacaklının VKN/TCKN'si
  kdvRate?: number; // FATURA: KDV oranı (%)
  kdvAmount?: number; // FATURA: KDV tutarı
  face?: boolean;
  back?: boolean;
  endorsementMarkers?: boolean;
  evidenceText?: string;
  confidence?: number;
}

export interface PageAiInput {
  kind: "text" | "vision";
  text?: string; // TEXT sayfa metni
  imageRef?: string; // IMAGE sayfa görüntü yolu
  prompt: string; // PAGE_EXTRACTION_PROMPT
}

/** AI/Vision çağrısı — TEK sayfa için ham alanlar. Test'te mock'lanır. */
export type PageAiExtractor = (input: PageAiInput) => Promise<RawPageFields>;

const EVIDENCE_MAX = 240; // evidenceText üst sınırı (kısa kanıt; tüm OCR DEĞİL)

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}

function mapRawToCandidate(page: Page, raw: RawPageFields): PageCandidate {
  return {
    pageIndex: page.pageIndex, // 1-BASED — AI'dan DEĞİL, Page'ten (güvenli)
    documentType: raw.documentType,
    documentNo: raw.documentNo,
    amount: raw.amount,
    currency: raw.currency,
    issueDate: raw.issueDate,
    dueDate: raw.dueDate,
    bankName: raw.bankName,
    drawerName: raw.drawerName,
    drawerIdentityNo: raw.drawerIdentityNo,
    debtorCandidates: raw.debtorCandidates,
    creditorName: raw.creditorName,
    creditorIdentityNo: raw.creditorIdentityNo,
    kdvRate: raw.kdvRate,
    kdvAmount: raw.kdvAmount,
    face: raw.face,
    back: raw.back,
    endorsementMarkers: raw.endorsementMarkers,
    evidenceText: raw.evidenceText ? truncate(raw.evidenceText, EVIDENCE_MAX) : undefined,
    confidence: raw.confidence ?? 0,
  };
}

/**
 * TEK sayfadan PageCandidate üretir. Graceful: hata/eksik girdi → düşük-güven aday, throw YOK.
 *
 * @remarks Çağrıldığı yerler:
 * - (henüz YOK — PR-2b-2 izole adapter; üretim bağlama PR-2b-3)
 */
export async function extractPageCandidate(
  page: Page,
  deps: { aiExtract?: PageAiExtractor } = {},
): Promise<PageCandidate> {
  const aiExtract = deps.aiExtract ?? defaultPageAiExtract;
  try {
    if (page.kind === "TEXT" && page.text && page.text.trim().length > 0) {
      const raw = await aiExtract({ kind: "text", text: page.text, prompt: PAGE_EXTRACTION_PROMPT });
      return mapRawToCandidate(page, raw);
    }
    if (page.needsImageExtraction && page.imageRef) {
      const raw = await aiExtract({ kind: "vision", imageRef: page.imageRef, prompt: PAGE_EXTRACTION_PROMPT });
      return mapRawToCandidate(page, raw);
    }
    // IMAGE ama imageRef YOK (render başarısız/stub) → çıkaramaz → graceful düşük-güven
    return { pageIndex: page.pageIndex, confidence: 0 };
  } catch (e: any) {
    // GRACEFUL: AI hatası/timeout → düşük-güven aday, throw DIŞARI taşmaz
    logger.warn(`Sayfa ${page.pageIndex} aday çıkarımı başarısız: ${e?.message ?? e}`);
    return { pageIndex: page.pageIndex, confidence: 0 };
  }
}

/**
 * Tüm sayfaları SIRALI işler (eşzamanlı Vision maliyetli → sıralı, cost-bilinçli).
 * Her sayfa BAĞIMSIZ; sayfalar-arası bilgi taşınmaz (kırmızı çizgi).
 */
export async function extractAllPageCandidates(
  pages: Page[],
  deps: { aiExtract?: PageAiExtractor } = {},
): Promise<PageCandidate[]> {
  const out: PageCandidate[] = [];
  for (const page of pages) {
    out.push(await extractPageCandidate(page, deps));
  }
  return out;
}

/**
 * fence-fix: LLM çıktısı bazen ```json ... ``` markdown-fence ile gelir → ham JSON.parse PATLAR
 * (çek kaybı; V2 teşhisinde 4 sayfanın 3'ü bu yüzden parse-fail oldu). Bu helper fence'i SOYAR
 * (yoksa metni AYNEN döner). response_format:json_object BİRİNCİL savunma; bu fence-strip
 * İKİNCİL/garantör — model/SDK/endpoint davranışı değişse de parse ROBUST kalır.
 */
export function stripJsonFence(s: string): string {
  const t = s.trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return m ? m[1].trim() : t;
}

/** LLM JSON cevabını güvenli ayrıştır: fence-strip + JSON.parse (tek parse noktası). */
export function parseAiJson(content: string): any {
  return JSON.parse(stripJsonFence(content));
}

/**
 * Gerçek AI/Vision çağrısı (lazy OpenAI). DORMANT — PR-2b-2'de hiçbir yere bağlı değil;
 * testler mock enjekte eder. Anahtar yoksa throw eder → extractPageCandidate graceful yakalar.
 */
export const defaultPageAiExtract: PageAiExtractor = async (input) => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const OpenAI = require("openai");
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY yok (page extraction)");
  const client = new OpenAI({ apiKey });

  let model: string;
  let userContent: any;
  if (input.kind === "vision" && input.imageRef) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("fs");
    const b64 = fs.readFileSync(input.imageRef).toString("base64");
    model = "gpt-4o";
    userContent = [{ type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } }];
  } else {
    model = process.env.OPENAI_MODEL || "gpt-4o";
    userContent = input.text ?? "";
  }

  const resp = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: input.prompt },
      { role: "user", content: userContent },
    ],
    temperature: 0.1,
    max_tokens: 1000,
    response_format: { type: "json_object" }, // fence-fix: modele ham JSON zorla (fence olasılığını düşür)
  });
  const content = resp.choices?.[0]?.message?.content || "{}";
  return parseAiJson(content); // fence-fix: fence-strip + parse (garantör; ham JSON.parse'ın yerine)
};
