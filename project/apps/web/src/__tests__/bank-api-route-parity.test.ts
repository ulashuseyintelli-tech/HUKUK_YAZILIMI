import { beforeEach, describe, expect, it, vi } from "vitest";

import { financeApi } from "@/lib/api/finance";
import { api } from "@/lib/api";

function mockFetch(body: unknown = {}) {
  const fn = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(body),
  });
  (global as unknown as { fetch: unknown }).fetch = fn;
  return fn;
}

describe("bank API route parity", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    api.setToken("test-token");
  });

  it("uses backend-supported bank account routes", async () => {
    const fetchMock = mockFetch([]);

    await api.getBankAccounts({ ownerType: "CLIENT", ownerId: "client-1", isActive: true });
    await api.createBankAccount({
      bankProvider: "GARANTI",
      accountName: "Main",
      iban: "TR000000000000000000000000",
      currency: "TRY",
      isActive: true,
    } as any);

    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "/api/bank/accounts?ownerType=CLIENT&ownerId=client-1&isActive=true",
    );
    expect(String(fetchMock.mock.calls[1][0])).toContain("/api/bank/accounts");
    expect(fetchMock.mock.calls[1][1]?.method).toBe("POST");
  });

  it("uses account-scoped balance, sync and transaction routes", async () => {
    const fetchMock = mockFetch({ count: 0, transactions: [] });

    await api.getBankBalance("account-1");
    await api.syncBankTransactions("account-1", "2026-01-01", "2026-01-31");
    await api.getBankTransactions("account-1", {
      transactionType: "INCOMING",
      isMatched: false,
      limit: 20,
    });

    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/bank/accounts/account-1/balance");
    expect(String(fetchMock.mock.calls[1][0])).toContain("/api/bank/accounts/account-1/sync");
    expect(fetchMock.mock.calls[1][1]?.method).toBe("POST");
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });
    expect(String(fetchMock.mock.calls[2][0])).toContain(
      "/api/bank/accounts/account-1/transactions?transactionType=INCOMING&isMatched=false&limit=20",
    );
  });

  it("uses backend-supported transaction, transfer and stats routes", async () => {
    const fetchMock = mockFetch({ success: true });

    await api.getUnmatchedBankTransactions(25);
    await api.matchTransactionToCase("tx-1", "case-1");
    await api.sendBankTransfer({
      fromIban: "TR000000000000000000000001",
      toIban: "TR000000000000000000000002",
      amount: 100,
      currency: "TRY",
      receiverName: "Receiver",
    });
    await api.getBankStats();

    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/bank/transactions/unmatched?limit=25");
    expect(String(fetchMock.mock.calls[1][0])).toContain("/api/bank/transactions/tx-1/match");
    expect(fetchMock.mock.calls[1][1]?.method).toBe("POST");
    expect(String(fetchMock.mock.calls[2][0])).toContain("/api/bank/transfer");
    expect(fetchMock.mock.calls[2][1]?.method).toBe("POST");
    expect(String(fetchMock.mock.calls[3][0])).toContain("/api/bank/stats");
  });

  it("does not expose legacy finance bank helper routes", () => {
    expect("getBanks" in financeApi).toBe(false);
    expect("getBankAccounts" in financeApi).toBe(false);
    expect("createBankAccount" in financeApi).toBe(false);
  });
});