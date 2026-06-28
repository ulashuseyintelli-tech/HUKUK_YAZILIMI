import { apiClient } from './client';

/**
 * TM3 Faz 7-E — Müvekkil Ekstresi (ClientStatement) API katmanı.
 *
 * Ekstre = IMMUTABLE snapshot. create()/supersede() MUTATION'dur (backend #564 guard'lı:
 * period-scoped tek-ACTIVE + advisory-lock + audit). Düzeltme = supersede (yeni ACTIVE + eski SUPERSEDED).
 *
 * NOT: client-statement controller payload'u DOĞRUDAN döner → TEK zarf (response.data),
 * client-settlement'taki çift zarf DEĞİL.
 */

export type ClientStatementStatus = 'ACTIVE' | 'SUPERSEDED' | 'VOID';

export interface ClientStatementLine {
  id: string;
  lineDate: string;
  lineType: string;
  refType: string;
  refId: string;
  /** Faz B: client-level ekstre satırında DOLU (kaynak dosya); case-level'da null. */
  caseId: string | null;
  caseClientId: string | null;
  /** Decimal string. */
  debit: string;
  credit: string;
  runningBalance: string;
  note: string | null;
}

export interface ClientStatement {
  id: string;
  /** Faz B: client-level ekstrede null (tüm dosyalar); case-level'da dolu. */
  caseId: string | null;
  clientId: string;
  periodStart: string;
  periodEnd: string;
  openingBalance: string;
  closingBalance: string;
  currency: string;
  status: ClientStatementStatus;
  supersededById: string | null;
  note: string | null;
  generatedById: string;
  createdAt: string;
  lines?: ClientStatementLine[]; // findOne (detay) içerir
}

export interface CreateStatementInput {
  clientId: string;
  periodStart: string; // ISO
  periodEnd: string; // ISO
  includeRequests?: boolean;
  note?: string;
}

export interface SupersedeStatementInput {
  periodStart: string;
  periodEnd: string;
  includeRequests?: boolean;
  note?: string;
}

/** Faz B — client-level (genel) ekstre üretimi. clientId URL'den; caseId/includeRequests YOK. */
export interface CreateClientLevelStatementInput {
  periodStart: string;
  periodEnd: string;
  note?: string;
}

export const clientStatementApi = {
  /** Dosya bazlı liste (default ACTIVE). */
  async list(caseId: string): Promise<ClientStatement[]> {
    const resp = await apiClient.get<ClientStatement[]>(`/client-statements/case/${caseId}`);
    return resp.data;
  },

  /** Tek ekstre + satırlar. */
  async get(id: string): Promise<ClientStatement> {
    const resp = await apiClient.get<ClientStatement>(`/client-statements/${id}`);
    return resp.data;
  },

  /** Yeni ekstre üret (MUTATION). Aynı dönem ACTIVE varsa backend ConflictException döner → supersede. */
  async create(caseId: string, input: CreateStatementInput): Promise<ClientStatement> {
    const resp = await apiClient.post<ClientStatement>(`/client-statements/case/${caseId}`, input);
    return resp.data;
  },

  /** Ekstreyi yenile = supersede (eski SUPERSEDED + yeni ACTIVE). Client-level ekstrede de aynı endpoint
   *  (backend old.caseId=null → client-level dalı). */
  async supersede(id: string, input: SupersedeStatementInput): Promise<ClientStatement> {
    const resp = await apiClient.post<ClientStatement>(`/client-statements/${id}/supersede`, input);
    return resp.data;
  },

  // ── Faz B: CLIENT-LEVEL (genel) ekstre ──

  /** Müvekkilin genel (client-level, caseId=null) ekstreleri (default ACTIVE). */
  async listByClient(clientId: string): Promise<ClientStatement[]> {
    const resp = await apiClient.get<ClientStatement[]>(`/client-statements/client/${clientId}`);
    return resp.data;
  },

  /** Genel ekstre üret (MUTATION; yalnız CLIENT_SPECIFIC hareketler). Aynı dönem ACTIVE varsa → supersede. */
  async createClientLevel(clientId: string, input: CreateClientLevelStatementInput): Promise<ClientStatement> {
    const resp = await apiClient.post<ClientStatement>(`/client-statements/client/${clientId}`, input);
    return resp.data;
  },
};

/** ISO/Date → date-input (YYYY-MM-DD). */
export function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** date-input + gün → date-input. */
export function addDaysInput(dateInput: string, days: number): string {
  const d = new Date(`${dateInput}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateInput(d);
}

export const STATEMENT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Aktif',
  SUPERSEDED: 'Yenilendi',
  VOID: 'Geçersiz',
};

/**
 * Faz B — client-level ekstre satır tipi → hukuk bürosu dili (KİLİTLİ; Ulaş).
 * DİKKAT: CLIENT_PAYMENT burada "müvekkilden masraf tahsilatı"dır → "Masraf Tahsil Edildi"
 * (ASLA "müvekkile ödeme" DEĞİL; o CLIENT_PAYOUT_SENT'tir). Bilinmeyen tip ham gösterilir.
 */
export const CLIENT_STATEMENT_LINE_LABELS: Record<string, string> = {
  CASE_COLLECTION_PAYABLE: 'Müvekkile Borç Oluştu',
  CLIENT_PAYOUT_SENT: 'Müvekkile Ödeme Yapıldı',
  EXPENSE_REQUESTED: 'Müvekkilden Masraf Talep Edildi',
  CLIENT_PAYMENT: 'Masraf Tahsil Edildi',
};
