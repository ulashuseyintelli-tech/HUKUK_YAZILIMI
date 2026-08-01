/** @jest-environment node */
/**
 * DEBTOR-UYAP-HACIZ-TENANT-GUARD-P1-I02 — UYAP hukuki gonderim yetki siniri.
 *
 * Bulgular:
 *  - DEBTOR-IDOR-03: `submitCriminalComplaint` / `submitCivilLawsuit` yollarinda HICBIR
 *    dosya sahipligi kontrolu yoktu; `caseId` dogrudan istemci govdesinden geliyordu.
 *  - DEBTOR-IDOR-04: vekalet kontrolu `if (!skipPoaCheck && clientId && lawyerId &&
 *    request.tenantId)` kosuluna bagliydi (fail-open by omission) ve authority olarak
 *    ISTEMCI KONTROLUNDEKI DTO alani `request.tenantId` kullaniliyordu.
 *
 * Bu testler DAVRANIS dogrular:
 *  - Sahte Prisma `where` kosullarini GERCEKTEN uygular; tenant filtresi dususe test
 *    yesil KALAMAZ (kanit-uretici fixture).
 *  - Yetkisizlikte HICBIR yan etki olusmamalidir: log satiri yok, evidence yok,
 *    CPE karar kaydi yok, dis gonderim yok.
 *  - Cross-tenant / var-olmayan dosya / vekaletsiz durum DISARIYA AYNI yaniti verir.
 */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { UyapService } from '../uyap.service';

// ============================================================
// Fixtures: 2 tenant, 2 dosya, her dosyada 1 client + 1 lawyer
// ============================================================
const T1 = 'tenant-alpha';
const T2 = 'tenant-beta';

const CASES = [
  { id: 'case-a1', tenantId: T1, clientId: 'client-a', lawyerId: 'lawyer-a' },
  { id: 'case-b1', tenantId: T2, clientId: 'client-b', lawyerId: 'lawyer-b' },
];

type PoaOutcome = { isValid: boolean; message: string; daysRemaining?: number };

/**
 * `where` kosulunu GERCEKTEN uygulayan sahte Prisma + tam davranissal POA cozucusu.
 * `poaResolver` senaryoya gore MISSING/REVOKED/EXPIRED/WRONG-* durumlarini uretir.
 */
