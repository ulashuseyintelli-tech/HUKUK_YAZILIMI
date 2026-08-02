import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ExternalCaseStatusTransitionService } from '../external-case-status-transition.service';

// DEBTOR-EXTERNAL-CASE-STATUS-INTEGRITY-P1-I15-D2-I02 (OWNER D2 POLICY DECISION —
// RATIFIED). Bu suite ExternalCaseStatusTransitionService'in 3 giriş noktasını
// kanıtlar: transitionManual (insan CAS, bank-candidate-settlement-transition
// emsali), closeManual (lawyer-only + closureReason kuralları), ve
// applySystemDerivedProjection (canonical-Collection-writer-only, SELECT ... FOR
// UPDATE pessimistic lock — REVIZYON: gerçek CI'da 10 eşzamanlı çağrı ile eski
// updatedAt-CAS + bounded-retry tasarımı ConflictException'a düştü; bkz. servis
// dosyası başı yorumu). Mock prisma, updateMany'nin WHERE guard alanlarını
// GERÇEKTEN kontrol eden minimal bir in-memory satır simüle eder (transitionManual/
// closeManual için) — böylece count===0 raced-read dalı da gerçekten tetiklenir.
// applySystemDerivedProjection artık $queryRaw (kilit) + koşulsuz update kullanır.

const TENANT = 't1';
const EXTERNAL_CASE_ID = 'ec1';
const CASE_ID = 'case1';
const CASE_DEBTOR_ID = 'cd1';
const ACTOR = 'user-1';

function makeMockPrisma(initialRow: Record<string, any>) {
  let row: Record<string, any> | null = { ...initialRow };
  let tick = 0;
  const externalCase = {
    findFirst: jest.fn(async () => (row ? { ...row } : null)),
    updateMany: jest.fn(async ({ where, data }: any) => {
      if (!row) return { count: 0 };
      const guardKeys = Object.keys(where).filter((k) => k !== 'id' && k !== 'tenantId');
      const matches = guardKeys.every((k) => {
        const actual = row![k];
        const expected = where[k];
        if (actual instanceof Date && expected instanceof Date) return actual.getTime() === expected.getTime();
        return actual === expected;
      });
      if (!matches) return { count: 0 };
      tick += 1;
      const definedData = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
      row = { ...row, ...definedData, updatedAt: new Date(2026, 0, 1, 0, 0, tick) };
      return { count: 1 };
    }),
    update: jest.fn(async ({ data }: any) => {
      if (!row) throw new Error('row not found');
      const definedData = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
      row = { ...row, ...definedData };
      return { ...row };
    }),
  };
  const prisma: any = {
    externalCase,
    $queryRaw: jest.fn(async () => (row ? [{ ...row }] : [])),
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };
  return { prisma, getRow: () => row };
}

function baseRow(overrides: Record<string, any> = {}) {
  return {
    id: EXTERNAL_CASE_ID,
    tenantId: TENANT,
    caseDebtorId: CASE_DEBTOR_ID,
    caseDebtor: { case: { id: CASE_ID } },
    attachmentStatus: 'HACIZ_TALEP',
    claimAmount: 1000,
    receivedAmount: 0,
    notes: null,
    closureReason: null,
    updatedAt: new Date(2025, 0, 1),
    ...overrides,
  };
}

function buildService(row: Record<string, any>, opts: { authorityThrows?: Error; guardThrows?: Error } = {}) {
  const { prisma, getRow } = makeMockPrisma(row);
  const auditService = { logInTransaction: jest.fn().mockResolvedValue(undefined) };
  const authority = {
    assertFactOrProcessTransitionAuthority: opts.authorityThrows
      ? jest.fn().mockRejectedValue(opts.authorityThrows)
      : jest.fn().mockResolvedValue({ actorKind: 'LAWYER', lawyerId: 'law-1' }),
    assertManualClosureAuthority: opts.authorityThrows
      ? jest.fn().mockRejectedValue(opts.authorityThrows)
      : jest.fn().mockResolvedValue({ actorKind: 'LAWYER', lawyerId: 'law-1' }),
  };
  const caseDebtorLifecycleGuard = {
    assertActiveByCaseDebtorId: opts.guardThrows
      ? jest.fn().mockRejectedValue(opts.guardThrows)
      : jest.fn().mockResolvedValue({ id: CASE_DEBTOR_ID, lifecycleStatus: 'ACTIVE' }),
  };
  const svc = new ExternalCaseStatusTransitionService(
    prisma,
    auditService as any,
    authority as any,
    caseDebtorLifecycleGuard as any,
  );
  return { svc, prisma, auditService, authority, caseDebtorLifecycleGuard, getRow };
}

