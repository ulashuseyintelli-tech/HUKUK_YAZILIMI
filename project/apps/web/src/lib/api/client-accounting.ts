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
  /** Takip başlangıç tarihi (ISO) — ekstre default period fallback'i için (Faz7-E). */
  caseOpenedAt: string | null;
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

export interface CreatePayoutInput {
  caseId: string;
  caseClientId: string;
  /** Pozitif; backend Decimal(15,2). amount<=outstanding ön-kontrol UI'da, OTORİTE backend. */
  amount: number | string;
  currency?: string;
  note?: string;
  /** Tenant-scoped duplicate guard; client-side üretilir (her gönderim oturumu için tek). */
  idempotencyKey: string;
}

export interface CreatePayoutResult {
  created: boolean;
  payoutId: string;
  idempotentReplay?: boolean;
}

/** ExpenseRequest dosya/müvekkil masraf özeti. Tutarlar number (backend toplar; UI hesaplamaz). */
export interface ExpenseCaseSummary {
  totalRequested: number;
  totalPaid: number;
  totalPending: number;
  requestCount: number;
  paidCount: number;
  pendingCount: number;
  blockingUnpaid: number;
}

/** Masraf-avansı (CaseBalance) bakiyesi. balance Decimal-string. */
export interface CaseBalanceInfo {
  balance: string;
  currency: string;
}

/** Faz A — Genel Cari dosya kırılımı satırı (Decimal string). A=müvekkile özgü, B=dosya geneli. */
export interface ClientCaseBreakdownItem {
  caseId: string;
  caseNumber: string;
  executionFileNumber: string | null;
  role: string;
  // A — müvekkile özgü
  payableNet: string;
  paidToClient: string;
  expenseRequested: string;
  expensePaid: string;
  // B — dosya geneli / paylaşılan bağlam (müvekkile atfedilmez)
  debtorCollection: string;
  pendingDistribution: string;
  advanceBalance: string;
  needsReview: boolean;
}

/** Faz A — Müvekkil Genel Cari (client-level read-only projection). Tutarlar Decimal-string. */
export interface ClientAccountingSummary {
  clientId: string;
  currency: string;
  clientScoped: {
    payableNet: string;
    paidToClient: string;
    expenseRequested: string;
    expensePaid: string;
    expenseUnpaid: string;
    offsettableNetPosition: string; // BİLGİ; defter kaydı değil
  };
  caseScopedContext: {
    debtorCollection: string;
    pendingDistribution: string;
    advanceBalance: string;
  };
  needsReview: boolean;
  caseBreakdown: ClientCaseBreakdownItem[];
}

/** Faz A-MOV — birleşik hareket kaynak tipleri (backend ile aynı). */
export type MovementSourceType =
  | 'COLLECTION'
  | 'COLLECTION_DISPOSITION'
  | 'CLIENT_PAYOUT'
  | 'EXPENSE_REQUEST'
  | 'EXPENSE_PAYMENT'
  | 'CASE_BALANCE';

export type MovementScopeGroup = 'CLIENT_SPECIFIC' | 'CASE_CONTEXT';

export type MovementClientEffect =
  | 'INCREASE_CLIENT_PAYABLE'
  | 'DECREASE_CLIENT_PAYABLE'
  | 'INCREASE_CLIENT_EXPENSE_DEBT'
  | 'DECREASE_CLIENT_EXPENSE_DEBT'
  | 'NO_DIRECT_CLIENT_EFFECT';

/**
 * Faz A-MOV — tek birleşik hareket satırı (read-only). `amount` her zaman pozitif Decimal-string;
 * yön `clientEffect` ile gelir (running balance YOK). CASE_CONTEXT satırları NO_DIRECT_CLIENT_EFFECT
 * (dosya geneli, müvekkile atfedilmez). UI bu değerleri HESAPLAMAZ, yalnız gösterir.
 */
export interface ClientAccountingMovement {
  id: string;
  sourceType: MovementSourceType;
  sourceId: string;
  scopeGroup: MovementScopeGroup;
  occurredAt: string; // ISO
  caseId: string;
  caseNo: string;
  caseClientId: string | null;
  label: string;
  description: string | null;
  amount: string; // Decimal string (pozitif)
  currency: string;
  clientEffect: MovementClientEffect;
  status: string;
  needsReview?: boolean;
}

