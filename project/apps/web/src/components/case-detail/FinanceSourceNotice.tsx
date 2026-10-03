"use client";

import type { FinanceSourceStatus, FinanceSourceView } from "@/lib/operation-deck-finance-sources";

/**
 * OperationDeck "Finans" sekmesinde bağlı kaynakların (tahsilat, masraf talebi) durum yazıları.
 *
 * Kartta kısa durum, liste açıklamasında kaynağın adı yazılır. Okunamayan liste "kayıt yok" anlamına gelmez; ekranda
 * kalan son başarılı veri güncel ya da hatasızmış gibi sunulmaz. "Tekrar dene" yalnız ilgili kaynağı YENİDEN OKUR.
 */

type FinanceSourceKind = "collections" | "expenseRequests";

/** Son başarılı veri ekrandayken değerin yanına yazılan not. */
export const FINANCE_SOURCE_REFRESH_NOTE = {
  REFRESHING: "Güncelleniyor…",
  REFRESH_FAILED: "Güncellenemedi; son başarılı veri gösteriliyor",
} as const;

/** Liste açıklaması: kaynağı adıyla söyler. */
export const FINANCE_SOURCE_LIST_TEXT: Record<FinanceSourceKind, Record<Exclude<FinanceSourceStatus, "READY">, string>> = {
  collections: {
    NOT_CONNECTED: "Tahsilatlar henüz bu ekrana bağlanmadı. Bu, tahsilat bulunmadığı anlamına gelmez.",
    LOADING: "Tahsilatlar yükleniyor…",
    ERROR: "Tahsilatlar okunamadı. Bu, tahsilat bulunmadığı anlamına gelmez.",
    REFRESHING: "Tahsilatlar güncelleniyor…",
    REFRESH_FAILED: "Tahsilatlar güncellenemedi; son başarılı veri gösteriliyor.",
  },
  expenseRequests: {
    NOT_CONNECTED: "Masraf talepleri henüz bu ekrana bağlanmadı. Bu, masraf talebi bulunmadığı anlamına gelmez.",
    LOADING: "Masraf talepleri yükleniyor…",
    ERROR: "Masraf talepleri okunamadı. Bu, masraf talebi bulunmadığı anlamına gelmez.",
    REFRESHING: "Masraf talepleri güncelleniyor…",
    REFRESH_FAILED: "Masraf talepleri güncellenemedi; son başarılı veri gösteriliyor.",
  },
};

/** Kartta, son başarılı değerin altına yazılan yenileme notu. Veri güncelse (READY) hiçbir şey yazmaz. */
export function FinanceSourceRefreshNote({ view, testId }: { view: FinanceSourceView; testId: string }) {
  if (!view.refresh) return null;
  return (
    <p
      className={`mt-0.5 text-[10px] leading-snug ${
        view.refresh === "REFRESH_FAILED" ? "font-medium text-amber-800" : "text-slate-600"
      }`}
      data-testid={testId}
      data-source-status={view.status}
    >
      {FINANCE_SOURCE_REFRESH_NOTE[view.refresh]}
    </p>
  );
}

/**
 * Liste açıklaması. Kaynak READY iken hiçbir şey yazmaz. Okuma düştüyse (ERROR / REFRESH_FAILED) ve yeniden okuma
 * işleyicisi verilmişse "Tekrar dene" düğmesi çizer.
 */
export function FinanceSourceListNotice({
  source,
  view,
  onRetry,
  testId,
  retryTestId,
}: {
  source: FinanceSourceKind;
  view: FinanceSourceView;
  onRetry?: () => void;
  testId: string;
  retryTestId: string;
}) {
  if (view.status === "READY") return null;
  const text = FINANCE_SOURCE_LIST_TEXT[source][view.status];
  const failed = view.status === "ERROR" || view.status === "REFRESH_FAILED";

  if (!failed) {
    return (
      <p
        className="mt-2 text-[11px] leading-snug text-slate-500"
        role="status"
        data-testid={testId}
        data-source-status={view.status}
      >
        {text}
      </p>
    );
  }

  const tone =
    view.status === "ERROR" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900";
  const buttonTone =
    view.status === "ERROR" ? "bg-red-100 text-red-800 hover:bg-red-200" : "bg-amber-100 text-amber-900 hover:bg-amber-200";
  return (
    <div
      className={`mt-2 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs ${tone}`}
      role="status"
      data-testid={testId}
      data-source-status={view.status}
    >
      <span className="leading-snug">{text}</span>
      {onRetry && (
        <button
          type="button"
          onClick={() => onRetry()}
          className={`shrink-0 rounded px-2 py-1 ${buttonTone}`}
          data-testid={retryTestId}
        >
          Tekrar dene
        </button>
      )}
    </div>
  );
}
