/**
 * ActionHandlerService lock temizleme aralığının yaşam döngüsü.
 *
 * Kusur (izole gate DB'de ölçüldü): aralık constructor'da açılıyor ve hiç kapanmıyordu;
 * bağlamı kapatılan ADR-014 runner kanıt yazdıktan sonra kendiliğinden çıkamıyordu.
 * Kilit: constructor aralık AÇMAZ; onApplicationBootstrap tek aralık açar (tekrarlı çağrı
 * ikinciyi açmaz); onModuleDestroy aynı aralığı kapatır.
 */
import { ActionHandlerService } from '../action-handler.service';

describe('ActionHandlerService — lock temizleme aralığı yaşam döngüsü', () => {
  let setSpy: jest.SpyInstance;
  let clearSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    setSpy = jest.spyOn(global, 'setInterval');
    clearSpy = jest.spyOn(global, 'clearInterval');
  });

  afterEach(() => {
    setSpy.mockRestore();
    clearSpy.mockRestore();
    jest.useRealTimers();
  });

  const make = () => new ActionHandlerService({} as never, {} as never, {} as never, {} as never);
  const lockIntervalCalls = () => setSpy.mock.calls.filter(([, ms]) => ms === 5 * 60 * 1000);

  it('constructor aralık açmaz', () => {
    make();
    expect(lockIntervalCalls()).toHaveLength(0);
  });

  it('onApplicationBootstrap tek aralık açar; onModuleDestroy aynı aralığı kapatır', () => {
    const svc = make();
    svc.onApplicationBootstrap();
    svc.onApplicationBootstrap();
    expect(lockIntervalCalls()).toHaveLength(1);
    const handle = setSpy.mock.results[setSpy.mock.calls.indexOf(lockIntervalCalls()[0])].value;

    svc.onModuleDestroy();
    expect(clearSpy).toHaveBeenCalledWith(handle);
    expect(jest.getTimerCount()).toBe(0);

    svc.onModuleDestroy();
    expect(clearSpy).toHaveBeenCalledTimes(1);
  });
});
