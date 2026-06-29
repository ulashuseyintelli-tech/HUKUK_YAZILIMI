import { apiClient } from './client';

/**
 * Client Intake / Müvekkil Analiz 4.7d-1 — ClientIntelStatement READ-ONLY API client.
 *
 * ⛔ MUHASEBE/ACCOUNTING DEĞİL: ClientIntelStatement = müvekkil analiz (intake) formlarından
 *    personel onayıyla promote edilen YUMUŞAK istihbarat beyanı (soft-6 kategori). Accounting
 *    statement / ClientStatement / cari ile İLGİSİ YOKTUR; karıştırılmaz.
 *
 * Bu sprint (4.7d-1) YALNIZ read-only: listByCase + get. Mutation'lar BİLİNÇLİ DIŞARIDA
 * (4.7d-2): retract / falsePositive / supersede / create EKLENMEDİ. lib/api.ts monolitine
 * DOKUNULMAZ — domain-local modüler client (client-offset/client-statement deseni).
 *
 * Envelope: apiClient.get/post payload'u {data: body} olarak BİR KEZ sarar; controller
 * payload'u DOĞRUDAN döner (tek-zarf) → doğru unwrap = resp.data (resp.data.data DEĞİL).
 */

export type ClientIntelCategory =
  | 'INCOME_SOURCE'
  | 'COMMERCIAL_RELATION'
  | 'FAMILY_CIRCLE'
  | 'DIGITAL_FOOTPRINT'
  | 'PAYMENT_HISTORY'
  | 'STRATEGY';

export type ClientIntelStatus = 'ACTIVE' | 'RETRACTED' | 'SUPERSEDED' | 'FALSE_POSITIVE';
export type ClientIntelSource = 'CLIENT_DECLARATION';
export type ClientIntelConfidence = 'DECLARED';

/** ClientIntelStatement read modeli (backend entity birebir; value IMMUTABLE beyan). */
export interface ClientIntelStatement {
  id: string;
  tenantId: string;
  caseId: string;
  debtorId: string;
  category: ClientIntelCategory;
  label: string | null;
  value: string;
  note: string | null;
  source: ClientIntelSource;
  confidence: ClientIntelConfidence;
  status: ClientIntelStatus;
  supersededById: string | null;
  supersededAt: string | null;
  revokedAt: string | null;
  revokedById: string | null;
  lifecycleNote: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export const clientIntelStatementApi = {
  /**
   * Dosya bazlı istihbarat listesi (status verilmezse backend default ACTIVE).
   * <remarks>GET /client-intel-statements/case/:caseId?status=</remarks>
   */
  async listByCase(caseId: string, status?: ClientIntelStatus): Promise<ClientIntelStatement[]> {
    const qs = status ? `?status=${encodeURIComponent(status)}` : '';
    const resp = await apiClient.get<ClientIntelStatement[]>(`/client-intel-statements/case/${caseId}${qs}`);
    return resp.data;
  },

  /**
   * Tek istihbarat beyanı.
   * <remarks>GET /client-intel-statements/:id</remarks>
   */
  async get(id: string): Promise<ClientIntelStatement> {
    const resp = await apiClient.get<ClientIntelStatement>(`/client-intel-statements/${id}`);
    return resp.data;
  },

  /**
   * Dosya için TÜM statülerdeki kayıtlar (READ-ONLY): ACTIVE + RETRACTED + FALSE_POSITIVE +
   * SUPERSEDED. Backend "all" endpoint'i YOK → mevcut listByCase status başına paralel çağrılır
   * ve birleştirilir. Yeni endpoint / mutation EKLENMEZ (4.7d-2a inactive görünürlük).
   * <remarks>N× GET /client-intel-statements/case/:caseId?status=</remarks>
   */
  async listByCaseAllStatuses(caseId: string): Promise<ClientIntelStatement[]> {
    const statuses: ClientIntelStatus[] = ['ACTIVE', 'RETRACTED', 'FALSE_POSITIVE', 'SUPERSEDED'];
    const groups = await Promise.all(statuses.map((s) => clientIntelStatementApi.listByCase(caseId, s)));
    return groups.flat();
  },
};
