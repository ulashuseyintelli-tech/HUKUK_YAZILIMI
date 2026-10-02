/**
 * Dosya açılışı — otomatik açılış masraf akışının SONUCU (birim; veritabanı ve SMTP yok).
 *
 * Ölçülen kusur (main 6681b1d5): `CaseService.create` masraf e-postasının dönüş değerine bakmadan "Masraf talebi maili
 * gönderildi" yazıyor, gönderilemeyen e-posta kullanıcıya bildirilmiyordu. Owner kararı (2026-10-01): sonuç yanıtta
 * bildirilir (deneme en çok 10 sn beklenir), günlük sonuca göre yazılır, başarısızlıkta takip görevi oluşur.
 *
 * Bu test akışın DALLARINI sabitler (gerçek HTTP + veritabanı kanıtı:
 * expense-request/__tests__/opening-expense-email-outcome.http.db-gated.integration.spec.ts). Akış ASLA fırlatmaz:
 * masraf ya da e-posta hatası dosya açılışını bozmaz.
 */
import { CaseService } from '../case.service';
import {
  describeOpeningExpenseEmailFailure,
  OPENING_EXPENSE_EMAIL_WAIT_MS,
} from '../../expense-request/opening-expense-email-outcome';

const stub = {} as any;

/** Constructor sırası: prisma, audit, clientInfo, interestEngine, expenseRequest, domainEventIngest, collectionService, clientService, lawyerService, debtorService */
function build(expenseRequestService: Record<string, jest.Mock>) {
  const svc = new CaseService(stub, stub, stub, stub, expenseRequestService as any, stub, stub, stub, stub, stub);
  const log = jest.fn();
  const warn = jest.fn();
  (svc as any).logger = { log, warn };
  const run = (shouldSendEmail: boolean) => (svc as any).runOpeningExpenseAutomation('tenant-1', 'case-1', '2026/77', shouldSendEmail);
  const wait = (automation: Promise<unknown>) => (svc as any).awaitOpeningExpenseEmailOutcome(automation);
  return { svc, log, warn, run, wait };
}

const lines = (mock: jest.Mock) => mock.mock.calls.map(([message]) => String(message));

const NOT_SENT = (reasonCode: Parameters<typeof describeOpeningExpenseEmailFailure>[0]) => {
  const failure = describeOpeningExpenseEmailFailure(reasonCode);
  return {
    status: 'EMAIL_NOT_SENT',
    reasonCode,
    message: failure.message,
    requiredInfo: failure.requiredInfo,
    expenseEmailRequested: true,
    expenseEmailSent: false,
  };
};

