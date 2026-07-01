import { CaseFeeAgreementController } from '../case-fee-agreement.controller';

const REQ = { user: { id: 'u-1', tenantId: 't-1' } } as any;

function makeController() {
  const service = {
    create: jest.fn().mockResolvedValue({ id: 'cfa-new' }),
    update: jest.fn().mockResolvedValue({ id: 'cfa-v2' }),
    terminate: jest.fn().mockResolvedValue({ id: 'cfa-1', status: 'TERMINATED' }),
    getById: jest.fn().mockResolvedValue({ id: 'cfa-1' }),
    getActiveForCaseClient: jest.fn().mockResolvedValue({ id: 'cfa-1', status: 'ACTIVE' }),
    listForCaseClient: jest.fn().mockResolvedValue([{ id: 'cfa-1' }]),
  };
  const controller = new CaseFeeAgreementController(service as never);
  return { controller, service };
}

describe('CaseFeeAgreementController (S8-B FAZ-2 — ince HTTP kabuğu)', () => {
  it('create → service.create(tenantId, input, {userId}); tenant/actor req.user\'dan', async () => {
    const { controller, service } = makeController();
    const input = { caseClientId: 'cc-1', feeType: 'FLAT_AMOUNT', flatAmount: '2000.00' } as any;
    const r = await controller.create(REQ, input);
    expect(service.create).toHaveBeenCalledWith('t-1', input, { userId: 'u-1' });
    expect(r).toEqual({ id: 'cfa-new' });
  });

  it('update → service.update(tenantId, agreementId, input, {userId})', async () => {
    const { controller, service } = makeController();
    const input = { feeType: 'FLAT_AMOUNT', flatAmount: '3000.00' } as any;
    await controller.update(REQ, 'cfa-1', input);
    expect(service.update).toHaveBeenCalledWith('t-1', 'cfa-1', input, { userId: 'u-1' });
  });

  it('terminate → service.terminate(tenantId, agreementId, {userId})', async () => {
    const { controller, service } = makeController();
    await controller.terminate(REQ, 'cfa-1');
    expect(service.terminate).toHaveBeenCalledWith('t-1', 'cfa-1', { userId: 'u-1' });
  });

  it('getById → service.getById(tenantId, agreementId) (read, actor geçmez)', async () => {
    const { controller, service } = makeController();
    await controller.getById(REQ, 'cfa-1');
    expect(service.getById).toHaveBeenCalledWith('t-1', 'cfa-1');
  });

  it('active → service.getActiveForCaseClient(tenantId, caseClientId)', async () => {
    const { controller, service } = makeController();
    await controller.active(REQ, 'cc-1');
    expect(service.getActiveForCaseClient).toHaveBeenCalledWith('t-1', 'cc-1');
  });

  it('listForCaseClient → service.listForCaseClient(tenantId, caseClientId)', async () => {
    const { controller, service } = makeController();
    const r = await controller.listForCaseClient(REQ, 'cc-1');
    expect(service.listForCaseClient).toHaveBeenCalledWith('t-1', 'cc-1');
    expect(r).toEqual([{ id: 'cfa-1' }]);
  });

  it('tenant/actor daima req.user\'dan alınır — body/param içindeki spoof değerler kullanılmaz', async () => {
    const { controller, service } = makeController();
    // input içine tenantId/actor spoof edilse bile controller yalnız req.user\'ı geçirir.
    const spoofInput = { caseClientId: 'cc-1', feeType: 'FLAT_AMOUNT', flatAmount: '2000.00', tenantId: 't-SPOOF', userId: 'u-SPOOF' } as any;
    await controller.create(REQ, spoofInput);
    const [tenantArg, , actorArg] = service.create.mock.calls[0];
    expect(tenantArg).toBe('t-1');
    expect(actorArg).toEqual({ userId: 'u-1' });
  });
});
