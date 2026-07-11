import { describe, expect, it } from "vitest";
import { aggregateListedClaimItems, type ListedClaimItemInput } from "../lib/case-claim-live-aggregate";

const item = (
  bakiyeTutar: unknown,
  currency: unknown = "TRY",
  extra: Record<string, unknown> = {},
): ListedClaimItemInput => ({ raw: { bakiyeTutar, currency, ...extra } });

describe("aggregateListedClaimItems", () => {
  it("aggregates same-currency listed items", () => {
    expect(aggregateListedClaimItems([item(100), item(250.5)], "TRY")).toEqual([
      { currency: "TRY", amount: 350.5, itemCount: 2 },
    ]);
  });

  it("keeps currencies separate and returns them deterministically", () => {
    expect(aggregateListedClaimItems([item(20, "usd"), item(10, "TRY"), item(5, "USD")], "TRY")).toEqual([
      { currency: "TRY", amount: 10, itemCount: 1 },
      { currency: "USD", amount: 25, itemCount: 2 },
    ]);
  });

  it("reflects add, edit and delete list updates", () => {
    const initial = [item(100)];
    expect(aggregateListedClaimItems(initial, "TRY")[0].amount).toBe(100);
    expect(aggregateListedClaimItems([...initial, item(50)], "TRY")[0].amount).toBe(150);
    expect(aggregateListedClaimItems([item(125), item(50)], "TRY")[0].amount).toBe(175);
    expect(aggregateListedClaimItems([item(125)], "TRY")[0].amount).toBe(125);
  });

  it("excludes zero, negative, NaN, infinite and missing amounts", () => {
    expect(aggregateListedClaimItems([
      item(0),
      item(-1),
      item(Number.NaN),
      item(Number.POSITIVE_INFINITY),
      item(undefined),
      {},
    ], "TRY")).toEqual([]);
  });

  it("returns no synthetic zero aggregate for an empty list", () => {
    expect(aggregateListedClaimItems([], "TRY")).toEqual([]);
  });

  it("retains CEK and SENET amounts independently of instrument routing", () => {
    expect(aggregateListedClaimItems([
      item(1_000, "TRY", { kalemTuru: "CEK" }),
      item(2_000, "TRY", { kalemTuru: "SENET" }),
    ], "TRY")).toEqual([{ currency: "TRY", amount: 3_000, itemCount: 2 }]);
  });

  it("retains a hydrated legacy Due through its listed bakiyeTutar", () => {
    expect(aggregateListedClaimItems([
      item(450, "EUR", { __legacyDue: { amount: "450.00", type: "PRINCIPAL" } }),
    ], "TRY")).toEqual([{ currency: "EUR", amount: 450, itemCount: 1 }]);
  });

  it("does not double-count hesapOzeti values", () => {
    expect(aggregateListedClaimItems([
      item(100, "TRY", {
        hesapOzeti: [
          { key: "takip_tutari", tutar: 125 },
          { key: "toplam_borc", tutar: 175 },
        ],
      }),
    ], "TRY")).toEqual([{ currency: "TRY", amount: 100, itemCount: 1 }]);
  });

  it("uses the case currency only when a listed item has no currency", () => {
    expect(aggregateListedClaimItems([{ raw: { bakiyeTutar: 75 } }], "usd")).toEqual([
      { currency: "USD", amount: 75, itemCount: 1 },
    ]);
  });
});
