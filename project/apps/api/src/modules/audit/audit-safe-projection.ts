import { maskEmail, maskIban, maskIdentity, maskPhone, maskTckn } from '../../common/pii-mask.util';

type SafeScalar = string | number | boolean | null;
export type AuditSafeProjectionValue = SafeScalar | AuditSafeProjectionValue[] | { [key: string]: AuditSafeProjectionValue };

export interface AuditSafeProjectionInput {
  id?: string;
  tenantId?: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  userId?: string | null;
  userName?: string | null;
  description?: string | null;
  metadata?: unknown;
  oldValues?: unknown;
  newValues?: unknown;
  createdAt?: Date | string | null;
}

export interface AuditSafeProjection {
  id?: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actor: {
    id: string | null;
    displayName: string | null;
  };
  description: string | null;
  metadata?: Record<string, AuditSafeProjectionValue>;
  oldValues?: Record<string, AuditSafeProjectionValue>;
  newValues?: Record<string, AuditSafeProjectionValue>;
  rawValuePresence: {
    metadata: boolean;
    oldValues: boolean;
    newValues: boolean;
  };
  createdAt?: Date | string | null;
}

const SAFE_EXACT_KEYS = new Set([
  'action',
  'actionCode',
  'amount',
  'authorizationMode',
  'caseClientId',
  'caseId',
  'clientId',
  'closureMethod',
  'currency',
  'entityId',
  'entityType',
  'evidenceRef',
  'expenseCaseId',
  'expenseRequestId',
  'kind',
  'manualReversalId',
  'offsetId',
  'payableCaseClientId',
  'payableCaseId',
  'requestId',
  'result',
  'reversesOffsetId',
  'role',
  'source',
  'status',
  'tenantId',
  'userId',
  'workflowStatus',
]);

const SAFE_KEY_SUFFIXES = [
  'Id',
  'Ids',
  'Ref',
  'Refs',
  'Reference',
  'Hash',
  'Digest',
  'Fingerprint',
  'Present',
  'Length',
  'Count',
  'Total',
  'Amount',
  'Currency',
  'Status',
  'Mode',
  'Code',
] as const;

const SECRET_KEY_PATTERN = /(authorization|cookie|password|passwd|secret|token|jwt|api[-_]?key|access[-_]?key|private[-_]?key|credential|session|bearer|cvv|cvc|pan|card)/i;
const STACK_TRACE_PATTERN = /(?:^|\n)\s*at\s+[^\n]+\([^\n]+:\d+:\d+\)|\b[A-Za-z]+Error:\s+[^\n]+/;
const SQL_PATTERN = /\b(select|insert|update|delete|drop|alter|create)\b[\s\S]{0,80}\b(from|into|table|where|join|values|set)\b/i;
const PROMPT_INJECTION_PATTERN = /\b(ignore (all )?(previous|prior) instructions|system prompt|developer message|act as|jailbreak)\b/i;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const API_KEY_PATTERN = /\b(?:sk|pk|rk|ghp|github_pat|AIza)[A-Za-z0-9_\-]{12,}\b/g;
const CARD_PATTERN = /\b(?:\d[ -]*?){13,19}\b/g;
const CVV_PATTERN = /\bcvv\s*[:=]?\s*\d{3,4}\b/gi;
const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const IBAN_PATTERN = /\bTR\d{2}[\s-]?(?:\d[\s-]?){22}\b/gi;
const PHONE_PATTERN = /(?<!\d)(?:\+90|0)?5\d{9}(?!\d)/g;
const TCKN_PATTERN = /(?<!\d)\d{11}(?!\d)/g;
const TAX_NO_PATTERN = /(?<!\d)\d{10}(?!\d)/g;

/**
 * Central safe projection for audit readers. It is intentionally pure and is not wired to generic
 * /audit endpoints in C2D-PD-1B, so existing API contracts remain unchanged.
 */
export function projectAuditLogSafe(row: AuditSafeProjectionInput): AuditSafeProjection {
  return {
    id: row.id,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId ?? null,
    actor: {
      id: row.userId ?? null,
      displayName: row.userName ? sanitizeSafeText(row.userName) : null,
    },
    description: sanitizeSystemDescription(row.description),
    metadata: projectAuditObject(row.metadata),
    oldValues: projectAuditObject(row.oldValues),
    newValues: projectAuditObject(row.newValues),
    rawValuePresence: {
      metadata: isPlainObject(row.metadata),
      oldValues: isPlainObject(row.oldValues),
      newValues: isPlainObject(row.newValues),
    },
    createdAt: row.createdAt,
  };
}

export function projectAuditObject(raw: unknown): Record<string, AuditSafeProjectionValue> | undefined {
  if (!isPlainObject(raw)) return undefined;
  const out: Record<string, AuditSafeProjectionValue> = {};
  for (const [key, value] of Object.entries(raw)) {
    const projected = projectAuditEntry(key, value);
    if (projected !== undefined) out[key] = projected;
  }
  return Object.keys(out).length ? out : undefined;
}

function projectAuditEntry(key: string, value: unknown): AuditSafeProjectionValue | undefined {
  if (!isSafeKey(key)) return undefined;
  if (SECRET_KEY_PATTERN.test(key) && key !== 'authorizationMode') return '[masked]';
  return projectSafeValue(value);
}

function projectSafeValue(value: unknown): AuditSafeProjectionValue | undefined {
  if (value === null) return null;
  if (typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return sanitizeSafeText(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    const projected = value.map((item) => projectSafeValue(item)).filter((item): item is AuditSafeProjectionValue => item !== undefined);
    return projected.length ? projected.slice(0, 50) : undefined;
  }
  if (isPlainObject(value)) {
    return projectAuditObject(value);
  }
  return undefined;
}

function isSafeKey(key: string): boolean {
  if (SAFE_EXACT_KEYS.has(key)) return true;
  return SAFE_KEY_SUFFIXES.some((suffix) => key.endsWith(suffix));
}

function sanitizeSystemDescription(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  return sanitizeSafeText(value.trim()).slice(0, 500);
}

function sanitizeSafeText(value: string): string {
  let text = value;
  if (STACK_TRACE_PATTERN.test(text)) return '[stack trace redacted]';
  if (SQL_PATTERN.test(text)) return '[sql redacted]';
  if (PROMPT_INJECTION_PATTERN.test(text)) return '[untrusted prompt text redacted]';

  text = text.replace(JWT_PATTERN, '[token masked]');
  text = text.replace(API_KEY_PATTERN, '[secret masked]');
  text = text.replace(EMAIL_PATTERN, (match) => maskEmail(match));
  text = text.replace(IBAN_PATTERN, (match) => maskIban(match));
  text = text.replace(PHONE_PATTERN, (match) => maskPhone(match));
  text = text.replace(CARD_PATTERN, '[card masked]');
  text = text.replace(CVV_PATTERN, '[cvv masked]');
  text = text.replace(TCKN_PATTERN, (match) => maskTckn(match));
  text = text.replace(TAX_NO_PATTERN, (match) => maskIdentity(match));
  text = text.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch);
  return text.slice(0, 500);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
}
