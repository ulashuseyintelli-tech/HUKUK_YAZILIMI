/**
 * OperationDeck "Finans" sekmesinde gerçek kaynağa BAĞLI alanların (tahsilat, masraf talebi) okuma durumu.
 *
 * Kural (owner kararı 2026-10-02): kaynak okunmadan ya da okunamamışken ekrana sayı, "0" ya da "kayıt yok" beyanı
 * yazılmaz — okunmamış / okunamamış kaynak sıfır ya da boş DEĞİLDİR. AYNI dosya ve AYNI para birimi bağlamında daha önce
 * başarıyla okunmuş veri, yenileme sürerken ya da yenileme düştüğünde ekranda kalabilir; ama güncel ya da hatasızmış gibi
 * sunulmaz (durumu yanında yazılır). Başka dosyanın ya da başka para birimi bağlamının verisi "son başarılı veri" sayılmaz.
 *
 * Buradaki yardımcılar yalnız DURUM türetir: tutar hesaplamaz, veri kaynağı bağlamaz, istek atmaz.
 *
 * Kullanıldığı yer:
 * - dosya detayı sayfası (`app/(dashboard)/cases/[id]/page.tsx`): iki okumanın durumunu türetir ve bileşene verir
 * - `components/case-detail/OperationDeck.tsx` ve `components/case-detail/FinanceSourceNotice.tsx`: durumu çözümler;
 *   değer ve liste yalnız veri VARKEN yazılır
 */

import { recordCurrencyCode } from "@/lib/record-currency-display";

/**
 * Bağlı bir kaynağın ekran durumu.
 *  - NOT_CONNECTED: durum bildirilmedi (varsayılan — güvenli taraf)
 *  - LOADING: ilk okuma sürüyor; gösterilebilecek başarılı veri yok
 *  - ERROR: okunamadı ve gösterilebilecek başarılı veri yok
 *  - READY: okundu; sıfır ve boş liste GERÇEK sıfır / gerçek "kayıt yok"tur
 *  - REFRESHING: son başarılı veri ekranda, yeniden okunuyor
 *  - REFRESH_FAILED: son başarılı veri ekranda, yeniden okuma düştü
 */
export type FinanceSourceStatus = "NOT_CONNECTED" | "LOADING" | "ERROR" | "READY" | "REFRESHING" | "REFRESH_FAILED";
/** Gösterilecek veri yokken yazılan durum. */
export type FinanceSourceUnavailableStatus = "NOT_CONNECTED" | "LOADING" | "ERROR";
/** Son başarılı veri ekrandayken yazılan yenileme durumu. */
export type FinanceSourceRefreshStatus = "REFRESHING" | "REFRESH_FAILED";

export interface FinanceSourceView {
  /** Çözümlenmiş durum (tanınmayan değer ERROR'a, verilmeyen değer NOT_CONNECTED'e düşer). */
  status: FinanceSourceStatus;
  /** Eldeki veri gösterilir mi: READY ya da son başarılı veri + yenileme notu. */
  hasData: boolean;
  /** Veri gösterilmiyorsa yerine yazılacak durum; veri gösteriliyorsa null. */
  unavailable: FinanceSourceUnavailableStatus | null;
  /** Veri gösteriliyorsa yenileme durumu; veri güncelse (READY) null. */
  refresh: FinanceSourceRefreshStatus | null;
}

const withData = (status: "READY" | FinanceSourceRefreshStatus): FinanceSourceView => ({
  status,
  hasData: true,
  unavailable: null,
  refresh: status === "READY" ? null : status,
});

const withoutData = (status: FinanceSourceUnavailableStatus): FinanceSourceView => ({
  status,
  hasData: false,
  unavailable: status,
  refresh: null,
});

/**
 * Bileşene verilen durumu çözümler. İzin listesiyle çalışır: yalnız tanınan üç durum veri gösterir. Durum verilmemişse
 * (`undefined` / `null`) NOT_CONNECTED, tanınmayan bir değerse ERROR sayılır — ikisinde de sayı yazılmaz.
 */
export function resolveFinanceSourceView(status: unknown): FinanceSourceView {
  switch (status) {
    case "READY":
    case "REFRESHING":
    case "REFRESH_FAILED":
      return withData(status);
    case "LOADING":
    case "ERROR":
    case "NOT_CONNECTED":
      return withoutData(status);
    case undefined:
    case null:
      return withoutData("NOT_CONNECTED");
    default:
      return withoutData("ERROR");
  }
}

export interface FinanceSourceReadState {
  /** Şu an ekranda gösterilen bağlam (`financeSourceContextKey`); null = bağlam henüz belli değil. */
  contextKey: string | null;
  /** Eldeki verinin — son BAŞARILI okumanın — bağlamı. */
  loadedKey: string | null;
  /** Son BAŞLATILAN okumanın bağlamı; `loading` ve `failed` o okumaya aittir. */
  attemptKey: string | null;
  /** Son başlatılan okuma sürüyor mu. */
  loading: boolean;
  /** Son başlatılan okuma hata ile mi bitti. */
  failed: boolean;
}

/**
 * Sayfanın bir okumaya ilişkin bildiklerinden ekran durumunu türetir.
 *
 * Eldeki veri yalnız okunduğu bağlamda geçerlidir: `loadedKey` gösterilen bağlamla aynı değilse veri yok sayılır ve ilk
 * okuma tamamlanana kadar LOADING, o okuma düşerse ERROR döner — READY dönmez. Başka bir bağlam için başlatılmış okumanın
 * `loading` / `failed` bilgisi bu bağlama taşınmaz.
 */
export function deriveFinanceSourceStatus(state: FinanceSourceReadState): Exclude<FinanceSourceStatus, "NOT_CONNECTED"> {
  const { contextKey } = state;
  if (contextKey === null) return "LOADING";
  const attemptIsCurrent = state.attemptKey === contextKey;
  const loading = attemptIsCurrent && state.loading;
  const failed = attemptIsCurrent && !state.loading && state.failed;
  if (state.loadedKey === contextKey) return loading ? "REFRESHING" : failed ? "REFRESH_FAILED" : "READY";
  return failed ? "ERROR" : "LOADING";
}

/**
 * Okumanın bağlam anahtarı: dosya + dosyanın para birimi (boş para birimi şema varsayılanı sayılır). Dosya kimliği yoksa
 * null döner: bağlam belli değilken hiçbir veri "bu bağlamın verisi" sayılmaz.
 */
export function financeSourceContextKey(caseId: string | null | undefined, currency: string | null | undefined): string | null {
  if (typeof caseId !== "string" || caseId === "") return null;
  return JSON.stringify([caseId, recordCurrencyCode(currency)]);
}
