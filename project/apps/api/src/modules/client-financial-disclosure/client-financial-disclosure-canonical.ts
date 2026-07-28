import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { canonicalJsonStringify } from '../permission-diagnostics/guided-edge/canonical-json';
import {
  CLIENT_FINANCIAL_DISCLOSURE_SNAPSHOT_CONTRACT_VERSION,
  CLIENT_FINANCIAL_DISCLOSURE_SOURCE_FINGERPRINT_CONTRACT_VERSION,
  ClientFinancialDisclosureError,
  type DisclosureLineSnapshotV1,
  type DisclosureSnapshotPayloadV1,
  type DisclosureSourceFingerprintPayloadV1,
} from './client-financial-disclosure.contract';

/**
 * CLIENT-P2-U03-TRACK-B-I02 — canonical serialization + deterministic hash.
 *
 * SAF (IO-suz, DI yok). Yeni bir hash algoritması veya generic canonical JSON
 * kütüphanesi ÜRETMEZ: repository'nin canonical yardımcıları
 * (`permission-diagnostics/guided-edge/canonical-json`) ve `ClaimFormationSnapshot`
 * emsalinin domain-separated sha256 deseni yeniden kullanılır.
 */

/** `Decimal(15,2)` canonical string — locale-bağımsız, sabit ölçek (§35.16). */
export function canonicalMoney(value: Prisma.Decimal | string | number): string {
  const decimal = value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
  if (!decimal.isFinite()) {
    throw new ClientFinancialDisclosureError('DISCLOSURE_RECONCILIATION_MISMATCH');
  }
  // §35.16: yuvarlama artıkları SESSİZCE atanamaz → 2'den fazla ondalık REDDEDİLİR.
  if (decimal.decimalPlaces() > 2) {
    throw new ClientFinancialDisclosureError('DISCLOSURE_RECONCILIATION_MISMATCH');
  }
  // Sabit iki ondalık, Decimal aritmetiğiyle (IEEE-754 float'a DÜŞMEZ, toFixed KULLANMAZ).
  const minor = decimal.times(100);
  const sign = minor.isNegative() ? '-' : '';
  const digits = minor.abs().toString().padStart(3, '0');
  return `${sign}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

/** Canonical UTC ISO-8601 zaman damgası — timezone-bağımsız. */
export function canonicalInstant(value: Date): string {
  if (Number.isNaN(value.getTime())) {
    throw new ClientFinancialDisclosureError('DISCLOSURE_SOURCE_STATE_INVALID');
  }
  return value.toISOString();
}

/**
 * Satır sırası deterministik hale getirilir: `sourceDispositionLineId` üzerinden
 * sıralanır ve `sortOrder` bu sıradan TÜRETİLİR. Böylece kaynak satırların
 * okunma sırası hash'i değiştiremez (§15/§16).
 */
export function canonicalDisclosureLines(
  lines: readonly {
    readonly type: string;
    readonly amount: Prisma.Decimal | string | number;
    readonly sourceDispositionLineId: string;
  }[],
): readonly DisclosureLineSnapshotV1[] {
  const seen = new Set<string>();
  for (const line of lines) {
    if (seen.has(line.sourceDispositionLineId)) {
      throw new ClientFinancialDisclosureError('DISCLOSURE_DUPLICATE');
    }
    seen.add(line.sourceDispositionLineId);
  }
  return Object.freeze(
    [...lines]
      .sort((a, b) => (a.sourceDispositionLineId < b.sourceDispositionLineId ? -1 : 1))
      .map((line, index) =>
        Object.freeze({
          type: line.type,
          amount: canonicalMoney(line.amount),
          sourceDispositionLineId: line.sourceDispositionLineId,
          sortOrder: index,
        }),
      ),
  );
}

/**
 * Domain-separated sha256: `sha256(contractVersion || 0x00 || canonicalJson)`.
 * `ClaimFormationSnapshot` emsaliyle aynı desen — algoritma değiştirilmemiştir.
 */
function domainSeparatedHash(contractVersion: string, payload: unknown): string {
  return createHash('sha256')
    .update(contractVersion, 'utf8')
    .update('\0', 'utf8')
    .update(canonicalJsonStringify(payload), 'utf8')
    .digest('hex');
}

export function buildDisclosureSnapshotPayload(input: {
  readonly tenantId: string;
  readonly caseId: string;
  readonly caseClientId: string;
  readonly clientId: string;
  readonly collectionDispositionId: string;
  readonly version: number;
  readonly currency: string;
  readonly sourceCollectionId: string;
  readonly sourceCollectionAmount: Prisma.Decimal | string | number;
  readonly sourceCollectionDate: Date;
  readonly dispositionTotalAmount: Prisma.Decimal | string | number;
  readonly dispositionPostedAt: Date;
  readonly totalCollected: Prisma.Decimal | string | number;
  readonly clientNetAmount: Prisma.Decimal | string | number;
  readonly lines: readonly DisclosureLineSnapshotV1[];
}): DisclosureSnapshotPayloadV1 {
  return Object.freeze({
    contractVersion: CLIENT_FINANCIAL_DISCLOSURE_SNAPSHOT_CONTRACT_VERSION,
    tenantId: input.tenantId,
    caseId: input.caseId,
    caseClientId: input.caseClientId,
    clientId: input.clientId,
    collectionDispositionId: input.collectionDispositionId,
    version: input.version,
    currency: input.currency,
    sourceCollectionId: input.sourceCollectionId,
    sourceCollectionAmount: canonicalMoney(input.sourceCollectionAmount),
    sourceCollectionDate: canonicalInstant(input.sourceCollectionDate),
    dispositionTotalAmount: canonicalMoney(input.dispositionTotalAmount),
    dispositionPostedAt: canonicalInstant(input.dispositionPostedAt),
    totalCollected: canonicalMoney(input.totalCollected),
    clientNetAmount: canonicalMoney(input.clientNetAmount),
    lines: input.lines,
  });
}

export function disclosureSnapshotHash(payload: DisclosureSnapshotPayloadV1): string {
  return domainSeparatedHash(CLIENT_FINANCIAL_DISCLOSURE_SNAPSHOT_CONTRACT_VERSION, payload);
}

export function buildDisclosureSourceFingerprintPayload(input: {
  readonly tenantId: string;
  readonly caseId: string;
  readonly caseClientId: string;
  readonly clientId: string;
  readonly dispositionId: string;
  readonly dispositionStatus: string;
  readonly dispositionBeneficiaryScope: string;
  readonly dispositionTotalAmount: Prisma.Decimal | string | number;
  readonly dispositionCurrency: string;
  readonly dispositionPostedAt: Date;
  readonly collectionId: string;
  readonly collectionStatus: string;
  readonly collectionAmount: Prisma.Decimal | string | number;
  readonly collectionCurrency: string;
  readonly collectionDate: Date;
  readonly lines: readonly DisclosureLineSnapshotV1[];
}): DisclosureSourceFingerprintPayloadV1 {
  return Object.freeze({
    contractVersion: CLIENT_FINANCIAL_DISCLOSURE_SOURCE_FINGERPRINT_CONTRACT_VERSION,
    tenantId: input.tenantId,
    caseId: input.caseId,
    caseClientId: input.caseClientId,
    clientId: input.clientId,
    dispositionId: input.dispositionId,
    dispositionStatus: input.dispositionStatus,
    dispositionBeneficiaryScope: input.dispositionBeneficiaryScope,
    dispositionTotalAmount: canonicalMoney(input.dispositionTotalAmount),
    dispositionCurrency: input.dispositionCurrency,
    dispositionPostedAt: canonicalInstant(input.dispositionPostedAt),
    collectionId: input.collectionId,
    collectionStatus: input.collectionStatus,
    collectionAmount: canonicalMoney(input.collectionAmount),
    collectionCurrency: input.collectionCurrency,
    collectionDate: canonicalInstant(input.collectionDate),
    lines: input.lines,
  });
}

export function disclosureSourceFingerprint(
  payload: DisclosureSourceFingerprintPayloadV1,
): string {
  return domainSeparatedHash(
    CLIENT_FINANCIAL_DISCLOSURE_SOURCE_FINGERPRINT_CONTRACT_VERSION,
    payload,
  );
}

export function isSha256Hex(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

/**
 * §35.16 zorunlu kesin reconciliation — TOLERANS YOK:
 *   Σ satırlar          = totalCollected
 *   CLIENT_PAYABLE satırı = clientNetAmount
 *
 * `HELD_PENDING_DISTRIBUTION` satırı asla client-görünür olamaz (§35.5); POSTED
 * dispozisyonda böyle bir satır bulunması invariant ihlalidir → fail-closed.
 */
export function assertDisclosureReconciliation(input: {
  readonly lines: readonly DisclosureLineSnapshotV1[];
  readonly totalCollected: string;
  readonly clientNetAmount: string;
}): void {
  if (input.lines.length === 0) {
    throw new ClientFinancialDisclosureError('DISCLOSURE_RECONCILIATION_MISMATCH');
  }
  if (input.lines.some((line) => line.type === 'HELD_PENDING_DISTRIBUTION')) {
    throw new ClientFinancialDisclosureError('DISCLOSURE_SOURCE_STATE_INVALID');
  }

  const sum = input.lines.reduce(
    (acc, line) => acc.add(new Prisma.Decimal(line.amount)),
    new Prisma.Decimal(0),
  );
  if (!sum.equals(new Prisma.Decimal(input.totalCollected))) {
    throw new ClientFinancialDisclosureError('DISCLOSURE_RECONCILIATION_MISMATCH');
  }

  const clientPayable = input.lines.filter((line) => line.type === 'CLIENT_PAYABLE');
  if (clientPayable.length !== 1) {
    throw new ClientFinancialDisclosureError('DISCLOSURE_RECONCILIATION_MISMATCH');
  }
  if (!new Prisma.Decimal(clientPayable[0].amount).equals(new Prisma.Decimal(input.clientNetAmount))) {
    throw new ClientFinancialDisclosureError('DISCLOSURE_RECONCILIATION_MISMATCH');
  }
}
