import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { BadRequestException } from '@nestjs/common';
import { UyapService, UYAP_HACIZ_TALEBI_ENDPOINT_REQUIRED, UYAP_SUBMIT_AUTHORITY_REVALIDATION_FAILED, UYAP_TAKIP_TALEBI_XML_SUBMIT_REQUIRED } from '../uyap.service';
import { submitAuthorityFactsDouble } from './submit-authority-facts.test-double';
import { UyapController } from '../uyap.controller';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ViewerWriteDenyGuard } from '../../auth/guards/viewer-write-deny.guard';
import { ActionCode } from '../../policy-engine/types/action-code.enum';
import { PolicyEngineController, CPE_CLIENT_CONTEXT_REJECTED } from '../../policy-engine/policy-engine.controller';

/**
 * Güvenlik paketi 01 P1 (DV-198 / GR-8; owner Ek 90 / Ek 91) — UYAP gönderim uçlarında ÇALIŞMA ZAMANI politika kapısı (saf test).
 *
 * Kilitlenenler:
 *  - document/submit → UYAP_DOCUMENT_SUBMIT; lawsuit/{criminal,civil} → UYAP_LAWSUIT_FILE; xml/submit → UYAP_SEND (TEK karar).
 *  - Aktör YALNIZ kimliği doğrulanmış kullanıcı (req.user.id); gövdedeki lawyerId / clientId yetki girdisi değil.
 *  - Sıra: assertUyapLegalAuthority → politika kapısı → yan etki (logRequest / yaşam döngüsü). Ret → yan etki YOK.
 *  - Fail-closed: motor yok / hata → CPE_CHECK_FAILED; ret → CPE_GATE_BLOCKED.
 *  - HACIZ_TALEBI evrak ucunda 400 UYAP_HACIZ_TALEBI_ENDPOINT_REQUIRED (owner Ek 91 B3-iii), veri erişiminden önce.
 *  - UyapController: JwtAuthGuard + ViewerWriteDenyGuard; okuma nitelikli POST'lar (xml/validate, debtor/assets) istisnalı.
 *  - can-perform-action: istemci `context`'i 400 (K3); bağlam sunucuda üretilir.
 * HTTP + tek kullanımlık PostgreSQL kanıtı: uyap-submit-runtime-authz.http.db-gated.integration.spec.ts.
 */

const T1 = 'tenant-1';

function buildService(opts: { cpe?: any | null; revalidation?: any | null } = {}) {
  const effects: string[] = [];
  const prisma: any = {
    case: {
      findFirst: jest.fn(async ({ where }: any) =>
        where?.tenantId === T1 && where?.id === 'case-1'
          ? { id: 'case-1', tenantId: T1, caseClients: [{ clientId: 'cl-1', client: { id: 'cl-1' } }], lawyers: [{ lawyerId: 'lw-1', lawyer: { id: 'lw-1' } }] }
          : null,
      ),
    },
    uyapRequestLog: {
      create: jest.fn(async () => { effects.push('uyapRequestLog.create'); return { id: 'log-1' }; }),
      update: jest.fn(async () => { effects.push('uyapRequestLog.update'); return { requestType: 'x', retryCount: 0 }; }),
    },
    caseLifecycle: { create: jest.fn(async () => { effects.push('caseLifecycle.create'); return {}; }) },
  };
  const poaService: any = { checkValidPoa: jest.fn(async () => ({ isValid: true, daysRemaining: 100, poa: { id: 'poa-1' } })) };
  const cpe =
    opts.cpe === null
      ? undefined
      : opts.cpe ?? { canPerformAction: jest.fn(async () => { effects.push('cpe'); return { allowed: true, code: 'OK', traceId: 't', decisionId: 'd' }; }) };
  // P5 (owner Ek 102 K2): işlem öncesi son yetki doğrulaması (varsayılan: bütün olgular true; null = bağımlılık YOK).
  const revalidation = opts.revalidation === null ? undefined : opts.revalidation ?? submitAuthorityFactsDouble();
  if (revalidation) {
    const inner = revalidation.compute;
    revalidation.compute = jest.fn(async (...args: any[]) => { effects.push('revalidate'); return inner(...args); });
  }
  const service = new UyapService(prisma, poaService, {} as any, { report: jest.fn() } as any, cpe, undefined, undefined, undefined, revalidation);
  return { service, prisma, cpe, effects, revalidation };
}