describe('CaseService — otomatik açılış masraf akışının sonucu', () => {
  describe('e-posta istenmedi ("Sadece Oluştur")', () => {
    it('talep oluşturulur; e-posta DENENMEZ, sonuç üretilmez, günlük bugünkü satırı yazar', async () => {
      const expense = {
        createOpeningExpenseSet: jest.fn(async () => ({ id: 'exp-1' })),
        sendExpenseEmail: jest.fn(),
        recordOpeningExpenseEmailNotSent: jest.fn(),
      };
      const { run, log, warn } = build(expense);

      await expect(run(false)).resolves.toBeUndefined();

      expect(expense.createOpeningExpenseSet).toHaveBeenCalledWith('case-1', 'tenant-1', 'system');
      expect(expense.sendExpenseEmail).not.toHaveBeenCalled();
      expect(expense.recordOpeningExpenseEmailNotSent).not.toHaveBeenCalled();
      expect(lines(log)).toEqual(['Otomatik açılış masrafları oluşturuldu: 2026/77']);
      expect(lines(warn)).toEqual([]);
    });

    it('talep oluşturulamazsa fırlatmaz; bugünkü uyarı satırı yazılır, sonuç üretilmez', async () => {
      const expense = { createOpeningExpenseSet: jest.fn(async () => Promise.reject(new Error('Takibe müvekkil atanmamış'))), sendExpenseEmail: jest.fn() };
      const { run, log, warn } = build(expense);

      await expect(run(false)).resolves.toBeUndefined();

      expect(lines(log)).toEqual([]);
      expect(lines(warn)).toEqual(['Otomatik masraf seti oluşturulamadı: Takibe müvekkil atanmamış']);
    });
  });

  describe('e-posta istendi ("Oluştur ve Masraf Maili Gönder")', () => {
    it('gönderildi: sonuç üretilmez (yanıta alan girmez); günlük bugünkü iki satırı yazar; başarısızlık kaydı / görev yok', async () => {
      const expense = {
        createOpeningExpenseSet: jest.fn(async () => ({ id: 'exp-1' })),
        sendExpenseEmail: jest.fn(async () => ({ success: true, notificationId: 'n-1' })),
        recordOpeningExpenseEmailNotSent: jest.fn(),
      };
      const { run, log, warn } = build(expense);

      await expect(run(true)).resolves.toBeUndefined();

      expect(expense.sendExpenseEmail).toHaveBeenCalledWith('tenant-1', 'exp-1', 'system');
      expect(expense.recordOpeningExpenseEmailNotSent).not.toHaveBeenCalled();
      expect(lines(log)).toEqual(['Otomatik açılış masrafları oluşturuldu: 2026/77', 'Masraf talebi maili gönderildi: 2026/77']);
      expect(lines(warn)).toEqual([]);
    });

    it.each([
      ['kapalı kapı', { success: false, reason: 'PAYMENT_ACCOUNT_INVALID' }],
      ['dağıtım başarısız', { success: false }],
      ['dönüş değeri yok', undefined],
    ])('gönderilemedi (%s): neden kaydedilen son denemeden okunur, görev yazılır, "gönderildi" YAZILMAZ', async (_title, emailResult) => {
      const failure = describeOpeningExpenseEmailFailure('PAYMENT_ACCOUNT_MISSING');
      const expense = {
        createOpeningExpenseSet: jest.fn(async () => ({ id: 'exp-1' })),
        sendExpenseEmail: jest.fn(async () => emailResult),
        recordOpeningExpenseEmailNotSent: jest.fn(async () => failure),
      };
      const { run, log, warn } = build(expense);

      await expect(run(true)).resolves.toEqual(NOT_SENT('PAYMENT_ACCOUNT_MISSING'));

      expect(expense.recordOpeningExpenseEmailNotSent).toHaveBeenCalledWith('tenant-1', 'exp-1', 'DELIVERY_NOT_CONFIRMED');
      expect(lines(log)).toEqual(['Otomatik açılış masrafları oluşturuldu: 2026/77']);
      expect(lines(warn)).toEqual(['Masraf talebi maili GÖNDERİLEMEDİ: 2026/77 (neden: PAYMENT_ACCOUNT_MISSING)']);
    });

    it('gönderim istisna ile kesilirse fırlatmaz: bugünkü uyarı satırı + genel neden SEND_ERROR ile kayıt', async () => {
      const expense = {
        createOpeningExpenseSet: jest.fn(async () => ({ id: 'exp-1' })),
        sendExpenseEmail: jest.fn(async () => Promise.reject(new Error('Masraf talebi bulunamadı'))),
        recordOpeningExpenseEmailNotSent: jest.fn(async (_tenant: string, _id: string, fallback: any) => describeOpeningExpenseEmailFailure(fallback)),
      };
      const { run, warn } = build(expense);

      await expect(run(true)).resolves.toEqual(NOT_SENT('SEND_ERROR'));

      expect(expense.recordOpeningExpenseEmailNotSent).toHaveBeenCalledWith('tenant-1', 'exp-1', 'SEND_ERROR');
      expect(lines(warn)).toEqual(['Masraf maili gönderilemedi: Masraf talebi bulunamadı', 'Masraf talebi maili GÖNDERİLEMEDİ: 2026/77 (neden: SEND_ERROR)']);
    });

    it('neden / görev kaydı yazılamazsa da sonuç (genel nedenle) bildirilir', async () => {
      const expense = {
        createOpeningExpenseSet: jest.fn(async () => ({ id: 'exp-1' })),
        sendExpenseEmail: jest.fn(async () => ({ success: false })),
        recordOpeningExpenseEmailNotSent: jest.fn(async () => Promise.reject(new Error('db down'))),
      };
      const { run, warn } = build(expense);

      await expect(run(true)).resolves.toEqual(NOT_SENT('DELIVERY_NOT_CONFIRMED'));
      expect(lines(warn)).toEqual([
        'Masraf e-postası sonucu kaydedilemedi (2026/77): db down',
        'Masraf talebi maili GÖNDERİLEMEDİ: 2026/77 (neden: DELIVERY_NOT_CONFIRMED)',
      ]);
    });

    it.each([
      ['talep oluşturulamadı', jest.fn(async () => Promise.reject(new Error('beklenmeyen hata')))],
      ['talep kimliği dönmedi', jest.fn(async () => null)],
    ])('%s: e-posta denenmez; gönderilmediği nedeniyle bildirilir', async (_title, createOpeningExpenseSet) => {
      const expense = { createOpeningExpenseSet, sendExpenseEmail: jest.fn(), recordOpeningExpenseEmailNotSent: jest.fn() };
      const { run } = build(expense);

      await expect(run(true)).resolves.toEqual(NOT_SENT('OPENING_REQUEST_NOT_CREATED'));

      expect(expense.sendExpenseEmail).not.toHaveBeenCalled();
      expect(expense.recordOpeningExpenseEmailNotSent).not.toHaveBeenCalled();
    });
  });

  describe('yanıtın e-posta denemesini beklemesi', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('deneme süresinde sonuçlanırsa sonucu (ya da gönderildiyse undefined) aynen döner ve zamanlayıcı bırakılmaz', async () => {
      const { wait } = build({});

      await expect(wait(Promise.resolve(undefined))).resolves.toBeUndefined();
      await expect(wait(Promise.resolve(NOT_SENT('RECIPIENT_MISSING')))).resolves.toEqual(NOT_SENT('RECIPIENT_MISSING'));
      expect(jest.getTimerCount()).toBe(0);
    });

    it('süre dolana kadar sonuç yoksa "henüz belli değil" döner; süre dolmadan dönmez', async () => {
      const { wait } = build({});
      const never = new Promise<undefined>(() => undefined);
      let settled: unknown = 'bekliyor';
      const pending = wait(never).then((value: unknown) => {
        settled = value;
        return value;
      });

      await jest.advanceTimersByTimeAsync(OPENING_EXPENSE_EMAIL_WAIT_MS - 1);
      expect(settled).toBe('bekliyor');

      await jest.advanceTimersByTimeAsync(1);
      await expect(pending).resolves.toEqual({
        status: 'EMAIL_RESULT_PENDING',
        reasonCode: 'RESULT_PENDING',
        message: expect.stringContaining('henüz belli değil'),
        requiredInfo: [],
        expenseEmailRequested: true,
        expenseEmailSent: false,
      });
      expect(jest.getTimerCount()).toBe(0);
    });
  });
});
