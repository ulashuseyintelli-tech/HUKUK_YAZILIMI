import 'reflect-metadata';
import { validateClientBankAccountInput } from '../dto/client-bank-account.dto';
import { BankService } from '../../bank/bank.service';

describe('H13 service input boundaries', () => {
  it.each([null, undefined, [], 'profile', 17])('rejects non-object body %p', body => {
    expect(() => validateClientBankAccountInput(body, false)).toThrow();
  });
  it.each([{ bankName: null }, { iban: null }, { isPrimary: null }, { isPrimary: 'true' }, { bankName: '' }, { accountHolder: {} }, { showInDocuments: true }, { clientId: 'other' }])('rejects invalid/extra direct update %p', body => {
    expect(() => validateClientBankAccountInput(body, false)).toThrow();
  });
  it('requires name and full valid IBAN for direct creates', () => {
    for (const body of [{}, { bankName: 'Test' }, { iban: 'TR330006100519786457841326' }, { bankName: 'Test', iban: 'TR33****1326' }]) {
      expect(() => validateClientBankAccountInput(body, true)).toThrow();
    }
  });
  it('normalizes full IBAN and preserves explicit nullable fields and absent fields', () => {
    expect(validateClientBankAccountInput({ bankName: ' Bank ', iban: 'tr33 0006 1005 1978 6457 8413 26', branchName: null }, true))
      .toEqual({ bankName: 'Bank', iban: 'TR330006100519786457841326', branchName: null });
    expect(validateClientBankAccountInput({ accountHolder: null }, false)).toEqual({ accountHolder: null });
    expect(validateClientBankAccountInput({}, false)).toEqual({});
  });
  it('generic BankService refuses CLIENT registration before any persistence', async () => {
    const prisma = { bankAccount: { create: jest.fn() } };
    const service = new BankService({} as any, prisma as any, {} as any, {} as any);
    await expect(service.addBankAccount('tenant', { bankCode: '062', bankName: 'Test', iban: 'TR330006100519786457841326', ownerType: 'CLIENT', ownerId: 'client', ownerName: 'Test' }))
      .rejects.toMatchObject({ status: 400, response: { code: 'CLIENT_BANK_PROFILE_ROUTE_REQUIRED' } });
    expect(prisma.bankAccount.create).not.toHaveBeenCalled();
  });
});
