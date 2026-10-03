import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';
import { createIdempotencyKey } from '../idempotency-key';
import { startStageExpenseOperation } from '../stage-expense-operation';

/**
 * Aşama masraf seti — istek anahtarı istemci sözleşmesi (owner 2026-10-03, madde 4).
 * Anahtar KULLANICI İŞLEMİ başına bir kez üretilir; o işlemin tekrarlarında aynen gönderilir; meşru yeni işlem yeni anahtar
 * alır; çağıran anahtar verdiyse api.ts onu DEĞİŞTİRMEZ. İstemci hesap yapmaz; kopya / çakışma kararı sunucudadır.
 */
afterEach(() => vi.restoreAllMocks());

const spyRequest = () => vi.spyOn(api as unknown as { request: (...args: unknown[]) => Promise<unknown> }, 'request').mockResolvedValue({ id: 'x' });
const sentKeys = (request: ReturnType<typeof spyRequest>) =>
  request.mock.calls.map(([, options]) => JSON.parse(String((options as RequestInit).body)).idempotencyKey as string);

describe('api.createStageExpenses — çağıranın anahtarı aynen gider', () => {
  it('anahtarı gövdede gönderir, DEĞİŞTİRMEZ (kırpma, önek, yeniden üretim yok); uç, yöntem ve dosya / aşama yolu değişmez', async () => {
    const request = spyRequest();

    await api.createStageExpenses('case-1', 'SEIZURE', 'cagiran-anahtari-0001');

    expect(request).toHaveBeenCalledTimes(1);
    const [endpoint, options] = request.mock.calls[0] as [string, RequestInit];
    expect(endpoint).toBe('/expense-requests/case/case-1/stage/SEIZURE');
    expect(options.method).toBe('POST');
    expect(JSON.parse(String(options.body))).toEqual({ idempotencyKey: 'cagiran-anahtari-0001' });
  });
});

describe('startStageExpenseOperation — işlem başına tek anahtar', () => {
  it('TEKRAR = AYNI ANAHTAR: aynı işlemin submit()’i çift tıklamada ve yeniden denemede aynı anahtarı gönderir', async () => {
    const request = spyRequest();
    const operation = startStageExpenseOperation('case-1', 'SEIZURE');

    await operation.submit();
    await operation.submit();
    await operation.submit();

    expect(sentKeys(request)).toEqual([operation.idempotencyKey, operation.idempotencyKey, operation.idempotencyKey]);
    expect(request.mock.calls.every(([endpoint]) => endpoint === '/expense-requests/case/case-1/stage/SEIZURE')).toBe(true);
  });

  it('YENİ İŞLEM = YENİ ANAHTAR: ikinci işlem (ikinci haciz masrafı) farklı anahtar taşır; önceki işlemin tekrarı eski anahtarla gider', async () => {
    const request = spyRequest();
    const first = startStageExpenseOperation('case-1', 'SEIZURE');
    const second = startStageExpenseOperation('case-1', 'SEIZURE');

    await first.submit();
    await second.submit();
    await first.submit();

    expect(first.idempotencyKey).not.toBe(second.idempotencyKey);
    expect(sentKeys(request)).toEqual([first.idempotencyKey, second.idempotencyKey, first.idempotencyKey]);
  });

  it('anahtar işlem başlarken bir kez üretilir (submit sırasında yeniden üretilmez) ve sunucunun kabul ettiği biçimdedir', async () => {
    spyRequest();
    const operation = startStageExpenseOperation('case-1', 'SALE');
    const before = operation.idempotencyKey;

    await operation.submit();

    expect(operation.idempotencyKey).toBe(before);
    expect(before).toMatch(/^stage-expense-[A-Za-z0-9._:-]+$/);
    expect(before.length).toBeLessThanOrEqual(128);
  });

  it('iki bağımsız anahtar üretimi aynı değeri vermez', () => {
    expect(createIdempotencyKey('stage-expense')).not.toBe(createIdempotencyKey('stage-expense'));
  });
});