function buildService(opts: {
  poaResolver?: (clientId: string, lawyerId: string, tenantId: string) => PoaOutcome;
  cpe?: { canPerformAction: jest.Mock } | null;
  // I15-D1: bu dosya POA/tenant/CPE davranışını test eder — actor-specific
  // TRIGGER_HACIZ authority (ActingLawyer+assignment+own-POA-scope+PermissionGrant)
  // AYRI, dedike bir spec dosyasında (trigger-haciz-authorization.service.spec.ts)
  // test edilir. Varsayılan: her zaman başarıyla çözümlenir (bu dosyanın senaryolarını
  // etkilememesi için); `null` verilirse UNAVAILABLE (fail-closed) simüle eder.
  triggerHacizAuthorization?: { assertAuthorized: jest.Mock } | null;
} = {}) {
  const sideEffects: string[] = [];

  const prisma: any = {
    case: {
      findFirst: jest.fn(async (args: any) => {
        const w = args?.where ?? {};
        const row = CASES.find(
          (c) =>
            (w.id === undefined || c.id === w.id) &&
            (w.tenantId === undefined || c.tenantId === w.tenantId),
        );
        if (!row) return null;
        return {
          id: row.id,
          tenantId: row.tenantId,
          caseClients: [{ clientId: row.clientId, client: { id: row.clientId } }],
          lawyers: [{ lawyerId: row.lawyerId, lawyer: { id: row.lawyerId } }],
        };
      }),
    },
    uyapRequestLog: {
      create: jest.fn(async () => {
        sideEffects.push('uyapRequestLog.create');
        return { id: 'log-1' };
      }),
      update: jest.fn(async () => {
        sideEffects.push('uyapRequestLog.update');
        return {};
      }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  const poaService: any = {
    checkValidPoa: jest.fn(async (clientId: string, lawyerId: string, tenantId: string) => {
      const resolve = opts.poaResolver ?? (() => ({ isValid: true, message: 'ok' }));
      return resolve(clientId, lawyerId, tenantId);
    }),
  };

  const validationGate: any = {
    checkPreHacizIntelligence: jest.fn(async () => {
      sideEffects.push('validationGate.checkPreHacizIntelligence');
      return { isValid: true, warnings: [], debtors: [] };
    }),
  };

  const errorReporter: any = { report: jest.fn() };

  const cpe =
    opts.cpe === null
      ? undefined
      : opts.cpe ??
        ({
          canPerformAction: jest.fn(async () => {
            sideEffects.push('cpe.canPerformAction');
            return { allowed: true, traceId: 'trace-1', decisionId: 'dec-1' };
          }),
        } as any);

  const triggerHacizAuthorization =
    opts.triggerHacizAuthorization === null
      ? undefined
      : opts.triggerHacizAuthorization ??
        ({
          assertAuthorized: jest.fn(async () => ({ debtorId: 'debtor-default' })),
          revalidateCaseDebtorFreshness: jest.fn(async () => undefined),
        } as any);

  const service = new UyapService(
    prisma,
    poaService,
    validationGate,
    errorReporter,
    cpe,
    undefined, // evidenceOrchestrator — bu dosyanın kapsamı dışında
    undefined, // authoritySnapshots — bu dosyanın kapsamı dışında
    triggerHacizAuthorization,
  );
  return { service, prisma, poaService, cpe, triggerHacizAuthorization, sideEffects };
}

/** Yetkisiz istekte HICBIR yan etki olusmamis olmali. */
function expectNoSideEffect(ctx: ReturnType<typeof buildService>) {
  expect(ctx.prisma.uyapRequestLog.create).not.toHaveBeenCalled();
  expect(ctx.prisma.uyapRequestLog.update).not.toHaveBeenCalled();
  expect(ctx.sideEffects).toEqual([]);
}

const hacizReq = (over: Record<string, unknown> = {}) =>
  ({
    caseId: 'case-a1',
    targetType: 'BANK',
    targetDetails: {},
    amount: 100,
    ...over,
  }) as any;

const criminalReq = (over: Record<string, unknown> = {}) =>
  ({
    caseId: 'case-a1',
    lawsuitType: 'KARSILIKSIZ_CEK',
    uyapDavaTuru: 'X',
    courtType: 'ASLIYE',
    documentContent: 'ZG9j',
    documentName: 'sikayet.pdf',
    complainant: { name: 'A' },
    suspect: { name: 'B' },
    ...over,
  }) as any;

const civilReq = (over: Record<string, unknown> = {}) =>
  ({
    caseId: 'case-a1',
    lawsuitType: 'ITIRAZIN_IPTALI',
    uyapDavaTuru: 'Y',
    courtType: 'ASLIYE',
    documentContent: 'ZG9j',
    documentName: 'dava.pdf',
    plaintiff: { name: 'A' },
    defendant: { name: 'B' },
    ...over,
  }) as any;

const docReq = (over: Record<string, unknown> = {}) =>
  ({
    caseId: 'case-a1',
    documentType: 'HACIZ_TALEBI',
    documentContent: 'ZG9j',
    documentName: 'evrak.pdf',
    ...over,
  }) as any;

/** Korunan operasyonlar — her senaryo ucu icin de kosar. */
const OPERATIONS: Array<{
  name: string;
  invoke: (svc: UyapService, req: any, tenantId: any) => Promise<unknown>;
  req: (over?: Record<string, unknown>) => any;
}> = [
  {
    name: 'pushHacizRequest',
    invoke: (svc, req, tenantId) => (svc as any).pushHacizRequest(req, tenantId),
    req: hacizReq,
  },
  {
    name: 'submitCriminalComplaint',
    invoke: (svc, req, tenantId) => (svc as any).submitCriminalComplaint(req, tenantId),
    req: criminalReq,
  },
  {
    name: 'submitCivilLawsuit',
    invoke: (svc, req, tenantId) => (svc as any).submitCivilLawsuit(req, tenantId),
    req: civilReq,
  },
  // SIBLING PATH — ayni kok neden (bkz. PR aciklamasi): `submitDocument` de UYAP'a
  // hukuki evrak (TAKIP_TALEBI/DILEKCE/ITIRAZ/HACIZ_TALEBI) gonderiyor ve ayni fail-open
  // desenini tasiyordu. Ayni kapidan gectigi burada da dogrulanir.
  {
    name: 'submitDocument (sibling)',
    invoke: (svc, req, tenantId) => (svc as any).submitDocument(req, tenantId),
    req: docReq,
  },
];

afterEach(() => jest.clearAllMocks());

// ============================================================
// SEN-01..08 — tenant / dosya / kaynak sahipligi
// ============================================================
describe.each(OPERATIONS)('DEBTOR-IDOR-03/04 — $name tenant siniri', (op) => {
  it('SEN-01: ayni tenant + gecerli vekalet → islem devam eder', async () => {
    const ctx = buildService();
    await expect(op.invoke(ctx.service, op.req(), T1)).resolves.toBeDefined();
    expect(ctx.prisma.case.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'case-a1', tenantId: T1 } }),
    );
  });

  it('SEN-02: cross-tenant dosya → DENY, hicbir yan etki YOK', async () => {
    const ctx = buildService();
    await expect(op.invoke(ctx.service, op.req({ caseId: 'case-b1' }), T1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expectNoSideEffect(ctx);
  });

  it('SEN-03: cross-tenant kaynak baglantisi (payload tenantId baska tenant) → DENY', async () => {
    const ctx = buildService();
    await expect(
      op.invoke(ctx.service, op.req({ tenantId: T2 }), T1),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expectNoSideEffect(ctx);
    // Tenant uyusmazliginda DB'ye bile gidilmez.
    expect(ctx.prisma.case.findFirst).not.toHaveBeenCalled();
  });

  it('SEN-04: var olmayan dosya → DENY', async () => {
    const ctx = buildService();
    await expect(op.invoke(ctx.service, op.req({ caseId: 'yok' }), T1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expectNoSideEffect(ctx);
  });

  it('SEN-05: bos/eksik caseId → DENY (kaynak cozumlenemez)', async () => {
    const ctx = buildService();
    await expect(op.invoke(ctx.service, op.req({ caseId: '' }), T1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expectNoSideEffect(ctx);
  });

  it('SEN-06: sahte govde tenantId (kendi tenant ile ayni degil) → YOK SAYILMAZ, DENY', async () => {
    const ctx = buildService();
    await expect(
      op.invoke(ctx.service, op.req({ tenantId: 'saldirgan-tenant' }), T1),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expectNoSideEffect(ctx);
  });

  it('SEN-07: govde tenantId dogru olsa bile AUTHORITY dogrulanmis paramdir', async () => {
    const ctx = buildService();
    // Govde T1 diyor ama dogrulanmis principal T2 → T2'nin dosyasi degil → DENY.
    await expect(
      op.invoke(ctx.service, op.req({ caseId: 'case-a1', tenantId: T2 }), T2),
    ).rejects.toBeInstanceOf(BadRequestException);
    // Sorgu dogrulanmis tenant (T2) ile yapildi — govdedeki deger degil.
    expect(ctx.prisma.case.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'case-a1', tenantId: T2 } }),
    );
    expectNoSideEffect(ctx);
  });

  it('SEN-08: dogrulanmis tenant YOK → FAIL-CLOSED, DB sorgusu bile yapilmaz', async () => {
    for (const missing of [undefined, null, '']) {
      const ctx = buildService();
      await expect(op.invoke(ctx.service, op.req(), missing as any)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(ctx.prisma.case.findFirst).not.toHaveBeenCalled();
      expectNoSideEffect(ctx);
    }
  });
});

// ============================================================
// SEN-09..16 — aktor yetkisi ve vekalet
// ============================================================
describe.each(OPERATIONS)('DEBTOR-IDOR-04 — $name vekalet/aktor yetkisi', (op) => {
  const deny = (): PoaOutcome => ({ isValid: false, message: 'Geçerli vekalet bulunamadı' });

  it('SEN-09: yetkisiz aktor (dosyadaki avukata vekalet yok) → DENY', async () => {
    const ctx = buildService({ poaResolver: deny });
    await expect(op.invoke(ctx.service, op.req(), T1)).rejects.toBeInstanceOf(BadRequestException);
    expectNoSideEffect(ctx);
  });

  it('SEN-10: tenant uyeligi VAR ama hukuki yetki YOK → DENY (tenant sahipligi yetki degildir)', async () => {
    const ctx = buildService({ poaResolver: deny });
    await expect(op.invoke(ctx.service, op.req(), T1)).rejects.toBeInstanceOf(BadRequestException);
    // Dosya T1'e ait — sahiplik gecti, yetki gecmedi.
    expect(ctx.prisma.case.findFirst).toHaveBeenCalled();
    expectNoSideEffect(ctx);
  });

  it('SEN-11: vekalet YOK → DENY', async () => {
    const ctx = buildService({ poaResolver: deny });
    await expect(op.invoke(ctx.service, op.req(), T1)).rejects.toBeInstanceOf(BadRequestException);
    expectNoSideEffect(ctx);
  });

  it('SEN-12: vekalet IPTAL (status !== ACTIVE) → DENY', async () => {
    // Kanonik motor iptali `status: ACTIVE` filtresiyle eler → cozucu invalid doner.
    const ctx = buildService({ poaResolver: () => ({ isValid: false, message: 'revoked' }) });
    await expect(op.invoke(ctx.service, op.req(), T1)).rejects.toBeInstanceOf(BadRequestException);
    expectNoSideEffect(ctx);
  });

  it('SEN-13: vekalet SURESI DOLMUS → DENY', async () => {
    const ctx = buildService({ poaResolver: () => ({ isValid: false, message: 'expired' }) });
    await expect(op.invoke(ctx.service, op.req(), T1)).rejects.toBeInstanceOf(BadRequestException);
    expectNoSideEffect(ctx);
  });

  it('SEN-14: YANLIS TENANT vekaleti → DENY (cozucuye dogrulanmis tenant gecirilir)', async () => {
    const seen: string[] = [];
    const ctx = buildService({
      poaResolver: (_c, _l, tenantId) => {
        seen.push(tenantId);
        // Vekalet yalniz T2 altinda gecerli olsun; cagri T1 ile geldiginde eslesmemeli.
        return tenantId === T2 ? { isValid: true, message: 'ok' } : { isValid: false, message: 'wrong tenant' };
      },
    });
    await expect(op.invoke(ctx.service, op.req(), T1)).rejects.toBeInstanceOf(BadRequestException);
    expect(seen).toEqual([T1]); // istemci govdesindeki deger DEGIL
    expectNoSideEffect(ctx);
  });

  it('SEN-15: YANLIS DOSYA vekaleti → DENY (vekalet dosyanin client/lawyer ciftine baglidir)', async () => {
    const ctx = buildService({
      poaResolver: (clientId) =>
        clientId === 'client-b'
          ? { isValid: true, message: 'ok' }
          : { isValid: false, message: 'wrong case binding' },
    });
    // case-a1 → client-a; yalniz client-b'nin vekaleti var → DENY.
    await expect(op.invoke(ctx.service, op.req(), T1)).rejects.toBeInstanceOf(BadRequestException);
    expectNoSideEffect(ctx);
  });

  it('SEN-16: `skipPoaCheck` bayragi yetki kapisini ATLATAMAZ', async () => {
    const ctx = buildService({ poaResolver: deny });
    await expect(
      op.invoke(ctx.service, op.req({ skipPoaCheck: true }), T1),
    ).rejects.toBeInstanceOf(BadRequestException);
    expectNoSideEffect(ctx);
  });
});

// ============================================================
// SEN-17..19 — CPE fail-closed (yalniz haciz: kanonik ActionCode yalniz onun icin var)
// ============================================================
describe('DEBTOR-UYAP-HACIZ-TENANT-GUARD-P1-I02 — pushHacizRequest CPE gate', () => {
  it('SEN-17: CPE DENY → islem engellenir, log/dis gonderim YOK', async () => {
    const ctx = buildService({
      cpe: {
        canPerformAction: jest.fn(async () => ({ allowed: false, reason: 'gate', code: 'GATE_BLOCKED' })),
      } as any,
    });
    await expect((ctx.service as any).pushHacizRequest(hacizReq(), T1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(ctx.prisma.uyapRequestLog.create).not.toHaveBeenCalled();
  });

  it('SEN-18: CPE HATASI → FAIL-CLOSED (fail-open fallback YOK)', async () => {
    const ctx = buildService({
      cpe: {
        canPerformAction: jest.fn(async () => {
          throw new Error('cpe down');
        }),
      } as any,
    });
    await expect((ctx.service as any).pushHacizRequest(hacizReq(), T1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(ctx.prisma.uyapRequestLog.create).not.toHaveBeenCalled();
  });

  it('SEN-19: CPE dogrulanmis tenant ile cagrilir (tenant mismatch imkansiz)', async () => {
    const spy = jest.fn(async () => ({ allowed: true, traceId: 't', decisionId: 'd' }));
    const ctx = buildService({ cpe: { canPerformAction: spy } as any });
    await (ctx.service as any).pushHacizRequest(hacizReq({ tenantId: T1 }), T1);
    expect(spy).toHaveBeenCalledWith(T1, 'case-a1', expect.anything(), expect.anything());
  });

  it('SEN-19b: yetki kapisi CPE`den ONCE calisir — yetkisizde CPE HIC cagrilmaz', async () => {
    const spy = jest.fn();
    const ctx = buildService({ cpe: { canPerformAction: spy } as any });
    await expect(
      (ctx.service as any).pushHacizRequest(hacizReq({ caseId: 'case-b1' }), T1),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(spy).not.toHaveBeenCalled();
  });

  it('SEN-19c (I15-D1): triggerHacizAuthorization TRUSTED actorUserId parametresiyle cagrilir — body`deki request.userId/lawyerId ile DEGIL (spoof-proof)', async () => {
    const trustedActor = 'trusted-actor-from-controller';
    const spoofedBodyUserId = 'spoofed-user-in-body';
    const ctx = buildService({});
    await (ctx.service as any).pushHacizRequest(
      hacizReq({ userId: spoofedBodyUserId, lawyerId: 'spoofed-lawyer-in-body' }),
      T1,
      trustedActor,
    );
    expect(ctx.triggerHacizAuthorization.assertAuthorized).toHaveBeenCalledWith(
      expect.objectContaining({ authenticatedUserId: trustedActor }),
    );
    expect(ctx.triggerHacizAuthorization.assertAuthorized).not.toHaveBeenCalledWith(
      expect.objectContaining({ authenticatedUserId: spoofedBodyUserId }),
    );
  });
});

// ============================================================
// SEN-20..23 — yan etki sirasi
// ============================================================
describe.each(OPERATIONS)('SIDE-EFFECT ORDERING — $name', (op) => {
  it('SEN-20/21/22: yetki reddinde log kaydi, dis gonderim ve durum degisikligi OLUSMAZ', async () => {
    const ctx = buildService({ poaResolver: () => ({ isValid: false, message: 'no poa' }) });
    await expect(op.invoke(ctx.service, op.req(), T1)).rejects.toBeInstanceOf(BadRequestException);
    expect(ctx.prisma.uyapRequestLog.create).not.toHaveBeenCalled();
    expect(ctx.prisma.uyapRequestLog.update).not.toHaveBeenCalled();
    expect(ctx.sideEffects).toEqual([]);
  });

  it('SEN-23: yetkili istek TEK mantiksal komut uretir', async () => {
    const ctx = buildService();
    await op.invoke(ctx.service, op.req(), T1);
    expect(ctx.prisma.uyapRequestLog.create).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// SEN-24/25 — tekrarli gonderim (mevcut sozlesme kapsaminda)
// ============================================================
describe('DUPLICATE SUBMISSION — mevcut sozlesme', () => {
  it('SEN-24: es zamanli yetkisiz iki istek → HICBIRI gonderim uretmez', async () => {
    const ctx = buildService({ poaResolver: () => ({ isValid: false, message: 'no poa' }) });
    const results = await Promise.allSettled([
      (ctx.service as any).pushHacizRequest(hacizReq(), T1),
      (ctx.service as any).pushHacizRequest(hacizReq(), T1),
    ]);
    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    expect(ctx.prisma.uyapRequestLog.create).not.toHaveBeenCalled();
  });

  it('SEN-25: yetki kapisi her cagride yeniden degerlendirilir (cache/atlama YOK)', async () => {
    const ctx = buildService();
    await (ctx.service as any).pushHacizRequest(hacizReq(), T1);
    await (ctx.service as any).pushHacizRequest(hacizReq(), T1);
    // Iki cagri → iki bagimsiz sahiplik+vekalet dogrulamasi.
    expect(ctx.prisma.case.findFirst).toHaveBeenCalledTimes(2);
  });
});

// ============================================================
// Sozlesme (static) — gerilemeyi engelle
// ============================================================
describe('DEBTOR-UYAP-HACIZ-TENANT-GUARD-P1-I02 — sozlesme', () => {
  const SRC = readFileSync(join(__dirname, '..', 'uyap.service.ts'), 'utf8');

  it('korunan dort operasyon da yetki kapisini cagirir (3 hedef + 1 sibling)', () => {
    const calls = SRC.match(/await this\.assertUyapLegalAuthority\(\{/g) ?? [];
    expect(calls).toHaveLength(4);
  });

  it('UYAP modulunde kosullu (fail-open) vekalet blogu KALMADI', () => {
    // Bu PR uc hedef operasyon + submitDocument sibling yolunu kapatti.
    // sendPaymentOrder bilerek kapsam disinda birakilmisti (ayni dosyanin 287-345
    // araligini degistiren PR #1714 tam olarak o blogu kaldiriyordu). #1714 merge oldu
    // ve bu dal rebase ile onu aldi; sonuc olarak modulde hicbir kosullu POA blogu kalmadi.
    expect(SRC).not.toMatch(/if \(!request\.skipPoaCheck/);
  });

  it('kosullu (fail-open) vekalet bloklari KALDIRILDI', () => {
    expect(SRC).not.toMatch(/if \(!request\.skipPoaCheck && request\.\w+Id && request\.lawyerId/);
  });

  it('yetki kapisi ikinci bir POA motoru KURMAZ — kanonik cozucuyu cagirir', () => {
    expect(SRC).toMatch(/assertUyapLegalAuthority[\s\S]{0,3000}?await this\.validateCasePoaForUyap\(caseId, tenantId\)/);
  });

  it('kanonik POA motorunda aksiyon-kapsami (scope) alani YOKTUR — model siniri kayit altinda', () => {
    // DURUST KAYIT: `PoaService.checkValidPoa` tenant/lawyer/status/sure dogrular; islem
    // kategorisi bazli yetki kapsami (haciz vs sikayet vs dava) kanonik modelde YOK.
    // Bu spec o sinirin sessizce "kontrol ediliyor" sanilmasini engeller.
    const poaSrc = readFileSync(
      join(__dirname, '..', '..', 'poa', 'poa.service.ts'),
      'utf8',
    );
    const fn = poaSrc.slice(poaSrc.indexOf('async checkValidPoa('));
    expect(fn.slice(0, 1200)).not.toMatch(/actionScope|actionCategory|allowedActions/);
  });
});
