/**
 * K3-L (owner GO 2026-09-30 madde 3) — sihirbazın alacak kalemleri adımında evrak taramasından (OCR) gelen kambiyo
 * kayıtları görünür olur. TEK KAYNAK sihirbazın `instruments` durumudur: burada kopya / yeni kalem ÜRETİLMEZ; dosya
 * açılışında bu kayıtlar `instruments[]` ile gider ve her biri kendi anapara kalemini sunucuda BİR KEZ oluşturur.
 *
 * Aynı evrak elle de kalem olarak eklenirse sunucu iki evrak + iki anapara yazardı (ikinci PRINCIPAL). Aynı evrak =
 * aynı tür (çek/senet) + aynı belge/seri no (boşluk ve büyük/küçük harf farkı yok sayılır) + aynı tutar (kuruş) + aynı
 * para birimi. Bu durumda elle ekleme ve gönderim reddedilir; kullanıcı elle kalemi siler ya da taramadaki seçimi değiştirir.
 */
import { INSTRUMENT_TYPE_LABELS, type CaseInstrumentPayload } from "@/components/debtor/ocr-instrument";

export interface OcrInstrumentAggregate {
  currency: string;
  amount: number;
  count: number;
}

const cents = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

const normalizeDocumentNo = (value: unknown): string =>
  String(value ?? "").replace(/\s+/g, "").toUpperCase();

const normalizeCurrency = (value: unknown): string => String(value || "TRY").trim().toUpperCase();

/** Taramadan gelen kayıtlar (elle girilen kambiyo `source: MANUAL` kalem listesinde zaten görünür). */
export function ocrInstrumentsOf(instruments: readonly CaseInstrumentPayload[]): CaseInstrumentPayload[] {
  return instruments.filter((i) => i.source !== "MANUAL");
}

/** Para birimi bazında toplam — kalem listesi toplamından AYRI (aynı para iki kez sayılmaz). */
export function aggregateOcrInstruments(instruments: readonly CaseInstrumentPayload[]): OcrInstrumentAggregate[] {
  const map = new Map<string, OcrInstrumentAggregate>();
  for (const i of ocrInstrumentsOf(instruments)) {
    const c = cents(i.amount);
    if (c === null || c <= 0) continue;
    const currency = normalizeCurrency(i.currency);
    const entry = map.get(currency) ?? { currency, amount: 0, count: 0 };
    entry.amount = (Math.round(entry.amount * 100) + c) / 100;
    entry.count += 1;
    map.set(currency, entry);
  }
  return [...map.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

/** Elle girilen kalemin taramadan gelen bir kayıtla AYNI evrak olup olmadığı (değilse null). */
export function findOcrDuplicateOfClaimRaw(
  raw: any,
  instruments: readonly CaseInstrumentPayload[],
): CaseInstrumentPayload | null {
  if (!raw) return null;
  const type = raw.kalemTuru === "CEK" ? "CEK" : raw.kalemTuru === "SENET" ? "SENET" : null;
  if (!type) return null;
  const documentNo = normalizeDocumentNo(type === "CEK" ? raw.cekBilgileri?.cekSeriNo : raw.senetBilgileri?.senetNo);
  const amount = cents(raw.bakiyeTutar);
  if (!documentNo || amount === null) return null;
  const currency = normalizeCurrency(raw.currency);
  return (
    ocrInstrumentsOf(instruments).find(
      (i) =>
        i.type === type &&
        normalizeDocumentNo(i.documentNo) === documentNo &&
        cents(i.amount) === amount &&
        normalizeCurrency(i.currency) === currency,
    ) ?? null
  );
}

export function ocrDuplicateMessage(dup: CaseInstrumentPayload): string {
  const label = INSTRUMENT_TYPE_LABELS[dup.type] ?? "Evrak";
  return (
    `Bu kalem, evrak taramasından zaten eklenmiş ${dup.documentNo} numaralı ${label.toLocaleLowerCase("tr-TR")} ile aynı ` +
    "(tür, numara, tutar ve para birimi). Aynı evrak ikinci kez eklenirse iki anapara kaydı oluşur; elle girilen kalemi " +
    "silin ya da borçlular adımındaki taramadan seçimi değiştirin."
  );
}
