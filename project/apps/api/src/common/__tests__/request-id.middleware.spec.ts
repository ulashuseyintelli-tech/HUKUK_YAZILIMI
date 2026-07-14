import { RequestIdMiddleware, getRequestId, normalizeRequestId } from '../request-id.middleware';

describe('RequestIdMiddleware correlation authority', () => {
  it('preserves a safe opaque request id and exposes the same response id', () => {
    const req = { headers: { 'x-request-id': 'req-01HZX_abc:42.7' } } as any;
    const setHeader = jest.fn();
    const next = jest.fn();

    new RequestIdMiddleware().use(req, { setHeader } as any, next);

    expect(getRequestId(req)).toBe('req-01HZX_abc:42.7');
    expect(setHeader).toHaveBeenCalledWith('x-request-id', 'req-01HZX_abc:42.7');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it.each([
    '',
    ' leading-space',
    'trailing-space ',
    'contains/slash',
    'contains\nnewline',
    'a'.repeat(129),
  ])('rejects unsafe input and lets middleware generate a safe server id: %p', (incoming) => {
    expect(normalizeRequestId(incoming)).toBeUndefined();
    const req = { headers: { 'x-request-id': incoming } } as any;
    const setHeader = jest.fn();

    new RequestIdMiddleware().use(req, { setHeader } as any, jest.fn());

    expect(getRequestId(req)).toMatch(/^[0-9a-f-]{36}$/);
    expect(getRequestId(req)).not.toBe(incoming);
  });
});
