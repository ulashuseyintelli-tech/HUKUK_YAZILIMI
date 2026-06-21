/**
 * Borç enstrümanı tipleri — prisma/NestJS'ten BAĞIMSIZ (saf), grouping motoru ve
 * OCR servisi ortak kullanır. Böylece deterministik grouping motoru ağır bağımlılık
 * olmadan izole test edilebilir.
 */

export type InstrumentType = "CEK" | "SENET" | "POLICE" | "FATURA" | "DIGER";
export type Currency = "TRY" | "USD" | "EUR" | "GBP" | "CHF";

/**
 * Gruplama kararının dayanağı (review ekranında kullanıcıya gösterilir).
 */
export type GroupingMethod =
  | "DOCUMENT_NO_MATCH" // aynı/yeni documentNo (güçlü)
  | "FACE_SIGNAL" // amount+dueDate (güçlü) ya da amount+taraf (orta) yüz sinyali
  | "SEQUENTIAL_HEURISTIC" // sıra-bazlı arka/ciro bağlama (orta/düşük)
  | "TYPE_BOUNDARY" // tip değişimi sinyali (düşük/orta + review; OCR yanlış sınıflayabilir)
  | "WEAK_AMOUNT_ONLY" // yalnız tutar (zayıf; arka/aval/teminat olabilir → review)
  | "AMBIGUOUS"; // karar verilemedi (review)

/**
 * Tek borç enstrümanı (çek/senet/fatura...). Bir PDF içinde BİRDEN FAZLA olabilir.
 */
export interface Instrument {
  // CEK=cheque, SENET=promissory_note, POLICE=poliçe, FATURA=invoice, DIGER=other
  type: InstrumentType;
  documentNo?: string;
  amount?: number;
  currency: Currency;
  issueDate?: string; // YYYY-MM-DD (düzenleme)
  dueDate?: string; // YYYY-MM-DD (vade)
  bankName?: string;
  branchName?: string;
  iban?: string;
  drawerName?: string; // keşideci / borçlu adayı (tek isim)
  debtorCandidates?: string[]; // çoklu borçlu adayı
  // P4-1: arka-yüz ciro/kaşe isim adayları (SIRASIZ, ham). AYRI back-pass doldurur — front
  // extraction'a DOKUNMAZ. holderName / zincir-sırası DEĞİL (onlar A1 türevi). Borçlu önerisine
  // SENTEZLENMEZ; clientMatch (P4-2) bu listeyi seçili müvekkille eşleştirir.
  endorsementNames?: string[];
  pageRange?: [number, number]; // enstrümanın PDF sayfa aralığı [from, to]
  confidence: number; // sayfa-extraction güveni (0-100)

  // PR-2a-1: gruplama meta verisi (deterministik motor doldurur)
  sourcePages?: number[]; // bu enstrümanın geldiği PDF sayfaları (ön+arka)
  needsReview?: boolean; // belirsiz çıkarım/gruplama → kullanıcı kontrol etmeli
  duplicateCandidateReason?: string; // neden review işaretlendi (insan-okur)
  groupingMethod?: GroupingMethod;
  groupConfidence?: number; // 0-1 (gruplama kararının güveni)
}

/**
 * Per-page çıkarımdan gelen sayfa adayı (grouping motorunun GİRDİSİ).
 * PR-2a-1: yalnız fixture/test besler. Gerçek per-page extraction PR-2a-2'de,
 * AI/Vision aday üretimi PR-2b'de bu tipi dolduracak.
 */
export interface PageCandidate {
  pageIndex: number;
  documentType?: InstrumentType;
  documentNo?: string;
  amount?: number;
  currency?: Currency;
  issueDate?: string;
  dueDate?: string;
  bankName?: string;
  branchName?: string;
  iban?: string;
  drawerName?: string;
  debtorCandidates?: string[];
  // face/back: BU sayfanın KENDİ görünümü (yüz mü / arka mı). "şu belgenin arkasıdır"
  // gibi SAYFALAR-ARASI ilişki DEĞİL — o grouping motorunun işi (AI'ya yasak).
  face?: boolean; // bu sayfa bir belge YÜZÜ gibi görünüyor (tutar/no/banka var)
  back?: boolean; // bu sayfa ARKA/ciro gibi görünüyor (ciro/imza, tutar yok)
  endorsementMarkers?: boolean; // ciro/imza/aval/teminat/keşide metni bulundu
  // evidenceText: bu sayfadan KISA kanıt parçası (review "AI bunu nereden çıkardı?").
  // Tüm OCR metni DEĞİL — yalnız ilgili kısa alıntı.
  evidenceText?: string;
  confidence?: number;
}
