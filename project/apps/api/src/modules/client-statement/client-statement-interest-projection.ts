import { Prisma } from '@prisma/client';
import type { CaseBalanceResult } from '../interest-engine/orchestration/case-balance.service';

export interface CollectedInterestAllocationInput {
  id: string;
  amount: Prisma.Decimal;
}

export interface ClientPayableEntitlementInput {
  id: string;
  amount: Prisma.Decimal;
}

export interface CollectedInterestShare {
  sourceLedgerAllocationId: string;
  sourceDispositionLineId: string;
  amount: Prisma.Decimal;
}

export class ClientStatementInterestProjectionInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClientStatementInterestProjectionInvariantError';
  }
}

function assertUniqueIds(rows: readonly { id: string }[], label: string): void {
  const ids = new Set<string>();
  for (const row of rows) {
    if (!row.id || ids.has(row.id)) {
      throw new ClientStatementInterestProjectionInvariantError(`${label} kimlikleri tekil ve dolu olmalıdır`);
    }
    ids.add(row.id);
  }
}

function toCents(value: Prisma.Decimal, label: string): bigint {
  if (!value.isFinite() || value.lt(0) || value.decimalPlaces() > 2) {
    throw new ClientStatementInterestProjectionInvariantError(`${label} geçerli Decimal(15,2) para tutarı olmalıdır`);
  }
  return BigInt(value.mul(100).toString());
}

function fromCents(value: bigint): Prisma.Decimal {
  return new Prisma.Decimal(value.toString()).div(100);
}

function divideHalfUp(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  return remainder * 2n >= denominator ? quotient + 1n : quotient;
}

/**
 * Canonical LedgerAllocation faiz tutarını gerçek POSTED CLIENT_PAYABLE oranına
 * göre cent-exact böler. Her allocation için toplam, `allocation × payable/total`
 * sonucunun HALF_UP cent karşılığıdır; cent artıkları büyük-kalan + stabil kimlik
 * sırasıyla dağıtılır. Yeni faiz hesabı veya allocation kaynağı üretmez.
 */
export function projectCollectedInterestShares(input: {
  dispositionTotal: Prisma.Decimal;
  allocations: readonly CollectedInterestAllocationInput[];
  payableLines: readonly ClientPayableEntitlementInput[];
}): CollectedInterestShare[] {
  assertUniqueIds(input.allocations, 'LedgerAllocation');
  assertUniqueIds(input.payableLines, 'CLIENT_PAYABLE');

  const totalCents = toCents(input.dispositionTotal, 'Disposition totalAmount');
  if (totalCents <= 0n) {
    throw new ClientStatementInterestProjectionInvariantError('POSTED disposition totalAmount pozitif olmalıdır');
  }

  const payable = input.payableLines
    .map((line) => ({ ...line, cents: toCents(line.amount, `CLIENT_PAYABLE ${line.id}`) }))
    .filter((line) => line.cents > 0n)
    .sort((a, b) => a.id.localeCompare(b.id));
  const allocations = input.allocations
    .map((allocation) => ({ ...allocation, cents: toCents(allocation.amount, `LedgerAllocation ${allocation.id}`) }))
    .filter((allocation) => allocation.cents > 0n)
    .sort((a, b) => a.id.localeCompare(b.id));

  const payableTotalCents = payable.reduce((sum, line) => sum + line.cents, 0n);
  const allocationTotalCents = allocations.reduce((sum, allocation) => sum + allocation.cents, 0n);
  if (payableTotalCents > totalCents) {
    throw new ClientStatementInterestProjectionInvariantError('CLIENT_PAYABLE toplamı disposition totalAmount değerini aşamaz');
  }
  if (allocationTotalCents > totalCents) {
    throw new ClientStatementInterestProjectionInvariantError('Faiz allocation toplamı disposition totalAmount değerini aşamaz');
  }
  if (payable.length === 0 || allocations.length === 0) return [];

  const shares: CollectedInterestShare[] = [];
  for (const allocation of allocations) {
    const targetCents = divideHalfUp(allocation.cents * payableTotalCents, totalCents);
    const candidates = payable.map((line) => {
      const numerator = allocation.cents * line.cents;
      return {
        line,
        cents: numerator / totalCents,
        remainder: numerator % totalCents,
      };
    });
    let remainderCents = targetCents - candidates.reduce((sum, candidate) => sum + candidate.cents, 0n);
    candidates.sort((a, b) => {
      if (a.remainder === b.remainder) return a.line.id.localeCompare(b.line.id);
      return a.remainder > b.remainder ? -1 : 1;
    });
    for (const candidate of candidates) {
      if (remainderCents <= 0n) break;
      candidate.cents += 1n;
      remainderCents -= 1n;
    }
    if (remainderCents !== 0n) {
      throw new ClientStatementInterestProjectionInvariantError('Cent artığı entitlement satırlarına dağıtılamadı');
    }

    for (const candidate of candidates.sort((a, b) => a.line.id.localeCompare(b.line.id))) {
      if (candidate.cents === 0n) continue;
      shares.push({
        sourceLedgerAllocationId: allocation.id,
        sourceDispositionLineId: candidate.line.id,
        amount: fromCents(candidate.cents),
      });
    }
  }

  const interestByLine = new Map<string, bigint>();
  for (const share of shares) {
    const cents = toCents(share.amount, `Projected interest ${share.sourceLedgerAllocationId}`);
    interestByLine.set(share.sourceDispositionLineId, (interestByLine.get(share.sourceDispositionLineId) ?? 0n) + cents);
  }
  for (const line of payable) {
    if ((interestByLine.get(line.id) ?? 0n) > line.cents) {
      throw new ClientStatementInterestProjectionInvariantError(`Projected interest CLIENT_PAYABLE ${line.id} tutarını aşamaz`);
    }
  }

  return shares.sort((a, b) =>
    a.sourceDispositionLineId.localeCompare(b.sourceDispositionLineId)
      || a.sourceLedgerAllocationId.localeCompare(b.sourceLedgerAllocationId),
  );
}

/** RECEIVABLE provider sonucundaki allocation-sonrası ödenmemiş faiz toplamını projekte eder. */
export function projectAccruedInterest(
  balance: Pick<CaseBalanceResult, 'currencyResults'>,
  currency: string,
): Prisma.Decimal | null {
  const rows = balance.currencyResults.filter((row) => row.currency === currency && row.result !== null);
  if (rows.length !== 1) return null;
  const states = rows[0].result?.finalDebtStates;
  if (!states) return null;

  let amount = new Prisma.Decimal(0);
  for (const state of states) {
    if (state.currency !== currency || !Number.isFinite(state.accruedInterest) || state.accruedInterest < 0) {
      return null;
    }
    amount = amount.plus(new Prisma.Decimal(String(state.accruedInterest)));
  }
  amount = amount.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  return amount.gt(0) ? amount : null;
}