const doc = (over: Record<string, unknown> = {}) =>
  ({ caseId: 'case-1', documentType: 'DILEKCE', documentContent: 'ZG9j', documentName: 'd.pdf', lawyerId: 'spoofed', ...over }) as any;
const criminal = () =>
  ({ caseId: 'case-1', lawsuitType: 'KARSILIKSIZ_CEK', uyapDavaTuru: 'X', courtType: 'ASLIYE', documentContent: 'x', documentName: 's.pdf', complainant: { name: 'A' }, suspect: { name: 'B' }, lawyerId: 'spoofed' }) as any;
const civil = () =>
  ({ caseId: 'case-1', lawsuitType: 'ITIRAZIN_IPTALI', uyapDavaTuru: 'Y', courtType: 'ASLIYE', documentContent: 'x', documentName: 'h.pdf', plaintiff: { name: 'A' }, defendant: { name: 'B' }, lawyerId: 'spoofed' }) as any;

const OPS: Array<{ name: string; expected: ActionCode; run: (svc: UyapService, actor?: string) => Promise<any> }> = [
  { name: 'submitDocument (document/submit)', expected: ActionCode.UYAP_DOCUMENT_SUBMIT, run: (svc, actor) => svc.submitDocument(doc(), T1, actor) },
  { name: 'submitDocument (xml/submit iç çağrısı)', expected: ActionCode.UYAP_SEND, run: (svc, actor) => svc.submitDocument(doc({ documentType: 'TAKIP_TALEBI' }), T1, actor, ActionCode.UYAP_SEND) },
  { name: 'submitCriminalComplaint', expected: ActionCode.UYAP_LAWSUIT_FILE, run: (svc, actor) => svc.submitCriminalComplaint(criminal(), T1, actor) },
  { name: 'submitCivilLawsuit', expected: ActionCode.UYAP_LAWSUIT_FILE, run: (svc, actor) => svc.submitCivilLawsuit(civil(), T1, actor) },
];

const errorCode = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'NO_ERROR';
  } catch (e: any) {
    return { type: e?.constructor?.name, code: e?.getResponse?.()?.code };
  }
};

afterEach(() => jest.clearAllMocks());

