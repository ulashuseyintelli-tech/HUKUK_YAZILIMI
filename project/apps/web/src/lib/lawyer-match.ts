/**
 * Vekaletname OCR taramasından çıkan avukat(lar)ı sistemdeki Lawyer kayıtlarıyla
 * eşleştirip POST /poa için lawyerIds üretir (saf / yan-etkisiz).
 *
 * Çağrıldığı yerler:
 * - cases/new/page.tsx → handlePoaScan() → vekaletname tarama (DocumentSourceSelector
 *   "Müvekkil ve Vekalet Oluştur") sonrası POA oluşturmadan ÖNCE lawyerIds üretimi.
 *
 * NEDEN: Eski inline eşleştirme adı ilk boşluktan bölüp name/surname'e ham
 * toLowerCase ile bakıyordu. Türkçe büyük/küçük (İ/ı) + sistemdeki "name" alanının
 * çok-kelimeli olması (örn. name="ULAŞ HÜSEYİN", surname="TELLİ") yüzünden gerçek
 * veride %0 eşleşiyordu → POA avukatsız oluşuyor → takip sihirbazında
 * "geçerli vekalet bulunamadı" uyarısı. Bu helper tam-ad normalize eşleştirme +
 * TCKN/baro sinyali + mükerrer kayıtlarda kanonik tercih yapar.
 *
 * KANONİK KAYNAK (parite koru): apps/api/src/common/name-match.util.ts
 * (normalizePersonName) — backend lawyer dedupe guard'ı aynı mantığı kullanır.
 * Web app backend util'ini import edemediği için mantık burada YANSITILIR; ek
 * olarak baştaki avukat unvanı ("Av."/"Avukat"/"Stj.") token'ları temizlenir.
 */

/**
 * NFD sonrası birleşik diakritik işaretleri (U+0300–U+036F) eler. Kod-noktası ile
 * filtrelenir; kaynak ASCII kalsın diye combining-mark regex literali KULLANILMAZ
 * (dosya NFC normalize edilirse bozulmasın).
 */
function stripCombiningMarks(input: string): string {
  let out = "";
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    if (code >= 0x300 && code <= 0x36f) continue;
    out += input[i];
  }
  return out;
}

/**
 * Kişi adı eşleştirme normalizasyonu — backend normalizePersonName ile birebir
 * (ı/İ→i, NFD diakritik folding, noktalama→boşluk, tek boşluk, UPPER).
 * "Ulaş Hüseyin Telli" == ("ULAŞ HÜSEYİN","TELLİ") == "ULAS HUSEYIN TELLI".
 */
