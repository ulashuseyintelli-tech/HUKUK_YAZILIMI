import { apiClient } from './client';

/**
 * TM3 Faz 7 — Müvekkil Muhasebesi (read-only) API katmanı.
 *
 * Backend addendum (PR #554) ile uçtan uca gerçek contract:
 *  - GET /clients/:clientId/accounting/cases
 *  - GET /collection-dispositions/case/:caseId/outstanding?caseClientId=&currency=
 *  - GET /client-payouts?caseId=&caseClientId=&currency=&from=&to=&page=&limit=
 *
 * KRİTİK: finansal scope `caseClientId`'dir, `clientId` DEĞİL. clientId yalnız sayfa bağlamı
 * (müvekkilin dosyalarını listelemek için). Outstanding backend'de hesaplanır — UI HESAPLAMAZ.
 *
 * Tutarlar backend'de Decimal(15,2) → string olarak gelir. `Number(...)` yalnız GÖSTERİM içindir;
 * UI hiçbir bakiye/borç hesabı yapmaz (otorite backend, drift yok).
 *
 * Not: controller'lar `{ data: <payload> }` döner; apiClient.get tekrar `{ data }` sarar →
 * gerçek payload `response.data.data`'dadır (çift zarf).
 */

export type CaseClientRole = 'ALACAKLI' | 'ORTAK_ALACAKLI';

export interface ClientAccountingCase {
  caseId: string;
  caseClientId: string;
  role: CaseClientRole | string;
  caseNumber: string;
  executionFileNumber: string | null;
  currency: string;
}

export interface OutstandingResult {
  caseId: string;
  caseClientId: string;
  currency: string;
  /** Decimal string. Σ POSTED CLIENT_PAYABLE (Collection CONFIRMED) − Σ RECORDED ClientPayout. */
  outstanding: string;
}

export interface ClientPayoutListItem {
  id: string;
  caseId: string;
  caseClientId: string;
  /** Decimal string. */
  amount: string;
  currency: string;
  status: string; // RECORDED
  paidAt: string; // ISO
  paidById: string;
  note: string | null;
}

export interface PaginatedPayouts {
  items: ClientPayoutListItem[];
  page: number;
  limit: number;
  total: number;
}

export interface ListPayoutsParams {
  caseId: string;
  caseClientId: string;
  currency?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export const clientAccountingApi = {
  /** Müvekkilin (eligible) dosyaları + caseClientId resolve. */
  async getCases(clientId: string): Promise<ClientAccountingCase[]> {
    const resp = await apiClient.get<{ data: { items: ClientAccountingCase[] } }>(
      `/clients/${clientId}/accounting/cases`,
    );
    return resp.data.data.items;
  },

  /** Seçili dosya + alacaklı için müvekkile-borç (backend otorite). */
  async getOutstanding(caseId: string, caseClientId: string, currency = 'TRY'): Promise<OutstandingResult> {
    const qs = new URLSearchParams({ caseClientId, currency });
    const resp = await apiClient.get<{ data: OutstandingResult }>(
      `/collection-dispositions/case/${caseId}/outstanding?${qs.toString()}`,
    );
    return resp.data.data;
  },

  /** Müvekkile yapılan ödemeler (paginated). */
  async listPayouts(params: ListPayoutsParams): Promise<PaginatedPayouts> {
    const qs = new URLSearchParams();
    qs.set('caseId', params.caseId);
    qs.set('caseClientId', params.caseClientId);
    if (params.currency) qs.set('currency', params.currency);
    if (params.from) qs.set('from', params.from);
    if (params.to) qs.set('to', params.to);
    if (params.page) qs.set('page', String(params.page));
    if (params.limit) qs.set('limit', String(params.limit));
    const resp = await apiClient.get<{ data: PaginatedPayouts }>(`/client-payouts?${qs.toString()}`);
    return resp.data.data;
  },
};

/**
 * Decimal-string tutarı TRY gösterimine çevirir. Number() yalnız GÖSTERİM içindir
 * (UI hesap yapmaz; backend otorite). Geçersizse ham string + currency döner.
 */
export function formatMoneyString(amount: string, currency = 'TRY'): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return `${amount} ${currency}`;
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency }).format(n);
}

/** Rol etiketleri (UI gösterimi). */
export const ROLE_LABELS: Record<string, string> = {
  ALACAKLI: 'Alacaklı',
  ORTAK_ALACAKLI: 'Ortak Alacaklı',
};
