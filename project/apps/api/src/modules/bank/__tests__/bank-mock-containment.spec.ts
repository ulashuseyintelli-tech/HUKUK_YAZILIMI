import { ServiceUnavailableException } from '@nestjs/common';
import { BANK_INTEGRATION_UNAVAILABLE, BankService } from '../bank.service';

const providers = ['garanti', 'akbank', 'isbank', 'yapikredi', 'ziraat', 'mock', 'unknown'];
const fromIban = 'TR' + '1'.repeat(24);
const transfer = { fromIban, toIban: 'TR' + '2'.repeat(24), amount: 100, currency: 'TRY' };
function make(provider: string | null) {
  const prisma = {
    bankAccount: {
      findFirst: jest.fn().mockResolvedValue({ id: 'account', tenantId: 'tenant', iban: fromIban, isIntegrated: true, integrationProvider: provider }),
      create: jest.fn(async ({ data }) => ({ id: 'account', ...data })), update: jest.fn(),
    },
    bankIntegrationLog: { create: jest.fn().mockResolvedValue({ id: 'log' }), update: jest.fn() },
    bankTransaction: { create: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
    case: { update: jest.fn() },
  };
  const collection = { create: jest.fn() };
  const service = new BankService({} as any, prisma as any, collection as any, {} as any);
  const noFinancialWrites = () => {
    expect(prisma.bankTransaction.create).not.toHaveBeenCalled();
    expect(prisma.bankTransaction.update).not.toHaveBeenCalled();
    expect(prisma.bankAccount.update).not.toHaveBeenCalled();
    expect(prisma.case.update).not.toHaveBeenCalled();
    expect(collection.create).not.toHaveBeenCalled();
  };
  return { service, prisma, noFinancialWrites };
}

describe('Mock-only bank adapters cannot claim real integration results', () => {
  it.each(providers)('%s cannot return a fabricated balance', async provider => {
    const { service, noFinancialWrites } = make(provider);
    await expect(service.getBalance('account', 'tenant')).rejects.toBeInstanceOf(ServiceUnavailableException);
    noFinancialWrites();
  });

  it.each([...providers, null])('%s sync fails explicitly, without transactions, collections or lastSyncAt', async provider => {
    const { service, prisma, noFinancialWrites } = make(provider);
    const result = await service.syncTransactions('account', 'tenant');
    expect(result).toMatchObject({ success: false, transactionCount: 0, newTransactions: 0, matchedTransactions: 0, errorCode: BANK_INTEGRATION_UNAVAILABLE });
    expect(prisma.bankIntegrationLog.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }));
    expect(prisma.bankIntegrationLog.update.mock.calls.some(call => call[0].data.status === 'SUCCESS')).toBe(false);
    noFinancialWrites();
  });

  it.each(providers)('%s transfer returns no success, fabricated transaction or reference', async provider => {
    const { service, prisma, noFinancialWrites } = make(provider);
    const result = await service.sendTransfer('tenant', transfer);
    expect(result).toMatchObject({ success: false, errorCode: BANK_INTEGRATION_UNAVAILABLE });
    expect(result.transactionId).toBeUndefined();
    expect(result.referenceNo).toBeUndefined();
    expect(prisma.bankIntegrationLog.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }));
    noFinancialWrites();
  });

  it('a configured provider name alone does not create an integrated account', async () => {
    const { service, prisma } = make('garanti');
    const result = await service.addBankAccount('tenant', { bankCode: '062', bankName: 'Test', iban: fromIban, ownerType: 'TENANT', ownerName: 'Test', integrationProvider: 'garanti' });
    expect(result.isIntegrated).toBe(false);
    expect(prisma.bankAccount.create).toHaveBeenCalledWith({ data: expect.objectContaining({ tenantId: 'tenant', integrationProvider: 'garanti', isIntegrated: false }) });
  });

  it('foreign account lookup still stops before provider/log/write', async () => {
    const { service, prisma, noFinancialWrites } = make('mock');
    prisma.bankAccount.findFirst.mockResolvedValue(null);
    await expect(service.getBalance('foreign', 'tenant')).rejects.toMatchObject({ status: 404 });
    await expect(service.syncTransactions('foreign', 'tenant')).rejects.toMatchObject({ status: 404 });
    expect(await service.sendTransfer('tenant', transfer)).toMatchObject({ success: false, errorCode: 'ACCOUNT_NOT_FOUND' });
    expect(prisma.bankIntegrationLog.create).not.toHaveBeenCalled();
    noFinancialWrites();
  });
});
