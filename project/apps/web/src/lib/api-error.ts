/**
 * OWN-12 ADIM A (owner D-2 b, 2026-09-06) — KANONIK HTTP HATA SOZLESMESI (dar birlestirme).
 *
 * Web'de iki HTTP istemcisi var (`lib/api.ts` singleton `api` ve `lib/api/client.ts` `apiClient`)
 * ve ikisi de basarisiz yanittan AYNI hata nesnesini elle kuruyordu:
 *   `new Error(body.message || "Bir hata oluştu")` + `.body` (yapisal govde) + `.status`.
 * Bu kopya sessizce ayrisabilir (ornegin biri `.body`'yi birakirsa review akislari bozulur).
 *
 * NEDEN TAM TASIMA BIRLESTIRMESI YAPILMADI: iki istemcinin `try` sinirlari FARKLIDIR —
 * `api.request` HTTP hatasini da kendi `catch`ine dusurup ag-hatasi raporlamasi ve mesaj
 * donusumu uygular; `apiClient.request` bunu YAPMAZ. Tasimayi tek metoda indirmek bu
 * davranis farkini `apiClient` tuketicilerine tasidi ve olculdu: `a4w`/`a4z` case-detail
 * okuma-hatasi suite'leri 8 test KIRILDI (baseline 11/11 PASS). Owner kisiti "ortak API'nin
 * diger modul tuketicilerini koru" geregi tam birlestirme GERI ALINDI; birlestirme burada,
 * davranisi degistirmeyen hata-kurma katmaniyla sinirli tutuldu. Kalan tam birlestirme
 * ADIM A'nin acik kismidir (bkz. Charter §60.2).
 */

/** Hata gövdesi (`message`/`code`/alan hatalari) + HTTP durumu tasiyan kanonik hata. */
export type ApiHttpError = Error & { body?: unknown; status?: number };

/**
 * Basarisiz HTTP yanitindan kanonik hata nesnesi kurar.
 *
 * Sozlesme (IKI istemcide de AYNEN korunur):
 *  - `message`: sunucu gövdesindeki `message`, yoksa "Bir hata oluştu"
 *  - `body`: ham gövde (yapisal alanlar — `code`, `candidates`, `reasonCode`, `fieldErrors` —
 *    review/validation akislari icin KORUNUR)
 *  - `status`: HTTP durum kodu
 *
 * MESAJ DONUSUMU (regresyon duzeltmesi, owner GO 2026-09-06 Faz 2): birlestirme oncesi kod
 * `new Error(body.message || 'Bir hata oluştu')` kuruyordu. `Error` yapicisi argumanina
 * `String()` uyguladigi icin NestJS `ValidationPipe`'in `message: string[]` govdesi kullaniciya
 * ULASIYORDU ("tckn gecersiz,email zorunlu"). Ilk birlestirmede yalniz `typeof === 'string'`
 * kabul edilince bu detay KAYBOLDU ve kullanici "Bir hata oluştu" gordu. Asagidaki hesap eski
 * davranisla BIREBIR aynidir: truthy her deger `String()` ile metne cevrilir, falsy deger
 * varsayilana duser.
 */
export function buildApiHttpError(body: unknown, status: number): ApiHttpError {
  const rawMessage =
    body && typeof body === 'object' ? (body as { message?: unknown }).message : undefined;
  const message = rawMessage ? String(rawMessage) : 'Bir hata oluştu';
  const error = new Error(message) as ApiHttpError;
  error.body = body;
  error.status = status;
  return error;
}

/** Yaniti gövdeye cevirir; JSON degilse bos nesne (mevcut davranis). */
export async function readErrorBody(response: Response): Promise<unknown> {
  return response.json().catch(() => ({}));
}
