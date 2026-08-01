import { ForbiddenException } from '@nestjs/common';
import { UyapService } from '../uyap.service';
// DEBTOR-UYAP-HACIZ-TENANT-GUARD-P1-I02 FIXTURE YUKSELTMESI (assertion ZAYIFLATILMADI):
// UYAP hukuki gonderim yollari artik KOSULSUZ olarak dosya sahipligi + gecerli vekalet
// ister. Bu spec'lerin amaci yetki DEGIL (transport truthfulness / evidence / log ownership
// / audit); dolayisiyla fixture yetkili bir baglam saglar. Yetki davranisinin KENDISI
// uyap-legal-authority-tenant-guard.spec.ts icinde ayrica ve tam olarak test edilir.
const AUTHORIZED_CASE = {
  id: 'c1',
  tenantId: 'tenant-A',
  caseClients: [{ clientId: 'client-1', client: { id: 'client-1' } }],
  lawyers: [{ lawyerId: 'lawyer-1', lawyer: { id: 'lawyer-1' } }],
};
const buildAuthorizedPoaService = () => ({
  checkValidPoa: jest.fn().mockResolvedValue({ isValid: true, message: 'ok' }),
});
const buildAuthorizedCaseFindFirst = () =>
  jest.fn(async (args: any) => ({ ...AUTHORIZED_CASE, id: args?.where?.id ?? 'c1' }));


/**
 * CLIENT-SEC-H2C-P02 — UyapRequestLog new-write tenant population.
 *
 * Kapsam:
 * - Yeni "brand-new" tenant-bound metotlar (checkTebligatStatus/checkMtsStatus/
 *   queryRelatedLawsuitStatus/queryDebtorAssets): doğru tenantId yazar, missing context'te
 *   fail closed (ForbiddenException, Prisma HİÇ çağrılmaz).
 * - Mevcut opsiyonel-tenantId alanını (POA amaçlı) yeniden kullanan metotlar
 *   (pushHacizRequest/sendPaymentOrder): tenantId varsa yazılır; YOKSA mevcut test edilmiş
 *   davranış (haciz-decision-audit.spec.ts) KORUNUR — işlem fail-closed OLMAZ, yalnız log
 *   satırı tenantId=NULL kalır (sentinel/sahte tenant ÜRETİLMEZ).
 * - System-scoped retryFailedRequests: raw update tenantId'ye HİÇ dokunmaz (ownership korunur).
 * - logResponse (tüm başarı/hata yanıt güncellemeleri): tenantId alanına dokunmaz.
 */
