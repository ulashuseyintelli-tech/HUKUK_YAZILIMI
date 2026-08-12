// PR-2A1 — Sessiz mutasyon onarımı: mutation hatasının GÜVENLİ kullanıcı yüzeyi.
//
// BULGU AİLESİ: `catch (e) { /* demo fallback */ }` — istek başarısız olduğunda arayüz kaydı
// YEREL olarak uyduruyordu. Kullanıcı duruşmasını/süresini/masrafını kayıtlı görüyor,
// veritabanında hiçbir şey yok. Yakın akraba: başarı yan etkisinin (form temizliği, modal
// kapanışı, yerel liste güncellemesi) `finally` içinde ya da try/catch DIŞINDA durması —
// o zaman hata olsa bile "oldu" görünür.
//
// KURAL: mutation başarısızsa HİÇBİR başarı yan etkisi çalışmaz; hata GÖRÜNÜR olur.
//
// ── Owner kuralı (kilitli) ───────────────────────────────────────────────────────────
// Backend'in KULLANICIYA YÖNELİK sözleşmesi (`message` / `code` / `fieldErrors`) körlemesine
// genel bir ağ hatasına çevrilmez — validation bilgisi kullanıcının işine yarar ve korunur.
// Maskelenen yalnız İÇ AYRINTILARDIR: stack, URL/endpoint, SQL, dosya yolu, sunucu içi tip
// adları. Bunlar görünürse fallback metin kullanılır.

/** Backend'in kullanıcıya yönelik hata sözleşmesi. */
export interface ActionErrorContract {
  /** Gösterilecek metin. Her zaman DOLU. */
  message: string;
  /** Sunucunun kararlı hata kodu (varsa) — arayüz özel dal açmak isterse. */
  code?: string;
  /** Alan-bazlı validation mesajları (varsa) — form altında gösterilebilir. */
  fieldErrors?: Record<string, string>;
  /** Tekrar denemenin ANLAMLI olup olmadığı: yalnız ağ/geçici hatada true. */
  transient: boolean;
}

/** İç ayrıntı sızıntısı işaretleri — bunları taşıyan metin kullanıcıya GÖSTERİLMEZ. */
const INTERNAL_LEAK = [
  /\bat\s+\w+\s*\(/, // stack frame
  /\.(ts|tsx|js|jsx):\d+/, // dosya:satır
  /https?:\/\//i, // URL / endpoint
  /\b(select|insert|update|delete)\s+.*\b(from|into|set|where)\b/i, // SQL
  /\bprisma\b|\bPrismaClient\b|\bP\d{4}\b/i, // ORM iç detayı
  /\b[A-Za-z]:\\|\/(usr|home|var)\//, // dosya yolu
  /\b(ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN)\b/, // ham soket hatası
];

function leaksInternals(text: string): boolean {
  return INTERNAL_LEAK.some((re) => re.test(text));
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}

/** Sunucunun kullanıcıya yönelik gövdesi: `err.body` veya `err.response.data`. */
function serverBody(error: unknown): Record<string, unknown> | undefined {
  const e = record(error);
  if (!e) return undefined;
  return record(e.body) ?? record(record(e.response)?.data);
}

function safeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return leaksInternals(trimmed) ? null : trimmed;
}

/** `{ field: "mesaj" }` biçimine indirger; sızıntı taşıyan alanları atar. */
function safeFieldErrors(value: unknown): Record<string, string> | undefined {
  const raw = record(value);
  if (!raw) return undefined;
  const out: Record<string, string> = {};
  for (const [field, message] of Object.entries(raw)) {
    const text = safeText(message) ?? safeText(Array.isArray(message) ? message[0] : undefined);
    if (text) out[field] = text;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Ağ katmanı hatası mı? (sunucu HİÇ yanıt vermedi)
 *
 * Sunucu gövdesi varsa ağ hatası DEĞİLDİR — validation bilgisi bu yüzden ezilmez.
 */
function isNetworkError(error: unknown): boolean {
  if (serverBody(error)) return false;
  const e = record(error);
  if (!e) return false;
  if (e.response || typeof e.status === 'number') return false; // sunucu yanıt verdi
  const name = typeof e.name === 'string' ? e.name : '';
  const message = typeof e.message === 'string' ? e.message.toLowerCase() : '';
  return (
    name === 'TypeError' ||
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('network request failed') ||
    message.includes('load failed')
  );
}

export const ACTION_ERROR_NETWORK =
  'Sunucuya ulaşılamadı. İşlem YAPILMADI — bağlantınızı kontrol edip tekrar deneyin.';

export const ACTION_ERROR_UNKNOWN = 'İşlem tamamlanamadı. Lütfen tekrar deneyin.';

/**
 * Mutation hatasını kullanıcı yüzeyine çevirir.
 *
 * `fallback` çağıranın alan-özel metnidir ("Duruşma kaydedilemedi." gibi) ve sunucu güvenli
 * bir mesaj döndürmediğinde kullanılır. `message` HER ZAMAN doludur: boş dönerse arayüz
 * hatayı yine göstermez ve bulgu geri gelir.
 *
 * `transient` YALNIZ ağ hatasında true'dur. Sunucu bir kural ihlali bildirdiyse aynı isteği
 * tekrarlamak aynı sonucu üretir — arayüz otomatik/tek-tık retry SUNMAZ.
 */
export function toActionError(error: unknown, fallback: string): ActionErrorContract {
  if (isNetworkError(error)) {
    return { message: ACTION_ERROR_NETWORK, transient: true };
  }

  const body = serverBody(error);
  const message =
    safeText(body?.message) ?? safeText(fallback) ?? ACTION_ERROR_UNKNOWN;
  const code = safeText(body?.code) ?? undefined;
  const fieldErrors = safeFieldErrors(body?.fieldErrors ?? body?.errors);

  return { message, code, fieldErrors, transient: false };
}

/** Yalnız gösterilecek metin gerektiğinde kullanılan kısa yol. */
export function toActionErrorMessage(error: unknown, fallback: string): string {
  return toActionError(error, fallback).message;
}
