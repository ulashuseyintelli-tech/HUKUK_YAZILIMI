/**
 * P4-1 (A1-V1b) — Arka-yüz ciro/kaşe İSİM çıkarımı (AYRI second-pass, C-PR2 deseni).
 *
 * 🔴 KIRMIZI ÇİZGİ (yapısal izolasyon — #294 regresyonunu tekrar ETMEMEK için):
 *  1) Front PAGE_EXTRACTION_PROMPT'a DOKUNULMAZ. Bu pass AYRI çalışır.
 *  2) applyEndorsementPass YALNIZ arka-yüz alanlarını yazar: `inst.endorsementNames` +
 *     `inst.whiteEndorsementDetected` (beyaz ciro SİNYALİ). drawerName/amount/issueDate/
 *     dueDate/documentNo/currency/bankName'e DOKUNMAZ → ön-yüz regresyonu KOD OLARAK İMKANSIZ.
 *  3) SIRA/ZİNCİR KURMAZ (kimin kime ciro ettiği = A1 türevi). Yalnız SIRASIZ ham isim listesi.
 *  4) Borçlu/CaseDebtor/Party YARATMAZ. Yalnız taslak veri (clientMatch P4-2'de tüketir).
 *
 * Yalnız kambiyo (CEK/SENET/POLICE) + arka-yüz (back/endorsementMarkers) sayfalarında çalışır.
 * AI hatası → graceful (endorsementNames yazılmaz; ön-yüz sonucu zaten üretildi, etkilenmez).
 */

import { Instrument, PageCandidate, InstrumentType } from "./debt-instrument.types";
import { Page } from "./pdf-segmentation";

/** Ciro/kaşe isimleri olan kambiyo evrak tipleri. FATURA/DIGER hariç. */
const KAMBIYO_TYPES = new Set<InstrumentType>(["CEK", "SENET", "POLICE"]);

const ENDORSEMENT_EVIDENCE_MAX = 240; // kısa kanıt alıntısı üst sınırı
const MAX_ENDORSEMENT_NAMES = 20; // enstrüman başına isim adayı cap (garbage-in koruması)
const MAX_NAME_LEN = 120; // tek isim uzunluk cap

/**
 * Arka-yüz isim çıkarımı için system prompt. Yalnız BU arka sayfayı işler; sıra/zincir kurmaz,
 * ön-yüz/keşideci çıkarmaz. (Front PAGE_EXTRACTION_PROMPT'tan tamamen AYRI.)
 */
export const BACK_ENDORSEMENT_PROMPT = `Sen bir Türk kambiyo hukuku belge analiz uzmanısın. Sana bir çek/senet/poliçenin ARKA YÜZÜ (ciro bölgesi) verilecek.

GÖREV: Bu arka yüzde GÖRÜNEN ciro / kaşe / imza İSİMLERİNİ çıkar (kişi veya şirket adları).

KURALLAR (kesin):
- YALNIZ İSİM çıkar. Tutar / tarih / belge no / banka ÇIKARMA (onlar ön yüzdedir, bu pass'in işi DEĞİL).
- KEŞİDECİ / ön-yüz bilgisi bu sayfada görünse bile ÇIKARMA. Bu pass YALNIZ arka-yüz ciro/kaşe isimleri içindir.
- SIRA / ZİNCİR KURMA. "Kimin kime ciro ettiği", "ilk/son ciranta", "güncel hamil" DEME. Yalnız gördüğün isimleri DÜZ, SIRASIZ liste olarak ver.
- Ciro işaretleri: "ciro edilmiştir", "ödeyiniz", "lehine", kaşe (şirket damgası), imza üstü/altı isimler.
- HAMİLİNE / beyaz ciro (isim yok) → boş liste döndür.
- Bir isimden EMİN DEĞİLSEN EKLEME. Uydurma. Boş bırakmak yanlış isimden iyidir.
- Kişi ve şirket adlarını (A.Ş./Ltd./Şti. dahil) gördüğün gibi yaz.

TEK JSON nesnesi döndür (dizi DEĞİL):
{
  "endorsementNames": ["arka yüzde görünen isim1", "isim2"],
  "evidence": "bu sayfadan KISA kanıt alıntısı (tüm metin DEĞİL, en çok ~200 karakter)"
}`;

/** Tek arka-sayfa için AI girdisi. */
export interface EndorsementAiInput {
  imageRef?: string; // arka sayfa görüntü yolu (vision)
  text?: string; // arka sayfa metni (TEXT sayfa)
  prompt: string; // BACK_ENDORSEMENT_PROMPT
  context?: string; // yalnız "neyi ÇIKARMAYACAĞINI" bildirmek için (keşideci/belge no); isimlere KOYULMAZ
}

/** Arka-yüz AI çağrısı — tek sayfa için ham ciro/kaşe isimleri. Test'te mock'lanır. */
export type EndorsementExtractor = (
  input: EndorsementAiInput,
) => Promise<{ endorsementNames: string[]; evidence?: string }>;

