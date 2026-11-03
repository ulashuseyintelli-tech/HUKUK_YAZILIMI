import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';

// O-1: `api.delete` gövdeyi YALNIZ verildiğinde gönderir; gövdesiz çağrılar önceki istekle aynı kalır.
function stubFetch() {
  const fetchMock = vi.fn().mockImplementation(async () =>
    new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api.delete gövde', () => {
  it('gövdesiz: DELETE, istekte body alanı YOK', async () => {
    const f = stubFetch();
    await api.delete('/lawyers/l1');
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toMatch(/\/lawyers\/l1$/);
    expect(init.method).toBe('DELETE');
    expect('body' in init).toBe(false);
  });

  it('gövdeli: DELETE + JSON gövde + Content-Type application/json', async () => {
    const f = stubFetch();
    await api.delete('/lawyers/l1', { replacementLawyerId: 'l2' });
    const [, init] = f.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('DELETE');
    expect(init.body).toBe(JSON.stringify({ replacementLawyerId: 'l2' }));
    expect(new Headers(init.headers as HeadersInit).get('Content-Type')).toBe('application/json');
  });
});