describe('ExternalCaseStatusTransitionService.transitionManual', () => {
  it('TEST-1: geçerli geçiş (HACIZ_TALEP->CEVAP_BEKLENIYOR) CAS ile başarılı olur + audit loglanır', async () => {
    const { svc, auditService, getRow } = buildService(baseRow());
    const result = await svc.transitionManual(
      TENANT,
      EXTERNAL_CASE_ID,
      { expectedStatus: 'HACIZ_TALEP' as any, targetStatus: 'CEVAP_BEKLENIYOR' as any },
      ACTOR,
    );
    expect(result.status).toBe('TRANSITIONED');
    expect(getRow()?.attachmentStatus).toBe('CEVAP_BEKLENIYOR');
    expect(getRow()?.statusSource).toBe('MANUAL');
    expect(getRow()?.statusChangedBy).toBe(ACTOR);
    expect(auditService.logInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: TENANT,
        action: 'EXTERNAL_CASE_STATUS_TRANSITIONED',
        entityId: EXTERNAL_CASE_ID,
        userId: ACTOR,
      }),
    );
  });

  it.each([
    ['HACIZ_TALEP', 'TAHSIL_BASLADI'],
    ['HACIZ_TALEP', 'KAPANDI'],
    ['CEVAP_BEKLENIYOR', 'HACIZ_TALEP'],
    ['KAPANDI', 'HACIZ_TALEP'],
  ])('TEST-2.%s->%s: matrix dışı geçiş BadRequestException ile reddedilir, DB hiç dokunulmaz', async (from, to) => {
    const { svc, prisma } = buildService(baseRow({ attachmentStatus: from }));
    await expect(
      svc.transitionManual(TENANT, EXTERNAL_CASE_ID, { expectedStatus: from as any, targetStatus: to as any }, ACTOR),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.externalCase.updateMany).not.toHaveBeenCalled();
  });

  it('TEST-3: expectedStatus DB gerçek durumuyla uyuşmuyorsa VE hedef de gerçek durumla aynı değilse (gerçek çakışma) ConflictException + actualStatus raporlanır', async () => {
    // Row gerçekte CEVAP_BEKLENIYOR'da; istek HACIZ_TALEP'ten HACIZ_KONDU'ya geçmeyi
    // bekliyor (matrix'te geçerli bir kenar, ama expectedStatus artık DOĞRU DEĞİL) —
    // hedef (HACIZ_KONDU) da gerçek durumla (CEVAP_BEKLENIYOR) AYNI olmadığı için bu
    // idempotent replay DEĞİL, gerçek bir çakışmadır.
    const { svc } = buildService(baseRow({ attachmentStatus: 'CEVAP_BEKLENIYOR' }));
    await expect(
      svc.transitionManual(
        TENANT,
        EXTERNAL_CASE_ID,
        { expectedStatus: 'HACIZ_TALEP' as any, targetStatus: 'HACIZ_KONDU' as any },
        ACTOR,
      ),
    ).rejects.toMatchObject({
      constructor: ConflictException,
      response: expect.objectContaining({
        code: 'EXTERNAL_CASE_STATUS_TRANSITION_CONFLICT',
        details: { actualStatus: 'CEVAP_BEKLENIYOR' },
      }),
    });
  });

  it('TEST-4: retried istek — DB zaten targetStatus ise idempotent REPLAYED döner, ikinci audit YAZILMAZ', async () => {
    const { svc, auditService } = buildService(baseRow({ attachmentStatus: 'CEVAP_BEKLENIYOR' }));
    const result = await svc.transitionManual(
      TENANT,
      EXTERNAL_CASE_ID,
      { expectedStatus: 'HACIZ_TALEP' as any, targetStatus: 'CEVAP_BEKLENIYOR' as any },
      ACTOR,
    );
    expect(result.status).toBe('REPLAYED');
    expect(auditService.logInTransaction).not.toHaveBeenCalled();
  });

  it('TEST-5: authority servis reddederse (ForbiddenException) DB hiç dokunulmaz', async () => {
    const { svc, prisma } = buildService(baseRow(), { authorityThrows: new ForbiddenException('denied') });
    await expect(
      svc.transitionManual(
        TENANT,
        EXTERNAL_CASE_ID,
        { expectedStatus: 'HACIZ_TALEP' as any, targetStatus: 'CEVAP_BEKLENIYOR' as any },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.externalCase.updateMany).not.toHaveBeenCalled();
  });

  it('TEST-6: pasif CaseDebtor (lifecycle guard reddi) DB hiç dokunulmaz', async () => {
    const { svc, prisma } = buildService(baseRow(), { guardThrows: new BadRequestException('passive') });
    await expect(
      svc.transitionManual(
        TENANT,
        EXTERNAL_CASE_ID,
        { expectedStatus: 'HACIZ_TALEP' as any, targetStatus: 'CEVAP_BEKLENIYOR' as any },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.externalCase.updateMany).not.toHaveBeenCalled();
  });

  it('TEST-7: boş actorUserId fail-closed reddedilir (authority hiç çağrılmaz)', async () => {
    const { svc, authority } = buildService(baseRow());
    await expect(
      svc.transitionManual(
        TENANT,
        EXTERNAL_CASE_ID,
        { expectedStatus: 'HACIZ_TALEP' as any, targetStatus: 'CEVAP_BEKLENIYOR' as any },
        '',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(authority.assertFactOrProcessTransitionAuthority).not.toHaveBeenCalled();
  });

  it('TEST-8: yabancı/olmayan externalCaseId → NotFoundException', async () => {
    const { prisma, auditService, authority, caseDebtorLifecycleGuard } = buildService(baseRow());
    prisma.externalCase.findFirst.mockResolvedValueOnce(null);
    const svc = new ExternalCaseStatusTransitionService(
      prisma,
      auditService as any,
      authority as any,
      caseDebtorLifecycleGuard as any,
    );
    await expect(
      svc.transitionManual(
        TENANT,
        'yok-boyle-bir-id',
        { expectedStatus: 'HACIZ_TALEP' as any, targetStatus: 'CEVAP_BEKLENIYOR' as any },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ExternalCaseStatusTransitionService.closeManual', () => {
  it('TEST-9: geçerli manuel kapatma (NEGATIVE_RESPONSE) başarılı olur', async () => {
    const { svc, getRow } = buildService(baseRow({ attachmentStatus: 'HACIZ_KONDU' }));
    const result = await svc.closeManual(
      TENANT,
      EXTERNAL_CASE_ID,
      { expectedStatus: 'HACIZ_KONDU' as any, closureReason: 'NEGATIVE_RESPONSE' as any },
      ACTOR,
    );
    expect(result.status).toBe('TRANSITIONED');
    expect(getRow()?.attachmentStatus).toBe('KAPANDI');
    expect(getRow()?.closureReason).toBe('NEGATIVE_RESPONSE');
    expect(getRow()?.statusSource).toBe('MANUAL');
  });

  it('TEST-10: closureReason=FULLY_COLLECTED manuel kapatmada REDDEDİLİR (yalnız SYSTEM_DERIVED writer üretebilir)', async () => {
    const { svc, prisma } = buildService(baseRow({ attachmentStatus: 'HACIZ_KONDU' }));
    await expect(
      svc.closeManual(
        TENANT,
        EXTERNAL_CASE_ID,
        { expectedStatus: 'HACIZ_KONDU' as any, closureReason: 'FULLY_COLLECTED' as any },
        ACTOR,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'EXTERNAL_CASE_CLOSURE_REASON_RESERVED' }),
    });
    expect(prisma.externalCase.updateMany).not.toHaveBeenCalled();
  });

  it('TEST-11: expectedStatus=KAPANDI baştan reddedilir (zaten kapalıyı tekrar kapatma)', async () => {
    const { svc, prisma } = buildService(baseRow({ attachmentStatus: 'KAPANDI' }));
    await expect(
      svc.closeManual(
        TENANT,
        EXTERNAL_CASE_ID,
        { expectedStatus: 'KAPANDI' as any, closureReason: 'OTHER' as any },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.externalCase.updateMany).not.toHaveBeenCalled();
  });

  it('TEST-12: expectedStatus DB gerçek durumuyla uyuşmuyorsa ConflictException', async () => {
    const { svc } = buildService(baseRow({ attachmentStatus: 'HACIZ_KONDU' }));
    await expect(
      svc.closeManual(
        TENANT,
        EXTERNAL_CASE_ID,
        { expectedStatus: 'CEVAP_BEKLENIYOR' as any, closureReason: 'OTHER' as any },
        ACTOR,
      ),
    ).rejects.toMatchObject({ constructor: ConflictException });
  });

  it('TEST-13: retried istek — DB zaten AYNI closureReason ile KAPANDI ise REPLAYED döner', async () => {
    const { svc } = buildService(baseRow({ attachmentStatus: 'KAPANDI', closureReason: 'OTHER' }));
    const result = await svc.closeManual(
      TENANT,
      EXTERNAL_CASE_ID,
      { expectedStatus: 'HACIZ_KONDU' as any, closureReason: 'OTHER' as any },
      ACTOR,
    );
    expect(result.status).toBe('REPLAYED');
  });

  it('TEST-14: DB zaten KAPANDI ama FARKLI closureReason ile — güvenli replay DEĞİL, ConflictException', async () => {
    const { svc } = buildService(baseRow({ attachmentStatus: 'KAPANDI', closureReason: 'SUPERSEDED' }));
    await expect(
      svc.closeManual(
        TENANT,
        EXTERNAL_CASE_ID,
        { expectedStatus: 'HACIZ_KONDU' as any, closureReason: 'OTHER' as any },
        ACTOR,
      ),
    ).rejects.toMatchObject({ constructor: ConflictException });
  });

  it('TEST-15: staff (canEdit=true) closeManual çağırırsa authority servis reddeder, DB dokunulmaz', async () => {
    const { svc, prisma } = buildService(baseRow({ attachmentStatus: 'HACIZ_KONDU' }), {
      authorityThrows: new ForbiddenException({ code: 'EXTERNAL_CASE_CLOSURE_LAWYER_ASSIGNMENT_REQUIRED' }),
    });
    await expect(
      svc.closeManual(
        TENANT,
        EXTERNAL_CASE_ID,
        { expectedStatus: 'HACIZ_KONDU' as any, closureReason: 'OTHER' as any },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.externalCase.updateMany).not.toHaveBeenCalled();
  });
});

describe('ExternalCaseStatusTransitionService.applySystemDerivedProjection', () => {
  it('TEST-16: tek denemede başarılı olur, statusChanged=true iken audit loglanır', async () => {
    const { svc, auditService, getRow } = buildService(baseRow({ attachmentStatus: 'HACIZ_KONDU', receivedAmount: 0 }));
    const result = await svc.applySystemDerivedProjection(TENANT, EXTERNAL_CASE_ID, async (_current) => ({
      receivedAmount: 300,
      attachmentStatus: 'TAHSIL_BASLADI' as any,
      closureReason: null,
      lastReceivedAt: new Date(2026, 0, 5),
      notes: 'ilk tahsilat',
    }));
    expect(result?.attachmentStatus).toBe('TAHSIL_BASLADI');
    expect(getRow()?.receivedAmount).toBe(300);
    expect(auditService.logInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'EXTERNAL_CASE_STATUS_TRANSITIONED' }),
    );
  });

  it('TEST-17: durum DEĞİŞMEZSE (yalnız receivedAmount artar) audit ÇAĞRILMAZ', async () => {
    const { svc, auditService } = buildService(
      baseRow({ attachmentStatus: 'TAHSIL_BASLADI', receivedAmount: 300 }),
    );
    await svc.applySystemDerivedProjection(TENANT, EXTERNAL_CASE_ID, async () => ({
      receivedAmount: 500,
      attachmentStatus: 'TAHSIL_BASLADI' as any,
      closureReason: null,
      lastReceivedAt: new Date(2026, 0, 6),
      notes: 'ikinci tahsilat',
    }));
    expect(auditService.logInTransaction).not.toHaveBeenCalled();
  });

  it('TEST-18: tam tahsilat → KAPANDI + closureReason=FULLY_COLLECTED sistem tarafından set edilir', async () => {
    const { svc, getRow } = buildService(baseRow({ attachmentStatus: 'HACIZ_KONDU', claimAmount: 1000 }));
    await svc.applySystemDerivedProjection(TENANT, EXTERNAL_CASE_ID, async () => ({
      receivedAmount: 1000,
      attachmentStatus: 'KAPANDI' as any,
      closureReason: 'FULLY_COLLECTED' as any,
      lastReceivedAt: new Date(2026, 0, 7),
      notes: 'tam tahsilat',
    }));
    expect(getRow()?.attachmentStatus).toBe('KAPANDI');
    expect(getRow()?.closureReason).toBe('FULLY_COLLECTED');
    expect(getRow()?.statusSource).toBe('SYSTEM_DERIVED');
    expect(getRow()?.statusChangedBy).toBeNull();
  });

  it('TEST-19: satır SELECT ... FOR UPDATE ile kilitlenir — sorgu metninde FOR UPDATE geçer, computeNext TEK SEFER çağrılır', async () => {
    const { prisma } = buildService(baseRow({ attachmentStatus: 'HACIZ_KONDU', receivedAmount: 0 }));
    const computeNext = jest.fn(async (current: any) => ({
      receivedAmount: (current.receivedAmount || 0) + 100,
      attachmentStatus: 'TAHSIL_BASLADI' as any,
      closureReason: null,
      lastReceivedAt: new Date(2026, 0, 8),
      notes: 'tek deneme',
    }));

    await new ExternalCaseStatusTransitionService(
      prisma,
      { logInTransaction: jest.fn() } as any,
      {} as any,
      {} as any,
    ).applySystemDerivedProjection(TENANT, EXTERNAL_CASE_ID, computeNext);

    expect(computeNext).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const sqlArg = (prisma.$queryRaw as jest.Mock).mock.calls[0][0];
    expect(String(sqlArg?.sql ?? sqlArg)).toMatch(/FOR UPDATE/);
    expect(prisma.externalCase.update).toHaveBeenCalledTimes(1);
  });

  it('TEST-20: iki ARDIŞIK çağrı aynı satırda — ikinci çağrı ilkinin GÜNCEL halini görür, hiçbir tahsilat kaybolmaz', async () => {
    const { svc, getRow } = buildService(baseRow({ attachmentStatus: 'HACIZ_KONDU', receivedAmount: 0, claimAmount: 1000 }));

    await svc.applySystemDerivedProjection(TENANT, EXTERNAL_CASE_ID, async (current) => ({
      receivedAmount: Number(current.receivedAmount) + 300,
      attachmentStatus: 'TAHSIL_BASLADI' as any,
      closureReason: null,
      lastReceivedAt: new Date(2026, 0, 1),
      notes: 'ilk tahsilat',
    }));
    await svc.applySystemDerivedProjection(TENANT, EXTERNAL_CASE_ID, async (current) => ({
      receivedAmount: Number(current.receivedAmount) + 300,
      attachmentStatus: 'TAHSIL_BASLADI' as any,
      closureReason: null,
      lastReceivedAt: new Date(2026, 0, 2),
      notes: 'ikinci tahsilat',
    }));

    // 300 + 300 = 600 — ikinci çağrı ilkinin (300) üzerine yazmadı, KAYBETMEDİ.
    expect(getRow()?.receivedAmount).toBe(600);
  });

  it('TEST-21: yabancı/olmayan externalCaseId → NotFoundException ($queryRaw boş dizi döner)', async () => {
    const { prisma } = makeMockPrisma(baseRow());
    (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([]);
    const auditService = { logInTransaction: jest.fn() };
    const svc = new ExternalCaseStatusTransitionService(prisma, auditService as any, {} as any, {} as any);

    await expect(
      svc.applySystemDerivedProjection(TENANT, 'yok-boyle-bir-id', async () => ({
        receivedAmount: 100,
        attachmentStatus: 'TAHSIL_BASLADI' as any,
        closureReason: null,
        lastReceivedAt: new Date(),
        notes: 'x',
      })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
