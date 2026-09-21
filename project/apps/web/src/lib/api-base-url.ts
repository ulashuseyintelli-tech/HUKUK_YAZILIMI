/**
 * API TABAN ADRESİ — tek kaynak.
 *
 * SORUN (ölçüldü 2026-09-21): canlı web derlemesinde `NEXT_PUBLIC_API_URL` verilmediği için
 * `http://localhost:8080` paketin içine gömülüyordu (19 yer). Uzak cihazdaki tarayıcı API'yi
 * KENDİ makinesinde arar; müvekkil portalı ve intake formu dışarıdan çalışmaz.
 *
 * ÇÖZÜM (en küçük, mimariye uygun): alan adı derlemeye GÖMÜLMEZ.
 *  1. `NEXT_PUBLIC_API_URL` açıkça verilmişse O kullanılır — mevcut sözleşme korunur.
 *  2. Verilmemişse ve kod TARAYICIDA, YEREL OLMAYAN bir host üzerinde çalışıyorsa taban BOŞ
 *     bırakılır: istekler `/api/...` olarak AYNI ORIGIN'e gider ve kenar katmanı `/api` yolunu
 *     API'ye yönlendirir. Böylece tek derleme her alan adında çalışır.
 *  3. Diğer her durumda (sunucu tarafı, `localhost`/`127.0.0.1` üzerinden personel erişimi)
 *     davranış BİREBİR eskisi gibidir: `http://localhost:8080`.
 *
 * Bu dosya tek başına dış erişimi sağlamaz; kenar katmanının `/api` yönlendirmesi ve izin
 * listesi şarttır (bkz. `client-external-access-r01/CLIENT-EXTERNAL-ACCESS-PACKAGE-R01.md`).
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", ""]);

/** Yerel geliştirme/personel erişimi için varsayılan. */
export const DEFAULT_API_BASE_URL = "http://localhost:8080";

/**
 * Taban adresi çağrı anında çözer. Sonuç boş dize olabilir; bu AYNI ORIGIN demektir
 * (`${base}/api${endpoint}` → `/api/...`).
 */
export function resolveApiBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_API_URL;
  if (explicit && explicit.trim() !== "") return explicit.replace(/\/+$/, "");

  if (typeof window !== "undefined" && window.location) {
    const host = String(window.location.hostname || "").toLowerCase();
    if (!LOCAL_HOSTS.has(host)) return "";
  }
  return DEFAULT_API_BASE_URL;
}
