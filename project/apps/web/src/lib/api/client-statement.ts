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
  caseClientId: string | null;
  /** Decimal string. */
  debit: string;
  credit: string;
  runningBalance: string;
  note: string | null;
}

export interface ClientStatement {
  id: string;
  caseId: string;
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

  /** Ekstreyi yenile = supersede (eski SUPERSEDED + yeni ACTIVE). */
  async supersede(id: string, input: SupersedeStatementInput): Promise<ClientStatement> {
    const resp = await apiClient.post<ClientStatement>(`/client-statements/${id}/supersede`, input);
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
