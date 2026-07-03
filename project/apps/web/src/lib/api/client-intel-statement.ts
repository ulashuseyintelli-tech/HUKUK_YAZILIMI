import { apiClient } from './client';

/**
 * Client Intake / Müvekkil Analiz 4.7d-1 — ClientIntelStatement READ-ONLY API client.
 *
 * ⛔ MUHASEBE/ACCOUNTING DEĞİL: ClientIntelStatement = müvekkil analiz (intake) formlarından
 *    personel onayıyla promote edilen YUMUŞAK istihbarat beyanı (soft-6 kategori). Accounting
 *    statement / ClientStatement / cari ile İLGİSİ YOKTUR; karıştırılmaz.
 *
 * Read: listByCase/listByDebtor + get. Mutation (4.7D-2): create / retract / markFalsePositive /
 * supersede — capability kontrolü TAMAMEN backend'de (OfficeApprovalService.isApproverEligible);
 * bu client hiçbir yetki ön-kontrolü YAPMAZ, yalnız backend'in 403/400 mesajını olduğu gibi taşır
 * (apiClient.request() zaten Error.message = backend body.message). lib/api.ts monolitine
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

/** POST /client-intel-statements/case/:caseId gövdesi (backend CreateClientIntelStatementDto ile birebir). */
export interface CreateClientIntelStatementPayload {
  debtorId: string;
  category: ClientIntelCategory;
  label?: string;
  value: string;
  note?: string;
}

/** retract/false-positive gövdesi — yalnız opsiyonel gerekçe (backend TransitionClientIntelStatementDto). */
export interface TransitionClientIntelStatementPayload {
  note?: string;
}

/** supersede gövdesi — yeni içerik (backend SupersedeClientIntelStatementDto ile birebir). */
export interface SupersedeClientIntelStatementPayload {
  value: string;
  label?: string;
  note?: string;
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

  /**
   * Borçlu bazlı istihbarat listesi (status verilmezse backend default ACTIVE).
   * <remarks>GET /client-intel-statements/debtor/:debtorId?status=</remarks>
   */
  async listByDebtor(debtorId: string, status?: ClientIntelStatus): Promise<ClientIntelStatement[]> {
    const qs = status ? `?status=${encodeURIComponent(status)}` : '';
    const resp = await apiClient.get<ClientIntelStatement[]>(`/client-intel-statements/debtor/${debtorId}${qs}`);
    return resp.data;
  },

  /**
   * Borçlu için TÜM statülerdeki kayıtlar (READ-ONLY) — listByCaseAllStatuses ile birebir aynı desen.
   * <remarks>N× GET /client-intel-statements/debtor/:debtorId?status=</remarks>
   */
  async listByDebtorAllStatuses(debtorId: string): Promise<ClientIntelStatement[]> {
    const statuses: ClientIntelStatus[] = ['ACTIVE', 'RETRACTED', 'FALSE_POSITIVE', 'SUPERSEDED'];
    const groups = await Promise.all(statuses.map((s) => clientIntelStatementApi.listByDebtor(debtorId, s)));
    return groups.flat();
  },

  /**
   * Yeni beyan oluştur (ACTIVE). create() capability-gate'e tabi DEĞİLDİR (backend owner kararı,
   * yalnız retract/false-positive/supersede gate'li).
   * <remarks>POST /client-intel-statements/case/:caseId</remarks>
   */
  async create(caseId: string, payload: CreateClientIntelStatementPayload): Promise<ClientIntelStatement> {
    const resp = await apiClient.post<ClientIntelStatement>(`/client-intel-statements/case/${caseId}`, payload);
    return resp.data;
  },

  /**
   * Beyanı geri al (ACTIVE → RETRACTED). Backend capability-gate'li (403 → Error.message).
   * <remarks>POST /client-intel-statements/:id/retract</remarks>
   */
  async retract(id: string, payload?: TransitionClientIntelStatementPayload): Promise<ClientIntelStatement> {
    const resp = await apiClient.post<ClientIntelStatement>(`/client-intel-statements/${id}/retract`, payload ?? {});
    return resp.data;
  },

  /**
   * Beyanı yanlış-pozitif işaretle (ACTIVE → FALSE_POSITIVE). Backend capability-gate'li.
   * <remarks>POST /client-intel-statements/:id/false-positive</remarks>
   */
  async markFalsePositive(id: string, payload?: TransitionClientIntelStatementPayload): Promise<ClientIntelStatement> {
    const resp = await apiClient.post<ClientIntelStatement>(`/client-intel-statements/${id}/false-positive`, payload ?? {});
    return resp.data;
  },

  /**
   * Düzeltme: eskisi SUPERSEDED olur, yeni ACTIVE kayıt döner. Backend capability-gate'li.
   * <remarks>POST /client-intel-statements/:id/supersede</remarks>
   */
  async supersede(id: string, payload: SupersedeClientIntelStatementPayload): Promise<ClientIntelStatement> {
    const resp = await apiClient.post<ClientIntelStatement>(`/client-intel-statements/${id}/supersede`, payload);
    return resp.data;
  },
};
