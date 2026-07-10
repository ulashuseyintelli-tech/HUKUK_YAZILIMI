import {
  claimItemCreationAmounts,
  claimItemNormalUpdateAmounts,
} from '../claim-item-amount-contract';

describe('ClaimItem three-amount contract', () => {
  it.each([1250, 0])('initializes provenance, canonical and mirror amounts from %s', (value) => {
    expect(claimItemCreationAmounts(value)).toEqual({
      originalAmount: value,
      demandedAmount: value,
      amount: value,
    });
  });

  it.each([1250, 0])('normal update mirrors canonical amount without emitting provenance for %s', (value) => {
    const update = claimItemNormalUpdateAmounts(value);

    expect(update).toEqual({ demandedAmount: value, amount: value });
    expect(update).not.toHaveProperty('originalAmount');
  });
});