export interface ClientMovementsResult {
  items: ClientAccountingMovement[];
  page: number;
  pageSize: number;
  total: number;
}

export interface MovementsParams {
  scope?: 'client' | 'case';
  caseId?: string;
  group?: MovementScopeGroup;
  currency?: string;
  page?: number;
  pageSize?: number;
  from?: string;
  to?: string;
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

  /**
   * Müvekkile ödeme kaydı (POST /client-payouts). D1: ClientPayout + CLIENT_PAYOUT_SENT;
   * masraf-avansı defterine YAZILMAZ. Over-payout / idempotency-conflict / scope hatalarını
   * backend döner (UI yalnız iletir, hesap yapmaz).
   */
  async createPayout(input: CreatePayoutInput): Promise<CreatePayoutResult> {
    const resp = await apiClient.post<{ data: CreatePayoutResult }>('/client-payouts', input);
    return resp.data.data;
  },

  /**
   * Faz A — Müvekkil Genel Cari (client-level read-only projection). scope=client.
   * A grubu müvekkile özgü, B grubu dosya geneli + dosya kırılımı. Çift zarf (response.data.data).
   */
  async getClientSummary(clientId: string, currency = 'TRY'): Promise<ClientAccountingSummary> {
    const qs = new URLSearchParams({ currency });
    const resp = await apiClient.get<{ data: ClientAccountingSummary }>(
      `/clients/${clientId}/accounting/summary?${qs.toString()}`,
    );
    return resp.data.data;
  },

  /**
   * Faz A-MOV — Müvekkil Genel Cari birleşik hareket listesi (read-only). Çift zarf (response.data.data).
   * scope=client (tüm eligible dosyalar) | case (tek dosya). group A/B izole eder. Tutarlar backend'den
   * (UI HESAPLAMAZ). Mahsup/ekstre/export YOK; bu yalnız hareket görüntüsüdür.
   */
  async getMovements(clientId: string, params: MovementsParams = {}): Promise<ClientMovementsResult> {
    const qs = new URLSearchParams();
    if (params.scope) qs.set('scope', params.scope);
    if (params.caseId) qs.set('caseId', params.caseId);
    if (params.group) qs.set('group', params.group);
    qs.set('currency', params.currency ?? 'TRY');
    if (params.page) qs.set('page', String(params.page));
    if (params.pageSize) qs.set('pageSize', String(params.pageSize));
    if (params.from) qs.set('from', params.from);
    if (params.to) qs.set('to', params.to);
    const resp = await apiClient.get<{ data: ClientMovementsResult }>(
      `/clients/${clientId}/accounting/movements?${qs.toString()}`,
    );
    return resp.data.data;
  },

  /**
   * Faz7-V — SEÇİLİ müvekkilin bu dosyadaki masraf özeti (ExpenseRequest, clientId filtreli).
   * "Müvekkilden Talep Edilen / Tahsil Edilen Masraf" kartlarını besler. Backend toplar; UI
   * liste çekip kendi toplamını HESAPLAMAZ. NOT: expense-request controller payload'u DOĞRUDAN
   * döner → tek zarf (response.data), client-settlement'taki çift zarf DEĞİL.
   */
  async getExpenseSummary(caseId: string, clientId: string): Promise<ExpenseCaseSummary> {
    const qs = new URLSearchParams({ clientId });
    const resp = await apiClient.get<ExpenseCaseSummary>(
      `/expense-requests/case/${caseId}/summary?${qs.toString()}`,
    );
    return resp.data;
  },

  /** Faz7-V — masraf/avans bakiyesi (CaseBalance). Tek zarf (response.data). Payout defteri DEĞİL. */
  async getCaseBalance(caseId: string): Promise<CaseBalanceInfo> {
    const resp = await apiClient.get<{ balance?: string | number; currency?: string }>(
      `/cases/${caseId}/balance`,
    );
    return { balance: String(resp.data?.balance ?? '0'), currency: resp.data?.currency ?? 'TRY' };
  },

  /** Faz7-V — borçludan dosyaya gelen toplam tahsilat (calculation-summary.toplamTahsilat). Tek zarf. */
  async getDebtorCollectionTotal(caseId: string): Promise<number> {
    const resp = await apiClient.get<{ toplamTahsilat?: number }>(
      `/cases/${caseId}/calculation-summary`,
    );
    return Number(resp.data?.toplamTahsilat ?? 0);
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
