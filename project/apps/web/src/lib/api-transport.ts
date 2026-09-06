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

/** Taban URL — iki istemcide de AYNI kaynak ve AYNI varsayilan. */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

/** `/api` onekli tam URL (iki istemcide de AYNI desen). */
export function buildApiUrl(endpoint: string): string {
  return `${API_BASE_URL}/api${endpoint}`;
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
