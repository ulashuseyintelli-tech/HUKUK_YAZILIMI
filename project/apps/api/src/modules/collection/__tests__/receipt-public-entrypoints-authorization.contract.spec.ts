// CaseController -> OcrService -> `require('pdf-poppler')`. pdf-poppler bir Windows
// odakli optional native pakettir ve Linux'ta poppler binary'sini bulamayinca
// index.js icinde DOGRUDAN process.exit(1) cagirir — yani jest worker'i olur ve
// manifest'in tamami duser. Bu spec Windows'ta gecip Linux CI'da kiriliyordu.
//
// Ayni sorun repo'da zaten biliniyor: client-workspace-live-smoke job'i
// "Disable optional pdf-poppler ..." adiyla paketi runtime'da stub'liyor.
//
// Factory'li jest.mock hoist edilir ve gercek modulun require edilmesini tamamen
// engeller. pdf-poppler bu spec'in dogruladigi yetkilendirme sozlesmesiyle ilgisizdir.
jest.mock('pdf-poppler', () => ({
  convert: async () => {
    throw new Error('pdf-poppler is stubbed in unit tests');
  },
}));

import * as fs from 'node:fs';
import * as path from 'node:path';
import { CollectionController } from '../collection.controller';
import { CaseController } from '../../case/case.controller';
import { BankController } from '../../bank/bank.controller';
import { ThirdPartyController } from '../../debtor/third-party.controller';

const envelope = {
  axis: 'GUIDED_OPEN_PERMISSION',
  outcome: 'CONFIRM_REQUIRED',
  actionCode: 'RECORD_COLLECTION',
  target: { resourceType: 'CASE', caseId: 'case-1' },
};

function request() {
  return { headers: { 'x-request-id': 'request-1' } } as any;
}