describe.each(OPS)('P1 runtime politika kapısı — $name', ({ expected, run }) => {
  it('politika motoru TEK kez beklenen eylem koduyla, sunucu aktörüyle çağrılır; gövdedeki lawyerId kullanılmaz; sonra yerel simülasyon', async () => {
    const ctx = buildService();
    const res = await run(ctx.service, 'user-1');
    expect(ctx.cpe.canPerformAction).toHaveBeenCalledTimes(1);
    const [tenant, caseId, action, context] = ctx.cpe.canPerformAction.mock.calls[0];
    expect({ tenant, caseId, action }).toEqual({ tenant: T1, caseId: 'case-1', action: expected });
    expect(context).toMatchObject({ tenantId: T1, authenticatedUserId: 'user-1' });
    expect(context.evaluatedAt).toBeInstanceOf(Date);
    expect(JSON.stringify(context)).not.toContain('spoofed');
    // kapı yan etkiden ÖNCE
    expect(ctx.effects[0]).toBe('cpe');
    expect(res.success).toBe(true);
    expect(res.data).toMatchObject({ simulated: true, dispatched: false, providerAccepted: false, legalEffectConfirmed: false });
  });

  it('politika reddi → 400 CPE_GATE_BLOCKED; istek kaydı / yaşam döngüsü kaydı YOK', async () => {
    const cpe = { canPerformAction: jest.fn(async () => ({ allowed: false, code: 'GATE_BLOCKED', reason: 'UYAP işlemi için vekaletname gerekli.', blockedBy: { gateCode: 'POWER_OF_ATTORNEY_MISSING', severity: 'HARD' } })) };
    const ctx = buildService({ cpe });
    expect(await errorCode(run(ctx.service, 'user-1'))).toEqual({ type: 'BadRequestException', code: 'CPE_GATE_BLOCKED' });
    expect(ctx.effects).toEqual([]);
  });

  it('aktör yoksa da kapı çalışır (motor aktörsüz bağlamı reddeder; atlama yok)', async () => {
    const ctx = buildService();
    await run(ctx.service, undefined);
    expect(ctx.cpe.canPerformAction).toHaveBeenCalledTimes(1);
    expect(ctx.cpe.canPerformAction.mock.calls[0][3]).toMatchObject({ authenticatedUserId: undefined });
  });

  it('motor yok → 400 CPE_CHECK_FAILED (fail-closed), yan etki YOK', async () => {
    const ctx = buildService({ cpe: null });
    expect(await errorCode(run(ctx.service, 'user-1'))).toEqual({ type: 'BadRequestException', code: 'CPE_CHECK_FAILED' });
    expect(ctx.effects).toEqual([]);
  });

  it('motor hata verir → 400 CPE_CHECK_FAILED (fail-closed), yan etki YOK', async () => {
    const ctx = buildService({ cpe: { canPerformAction: jest.fn(async () => { throw new Error('boom'); }) } });
    expect(await errorCode(run(ctx.service, 'user-1'))).toEqual({ type: 'BadRequestException', code: 'CPE_CHECK_FAILED' });
    expect(ctx.effects).toEqual([]);
  });

  it('dosya sahipliği kapısı ÖNCE: başka büronun dosyası → UYAP_LEGAL_AUTHORITY_DENIED, motor HİÇ çağrılmaz', async () => {
    const ctx = buildService();
    ctx.prisma.case.findFirst.mockResolvedValue(null); // dosya bu büroda yok (başka büro / var olmayan)
    expect(await errorCode(run(ctx.service, 'user-1'))).toEqual({ type: 'BadRequestException', code: 'UYAP_LEGAL_AUTHORITY_DENIED' });
    expect(ctx.cpe.canPerformAction).not.toHaveBeenCalled();
    expect(ctx.effects).toEqual([]);
  });
});

describe.each(OPS)('P5 (owner Ek 102 K2) işlem öncesi son yetki doğrulaması — $name', ({ run }) => {
  it('sıra: politika kararı → son doğrulama → istek kaydı; doğrulama sunucu aktörü + dosya + kiracı ile yapılır', async () => {
    const ctx = buildService();
    await run(ctx.service, 'user-1');
    expect(ctx.effects.slice(0, 3)).toEqual(['cpe', 'revalidate', 'uyapRequestLog.create']);
    const [caseId, context] = ctx.revalidation.compute.mock.calls[0];
    expect(caseId).toBe('case-1');
    expect(context).toMatchObject({ tenantId: T1, authenticatedUserId: 'user-1' });
    expect(context.evaluatedAt).toBeInstanceOf(Date);
  });

  it.each([
    ['dosya ataması kalkmış', { 'actor.is_assigned_to_case': false }],
    ['vekalet kalkmış', { 'actor.has_matching_power_of_attorney': false }],
    ['vekalet yürürlükte değil', { 'poa.is_effective_at_evaluation_time': false }],
    ['avukat çözülemiyor', { 'actor.is_canonical_lawyer': false }],
    ['olgu hiç üretilmedi', { 'actor.is_assigned_to_case': undefined }],
  ])('%s → 400 UYAP_SUBMIT_AUTHORITY_REVALIDATION_FAILED; istek kaydı / yaşam döngüsü YOK', async (_label, patch) => {
    const ctx = buildService({ revalidation: submitAuthorityFactsDouble(patch) });
    expect(await errorCode(run(ctx.service, 'user-1'))).toEqual({ type: 'BadRequestException', code: 'UYAP_SUBMIT_AUTHORITY_REVALIDATION_FAILED' });
    expect(UYAP_SUBMIT_AUTHORITY_REVALIDATION_FAILED).toBe('UYAP_SUBMIT_AUTHORITY_REVALIDATION_FAILED');
    expect(ctx.effects).toEqual(['cpe', 'revalidate']);
  });

  it('doğrulayıcı YOK → fail-closed 400 UYAP_SUBMIT_AUTHORITY_REVALIDATION_FAILED; yan etki YOK', async () => {
    const ctx = buildService({ revalidation: null });
    expect(await errorCode(run(ctx.service, 'user-1'))).toEqual({ type: 'BadRequestException', code: 'UYAP_SUBMIT_AUTHORITY_REVALIDATION_FAILED' });
    expect(ctx.effects).toEqual(['cpe']);
  });

  it('doğrulayıcı hata fırlatır → fail-closed 400; yan etki YOK', async () => {
    const ctx = buildService({ revalidation: { compute: jest.fn(async () => { throw new Error('db down'); }) } });
    expect(await errorCode(run(ctx.service, 'user-1'))).toEqual({ type: 'BadRequestException', code: 'UYAP_SUBMIT_AUTHORITY_REVALIDATION_FAILED' });
    expect(ctx.effects.filter((e) => e.startsWith('uyapRequestLog') || e.startsWith('caseLifecycle'))).toEqual([]);
  });
});