/** Türkçe-güvenli normalize anahtarı (İ/I tuzağı: önce harf-eşle, sonra lower). */
function normKey(s: string): string {
  return s
    .replace(/İ/g, "i")
    .replace(/I/g, "ı")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** İsimleri normalize-anahtarla dedup eder (İLK görüneni korur, sıralama bozulmaz). */
function dedupeNames(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    const k = normKey(n);
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(n);
    }
  }
  return out;
}

/** AI'a "bunları endorsementNames'e KOYMA" demek için bağlam (yalnız dışlama amaçlı). */
function buildContext(inst: Instrument): string {
  return `Bu ARKA YÜZ. Ön-yüz keşidecisi: ${inst.drawerName ?? "?"} — bunu endorsementNames'e KOYMA. Belge no: ${inst.documentNo ?? "?"}. YALNIZ arka-yüzdeki ciro/kaşe isimlerini çıkar.`;
}

/**
 * Bir enstrümanın ARKA-YÜZ sayfalarını seçer (sourcePages → back/endorsementMarkers olan
 * candidate'lar → imageRef/text taşıyan Page'ler). Kambiyo değilse / arka-yüz yoksa → [].
 * (PageCandidate.back/endorsementMarkers ZATEN front extraction'dan gelir — burada yalnız OKUNUR.)
 */
export function selectBackPages(
  instrument: Instrument,
  candidates: PageCandidate[],
  pages: Page[],
): Page[] {
  if (!instrument.type || !KAMBIYO_TYPES.has(instrument.type)) return [];
  const src = instrument.sourcePages ?? [];
  if (src.length === 0) return [];
  const candByIndex = new Map<number, PageCandidate>(candidates.map((c) => [c.pageIndex, c]));
  const pageByIndex = new Map<number, Page>(pages.map((p) => [p.pageIndex, p]));
  const out: Page[] = [];
  for (const idx of src) {
    const cand = candByIndex.get(idx);
    const isBack = cand?.back === true || cand?.endorsementMarkers === true;
    if (!isBack) continue;
    const page = pageByIndex.get(idx);
    if (page) out.push(page);
  }
  return out;
}

/**
 * Her enstrümanın arka-yüz sayfalarından ciro/kaşe isimlerini çıkarır ve YALNIZ
 * `inst.endorsementNames`'e yazar. Diğer alanlara ASLA dokunmaz (yapısal izolasyon).
 * Bir sayfa/çağrı patlasa graceful (diğerleri + ön-yüz etkilenmez).
 */
export async function applyEndorsementPass(
  instruments: Instrument[],
  candidates: PageCandidate[],
  pages: Page[],
  extractor: EndorsementExtractor,
): Promise<void> {
  for (const inst of instruments) {
    const backPages = selectBackPages(inst, candidates, pages);
    if (backPages.length === 0) continue;

    const collected: string[] = [];
    let read = false; // en az bir arka sayfa BAŞARIYLA okundu mu (isim 0 olsa bile) → beyaz ciro ayrımı
    for (const page of backPages) {
      const imageRef = page.imageRef;
      const text = page.kind === "TEXT" ? page.text : undefined;
      if (!imageRef && !text) continue; // çıkaracak içerik yok
      try {
        const res = await extractor({
          prompt: BACK_ENDORSEMENT_PROMPT,
          imageRef,
          text,
          context: buildContext(inst),
        });
        read = true; // başarıyla okundu (isim sayısı 0 olsa bile) → beyaz ciro adayı
        for (const raw of res?.endorsementNames ?? []) {
          const name = (raw ?? "").trim();
          if (name) collected.push(name.slice(0, MAX_NAME_LEN));
        }
      } catch {
        // GRACEFUL: bu arka sayfa başarısız → diğer sayfalar + ön-yüz sonucu etkilenmez
      }
    }

    if (collected.length > 0) {
      // YALNIZ endorsementNames yazılır — başka alana DOKUNULMAZ.
      inst.endorsementNames = dedupeNames([...(inst.endorsementNames ?? []), ...collected]).slice(
        0,
        MAX_ENDORSEMENT_NAMES,
      );
    } else if (read) {
      // BEYAZ CİRO SİNYALİ: arka-yüz markeri VAR + sayfa BAŞARIYLA okundu (read) ama hiç İSİM çıkmadı
      // → muhtemel beyaz/hamiline ciro. (AI hata / içeriksiz sayfa → read=false → flag YOK; "okunamadı"
      // ≠ "isim yok".) SINIR: yalnız SİNYAL — holder/zincir/borçlu/UI kararı ÜRETMEZ; endorsementNames'e
      // DOKUNMAZ (boş kalır). Tüketim ileride (Faz 2/3).
      inst.whiteEndorsementDetected = true;
    }
  }
}

export const __testing = { normKey, dedupeNames, buildContext, ENDORSEMENT_EVIDENCE_MAX };
