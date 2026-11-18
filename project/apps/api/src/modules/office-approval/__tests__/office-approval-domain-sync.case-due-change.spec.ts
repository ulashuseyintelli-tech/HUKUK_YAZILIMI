import { OfficeApprovalExecutionStatus, OfficeApprovalStatus } from '@prisma/client';
import { OfficeApprovalDomainSyncService } from '../office-approval-domain-sync.service';

/**
 * Due (dosya kalemi) değişikliği onayının onay altyapısındaki dalı — owner kararı 19.11.2026. Değerler SENTETİK.
 *
 * Aynı işlem kodu + dosya hedefi; ayrım kayıtlı niyetin sürümüyle. Dal genel kalem değişikliği dalından ÖNCE yakalanır;
 * işleyici karar transaction'ı içinde çalışır. İşleyici kayıtlı değilse ya da niyeti tanımayan (eski) kod çalışıyorsa
 * onay kapalı-hata verir: hiçbir kayıt yazılmaz, talep bekler.
 */
describe('OfficeApprovalDomainSyncService — Due değişikliği onayı dalı', () => {
  const intent = {
    version: 'CASE_DUE_CHANGE_V1',
    operation: 'DUE_CREATE',
    caseId: 'case-1',
    due: { type: 'PRINCIPAL', amount: 1000, dueDate: '2025-01-15', currency: 'TRY' },
    reason: 'sentetik',
  };
  const request = (overrides: Record<string, unknown> = {}) =>
    ({
      id: 'approval-1',
      tenantId: 'tenant-1',
      actionCode: 'CLAIM_ITEM_HIGH_IMPACT_CHANGE',
      targetType: 'CLAIM_ITEM_CASE',
      targetRef: 'case-1',
      requesterUserId: 'requester-1',
      approverUserId: 'approver-1',
      status: OfficeApprovalStatus.APPROVED,
      executionStatus: OfficeApprovalExecutionStatus.NOT_RUN,
      savedIntent: intent,
      ...overrides,
    }) as any;
  const makeTx = (counts: number[] = [1, 1]) => {
    const updateMany = jest.fn();
    for (const count of counts) updateMany.mockResolvedValueOnce({ count });
    return { officeApprovalRequest: { updateMany }, claimItem: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() } } as any;
  };

  it('onay: NOT_RUN → RUNNING → işleyici → SUCCEEDED (karar transaction\'ı içinde, sırayla)', async () => {
    const service = new OfficeApprovalDomainSyncService();
    const handler = jest.fn(async () => undefined);
    service.registerCaseDueChangeHandler(handler);
    const tx = makeTx();
    const req = request();

    await service.syncAfterDecision(tx, req);

    expect(handler).toHaveBeenCalledWith(tx, req);
    const [claim, done] = tx.officeApprovalRequest.updateMany.mock.calls.map((call: any[]) => call[0]);
    expect(claim).toMatchObject({
      where: { id: 'approval-1', status: OfficeApprovalStatus.APPROVED, executionStatus: OfficeApprovalExecutionStatus.NOT_RUN },
      data: { executionStatus: OfficeApprovalExecutionStatus.RUNNING },
    });
    expect(done).toMatchObject({
      where: { id: 'approval-1', executionStatus: OfficeApprovalExecutionStatus.RUNNING },
      data: { executionStatus: OfficeApprovalExecutionStatus.SUCCEEDED },
    });
    const order = tx.officeApprovalRequest.updateMany.mock.invocationCallOrder;
    expect(order[0]).toBeLessThan(handler.mock.invocationCallOrder[0]);
    expect(handler.mock.invocationCallOrder[0]).toBeLessThan(order[1]);
    // Genel kalem değişikliği dalı ÇALIŞMADI.
    expect(tx.claimItem.findFirst).not.toHaveBeenCalled();
  });

  it('işleyici fırlatırsa hata yayılır; yürütme SUCCEEDED işaretlenmez (karar transaction\'ı geri alınır)', async () => {
    const service = new OfficeApprovalDomainSyncService();
    service.registerCaseDueChangeHandler(async () => {
      throw new Error('sentetik kabul reddi');
    });
    const tx = makeTx();

    await expect(service.syncAfterDecision(tx, request())).rejects.toThrow('sentetik kabul reddi');
    expect(tx.officeApprovalRequest.updateMany).toHaveBeenCalledTimes(1); // yalnız RUNNING işareti (geri alınacak)
  });

  it('işleyici kayıtlı değilse onay kapalı-hata verir; hiçbir yürütme işareti yazılmaz', async () => {
    const service = new OfficeApprovalDomainSyncService();
    const tx = makeTx();

    await expect(service.syncAfterDecision(tx, request())).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CASE_DUE_CHANGE_HANDLER_UNAVAILABLE' }),
    });
    expect(tx.officeApprovalRequest.updateMany).not.toHaveBeenCalled();
  });

  it('eşzamanlı ikinci yürütme (NOT_RUN CAS kaybı) işleyiciyi çağırmadan reddedilir', async () => {
    const service = new OfficeApprovalDomainSyncService();
    const handler = jest.fn(async () => undefined);
    service.registerCaseDueChangeHandler(handler);

    await expect(service.syncAfterDecision(makeTx([0]), request())).rejects.toThrow('zaten yurutulmus');
    expect(handler).not.toHaveBeenCalled();
  });

  it.each([OfficeApprovalStatus.REJECTED, OfficeApprovalStatus.REVISION_REQUESTED, OfficeApprovalStatus.CANCELLED])(
    '%s: hiçbir kayıt yazılmaz, işleyici çağrılmaz',
    async (status) => {
      const service = new OfficeApprovalDomainSyncService();
      const handler = jest.fn(async () => undefined);
      service.registerCaseDueChangeHandler(handler);
      const tx = makeTx();

      await service.syncAfterDecision(tx, request({ status }));

      expect(handler).not.toHaveBeenCalled();
      expect(tx.officeApprovalRequest.updateMany).not.toHaveBeenCalled();
    },
  );

  it('değiştirerek onay desteklenmez', async () => {
    const service = new OfficeApprovalDomainSyncService();
    const handler = jest.fn(async () => undefined);
    service.registerCaseDueChangeHandler(handler);

    await expect(
      service.syncAfterDecision(makeTx(), request({ status: OfficeApprovalStatus.APPROVED_WITH_CHANGES })),
    ).rejects.toThrow('değiştirilerek onaylanamaz');
    expect(handler).not.toHaveBeenCalled();
  });

  it('işleyici tek kez kaydedilir; aynı işleyicinin yeniden kaydı zararsızdır', () => {
    const service = new OfficeApprovalDomainSyncService();
    const handler = async () => undefined;
    service.registerCaseDueChangeHandler(handler);
    expect(() => service.registerCaseDueChangeHandler(handler)).not.toThrow();
    expect(() => service.registerCaseDueChangeHandler(async () => undefined)).toThrow('already registered');
  });

  it('dal yalnız aynı işlem kodu + dosya hedefi + niyet sürümünde yakalanır', async () => {
    const service = new OfficeApprovalDomainSyncService();
    const handler = jest.fn(async () => undefined);
    service.registerCaseDueChangeHandler(handler);

    // Başka işlem kodu: hiçbir alan eşitlemesi yok (genel no-op).
    await service.syncAfterDecision(makeTx(), request({ actionCode: 'CHANGE_STATUS' }));
    // Kalem hedefli aynı sürüm: bu dal DEĞİL → genel kalem dalı niyeti tanımaz ve reddeder (yazım yok).
    await expect(service.syncAfterDecision(makeTx(), request({ targetType: 'CLAIM_ITEM' }))).rejects.toThrow('CLAIM_ITEM savedIntent gecersiz.');
    expect(handler).not.toHaveBeenCalled();
  });

  it('geri dönüş güvenliği: bu niyeti tanımayan kod (genel kalem okuyucusu) talebi reddeder, yazım yapmaz', () => {
    // Bu dalı içermeyen eski derlemede talep genel kalem değişikliği dalına düşer; o dalın niyet okuyucusu sürüm
    // uyuşmazlığıyla durur. Talep onay bekler durumda kalır; kalem / Due oluşmaz.
    const service = new OfficeApprovalDomainSyncService();
    expect(() => (service as any).readClaimItemIntent(request())).toThrow('CLAIM_ITEM savedIntent gecersiz.');
  });
});