describe('P5 (owner Ek 102 K2) — ödeme emri test ucu son doğrulamayı ÇAĞIRMAZ (Ek 95 K1)', () => {
  it('sendPaymentOrder: politika kararı var, son doğrulama yok', async () => {
    const ctx = buildService();
    await ctx.service
      .sendPaymentOrder({ caseId: 'case-1', executionOfficeCode: 'X', creditor: { name: 'A' }, debtor: { name: 'B' }, amount: 1, currency: 'TRY' } as any, T1, 'user-1')
      .catch(() => undefined);
    expect(ctx.cpe.canPerformAction).toHaveBeenCalledTimes(1);
    expect(ctx.revalidation.compute).not.toHaveBeenCalled();
  });
});

describe('P1 — HACIZ_TALEBI evrak ucunda reddedilir (owner Ek 91 B3-iii)', () => {
  it('400 UYAP_HACIZ_TALEBI_ENDPOINT_REQUIRED + "yalnız /uyap/haciz" iletisi; veri erişimi / politika kararı / yan etki YOK', async () => {
    const ctx = buildService();
    let caught: any;
    try {
      await ctx.service.submitDocument(doc({ documentType: 'HACIZ_TALEBI' }), T1, 'user-1');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(BadRequestException);
    expect(caught.getResponse()).toMatchObject({ code: UYAP_HACIZ_TALEBI_ENDPOINT_REQUIRED, message: 'Haciz talebi yalnız /uyap/haciz ucundan gönderilebilir.' });
    expect(ctx.prisma.case.findFirst).not.toHaveBeenCalled();
    expect(ctx.cpe.canPerformAction).not.toHaveBeenCalled();
    expect(ctx.effects).toEqual([]);
  });

  it('xml/submit yolu (UYAP_SEND) da HACIZ_TALEBI gönderemez', async () => {
    const ctx = buildService();
    expect(await errorCode(ctx.service.submitDocument(doc({ documentType: 'HACIZ_TALEBI' }), T1, 'user-1', ActionCode.UYAP_SEND))).toEqual({
      type: 'BadRequestException',
      code: UYAP_HACIZ_TALEBI_ENDPOINT_REQUIRED,
    });
  });

  it('kapalı küme dışı politika eylemi (tip zorlaması) → fail-closed CPE_CHECK_FAILED, motor çağrılmaz', async () => {
    const ctx = buildService();
    expect(await errorCode(ctx.service.submitDocument(doc(), T1, 'user-1', ActionCode.UYAP_QUERY as any))).toEqual({
      type: 'BadRequestException',
      code: 'CPE_CHECK_FAILED',
    });
    expect(ctx.cpe.canPerformAction).not.toHaveBeenCalled();
    expect(ctx.effects).toEqual([]);
  });
});

describe('P5 — TAKIP_TALEBI evrak ucunda reddedilir; xml/submit yolu etkilenmez (owner Ek 94, karar b2)', () => {
  it.each([
    ['varsayılan eylem (document/submit)', undefined],
    ['açık UYAP_DOCUMENT_SUBMIT', ActionCode.UYAP_DOCUMENT_SUBMIT],
  ])('%s → 400 UYAP_TAKIP_TALEBI_XML_SUBMIT_REQUIRED + açık ileti; veri erişimi / politika kararı / yan etki YOK', async (_label, action) => {
    const ctx = buildService();
    let caught: any;
    try {
      await ctx.service.submitDocument(doc({ documentType: 'TAKIP_TALEBI' }), T1, 'user-1', action as any);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(BadRequestException);
    expect(caught.getStatus()).toBe(400);
    expect(caught.getResponse()).toMatchObject({
      code: 'UYAP_TAKIP_TALEBI_XML_SUBMIT_REQUIRED',
      message: 'Takip talebi yalnız XML gönderim yolundan (xml/submit) gönderilebilir.',
    });
    expect(UYAP_TAKIP_TALEBI_XML_SUBMIT_REQUIRED).toBe('UYAP_TAKIP_TALEBI_XML_SUBMIT_REQUIRED');
    expect(ctx.prisma.case.findFirst).not.toHaveBeenCalled();
    expect(ctx.cpe.canPerformAction).not.toHaveBeenCalled();
    expect(ctx.effects).toEqual([]);
  });

  it('xml/submit iç çağrısı (UYAP_SEND) TAKIP_TALEBI ile ETKİLENMEZ: TEK UYAP_SEND kararı, sonra yerel simülasyon', async () => {
    const ctx = buildService();
    const res = await ctx.service.submitDocument(doc({ documentType: 'TAKIP_TALEBI' }), T1, 'user-1', ActionCode.UYAP_SEND);
    expect(ctx.cpe.canPerformAction).toHaveBeenCalledTimes(1);
    expect(ctx.cpe.canPerformAction.mock.calls[0][2]).toBe(ActionCode.UYAP_SEND);
    expect(res.success).toBe(true);
    expect(res.data).toMatchObject({ simulated: true, dispatched: false });
  });

  it.each(['DILEKCE', 'BEYAN', 'ITIRAZ', 'DIGER'])('evrak ucunda %s reddedilmez (yalnız TAKIP_TALEBI daraltıldı) → politika kararı TEK kez', async (type) => {
    const ctx = buildService();
    const res = await ctx.service.submitDocument(doc({ documentType: type }), T1, 'user-1');
    expect(ctx.cpe.canPerformAction).toHaveBeenCalledTimes(1);
    expect(ctx.cpe.canPerformAction.mock.calls[0][2]).toBe(ActionCode.UYAP_DOCUMENT_SUBMIT);
    expect(res.success).toBe(true);
  });
});

describe('P5 (owner Ek 95 K1) — dosya ataması kapısı çağıran bağlamıyla daraltıldı', () => {
  it('xml/submit iç çağrısı (UYAP_SEND) politika motoruna uyapSubmitChannel = XML_SUBMIT bildirir', async () => {
    const ctx = buildService();
    await ctx.service.submitDocument(doc({ documentType: 'TAKIP_TALEBI' }), T1, 'user-1', ActionCode.UYAP_SEND);
    expect(ctx.cpe.canPerformAction.mock.calls[0][3]).toMatchObject({ uyapSubmitChannel: 'XML_SUBMIT' });
  });

  it.each([
    ['document/submit', (svc: UyapService) => svc.submitDocument(doc(), T1, 'user-1')],
    ['lawsuit/criminal', (svc: UyapService) => svc.submitCriminalComplaint(criminal(), T1, 'user-1')],
    ['lawsuit/civil', (svc: UyapService) => svc.submitCivilLawsuit(civil(), T1, 'user-1')],
  ] as Array<[string, (svc: UyapService) => Promise<unknown>]>)('%s bu bağlamı VERMEZ (kendi eylem kodunda kapı koşulsuzdur)', async (_n, run) => {
    const ctx = buildService();
    await run(ctx.service);
    expect(ctx.cpe.canPerformAction.mock.calls[0][3]).not.toHaveProperty('uyapSubmitChannel');
  });

  it('ödeme emri test ucu (sendPaymentOrder, UYAP_SEND) bu bağlamı VERMEZ → atama kapısı uygulanmaz (main davranışı)', async () => {
    const ctx = buildService();
    await ctx.service.sendPaymentOrder(
      { caseId: 'case-1', executionOfficeCode: 'X', creditor: { name: 'A' }, debtor: { name: 'B' }, amount: 1, currency: 'TRY' } as any,
      T1,
      'user-1',
    ).catch(() => undefined); // yalnız politika çağrısının bağlamı ölçülür
    expect(ctx.cpe.canPerformAction).toHaveBeenCalledTimes(1);
    expect(ctx.cpe.canPerformAction.mock.calls[0][2]).toBe(ActionCode.UYAP_SEND);
    expect(ctx.cpe.canPerformAction.mock.calls[0][3]).not.toHaveProperty('uyapSubmitChannel');
  });
});

describe('P1 — UyapController: aktör sunucudan, xml/submit TEK karar (UYAP_SEND), salt okur koruması', () => {
  const mkController = () => {
    const uyapService: any = {
      submitDocument: jest.fn().mockResolvedValue({ success: true, evkNo: undefined }),
      submitCriminalComplaint: jest.fn().mockResolvedValue({ success: true }),
      submitCivilLawsuit: jest.fn().mockResolvedValue({ success: true }),
      validateCasePoaForUyap: jest.fn().mockResolvedValue({ isValid: true, errors: [] }),
    };
    const xml = { generateFromCase: jest.fn().mockResolvedValue('<x/>'), validateXml: jest.fn().mockReturnValue({ isValid: true, errors: [] }) };
    const observe = { observe: jest.fn().mockResolvedValue(undefined) };
    return { controller: new UyapController(uyapService, xml as any, observe as any), uyapService };
  };

  it('document/submit: aktör req.user.id (gövdedeki lawyerId DEĞİL); politika eylemi varsayılan (UYAP_DOCUMENT_SUBMIT)', async () => {
    const { controller, uyapService } = mkController();
    await controller.submitDocument({ caseId: 'case-1', documentType: 'DILEKCE', lawyerId: 'spoofed' }, T1, { user: { id: 'user-1' } });
    const call = uyapService.submitDocument.mock.calls[0];
    expect(call[1]).toBe(T1);
    expect(call[2]).toBe('user-1');
    expect(call.length).toBe(3); // 4. argüman yok → UYAP_DOCUMENT_SUBMIT (UYAP_SEND'e yükseltilemez)
  });

  it('xml/submit: iç submitDocument UYAP_SEND ile TEK kez çağrılır (denetleyicide ayrı karar yok)', async () => {
    const { controller, uyapService } = mkController();
    await controller.submitXmlToUyap('case-1', T1, { user: { id: 'user-1' } });
    expect(uyapService.submitDocument).toHaveBeenCalledTimes(1);
    const call = uyapService.submitDocument.mock.calls[0];
    expect(call.slice(1)).toEqual([T1, 'user-1', ActionCode.UYAP_SEND]);
  });

  it('sınıf korumaları: JwtAuthGuard SONRA ViewerWriteDenyGuard (sıra önemli: rol req.user\'dan okunur)', () => {
    const guards = Reflect.getMetadata('__guards__', UyapController) || [];
    expect(guards).toEqual([JwtAuthGuard, ViewerWriteDenyGuard]);
  });

  it('salt okur istisnası YALNIZ okuma nitelikli POST\'larda: xml/validate + debtor/assets', () => {
    const proto = UyapController.prototype as any;
    const posts = Object.getOwnPropertyNames(proto).filter((name) => Reflect.getMetadata('method', proto[name]) === 1 /* RequestMethod.POST */);
    expect(posts.length).toBeGreaterThanOrEqual(10); // 0 = kör
    const allowed = posts.filter((name) => Reflect.getMetadata('allowViewerReadOnlyPost', proto[name]) === true).sort();
    expect(allowed).toEqual(['queryDebtorAssets', 'validateXml']);
    for (const name of ['submitDocument', 'submitCriminalComplaint', 'submitCivilLawsuit', 'submitXmlToUyap', 'pushHacizRequest', 'testPaymentOrder', 'importXml', 'retryFailed']) {
      expect({ name, post: posts.includes(name), allowed: allowed.includes(name) }).toEqual({ name, post: true, allowed: false });
    }
  });
});

describe('P1 / K3 — can-perform-action: istemci bağlamı reddedilir, bağlam sunucuda üretilir', () => {
  const mk = () => {
    const cpe = { canPerformAction: jest.fn().mockResolvedValue({ allowed: false, code: 'GATE_BLOCKED' }) };
    const prisma = { case: { findFirst: jest.fn().mockResolvedValue({ id: 'case-1' }) } };
    return { controller: new PolicyEngineController(cpe as any, {} as any, prisma as any), cpe, prisma };
  };

  it.each([
    ['aktör sahteciliği', { authenticatedUserId: 'someone-else', tenantId: 'other-tenant', actingLawyerId: 'lw-x' }],
    ['boş nesne', {}],
    ['null', null],
  ])('gövdede `context` (%s) → 400 CPE_CLIENT_CONTEXT_REJECTED; dosya sorgusu / karar YOK', async (_l, context) => {
    const { controller, cpe, prisma } = mk();
    const res = await errorCode(controller.canPerformAction(T1, 'case-1', { actionCode: ActionCode.UYAP_SEND, context } as any, 'user-1'));
    expect(res).toEqual({ type: 'BadRequestException', code: CPE_CLIENT_CONTEXT_REJECTED });
    expect(cpe.canPerformAction).not.toHaveBeenCalled();
    expect(prisma.case.findFirst).not.toHaveBeenCalled();
  });

  it('bağlamsız gövde → eski yanıt biçimi { success, data }; bağlam sunucudan (tenant + req.user.id + değerlendirme anı)', async () => {
    const { controller, cpe } = mk();
    const res = await controller.canPerformAction(T1, 'case-1', { actionCode: ActionCode.UYAP_SEND } as any, 'user-1');
    expect(res).toEqual({ success: true, data: { allowed: false, code: 'GATE_BLOCKED' } });
    expect(cpe.canPerformAction).toHaveBeenCalledWith(T1, 'case-1', ActionCode.UYAP_SEND, { tenantId: T1, authenticatedUserId: 'user-1', evaluatedAt: expect.any(Date) });
  });
});

describe('P1 — kaynak sırası kilidi (ratchet): yetki → politika → yan etki', () => {
  const raw = fs.readFileSync(path.resolve(__dirname, '../uyap.service.ts'), 'utf8');
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const method = (name: string) => {
    const start = raw.search(new RegExp(`^ {2}(?:private )?async ${name}\\s*\\(`, 'm'));
    expect(start).toBeGreaterThanOrEqual(0);
    const rest = raw.slice(start + 1);
    const next = rest.search(/^ {2}(?:private |public |protected )?(?:async )?[A-Za-z0-9_]+\s*\(/m);
    return strip(rest.slice(0, next < 0 ? undefined : next));
  };

  it.each(['submitDocument', 'submitCriminalComplaint', 'submitCivilLawsuit'])('%s: assertUyapLegalAuthority < assertUyapPolicyAllows < logRequest', (name) => {
    const body = method(name);
    const authority = body.search(/this\.assertUyapLegalAuthority\s*\(/);
    const policy = body.search(/this\.assertUyapPolicyAllows\s*\(/);
    const log = body.search(/this\.logRequest\s*\(/);
    expect(authority).toBeGreaterThanOrEqual(0);
    expect(policy).toBeGreaterThan(authority);
    expect(log).toBeGreaterThan(policy);
  });

  it('politika kapısı yardımcısı motoru çağırır ve fail-closed kodları taşır (motor yok / hata / ret)', () => {
    const body = method('assertUyapPolicyAllows');
    expect(body).toMatch(/this\.casePolicyEngine\.canPerformAction\s*\(/);
    expect(body).toContain("code: 'CPE_CHECK_FAILED'");
    expect(body).toContain("code: 'CPE_GATE_BLOCKED'");
    expect(body).toMatch(/authenticatedUserId:\s*actorUserId/);
  });
});
