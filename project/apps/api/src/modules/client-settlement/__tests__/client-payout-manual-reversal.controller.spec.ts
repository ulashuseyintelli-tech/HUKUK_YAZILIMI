import { ClientPayoutManualReversalController } from '../client-payout-manual-reversal.controller';

describe('ClientPayoutManualReversalController', () => {
  function buildController() {
    const service = {
      close: jest.fn().mockResolvedValue({ id: 'mr-1', status: 'CLOSED' }),
    } as any;
    const readService = {
      list: jest.fn().mockResolvedValue({ items: [], page: 1, limit: 50, total: 0 }),
      detail: jest.fn().mockResolvedValue({ id: 'mr-1', status: 'OPEN' }),
    } as any;
    return { service, readService, controller: new ClientPayoutManualReversalController(service, readService) };
  }

  it('passes tenant from request context to read-only list', async () => {
    const { controller, readService } = buildController();
    const query = { status: 'CLOSED', closureMethod: 'REFUND', tenantId: 'spoof-tenant' } as any;

    const result = await controller.list({ user: { tenantId: 'tenant-from-jwt', id: 'actor-from-jwt' } }, query);

    expect(result).toEqual({ data: { items: [], page: 1, limit: 50, total: 0 } });
    expect(readService.list).toHaveBeenCalledWith('tenant-from-jwt', query);
  });

  it('passes tenant from request context to read-only detail', async () => {
    const { controller, readService } = buildController();

    const result = await controller.detail({ user: { tenantId: 'tenant-from-jwt', id: 'actor-from-jwt' } }, 'mr-1');

    expect(result).toEqual({ data: { id: 'mr-1', status: 'OPEN' } });
    expect(readService.detail).toHaveBeenCalledWith('tenant-from-jwt', 'mr-1');
  });

  it('takes tenant and actor from request context, not request body, when closing', async () => {
    const { controller, service } = buildController();
    const body = {
      closureMethod: 'REFUND',
      evidenceRef: 'ev-1',
      tenantId: 'spoof-tenant',
      closedById: 'spoof-user',
    } as any;

    const result = await controller.close(
      { user: { tenantId: 'tenant-from-jwt', id: 'actor-from-jwt' } },
      'mr-1',
      body,
    );

    expect(result).toEqual({ data: { id: 'mr-1', status: 'CLOSED' } });
    expect(service.close).toHaveBeenCalledWith('tenant-from-jwt', 'actor-from-jwt', 'mr-1', body);
  });
});