/**
 * ARC-07 I08 — LEGACY-FLAT REDUCTION EXECUTOR ÇEKİRDEĞİ (C2-I08 E4).
 *
 * Owner disposition (2026-08-06, RATIFIED/CONDITIONAL GO-COMPLETE) zorunlulukları:
 * dry-run/apply AYRI · idempotent · tenant-bounded · injected tx (fail-fast rollback) ·
 * audit + before/after sayaç · flat-only VEYA farklı satır görünce FAIL-CLOSED ·
 * K1 guarded-apply konvansiyonu (üç kapı; bkz. runbooks/guarded-apply-script-convention.md).
 *
 * SEMANTİK (A4 parity SQL ile birebir): satır yalnız ESIT ise indirgenebilir —
 * flat(city/district) trim-eşit VE primary-current street, flat address içinde geçer.
 * YALNIZ_FLAT veya FARKLI satır = CONFLICT → koşu TÜMÜYLE reddedilir (veri silinmez).
 * BOS / YALNIZ_RELATIONAL = NO-OP (idempotent yeniden koşu güvenli).
 * PII: plan/audit çıktıları yalnız ALAN ADI ve SAYI taşır — ham adres değeri ASLA.
 */
import { classifyDbTarget, redactSecrets } from '../policy-engine/diagnostics/k1-reviewed-linkage.core';

export { classifyDbTarget, redactSecrets };

export const CLIENT_FLAT_ADDRESS_FIELDS = ['address', 'city', 'district', 'region', 'postalCode'] as const;

export interface I08ClientRow {
  id: string;
  tenantId: string;
  address?: string | null;
  city?: string | null;
  district?: string | null;
  region?: string | null;
  postalCode?: string | null;
  /** isCurrent=true, isPrimary desc + createdAt desc sıralı İLK satır (A4 deseni). */
  primaryCurrent?: { street?: string | null; city?: string | null; district?: string | null } | null;
}

export type I08Bucket = 'BOS' | 'YALNIZ_FLAT' | 'YALNIZ_RELATIONAL' | 'ESIT' | 'FARKLI';

const clean = (v: string | null | undefined): string => (v ?? '').trim();

/** A4 parity SQL'inin satır-düzeyi birebir karşılığı. */
export function classifyI08Bucket(row: I08ClientRow): I08Bucket {
  const hasFlat = clean(row.address).length > 0;
  const hasRel = !!row.primaryCurrent;
  if (!hasFlat && !hasRel) return 'BOS';
  if (hasFlat && !hasRel) return 'YALNIZ_FLAT';
  if (!hasFlat && hasRel) return 'YALNIZ_RELATIONAL';
  const p = row.primaryCurrent!;
  const cityEq = clean(row.city) === clean(p.city);
  const districtEq = clean(row.district) === clean(p.district);
  const streetIn = clean(row.address).includes(clean(p.street));
  return cityEq && districtEq && streetIn ? 'ESIT' : 'FARKLI';
}

export interface I08Plan {
  ok: boolean;
  counters: Record<I08Bucket, number>;
  /** İndirgenecek satırlar (yalnız ESIT). */
  eligible: Array<{ id: string; tenantId: string }>;
  /** FAIL-CLOSED nedenleri: YALNIZ_FLAT + FARKLI satır kimlikleri (değer YOK). */
  conflicts: Array<{ id: string; tenantId: string; bucket: I08Bucket }>;
}

export function planI08Reduction(rows: I08ClientRow[]): I08Plan {
  const counters: Record<I08Bucket, number> = { BOS: 0, YALNIZ_FLAT: 0, YALNIZ_RELATIONAL: 0, ESIT: 0, FARKLI: 0 };
  const eligible: I08Plan['eligible'] = [];
  const conflicts: I08Plan['conflicts'] = [];
  for (const row of rows) {
    const bucket = classifyI08Bucket(row);
    counters[bucket] += 1;
    if (bucket === 'ESIT') eligible.push({ id: row.id, tenantId: row.tenantId });
    if (bucket === 'YALNIZ_FLAT' || bucket === 'FARKLI') conflicts.push({ id: row.id, tenantId: row.tenantId, bucket });
  }
  return { ok: conflicts.length === 0, counters, eligible, conflicts };
}

export interface I08GuardInput {
  apply: boolean;
  allowDbWrite: boolean;
  confirmReviewed: boolean;
  databaseUrl: string | undefined;
}

export interface I08GuardResult {
  allowed: boolean;
  reasons: string[];
  dbTarget: ReturnType<typeof classifyDbTarget>;
}

/** Üç kapı (K1 niyeti) + DB hedef sınıflandırması. Loopback dışı her hedef HARD-STOP. */
export function evaluateI08ApplyGuards(input: I08GuardInput): I08GuardResult {
  const dbTarget = classifyDbTarget(input.databaseUrl);
  const reasons: string[] = [];
  if (!input.apply) reasons.push('MODE_FLAG_MISSING (--apply)');
  if (!input.allowDbWrite) reasons.push('DB_WRITE_CONSENT_MISSING (--allow-db-write)');
  if (!input.confirmReviewed) reasons.push('REVIEW_CONFIRMATION_MISSING (--confirm-i08-reviewed)');
  if (dbTarget !== 'non-prod') reasons.push(`DB_TARGET_NOT_ALLOWED (${dbTarget}) — yalniz loopback hedef`);
  return { allowed: reasons.length === 0, reasons, dbTarget };
}

export interface I08TxLike {
  client: {
    updateMany: (args: unknown) => Promise<{ count: number }>;
  };
  auditLog: {
    create: (args: unknown) => Promise<unknown>;
  };
}

export interface I08ApplyResult {
  cleared: number;
  audited: number;
  /** WHERE koşuluna takılan (yarış/no-op) satır kimlikleri — hata değil, idempotency sinyali. */
  skipped: string[];
}

/**
 * TEK TENANT'ın eligible kümesini injected tx içinde indirger.
 * Koşullu yazım (TOCTOU): yalnız hâlâ flat taşıyan satır güncellenir; audit yalnız
 * gerçekten temizlenen satırda üretilir (metadata: alan ADLARI, ham değer YOK).
 * Herhangi bir satırda beklenmeyen hata → throw → çağıranın $transaction'ı ROLLBACK.
 */
export async function applyI08ReductionForTenant(
  tx: I08TxLike,
  tenantId: string,
  eligibleIds: string[],
  runId: string,
): Promise<I08ApplyResult> {
  let cleared = 0;
  let audited = 0;
  const skipped: string[] = [];
  for (const id of eligibleIds) {
    const { count } = await tx.client.updateMany({
      where: {
        id,
        tenantId,
        OR: [
          { address: { not: null } },
          { city: { not: null } },
          { district: { not: null } },
          { region: { not: null } },
          { postalCode: { not: null } },
        ],
      },
      data: { address: null, city: null, district: null, region: null, postalCode: null },
    });
    if (count === 0) {
      skipped.push(id);
      continue;
    }
    cleared += count;
    await tx.auditLog.create({
      data: {
        tenantId,
        action: 'CLIENT_FLAT_ADDRESS_REDUCED_I08',
        entityType: 'CLIENT',
        entityId: id,
        metadata: {
          clearedFields: [...CLIENT_FLAT_ADDRESS_FIELDS],
          paritySource: 'ESIT',
          runId,
          executor: 'ARC07-I08-E4',
        },
      },
    });
    audited += 1;
  }
  return { cleared, audited, skipped };
}
