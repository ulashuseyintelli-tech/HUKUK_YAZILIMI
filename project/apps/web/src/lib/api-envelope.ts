/**
 * OWN-12 ADIM B (owner D-2 b, 2026-09-06) — TEK CEVAP COZUMLEYICI.
 *
 * Neden: web tarafinda ayni "tolerant okuma" deseni (`res.data?.data ?? res.data`) 39 ayri
 * yerde elle yaziliydi. Her kopya kendi kenar durumunu (null gövde, dizi yanit, tek/cift zarf)
 * farkli ele aliyordu; bir ucun zarfi degistiginde hangi cagri yerinin bozuldugu goruleMEZdi.
 *
 * BU MODUL ZARF SOZLESMESINI DEGISTIRMEZ. Backend'in tek-zarf/cift-zarf davranisi AYNEN kalir
 * (owner: "yalniz kodu tek dosyada toplamak icin genis sozlesme degisikligi yapma"). Burada
 * yapilan tek sey: okuma tarafindaki TOLERANT deseni tek, test edilebilir bir yere almak.
 *
 * Kullanim:
 *   const client = unwrapEnvelope<Client>(await api.get('/clients/1'));
 *   const rows = unwrapList<Client>(await api.get('/clients'));
 */

/** Ic zarf (`{ data: T }`) tasiyan nesne mi? */
function hasDataProp(value: unknown): value is { data: unknown } {
  return !!value && typeof value === 'object' && 'data' in (value as Record<string, unknown>);
}

/**
 * Cift zarfi (`{ data: { data: T } }`) ve tek zarfi (`{ data: T }`) AYNI sekilde cozer;
 * zarfsiz gövdeyi oldugu gibi doner. Dizi gövdesi zarf SAYILMAZ.
 *
 * `null`/`undefined` gövde `null` doner (cagiran varsayilanini uygulayabilsin).
 */
export function unwrapEnvelope<T = unknown>(response: unknown): T | null {
  let current: unknown = response;
  // En fazla iki katman: apiClient sarmasi + controller zarfi. Daha derini SOZLESME DISI.
  for (let depth = 0; depth < 2; depth += 1) {
    if (!hasDataProp(current) || Array.isArray(current)) break;
    current = (current as { data: unknown }).data;
  }
  return (current ?? null) as T | null;
}

/**
 * Liste uclari icin: cozulen gövde dizi degilse BOS dizi doner (arayuz "undefined.map" ile
 * patlamaz). Zarf sozlesmesi degismez; yalniz okuma güvenli hale gelir.
 */
export function unwrapList<T = unknown>(response: unknown): T[] {
  const value = unwrapEnvelope<unknown>(response);
  return Array.isArray(value) ? (value as T[]) : [];
}
