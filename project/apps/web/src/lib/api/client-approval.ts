import { apiClient } from './client';

const STATUSES = ['DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED'] as const;
export type ClientApprovalStatus = typeof STATUSES[number];
export interface ClientApprovalRecord {
  id: string;
  caseId: string;
  clientId: string;
  subjectType: 'EXPENSE_REQUEST' | 'OPERATION' | 'OTHER';
  subjectLabel: string | null;
  title: string | null;
  description: string | null;
  status: ClientApprovalStatus;
  channel: 'EMAIL' | 'PORTAL' | 'MANUAL';
  requestedById: string | null;
  decision: 'APPROVE' | 'REJECT' | null;
  decisionNote: string | null;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  decidedAt: string | null;
  expiresAt: string | null;
}
export interface ClientApprovalEvent {
  id: string;
  eventType: 'CREATED' | 'SENT' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED';
  fromStatus: ClientApprovalStatus | null;
  toStatus: ClientApprovalStatus;
  byUserId: string | null;
  note: string | null;
  createdAt: string;
}
export interface ClientApprovalDetail extends ClientApprovalRecord { events: ClientApprovalEvent[] }

function invalid(): never { throw new Error('CLIENT_APPROVAL_RESPONSE_INVALID'); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return invalid();
  return value;
}
function text(value: unknown): string | null {
  if (value == null) return null;
  return typeof value === 'string' ? value : invalid();
}
function date(value: unknown): string {
  const result = id(value);
  return Number.isFinite(Date.parse(result)) ? result : invalid();
}
function optionalDate(value: unknown): string | null { return value == null ? null : date(value); }
function member<T extends string>(value: unknown, allowed: readonly T[]): T {
  return typeof value === 'string' && allowed.includes(value as T) ? value as T : invalid();
}
function record(value: unknown, caseId: string, tenantId: string): ClientApprovalRecord {
  const row = object(value);
  if (row.caseId !== caseId || row.tenantId !== tenantId) return invalid();
  return {
    id: id(row.id), caseId: id(row.caseId), clientId: id(row.clientId),
    subjectType: member(row.subjectType, ['EXPENSE_REQUEST', 'OPERATION', 'OTHER']),
    subjectLabel: text(row.subjectLabel), title: text(row.title), description: text(row.description),
    status: member(row.status, STATUSES), channel: member(row.channel, ['EMAIL', 'PORTAL', 'MANUAL']),
    requestedById: text(row.requestedById), decision: row.decision == null ? null : member(row.decision, ['APPROVE', 'REJECT'] as const),
    decisionNote: text(row.decisionNote), createdAt: date(row.createdAt), updatedAt: date(row.updatedAt),
    sentAt: optionalDate(row.sentAt), decidedAt: optionalDate(row.decidedAt), expiresAt: optionalDate(row.expiresAt),
  };
}
function unique<T extends { id: string }>(rows: T[]): T[] {
  if (new Set(rows.map(row => row.id)).size !== rows.length) return invalid();
  return rows;
}

// Read consumers: ClientApprovalLedgerCard only. No transition/write API is exposed here.
export const clientApprovalApi = {
  async list(caseId: string, tenantId: string): Promise<ClientApprovalRecord[]> {
    id(caseId); id(tenantId);
    const { data } = await apiClient.get<unknown>(`/client-approvals/case/${encodeURIComponent(caseId)}`);
    if (!Array.isArray(data)) return invalid();
    return unique(data.map(value => record(value, caseId, tenantId)));
  },
  async detail(parent: Pick<ClientApprovalRecord, 'id' | 'caseId' | 'clientId'>, tenantId: string): Promise<ClientApprovalDetail> {
    id(parent.id); id(parent.caseId); id(parent.clientId); id(tenantId);
    const { data } = await apiClient.get<unknown>(`/client-approvals/${encodeURIComponent(parent.id)}`);
    const raw = object(data), result = record(raw, parent.caseId, tenantId);
    if (result.id !== parent.id || result.clientId !== parent.clientId || !Array.isArray(raw.events)) return invalid();
    const events = unique(raw.events.map(value => {
      const event = object(value);
      if (event.approvalRequestId !== parent.id) return invalid();
      return {
        id: id(event.id), eventType: member(event.eventType, ['CREATED', 'SENT', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED']),
        fromStatus: event.fromStatus == null ? null : member(event.fromStatus, STATUSES),
        toStatus: member(event.toStatus, STATUSES), byUserId: text(event.byUserId), note: text(event.note), createdAt: date(event.createdAt),
      };
    }));
    return { ...result, events };
  },
};
