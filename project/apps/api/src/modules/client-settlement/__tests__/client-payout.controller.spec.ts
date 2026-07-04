/**
 * PAYOUT-APPROVAL-2 PR-2b — ClientPayoutController route sözleşmesi.
 * Kilit iddia: eski POST /client-payouts artık service.create() DEĞİL, service.requestPayout()
 * çağırır (bypass kapandı — doğrudan RECORDED payout yaratma route seviyesinde artık mümkün değil).
 */
import { ClientPayoutController } from '../client-payout.controller';

const ACTOR = { id: 'u1', tenantId: 't1' };
const REQ = { user: ACTOR } as any;
const DTO = { caseId: 'case1', caseClientId: 'cc-A', amount: '400', idempotencyKey: 'k1' } as any;

function buildController() {
  const service = {
    create: jest.fn(),
    requestPayout: jest.fn().mockResolvedValue({ requested: true, approvalRequestId: 'oar-1', status: 'PENDING_APPROVAL' }),
    finalize: jest.fn().mockResolvedValue({ created: true, payoutId: 'p1' }),
  };
  const readService = { listPayouts: jest.fn().mockResolvedValue({ items: [], page: 1, limit: 20, total: 0 }) };
  const controller = new ClientPayoutController(service as any, readService as any);
  return { controller, service, readService };
}

describe('PAYOUT-APPROVAL-2 PR-2b — legacy route bypass kapatıldı', () => {
  it('POST /client-payouts (create handler) artık requestPayout() çağırır, create() ÇAĞRILMAZ', async () => {
    const { controller, service } = buildController();
    const res = await controller.create(REQ, DTO);
    expect(service.requestPayout).toHaveBeenCalledWith('t1', DTO, { userId: 'u1' });
    expect(service.create).not.toHaveBeenCalled();
    expect(res).toEqual({ data: { requested: true, approvalRequestId: 'oar-1', status: 'PENDING_APPROVAL' } });
  });

  it('POST /client-payouts/request de AYNI requestPayout() metodunu çağırır (iki route, aynı davranış)', async () => {
    const { controller, service } = buildController();
    await controller.request(REQ, DTO);
    expect(service.requestPayout).toHaveBeenCalledWith('t1', DTO, { userId: 'u1' });
  });

  it('POST /client-payouts/:approvalRequestId/finalize finalize() çağırır', async () => {
    const { controller, service } = buildController();
    const res = await controller.finalize(REQ, 'oar-1', DTO);
    expect(service.finalize).toHaveBeenCalledWith('t1', 'oar-1', DTO, { userId: 'u1' });
    expect(res).toEqual({ data: { created: true, payoutId: 'p1' } });
  });

  it('GET /client-payouts listesi değişmedi (readService.listPayouts)', async () => {
    const { controller, readService } = buildController();
    await controller.list(REQ, 'case1', 'cc-A', 'TRY', undefined, undefined, '1', '20');
    expect(readService.listPayouts).toHaveBeenCalledWith('t1', {
      caseId: 'case1',
      caseClientId: 'cc-A',
      currency: 'TRY',
      from: undefined,
      to: undefined,
      page: 1,
      limit: 20,
    });
  });
});
