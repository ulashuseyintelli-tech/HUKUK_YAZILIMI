export interface ClaimItemCreationAmounts<T> {
  originalAmount: T;
  demandedAmount: T;
  amount: T;
}

export interface ClaimItemNormalUpdateAmounts<T> {
  demandedAmount: T;
  amount: T;
}

/**
 * A ClaimItem opens with one value represented in all three amount fields.
 * originalAmount is provenance and must not be emitted by normal updates.
 */
export function claimItemCreationAmounts<T>(value: T): ClaimItemCreationAmounts<T> {
  return {
    originalAmount: value,
    demandedAmount: value,
    amount: value,
  };
}

/**
 * demandedAmount is canonical; amount remains its compatibility mirror.
 */
export function claimItemNormalUpdateAmounts<T>(value: T): ClaimItemNormalUpdateAmounts<T> {
  return {
    demandedAmount: value,
    amount: value,
  };
}
