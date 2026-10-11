// KR-19: hata kaydı YAZIMI başarısız olduğunda sunucu günlüğüne yazılacak GÜVENLİ satırı üretir.
//
// Kural: günlüğe ham hata nesnesi, `message`, `stack`, `cause` ya da `meta` AKTARILMAZ. Veritabanı hata
// iletileri bağlantı adresi / kullanıcı adı taşıyabilir; serbest metin satır sonu da taşıyabilir.
// Bu yüzden satır YALNIZ bu dosyadaki sabit metinlerden kurulur:
//  - tür: hata nesnesinin SINIFINA bakılarak (`instanceof`) kapalı listeden seçilir. Nesnenin kendi
//    `name` / `constructor.name` alanı OKUNMAZ (serbest metindir; güvenli sayılmaz).
//  - kod: yalnız Prisma sınıflarında ve yalnız kapalı listedeki değerlerden biriyse yazılır.
//  - tanınmayan tür / kod → sabit "unknown" etiketi.
//
// Mevcut `error-log.sanitize.ts` serbest metni MASKELER (PII / sır taşıyan yol parçaları); burada serbest
// metin hiç yazılmadığı için maskeleme kullanılmaz — iki yardımcı farklı işi yapar.
import { Prisma } from "@prisma/client";

/** Günlüğe yazılan SABİT olay etiketi. */
export const ERROR_LOG_WRITE_FAILED_EVENT = "error-log write failed";

/** Tanınmayan hata türü / kodu için SABİT etiket. */
export const UNKNOWN_ERROR_LABEL = "unknown";

/**
 * Günlüğe yazılabilen Prisma hata kodları (kapalı liste): veritabanına erişim / bağlantı kodları ile bu
 * yazım yolunda görülebilecek sorgu kodları. Listede olmayan her değer "unknown" yazılır.
 */
const LOGGABLE_PRISMA_CODES: ReadonlySet<string> = new Set([
  "P1000", "P1001", "P1002", "P1003", "P1008", "P1010", "P1011", "P1017",
  "P2002", "P2003", "P2021", "P2022", "P2024", "P2025", "P2028", "P2034", "P2037",
]);

export interface ErrorLogWriteFailureClass {
  /** Kapalı listeden hata türü etiketi. */
  kind: string;
  /** Yalnız Prisma türlerinde: kapalı listeden kod ya da "unknown". */
  code?: string;
}

function loggableCode(value: unknown): string {
  return typeof value === "string" && LOGGABLE_PRISMA_CODES.has(value) ? value : UNKNOWN_ERROR_LABEL;
}

/** Hata nesnesini SINIFINA göre sınıflandırır. Hiçbir koşulda atmaz; serbest metin döndürmez. */
export function classifyErrorLogWriteFailure(error: unknown): ErrorLogWriteFailureClass {
  try {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return { kind: "PrismaClientKnownRequestError", code: loggableCode(error.code) };
    }
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return { kind: "PrismaClientInitializationError", code: loggableCode(error.errorCode) };
    }
    if (error instanceof Prisma.PrismaClientUnknownRequestError) return { kind: "PrismaClientUnknownRequestError" };
    if (error instanceof Prisma.PrismaClientRustPanicError) return { kind: "PrismaClientRustPanicError" };
    if (error instanceof Prisma.PrismaClientValidationError) return { kind: "PrismaClientValidationError" };
    if (error instanceof TypeError) return { kind: "TypeError" };
    if (error instanceof RangeError) return { kind: "RangeError" };
    if (error instanceof Error) return { kind: "Error" };
  } catch {
    // erişimci (getter) / vekil (proxy) hata fırlatırsa: sınıflandırılamadı
  }
  return { kind: UNKNOWN_ERROR_LABEL };
}

/** Günlük satırı: sabit olay etiketi + sınıflandırılmış tür (+ kod). Tek satırdır; serbest metin içermez. */
export function describeErrorLogWriteFailure(error: unknown): string {
  const { kind, code } = classifyErrorLogWriteFailure(error);
  return code === undefined
    ? `${ERROR_LOG_WRITE_FAILED_EVENT} (kind=${kind})`
    : `${ERROR_LOG_WRITE_FAILED_EVENT} (kind=${kind} code=${code})`;
}
