import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { ClientStatementRenderV1 } from './client-statement-render.contract';

/** Canonical JSON, so PostgreSQL jsonb property ordering cannot change a document identity. */
export function nativeStatementHash(value: unknown): string {
  const canonical = (v: any): any => v instanceof Date ? v.toISOString() : Array.isArray(v)
    ? v.map(canonical) : v && typeof v === 'object'
      ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

export function nativeStatementMembership(documents: readonly { currency: string; renderHash: string }[]): string {
  return nativeStatementHash([...documents].map(d => ({ currency: d.currency, renderHash: d.renderHash }))
    .sort((a, b) => a.currency < b.currency ? -1 : a.currency > b.currency ? 1 : 0));
}

/** Dates are serialized in immutable JSON and hydrated only for the existing PDF/token contract. */
export function hydrateNativeRender(value: Prisma.JsonValue): ClientStatementRenderV1 {
  const render = value as unknown as ClientStatementRenderV1;
  return { ...render, periodStart: new Date(render.periodStart), periodEnd: new Date(render.periodEnd),
    lines: render.lines.map(line => ({ ...line, lineDate: new Date(line.lineDate) })) };
}

/** Shared with legacy delivery claims; changing set/recipient/currency does not create a second monthly send. */
export const nativeMonthlyLockKey = (tenantId: string, clientId: string, periodKey: string) =>
  `client-statement-monthly-period|${tenantId}|${clientId}|${periodKey}`;

export const nativeMonthlyDedupeKey = (tenantId: string, clientId: string, periodKey: string) =>
  `STATEMENT_MONTHLY_NATIVE:${tenantId}:${clientId}:${periodKey}`;