describe('CLIENT-SEC-H2C-P02 — UyapRequestLog tenant write population', () => {
  const buildService = (overrides: any = {}, serviceOverrides: any = {}) => {
    const prisma: any = {
      uyapRequestLog: {
        create: jest.fn().mockResolvedValue({ id: 'log-1' }),
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
      case: { findFirst: buildAuthorizedCaseFindFirst() },
      ...overrides,
    };
    const poaService: any = buildAuthorizedPoaService();
    const validationGate: any = { checkPreHacizIntelligence: jest.fn().mockResolvedValue({ isValid: true, warnings: [], debtors: [] }) };
    const errorReporter: any = { report: jest.fn() };
    // TRANSPORT-CONTAIN-01: sendPaymentOrder artık CasePolicyEngine yokluğunda fail-closed'tır
    // (action-matrix UYAP_SEND=failMode:'CLOSED' ile uzlaştırıldı). Bu dosyanın amacı CPE
    // davranışını değil tenant-ownership yazımını test etmek olduğundan CPE-allow sağlanır;
    // haciz-decision-audit.spec.ts'in kendi CPE-yok senaryosu ayrı ve DEĞİŞMEDİ (pushHacizRequest
    // CasePolicyEngine yokluğunda hâlâ gate'i tamamen atlar — bu birim onu değiştirmedi).
    const casePolicyEngine: any = serviceOverrides.casePolicyEngine ?? {
      canPerformAction: jest.fn().mockResolvedValue({ allowed: true, traceId: 'trace-allow' }),
    };
    // I15-D1: bu dosyanın odağı tenant-ownership yazımıdır, TRIGGER_HACIZ actor-specific
    // authority DEĞİL; varsayılan başarı mock'u ile mevcut davranış korunur.
    const triggerHacizAuthorization: any = serviceOverrides.triggerHacizAuthorization ?? {
      assertAuthorized: jest.fn(async () => ({ debtorId: 'debtor-default' })),
      revalidateCaseDebtorFreshness: jest.fn(async () => undefined),
    };
    const service = new UyapService(
      prisma,
      poaService,
      validationGate,
      errorReporter,
      casePolicyEngine,
      undefined,
      undefined,
      triggerHacizAuthorization,
    );
    return { service, prisma, casePolicyEngine, triggerHacizAuthorization };
  };

  describe('Brand-new tenant-bound metotlar — fail-closed + doğru yazım', () => {
    it('checkTebligatStatus: tenantId varsa create tenantId ile çağrılır', async () => {
      const { service, prisma } = buildService();
      await service.checkTebligatStatus('tebligat-1', 'tenant-A');
      expect(prisma.uyapRequestLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tenantId: 'tenant-A' }) }),
      );
    });

    it('checkTebligatStatus: tenant context yoksa fail closed, Prisma HİÇ çağrılmaz', async () => {
      const { service, prisma } = buildService();
      await expect(service.checkTebligatStatus('tebligat-1', undefined as any)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.uyapRequestLog.create).not.toHaveBeenCalled();
    });

    it('checkMtsStatus: tenantId varsa create tenantId ile çağrılır', async () => {
      const { service, prisma } = buildService();
      await service.checkMtsStatus('MTS-1', 'tenant-A');
      expect(prisma.uyapRequestLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tenantId: 'tenant-A' }) }),
      );
    });

    it('checkMtsStatus: tenant context yoksa fail closed', async () => {
      const { service, prisma } = buildService();
      await expect(service.checkMtsStatus('MTS-1', undefined as any)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.uyapRequestLog.create).not.toHaveBeenCalled();
    });

    it('queryRelatedLawsuitStatus: tenantId varsa create tenantId ile çağrılır', async () => {
      const { service, prisma } = buildService();
      await service.queryRelatedLawsuitStatus('EVK-1', 'tenant-A');
      expect(prisma.uyapRequestLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tenantId: 'tenant-A' }) }),
      );
    });

    it('queryRelatedLawsuitStatus: tenant context yoksa fail closed', async () => {
      const { service, prisma } = buildService();
      await expect(service.queryRelatedLawsuitStatus('EVK-1', undefined as any)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.uyapRequestLog.create).not.toHaveBeenCalled();
    });

    it('queryDebtorAssets: tenantId varsa create tenantId ile çağrılır', async () => {
      const { service, prisma } = buildService();
      await service.queryDebtorAssets('12345678901', 'case-1', 'tenant-A');
      expect(prisma.uyapRequestLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tenantId: 'tenant-A' }) }),
      );
    });

    it('queryDebtorAssets: tenant context yoksa fail closed', async () => {
      const { service, prisma } = buildService();
      await expect(
        service.queryDebtorAssets('12345678901', 'case-1', undefined as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.uyapRequestLog.create).not.toHaveBeenCalled();
    });
  });

  describe('5 mevcut metot — CLIENT-SEC-H2C-P02-R1: log ownership trusted param\'dan (DTO\'dan DEĞİL)', () => {
    it('pushHacizRequest: log tenantId trusted 2. arg\'dan gelir', async () => {
      const { service, prisma } = buildService();
      await service.pushHacizRequest({
        caseId: 'case-1',
        targetType: 'BANK',
        targetDetails: {},
        amount: 1000,
        skipPoaCheck: true,
      }, 'tenant-A');
      expect(prisma.uyapRequestLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tenantId: 'tenant-A' }) }),
      );
    });

    // DEBTOR-UYAP-HACIZ-TENANT-GUARD-P1-I02 ILE GUCLENDIRILDI (ZAYIFLATILMADI):
    // Bu testin korudugu invariant "DTO.tenantId log ownership'i belirleyemez" idi; eski
    // davranista uyusmayan DTO tenant'i sessizce YOK SAYILIYOR ve islem SURUYORDU.
    // Artik payload tenant'i yalniz tutarlilik iddiasidir ve uyusmazlik FAIL-CLOSED'dir:
    // saldirgan degeri log'a yazilamamakla kalmaz, islem hic baslamaz.
    it('pushHacizRequest: DTO.tenantId trusted execution tenant ile uyusmuyorsa FAIL-CLOSED (log YAZILMAZ)', async () => {
      const { service, prisma } = buildService();
      await expect(
        service.pushHacizRequest({
          caseId: 'case-1',
          targetType: 'BANK',
          targetDetails: {},
          amount: 1000,
          tenantId: 'body-attacker-tenant',
          skipPoaCheck: true,
        } as any, 'tenant-authenticated'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      // Saldirgan degeri log ownership'e ASLA yazilmaz — hicbir log satiri olusmaz.
      expect(prisma.uyapRequestLog.create).not.toHaveBeenCalled();
    });

    it('pushHacizRequest: DTO.tenantId YOK iken log ownership trusted param uzerinden yazilir', async () => {
      const { service, prisma } = buildService();
      await service.pushHacizRequest({
        caseId: 'case-1',
        targetType: 'BANK',
        targetDetails: {},
        amount: 1000,
      } as any, 'tenant-authenticated');
      expect(prisma.uyapRequestLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tenantId: 'tenant-authenticated' }) }),
      );
    });

    // ZORUNLU BACKEND TEST #14 (OWNER DECISION — RATIFIED): "CPE exact canonical target ile
    // çalışır." canPerformAction'a geçirilen context.debtorId, TriggerHacizAuthorizationService'in
    // dönen CANONICAL debtorId'sidir — targetDetails içine enjekte edilmiş herhangi bir
    // client-supplied debtorId'ye ASLA güvenilmez (ZORUNLU BACKEND TEST #11 ile aynı invariant'ın
    // CPE-cephesindeki kanıtı).
    it('pushHacizRequest: CPE context.debtorId canonical (authority guard\'dan dönen) değerdir — targetDetails.debtorId ENJEKSİYONU yok sayılır', async () => {
      const { service, casePolicyEngine } = buildService({}, {
        triggerHacizAuthorization: {
          assertAuthorized: jest.fn(async () => ({ debtorId: 'canonical-debtor-XYZ' })),
          revalidateCaseDebtorFreshness: jest.fn(async () => undefined),
        },
      });
      await service.pushHacizRequest({
        caseId: 'case-1',
        caseDebtorId: 'cd-1',
        targetType: 'BANK',
        targetDetails: { assetId: 'a1', debtorId: 'attacker-supplied-debtor' },
        amount: 1000,
        skipPoaCheck: true,
      } as any, 'tenant-A');

      const context = casePolicyEngine.canPerformAction.mock.calls[0][3];
      expect(context.debtorId).toBe('canonical-debtor-XYZ');
      expect(context.debtorId).not.toBe('attacker-supplied-debtor');
    });

    // ZORUNLU BACKEND TEST #15 (OWNER DECISION — RATIFIED): "Pre-effect lifecycle revalidation
    // kaldırılırsa test kırmızı." Bu, revalidateCaseDebtorFreshness metodunun KENDİ davranışını
    // değil, pushHacizRequest'in bu metodu gerçekten ÇAĞIRDIĞINI (wiring) kanıtlar — metot
    // izolasyonda doğru olsa bile call-site'tan kaldırılırsa bu test kırmızıya döner.
    it('pushHacizRequest: revalidateCaseDebtorFreshness immediately-pre-effect olarak (tenantId, caseId, caseDebtorId) ile çağrılır', async () => {
      const { service, triggerHacizAuthorization } = buildService();
      await service.pushHacizRequest({
        caseId: 'case-1',
        caseDebtorId: 'cd-1',
        targetType: 'BANK',
        targetDetails: {},
        amount: 1000,
        skipPoaCheck: true,
      } as any, 'tenant-A');

      expect(triggerHacizAuthorization.revalidateCaseDebtorFreshness).toHaveBeenCalledWith(
        'tenant-A', 'case-1', 'cd-1',
      );
    });

    it('sendPaymentOrder: log tenantId trusted 2. arg\'dan gelir', async () => {
      const { service, prisma } = buildService();
      await service.sendPaymentOrder({
        caseId: 'case-1',
        executionOfficeCode: 'OFF-1',
        creditor: { name: 'Alacaklı' },
        debtor: { name: 'Borçlu' },
        amount: 1000,
        currency: 'TRY',
        skipPoaCheck: true,
      }, 'tenant-A');
      expect(prisma.uyapRequestLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tenantId: 'tenant-A' }) }),
      );
    });

    it('submitDocument: log tenantId trusted 2. arg\'dan gelir', async () => {
      const { service, prisma } = buildService();
      await service.submitDocument({
        caseId: 'case-1',
        documentType: 'TAKIP_TALEBI',
        documentContent: 'YmFzZTY0',
        documentName: 'takip.xml',
        skipPoaCheck: true,
      }, 'tenant-A');
      expect(prisma.uyapRequestLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tenantId: 'tenant-A' }) }),
      );
    });

    it('submitCriminalComplaint: log tenantId trusted 2. arg\'dan gelir', async () => {
      const { service, prisma } = buildService();
      await service.submitCriminalComplaint({
        caseId: 'case-1',
        lawsuitType: 'KARSILIKSIZ_CEK',
        uyapDavaTuru: 'X',
        courtType: 'ASLIYE',
        documentContent: 'YmFzZTY0',
        documentName: 'sikayet.pdf',
        complainant: { name: 'A' },
        suspect: { name: 'B' },
        skipPoaCheck: true,
      }, 'tenant-A');
      expect(prisma.uyapRequestLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tenantId: 'tenant-A' }) }),
      );
    });

    it('submitCivilLawsuit: log tenantId trusted 2. arg\'dan gelir', async () => {
      const { service, prisma } = buildService();
      await service.submitCivilLawsuit({
        caseId: 'case-1',
        lawsuitType: 'ITIRAZIN_IPTALI',
        uyapDavaTuru: 'X',
        courtType: 'ASLIYE',
        documentContent: 'YmFzZTY0',
        documentName: 'dava.pdf',
        plaintiff: { name: 'A' },
        defendant: { name: 'B' },
        skipPoaCheck: true,
      }, 'tenant-A');
      expect(prisma.uyapRequestLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tenantId: 'tenant-A' }) }),
      );
    });
  });

  // UYAP-EVIDENCE-RUNTIME-INTEGRITY-R02 UYARLAMASI (owner §7 "retry owner: SINGLE"):
  // bu blok "system-scoped retry update'i tenantId'ye dokunmaz" güvencesini koruyordu.
  // Retry yolu tamamen kaldırıldı (UyapRequestLog ikinci bir retry state machine idi ve
  // dispatcher'ı UYAP-RETRY-CONTAIN-01 ile zaten kapalıydı). Güvence kaybolmadı, daha
  // güçlü hâle geldi: retry HİÇBİR yazma yapmıyor.
  describe('System-scoped retry — KALDIRILDI (ownership yazımı imkânsız)', () => {
    it('retryFailedRequests: fail-closed atar ve HİÇBİR yazma yapmaz', async () => {
      const { service, prisma } = buildService({
        uyapRequestLog: {
          create: jest.fn().mockResolvedValue({ id: 'log-1' }),
          update: jest.fn().mockResolvedValue({}),
          findMany: jest.fn().mockResolvedValue([
            { id: 'failed-1', requestType: 'checkMtsStatus', requestData: {}, retryCount: 0 },
          ]),
        },
      });

      await expect(service.retryFailedRequests()).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'UYAP_RETRY_CONTRACT_MISSING' }),
      });

      expect(prisma.uyapRequestLog.update).not.toHaveBeenCalled();
      expect(prisma.uyapRequestLog.create).not.toHaveBeenCalled();
      expect(prisma.uyapRequestLog.findMany).not.toHaveBeenCalled();
    });
  });

  describe('logResponse — tenant ownership update sırasında değişmez', () => {
    it('başarılı yanıt güncellemesi tenantId alanına dokunmaz', async () => {
      const { service, prisma } = buildService();
      await service.checkMtsStatus('MTS-1', 'tenant-A');

      const updateCalls = prisma.uyapRequestLog.update.mock.calls;
      expect(updateCalls.length).toBeGreaterThan(0);
      for (const call of updateCalls) {
        expect(call[0].data).not.toHaveProperty('tenantId');
      }
    });
  });
});
