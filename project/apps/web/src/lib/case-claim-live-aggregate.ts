export interface ListedClaimItemInput {
  raw?: {
    bakiyeTutar?: unknown;
    currency?: unknown;
    [key: string]: unknown;
  };
}

export interface ListedClaimItemAggregate {
  currency: string;
  amount: number;
  itemCount: number;
}

function normalizeCurrency(value: unknown, fallbackCurrency: string): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim().toUpperCase();
  }
  return fallbackCurrency.trim().toUpperCase();
}

/**
 * Groups the amounts of claim items that have already been committed to the
 * create-case list. It intentionally ignores calculated summaries and any
 * uncommitted form buffer.
 */
export function aggregateListedClaimItems(
  items: readonly ListedClaimItemInput[],
  fallbackCurrency: string,
): ListedClaimItemAggregate[] {
  const aggregates = new Map<string, ListedClaimItemAggregate>();

  for (const item of items) {
    const amount = Number(item.raw?.bakiyeTutar);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const currency = normalizeCurrency(item.raw?.currency, fallbackCurrency);
    const existing = aggregates.get(currency);
    if (existing) {
      existing.amount += amount;
      existing.itemCount += 1;
    } else {
      aggregates.set(currency, { currency, amount, itemCount: 1 });
    }
  }

  return [...aggregates.values()].sort((left, right) =>
    left.currency < right.currency ? -1 : left.currency > right.currency ? 1 : 0,
  );
}
