/**
 * OWN-12 ADIM A (owner GO 2026-09-06, Faz 2) — ORTAK HTTP TASIMA KATMANI.
 *
 * Web'de iki HTTP istemcisi vardir: `lib/api.ts` singleton `api` ve `lib/api/client.ts`
 * `apiClient`. Ikisi de AYNI dort adimi elle tekrarliyordu: taban URL kurma, `/api` oneki,
 * kimlik + `Content-Type` basliklari, ve basarisiz yanittan hata kurma. Bu dosya o dort adimi
 * TEK yere alir.
 *
 * DAVRANIS FARKI SILINMEZ, ADAPTORDE KALIR. Iki istemcinin `try` SINIRLARI farklidir:
 *   - `api.request`      : fetch VE ok-kontrolu AYNI `try` icindedir → HTTP hatasi da kendi
 *                          `catch`ine duser; orada ag-hatasi raporlamasi ve kullanici-mesaji
 *                          donusumu (`Failed to fetch` → "API sunucusuna baglanilamiyor")
 *                          uygulanir.
 *   - `apiClient.request`: YALNIZ fetch `try` icindedir → HTTP hatasi ag raporlamasina
 *                          girmez ve mesaj donusumu YAPILMAZ; ham hata yukari cikar.
 * Onceki tam-birlestirme denemesi bu farki tuketicilere tasidigi icin olculerek geri
 * alinmisti (case-detail okuma-hatasi suite'lerinde 8 test kirilmisti). Bu katman
 * `try` sinirlarina DOKUNMAZ: her istemci kendi sinirini korur, yalniz ortak adimlari cagirir.
 * Davranis kilidi: `src/__tests__/api-transport-own12a.test.ts`.
 */
import { buildApiHttpError, readErrorBody } from './api-error';
import { resolveApiBaseUrl } from './api-base-url';

/**
 * Taban URL — iki istemcide de AYNI kaynak. Deger CAGRI ANINDA cozulur: `NEXT_PUBLIC_API_URL`
 * verilmisse o, verilmemis ve tarayici yerel OLMAYAN bir host'taysa AYNI ORIGIN (bos dize),
 * aksi halde `http://localhost:8080`. Bkz. `api-base-url.ts`.
 */
export const API_BASE_URL = resolveApiBaseUrl();

/** `/api` onekli tam URL (iki istemcide de AYNI desen). */
export function buildApiUrl(endpoint: string): string {
  return `${resolveApiBaseUrl()}/api${endpoint}`;
}

/**
 * Istek basliklari. Sira ONEMLIDIR ve mevcut davranisi birebir korur:
 * `Content-Type` → `Authorization` → cagiranin kendi basliklari (cagiran EZEBILIR).
 *
 * @param jsonContentType `false` verilirse `Content-Type` EKLENMEZ (blob indirme yolu; tarayici
 *   `FormData` icin sinir degerini kendisi koyar).
 */
export function buildApiHeaders(
  token: string | null,
  extraHeaders?: HeadersInit,
  jsonContentType = true,
): HeadersInit {
  return {
    ...(jsonContentType ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extraHeaders,
  };
}

/**
 * Ortak fetch: URL ve basliklari kurar, yaniti OLDUGU GIBI doner.
 *
 * Bilerek `ok` kontrolu YAPMAZ — kontrolun hangi `try` icinde olacagi cagirana aittir ve
 * iki istemcide FARKLIDIR (bkz. dosya basi).
 */
export async function sendApiRequest(
  endpoint: string,
  options: RequestInit,
  token: string | null,
  jsonContentType = true,
): Promise<Response> {
  return fetch(buildApiUrl(endpoint), {
    ...options,
    headers: buildApiHeaders(token, options.headers, jsonContentType),
  });
}

/**
 * Basarisiz yaniti kanonik hataya cevirir (`message` + `body` + `status`); basarili yaniti
 * degistirmeden doner.
 */
export async function assertApiResponseOk(response: Response): Promise<Response> {
  if (!response.ok) {
    throw buildApiHttpError(await readErrorBody(response), response.status);
  }
  return response;
}

/**
 * Basarili yanitin govdesini cozer (iki istemcide de AYNI adim).
 *
 * Govde BOSSA `null` doner: sunucu bir ucta "kayit yok" anlaminda `null` dondugunde yanit 200 ve
 * BOS govdeyle gelir (ornek: sorumlusu olmayan dosyada `GET /cases/:id/responsible-person`), 204 / 205
 * yanitlarinin da govdesi yoktur. Eskiden bu durumda `response.json()` "beklenmeyen JSON sonu" hatasi
 * firlatiyor, cagiran ekran basarili bir okumayi HATA olarak gosteriyordu.
 *
 * Bos OLMAYAN govde eskisi gibi JSON olarak cozulur; gecersiz JSON yine hata firlatir (sessizce
 * yutulmaz). Zarf cozumu (`{ data }`) cagirana aittir, burada yapilmaz.
 */
export async function readApiSuccessBody<T>(response: Response): Promise<T> {
  if (response.status === 204 || response.status === 205) return null as T;
  // Yalniz `json()` sunan yanit benzeri nesnelerde (govde metnine erisim yok) eski yol korunur.
  if (typeof response.text !== 'function') return response.json();
  const text = await response.text();
  if (text.trim() === '') return null as T;
  return JSON.parse(text) as T;
}
