import { apiClient } from './client';

export interface NativeStatementRender {
  currency: string;
  openingBalance: string;
  closingBalance: string;
  lines: { lineDate: string; label: string; note: string | null; debit: string; credit: string; runningBalance: string; isInformational: boolean; informationalAmount: string | null; fileReference: { value: string } | null }[];
}
export interface NativeStatementSet {
  id: string;
  clientId: string;
  status: 'ACTIVE' | 'SUPERSEDED' | 'VOID';
  periodStart: string;
  periodEnd: string;
  sourceCutAt: string;
  memberCount: number;
  memberHash: string;
  documents: { id: string; currency: string; renderHash: string; render: NativeStatementRender }[];
  artifactOutcome?: 'COMPLETE' | 'FAILED';
  deliveries?: { status: 'PENDING' | 'SENT' | 'FAILED'; attempts: number; nextRetryAt: string | null; sentAt: string | null }[];
}

const base = '/client-statement-sets';
const encode = encodeURIComponent;
export const nativeStatementApi = {
  async list(clientId: string): Promise<NativeStatementSet[]> { return (await apiClient.get<NativeStatementSet[]>(`${base}/client/${encode(clientId)}`)).data; },
  async create(clientId: string, period: { periodStart: string; periodEnd: string }): Promise<NativeStatementSet> { return (await apiClient.post<NativeStatementSet>(`${base}/client/${encode(clientId)}`, period)).data; },
  async supersede(id: string): Promise<NativeStatementSet> { return (await apiClient.post<NativeStatementSet>(`${base}/${encode(id)}/supersede`)).data; },
  async void(id: string, note: string): Promise<unknown> { return (await apiClient.post(`${base}/${encode(id)}/void`, { note })).data; },
  async retry(id: string): Promise<{ enabled: boolean; target: { outcome: string; reason?: string } | null }> { return (await apiClient.post<{ enabled: boolean; target: { outcome: string; reason?: string } | null }>(`${base}/${encode(id)}/monthly-delivery/retry`)).data; },
  async pdf(id: string, currency: string): Promise<Blob> { return (await apiClient.get<Blob>(`${base}/${encode(id)}/pdf/${encode(currency)}`, { responseType: 'blob' })).data; },
};
