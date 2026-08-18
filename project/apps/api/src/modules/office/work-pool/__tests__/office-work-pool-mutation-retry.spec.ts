import { PrismaService } from '@/prisma/prisma.service';
import { OfficeWorkPoolMutationService } from '../office-work-pool.mutation.service';
import {
  OfficeWorkPoolLegacyPassthroughViolationError,
  OfficeWorkPoolUnknownStateError,
  OFFICE_WORK_POOL_MUTATION_MAX_ATTEMPTS,
} from '../office-work-pool.mutation-contract';

/**
 * OFFICE-WR01-B02 AŞAMA 4 — BOUNDED + SINIFLANDIRILMIŞ RETRY DÖNGÜSÜ (§9.4a/4, T5'in retry yarısı).
 *
 * NE KANITLANIR: retry döngüsünün KENDİSİ — kaç deneme yapıldığı, her denemenin YENİ bir
 * transaction açtığı, hangi hata sınıflarının döngüye girdiği ve hangilerinin ANINDA fırladığı.
 * Bunun için `$transaction`'ın hata enjekte eden bir sahtesi yeterlidir ve DOĞRU araçtır:
 * ölçülen şey kilit davranışı değil, denetim akışıdır.
 *
 * NE KANITLANMAZ (dürüstlük sınırı, §11.5.6): kilit, serialization, `effectiveAt` sırası ve
 * fark hesabı BURADA KANITLANMAZ. Mock'lu bir test lock garantisinin kanıtı SAYILAMAZ; onlar
 * `office-work-pool-dual-write.db-gated.integration.spec.ts` içindeki T1-T6 matrisindedir ve
 * gerçek PostgreSQL ister.
 */
describe('OFFICE-WR01-B02 A4 — retry sozlesmesi (bounded + siniflandirilmis)', () => {
  const TENANT = 'owp-retry-tenant';

  function makeService(transaction: jest.Mock) {
    const prisma = { $transaction: transaction } as unknown as PrismaService;
    const service = new OfficeWorkPoolMutationService(prisma);
    // Retry uyarısı structured log'dur; suite çıktısını kirletmemesi için susturulur.
    jest.spyOn((service as unknown as { logger: { warn: () => void } }).logger, 'warn').mockImplementation(() => undefined);
    return { service, transaction };
  }

  const OK_OUTCOME = {
    effectiveAt: new Date('2026-08-18T10:00:00.000Z'),
    office: { tenantId: TENANT },
    changes: [],
    provisionedAnchorKinds: [],
  };

  const params = {
    tenantId: TENANT,
    source: { mode: 'EXPLICIT' as const, targetStates: { ESCALATION_MANAGER: ['l1'] } },
    actorUserId: 'u1',
  };

  it('(1) ilk denemede basarili → attempts = 1, tek transaction', async () => {
    const { service, transaction } = makeService(jest.fn().mockResolvedValue(OK_OUTCOME));
    const result = await service.applyTargetState(params);
    expect(result.attempts).toBe(1);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('(2) P2034 iki kez → ucuncu denemede basarili; her deneme YENI transaction', async () => {
    const transaction = jest
      .fn()
      .mockRejectedValueOnce({ code: 'P2034' })
      .mockRejectedValueOnce({ code: '40001' })
      .mockResolvedValue(OK_OUTCOME);
    const { service } = makeService(transaction);

    const result = await service.applyTargetState(params);

    expect(result.attempts).toBe(3);
    expect(transaction).toHaveBeenCalledTimes(3);
    // Kör yeniden uygulama YOK: her deneme aynı callback'i YENİ bir transaction'da koşar,
    // callback kilidi yeniden alır ve durumu TAZE okur (§9.4a/5).
  });

  it('(3) surekli serialization hatasi → UST SINIRDA durur, orijinal hata korunur', async () => {
    const transaction = jest.fn().mockRejectedValue({ code: '40P01' });
    const { service } = makeService(transaction);

    await expect(service.applyTargetState(params)).rejects.toMatchObject({ code: '40P01' });
    expect(transaction).toHaveBeenCalledTimes(OFFICE_WORK_POOL_MUTATION_MAX_ATTEMPTS);
  });

  it('(4) belirsiz commit sonucu (baglanti koptu) bounded olarak yeniden denenir', async () => {
    const transaction = jest.fn().mockRejectedValueOnce({ code: 'P1017' }).mockResolvedValue(OK_OUTCOME);
    const { service } = makeService(transaction);

    const result = await service.applyTargetState(params);

    expect(result.attempts).toBe(2);
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it('(5) CHECK / FK / unique ihlali ASLA retry edilmez', async () => {
    for (const code of ['23514', '23503', '23505', 'P2002', 'P2003']) {
      const transaction = jest.fn().mockRejectedValue({ code });
      const { service } = makeService(transaction);
      await expect(service.applyTargetState(params)).rejects.toMatchObject({ code });
      expect(transaction).toHaveBeenCalledTimes(1);
    }
  });

  it('(6) domain hatasi (UNKNOWN durum) retry edilmez — retry ile duzelmez', async () => {
    const transaction = jest
      .fn()
      .mockRejectedValue(new OfficeWorkPoolUnknownStateError('ESCALATION_MANAGER', 'ANCHOR_MISSING'));
    const { service } = makeService(transaction);

    await expect(service.applyTargetState(params)).rejects.toBeInstanceOf(
      OfficeWorkPoolUnknownStateError,
    );
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('(7) siniflandirilamayan hata retry edilmez (fail-closed allowlist)', async () => {
    const transaction = jest.fn().mockRejectedValue(new Error('beklenmeyen'));
    const { service } = makeService(transaction);
    await expect(service.applyTargetState(params)).rejects.toThrow('beklenmeyen');
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('(8) havuz kolonu passthrough ile yazilamaz — transaction HIC ACILMAZ', async () => {
    const transaction = jest.fn().mockResolvedValue(OK_OUTCOME);
    const { service } = makeService(transaction);

    await expect(
      service.applyTargetState({
        ...params,
        legacyPassthrough: { opReminderDays: 3, escalationManagerLawyerIds: ['x'] },
      }),
    ).rejects.toBeInstanceOf(OfficeWorkPoolLegacyPassthroughViolationError);
    // Saf normalizasyon transaction'dan ÖNCE koşar: sözleşme ihlali KİLİT TUTARAK reddedilmez.
    expect(transaction).not.toHaveBeenCalled();
  });

  it('(9) havuz-disi passthrough serbesttir', async () => {
    const transaction = jest.fn().mockResolvedValue(OK_OUTCOME);
    const { service } = makeService(transaction);
    await expect(
      service.applyTargetState({
        ...params,
        legacyPassthrough: { opReminderDays: 3, caseTaskOwnerDays: 2 },
      }),
    ).resolves.toMatchObject({ attempts: 1 });
  });
});