describe('RCV-P2-WS03-P03 four public receipt entrypoints', () => {
  it('POST /collections authorizes before canonical create and strips confirmationToken', async () => {
    const calls: string[] = [];
    const collectionService = {
      create: jest.fn(async (..._args: any[]) => {
        calls.push('write');
        return { id: 'collection-1' };
      }),
    };
    const authorization = {
      authorize: jest.fn(async () => {
        calls.push('authorization');
        return { kind: 'ALLOW' };
      }),
    };
    const controller = new CollectionController(collectionService as any, authorization as any);

    await controller.create(
      'tenant-1',
      'user-1',
      {
        caseId: 'case-1',
        idempotencyKey: 'idem-1',
        amount: 100,
        type: 'CASH' as any,
        date: '2026-07-17T00:00:00.000Z',
        confirmationToken: 'confirm-1',
      },
      request(),
    );

    expect(calls).toEqual(['authorization', 'write']);
    expect(authorization.authorize).toHaveBeenCalledWith(
      expect.objectContaining({ confirmationToken: 'confirm-1' }),
    );
    expect(collectionService.create.mock.calls[0][1]).not.toHaveProperty('confirmationToken');
  });

  it('POST /collections returns CONFIRM_REQUIRED without calling CollectionService', async () => {
    const collectionService = { create: jest.fn() };
    const authorization = { authorize: jest.fn().mockResolvedValue({ kind: 'ENVELOPE', envelope }) };
    const controller = new CollectionController(collectionService as any, authorization as any);

    await expect(
      controller.create('tenant-1', 'user-1', {
        caseId: 'case-1', idempotencyKey: 'idem-1', amount: 100,
        type: 'CASH' as any, date: '2026-07-17T00:00:00.000Z',
      }, request()),
    ).resolves.toBe(envelope);
    expect(collectionService.create).not.toHaveBeenCalled();
  });

  it('POST /cases/:id/collections authorizes before CaseService delegation', async () => {
    const calls: string[] = [];
    const caseService = { createCollection: jest.fn(async (..._args: any[]) => { calls.push('write'); return {}; }) };
    const authorization = { authorize: jest.fn(async () => { calls.push('authorization'); return { kind: 'ALLOW' }; }) };
    const controller = new CaseController(
      caseService as any, {} as any, {} as any, {} as any, {} as any,
      {} as any, {} as any, {} as any, {} as any, authorization as any,
    );

    await controller.createCollection('tenant-1', 'user-1', 'case-1', {
      idempotencyKey: 'idem-1', amount: 100, type: 'CASH', channel: 'NAKIT',
      date: '2026-07-17T00:00:00.000Z', confirmationToken: 'confirm-1',
    }, request());

    expect(calls).toEqual(['authorization', 'write']);
    expect(caseService.createCollection.mock.calls[0][2]).not.toHaveProperty('confirmationToken');
  });

  it('POST /cases/:id/collections produces zero delegation on CONFIRM_REQUIRED', async () => {
    const caseService = { createCollection: jest.fn() };
    const authorization = { authorize: jest.fn().mockResolvedValue({ kind: 'ENVELOPE', envelope }) };
    const controller = new CaseController(
      caseService as any, {} as any, {} as any, {} as any, {} as any,
      {} as any, {} as any, {} as any, {} as any, authorization as any,
    );

    await expect(controller.createCollection('tenant-1', 'user-1', 'case-1', {
      idempotencyKey: 'idem-1', amount: 100, type: 'CASH', channel: 'NAKIT',
      date: '2026-07-17T00:00:00.000Z',
    }, request())).resolves.toBe(envelope);
    expect(caseService.createCollection).not.toHaveBeenCalled();
  });

  it('POST /bank/transactions/:id/match resolves and authorizes before BankService', async () => {
    const calls: string[] = [];
    const bankService = { matchTransaction: jest.fn(async () => { calls.push('write'); return {}; }) };
    const authorization = {
      resolveBankCaseId: jest.fn(async () => { calls.push('resolver'); return 'case-1'; }),
      authorize: jest.fn(async () => { calls.push('authorization'); return { kind: 'ALLOW' }; }),
    };
    const controller = new BankController(bankService as any, {} as any, authorization as any);

    await controller.matchTransaction(
      'tenant-1', 'bank-1', { caseId: 'case-1', confirmationToken: 'confirm-1' },
      'user-1', request(),
    );

    expect(calls).toEqual(['resolver', 'authorization', 'write']);
  });

  it('POST /bank/transactions/:id/match produces zero delegation on resolver or authorization failure', async () => {
    const bankService = { matchTransaction: jest.fn() };
    const authorization = {
      resolveBankCaseId: jest.fn().mockResolvedValue('case-1'),
      authorize: jest.fn().mockResolvedValue({ kind: 'ENVELOPE', envelope }),
    };
    const controller = new BankController(bankService as any, {} as any, authorization as any);

    await expect(controller.matchTransaction(
      'tenant-1', 'bank-1', { caseId: 'case-1' }, 'user-1', request(),
    )).resolves.toBe(envelope);
    expect(bankService.matchTransaction).not.toHaveBeenCalled();

    authorization.resolveBankCaseId.mockRejectedValueOnce(new Error('resolver failed'));
    await expect(controller.matchTransaction(
      'tenant-1', 'bank-1', { caseId: 'case-1' }, 'user-1', request(),
    )).rejects.toThrow('resolver failed');
    expect(bankService.matchTransaction).not.toHaveBeenCalled();
  });

  it('POST /external-cases/:id/collection resolves and authorizes before ThirdPartyService', async () => {
    const calls: string[] = [];
    const thirdPartyService = { addExternalCaseCollection: jest.fn(async (..._args: any[]) => { calls.push('write'); return {}; }) };
    const authorization = {
      resolveExternalCaseId: jest.fn(async () => { calls.push('resolver'); return 'case-1'; }),
      authorize: jest.fn(async () => { calls.push('authorization'); return { kind: 'ALLOW' }; }),
    };
    const controller = new ThirdPartyController(thirdPartyService as any, authorization as any);

    await controller.addExternalCaseCollection(
      'tenant-1', 'user-1', 'external-1',
      { amount: 100, confirmationToken: 'confirm-1' }, request(),
    );

    expect(calls).toEqual(['resolver', 'authorization', 'write']);
    expect(thirdPartyService.addExternalCaseCollection.mock.calls[0][2]).not.toHaveProperty('confirmationToken');
  });

  it('POST /external-cases/:id/collection produces zero delegation on CONFIRM_REQUIRED', async () => {
    const thirdPartyService = { addExternalCaseCollection: jest.fn() };
    const authorization = {
      resolveExternalCaseId: jest.fn().mockResolvedValue('case-1'),
      authorize: jest.fn().mockResolvedValue({ kind: 'ENVELOPE', envelope }),
    };
    const controller = new ThirdPartyController(thirdPartyService as any, authorization as any);

    await expect(controller.addExternalCaseCollection(
      'tenant-1', 'user-1', 'external-1', { amount: 100 }, request(),
    )).resolves.toBe(envelope);
    expect(thirdPartyService.addExternalCaseCollection).not.toHaveBeenCalled();
  });
});

describe('RCV-P2-WS03-P03 static authorization bypass absence', () => {
  const root = path.resolve(__dirname, '..', '..');
  const assertions = [
    ['collection/collection.controller.ts', 'receiptAuthorization.authorize', 'collectionService.create'],
    ['case/case.controller.ts', 'receiptAuthorization.authorize', 'caseService.createCollection'],
    ['bank/bank.controller.ts', 'receiptAuthorization.authorize', 'bankService.matchTransaction'],
    ['debtor/third-party.controller.ts', 'receiptAuthorization.authorize', 'thirdPartyService.addExternalCaseCollection'],
  ] as const;

  it.each(assertions)('%s calls executable authorization before receipt delegation', (relative, gate, write) => {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    const gateIndex = source.indexOf(gate);
    const writeIndex = source.lastIndexOf(write);
    expect(gateIndex).toBeGreaterThan(-1);
    expect(writeIndex).toBeGreaterThan(gateIndex);
  });

  it('bounded receipt service does not import observe-only resolver or generic default-off gate', () => {
    const source = fs.readFileSync(
      path.join(root, 'collection/receipt-object-scope-authorization.service.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/from ['"].*effective-permission-resolver/);
    expect(source).not.toMatch(/from ['"].*guided-edge-gate\.service/);
    expect(source).not.toMatch(/isOfficeAdminCapacity/);
  });
});