export function normalizePersonName(...parts: (string | null | undefined)[]): string {
  const folded = parts
    .filter(Boolean)
    .join(" ")
    .replace(/ı/g, "i")
    .replace(/İ/g, "i")
    .normalize("NFD");
  return stripCombiningMarks(folded)
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/**
 * Baştaki avukat unvanı token'ları (normalize sonrası, UPPER). OCR adında
 * "Av.", "Avukat", "Stj. Av." gibi ön ekler olabilir; sistemdeki kayıtta yoktur.
 */
const TITLE_TOKENS = new Set(["AV", "AVUKAT", "STJ", "STAJYER", "HUK", "MUS", "MUSAVIR"]);

/** Tam-ad eşleştirme anahtarı: normalize + baştaki unvan token'larını at. */
export function nameMatchKey(...parts: (string | null | undefined)[]): string {
  const tokens = normalizePersonName(...parts).split(" ").filter(Boolean);
  while (tokens.length > 1 && TITLE_TOKENS.has(tokens[0])) tokens.shift();
  return tokens.join(" ");
}

export interface ScanLawyerInput {
  name?: string | null;
  barNumber?: string | null;
}

export interface ScanInput {
  lawyers?: ScanLawyerInput[] | null;
  lawyerName?: string | null;
  lawyerBarNumber?: string | null;
}

export interface LawyerRecord {
  id: string;
  name?: string | null;
  surname?: string | null;
  tckn?: string | null;
  barNumber?: string | null;
  isActive?: boolean | null;
  createdAt?: string | Date | null;
}

const hasValue = (v?: string | null): v is string => typeof v === "string" && v.trim() !== "";

/**
 * OCR adaylarını tek biçime indir: lawyers[] varsa onu kullan, yoksa tekil
 * lawyerName/lawyerBarNumber'dan TEK aday sentezle (tekil-ad fallback'i — eski
 * kodda yoktu, OCR yalnız tekil ad döndürdüğünde hiç eşleşme yapılmıyordu).
 */
function collectCandidates(scan: ScanInput): ScanLawyerInput[] {
  if (scan.lawyers && scan.lawyers.length > 0) {
    return scan.lawyers.map((l) => ({ name: l.name, barNumber: l.barNumber }));
  }
  if (hasValue(scan.lawyerName) || hasValue(scan.lawyerBarNumber)) {
    return [{ name: scan.lawyerName, barNumber: scan.lawyerBarNumber }];
  }
  return [];
}

/**
 * Bir OCR adayı için bir avukatın eşleşme sinyali gücü:
 * 3 = TCKN (OCR barNumber alanına TCKN koyabiliyor), 2 = baro sicil no,
 * 1 = tam-ad, 0 = eşleşme yok.
 */
function matchSignal(candidate: ScanLawyerInput, lawyer: LawyerRecord): number {
  if (hasValue(candidate.barNumber) && hasValue(lawyer.tckn) && lawyer.tckn === candidate.barNumber) {
    return 3;
  }
  if (hasValue(candidate.barNumber) && hasValue(lawyer.barNumber) && lawyer.barNumber === candidate.barNumber) {
    return 2;
  }
  if (hasValue(candidate.name)) {
    const key = nameMatchKey(candidate.name);
    if (key && key === nameMatchKey(lawyer.name, lawyer.surname)) return 1;
  }
  return 0;
}

/** createdAt → ms; tarihi olmayan/bozuk deterministik olarak en sona. */
const toTime = (d?: string | Date | null): number => {
  if (!d) return Number.POSITIVE_INFINITY;
  const t = new Date(d).getTime();
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
};

/**
 * Aynı adaya birden fazla avukat eşleşirse (mükerrer kayıtlar) kanonik olanı seç.
 * Sıra: (1) sinyal gücü (tckn > baro > ad) → (2) tckn/baro DOLU olan →
 * (3) aktif kayıt → (4) en eski createdAt → (5) en küçük id (deterministik).
 */
function pickBestLawyer(candidate: ScanLawyerInput, lawyers: LawyerRecord[]): LawyerRecord | undefined {
  const scored = lawyers
    .map((l) => ({ l, signal: matchSignal(candidate, l) }))
    .filter((x) => x.signal > 0);
  if (scored.length === 0) return undefined;

  scored.sort((a, b) => {
    if (a.signal !== b.signal) return b.signal - a.signal;
    const aCanon = hasValue(a.l.tckn) || hasValue(a.l.barNumber);
    const bCanon = hasValue(b.l.tckn) || hasValue(b.l.barNumber);
    if (aCanon !== bCanon) return aCanon ? -1 : 1;
    const aActive = a.l.isActive !== false;
    const bActive = b.l.isActive !== false;
    if (aActive !== bActive) return aActive ? -1 : 1;
    const at = toTime(a.l.createdAt);
    const bt = toTime(b.l.createdAt);
    if (at !== bt) return at - bt;
    return String(a.l.id) < String(b.l.id) ? -1 : String(a.l.id) > String(b.l.id) ? 1 : 0;
  });
  return scored[0].l;
}

/**
 * OCR taramasındaki avukatları sistemdeki Lawyer kayıtlarıyla eşleştirip
 * benzersiz lawyerIds döndürür. Eşleşme yoksa boş dizi (POA avukatsız oluşur —
 * bugünkü davranışla aynı, ama artık nadir).
 */
export function resolveLawyerIdsFromScan(scan: ScanInput, lawyers: LawyerRecord[]): string[] {
  const candidates = collectCandidates(scan);
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const best = pickBestLawyer(candidate, lawyers);
    if (best && !seen.has(best.id)) {
      seen.add(best.id);
      ids.push(best.id);
    }
  }
  return ids;
}
