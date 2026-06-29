import { ClientPayoutManualReversalController } from '../client-payout-manual-reversal.controller';

describe('ClientPayoutManualReversalController.close', () => {
  it('takes tenant and actor from request context, not request body', async () => {
    const service = {
      close: jest.fn().mockResolvedValue({ id: 'mr-1', status: 'CLOSED' }),
    } as any;
    const controller = new ClientPayoutManualReversalController(service);
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
