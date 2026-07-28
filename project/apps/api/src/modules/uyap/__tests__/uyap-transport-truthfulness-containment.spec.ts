/**
 * TRANSPORT-CONTAIN-01 — UYAP stub gönderim yollarının truthfulness containment sözleşmesi.
 * REAL-TRANSPORT=0: hiçbir stub-success yolu provider kabulü, gerçek gönderim veya hukuki
 * sonuç iddia edemez (sendPaymentOrder/pushHacizRequest/submitDocument/submitCriminalComplaint/
 * submitCivilLawsuit). sendPaymentOrder'ın CPE teknik-hata davranışı action-matrix'in
 * UYAP_SEND=failMode:'CLOSED' bildirimiyle uzlaştırılarak fail-closed'a çekildi.
 */

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


const FORBIDDEN_CLAIM_PATTERNS = [
  /UYAP'?a gönderildi/i,
  /kuyruğ\w* alındı/i,
  /başarıyla gönderildi/i,
];

function assertNoForbiddenClaim(text: string | undefined | null) {
  if (!text) return;
  for (const pattern of FORBIDDEN_CLAIM_PATTERNS) {
    expect(text).not.toMatch(pattern);
  }
}

const buildPrisma = () => ({
  case: { findFirst: buildAuthorizedCaseFindFirst() },
  uyapRequestLog: {
    create: jest.fn().mockResolvedValue({ id: 'req1' }),
    update: jest.fn().mockResolvedValue({ requestType: 'x', retryCount: 0 }),
  },
  auditLog: { create: jest.fn().mockResolvedValue({}) },
  caseLifecycle: { create: jest.fn().mockResolvedValue({}) },
});

const buildErrorReporter = () => ({ report: jest.fn().mockResolvedValue(undefined) });

const buildValidationGate = () => ({
  checkPreHacizIntelligence: jest.fn().mockResolvedValue({
    caseId: 'c1',
    isValid: true,
    warnings: [],
    overallLevel: 'DUSUK',
    debtors: [],
  }),
});

const buildCpeAllow = () => ({
  canPerformAction: jest.fn().mockResolvedValue({ allowed: true, traceId: 'trace-allow' }),
});

const buildCpeDeny = () => ({
  canPerformAction: jest.fn().mockResolvedValue({
    allowed: false,
    reason: 'test-deny',
    code: 'DENY_CODE',
    traceId: 'trace-deny',
  }),
});

const buildCpeThrows = () => ({
  canPerformAction: jest.fn().mockRejectedValue(new Error('cpe-boom')),
});

function buildService(opts: { casePolicyEngine?: any } = {}) {
  const prisma = buildPrisma();
  const errorReporter = buildErrorReporter();
  const validationGate = buildValidationGate();
  const poaService: any = buildAuthorizedPoaService();
  const svc = new UyapService(
    prisma as any,
    poaService,
    validationGate as any,
    errorReporter as any,
    opts.casePolicyEngine,
  );
  return { svc, prisma, errorReporter, validationGate };
}

const paymentRequest = (over: any = {}) => ({
  caseId: 'c1',
  executionOfficeCode: 'TEST-001',
  creditor: { name: 'Alacaklı' },
  debtor: { name: 'Borçlu' },
  amount: 1000,
  currency: 'TRY',
  skipPoaCheck: true,
  ...over,
});

const hacizRequest = (over: any = {}) => ({
  caseId: 'c1',
  targetType: 'BANK' as const,
  targetDetails: {},
  amount: 1000,
  skipPoaCheck: true,
  ...over,
});

const documentRequest = (over: any = {}) => ({
  caseId: 'c1',
  documentType: 'DIGER' as const,
  documentContent: 'x',
  documentName: 'd.pdf',
  skipPoaCheck: true,
  ...over,
});

const criminalRequest = (over: any = {}) => ({
  caseId: 'c1',
  lawsuitType: 'KARSILIKSIZ_CEK' as const,
  uyapDavaTuru: 'x',
  courtType: 'ICRA',
  documentContent: 'x',
  documentName: 'd.pdf',
  complainant: { name: 'A' },
  suspect: { name: 'B' },
  skipPoaCheck: true,
  ...over,
});

const civilRequest = (over: any = {}) => ({
  caseId: 'c1',
  lawsuitType: 'ITIRAZIN_IPTALI' as const,
  uyapDavaTuru: 'x',
  courtType: 'ICRA',
  documentContent: 'x',
  documentName: 'd.pdf',
  plaintiff: { name: 'A' },
  defendant: { name: 'B' },
  skipPoaCheck: true,
  ...over,
});

describe('UyapService — TRANSPORT-CONTAIN-01 truthfulness containment', () => {
  describe('sendPaymentOrder — CPE fail-closed uzlaştırması', () => {
    it('CPE explicit deny → CPE_GATE_BLOCKED korunur (mevcut davranış)', async () => {
      const { svc, prisma } = buildService({ casePolicyEngine: buildCpeDeny() });

      await expect(svc.sendPaymentOrder(paymentRequest(), 't1')).rejects.toMatchObject({
        response: { code: 'CPE_GATE_BLOCKED' },
      });
      expect(prisma.uyapRequestLog.create).not.toHaveBeenCalled();
    });

    it('CPE teknik hata (throws) → CPE_CHECK_FAILED + hiçbir write yapılmaz (önceden fail-open idi)', async () => {
      const { svc, prisma } = buildService({ casePolicyEngine: buildCpeThrows() });

      await expect(svc.sendPaymentOrder(paymentRequest(), 't1')).rejects.toMatchObject({
        response: { code: 'CPE_CHECK_FAILED' },
      });
      expect(prisma.uyapRequestLog.create).not.toHaveBeenCalled();
    });

    it('CasePolicyEngine injection absent → CPE_CHECK_FAILED + zero write', async () => {
      const { svc, prisma } = buildService({ casePolicyEngine: undefined });

      await expect(svc.sendPaymentOrder(paymentRequest(), 't1')).rejects.toMatchObject({
        response: { code: 'CPE_CHECK_FAILED' },
      });
      expect(prisma.uyapRequestLog.create).not.toHaveBeenCalled();
    });

    it('CPE allow → stub dispatch normal şekilde ilerler (regresyon)', async () => {
      const { svc } = buildService({ casePolicyEngine: buildCpeAllow() });

      const res = await svc.sendPaymentOrder(paymentRequest(), 't1');
      expect(res.success).toBe(true);
    });
  });

  describe('pushHacizRequest — mevcut CPE fail-closed davranışı DEĞİŞMEDİ (regresyon)', () => {
    it('CPE explicit deny → CPE_GATE_BLOCKED', async () => {
      const { svc } = buildService({ casePolicyEngine: buildCpeDeny() });

      await expect(svc.pushHacizRequest(hacizRequest(), 't1')).rejects.toMatchObject({
        response: { code: 'CPE_GATE_BLOCKED' },
      });
    });

    it('CPE teknik hata → CPE_CHECK_FAILED (zaten fail-closed idi, davranış değişmedi)', async () => {
      const { svc } = buildService({ casePolicyEngine: buildCpeThrows() });

      await expect(svc.pushHacizRequest(hacizRequest(), 't1')).rejects.toMatchObject({
        response: { code: 'CPE_CHECK_FAILED' },
      });
    });
  });

  describe('stub-success response sözleşmesi (5 metod)', () => {
    it('sendPaymentOrder: simulated/dispatched/providerAccepted/legalEffectConfirmed + stubReference + evkNo yok', async () => {
      const { svc } = buildService({ casePolicyEngine: buildCpeAllow() });
      const res: any = await svc.sendPaymentOrder(paymentRequest(), 't1');

      expect(res.success).toBe(true);
      expect(res.evkNo).toBeUndefined();
      expect(res.data.simulated).toBe(true);
      expect(res.data.dispatched).toBe(false);
      expect(res.data.providerAccepted).toBe(false);
      expect(res.data.legalEffectConfirmed).toBe(false);
      expect(res.data.stubReference).toEqual(expect.stringMatching(/^EVK-\d+$/));
      assertNoForbiddenClaim(res.data.message);
    });

    it('pushHacizRequest: simulated/dispatched/providerAccepted/legalEffectConfirmed + stubReference + evkNo yok', async () => {
      const { svc } = buildService({ casePolicyEngine: buildCpeAllow() });
      const res: any = await svc.pushHacizRequest(hacizRequest(), 't1');

      expect(res.success).toBe(true);
      expect(res.evkNo).toBeUndefined();
      expect(res.data.simulated).toBe(true);
      expect(res.data.dispatched).toBe(false);
      expect(res.data.providerAccepted).toBe(false);
      expect(res.data.legalEffectConfirmed).toBe(false);
      expect(res.data.stubReference).toEqual(expect.stringMatching(/^HCZ-\d+$/));
      assertNoForbiddenClaim(res.data.message);
    });

    it('submitDocument: simulated/dispatched/providerAccepted/legalEffectConfirmed + stubReference + evkNo yok', async () => {
      const { svc } = buildService();
      const res: any = await svc.submitDocument(documentRequest(), 't1');

      expect(res.success).toBe(true);
      expect(res.evkNo).toBeUndefined();
      expect(res.data.simulated).toBe(true);
      expect(res.data.dispatched).toBe(false);
      expect(res.data.providerAccepted).toBe(false);
      expect(res.data.legalEffectConfirmed).toBe(false);
      expect(res.data.stubReference).toEqual(expect.stringMatching(/^DOC-\d+$/));
      assertNoForbiddenClaim(res.data.message);
    });

    it('submitCriminalComplaint: simulated/dispatched/providerAccepted/legalEffectConfirmed + stubReference + evkNo yok', async () => {
      const { svc } = buildService();
      const res: any = await svc.submitCriminalComplaint(criminalRequest(), 't1');

      expect(res.success).toBe(true);
      expect(res.evkNo).toBeUndefined();
      expect(res.data.simulated).toBe(true);
      expect(res.data.dispatched).toBe(false);
      expect(res.data.providerAccepted).toBe(false);
      expect(res.data.legalEffectConfirmed).toBe(false);
      expect(res.data.stubReference).toEqual(expect.stringMatching(/^CEZA-\d+$/));
      assertNoForbiddenClaim(res.data.message);
    });

    it('submitCivilLawsuit: simulated/dispatched/providerAccepted/legalEffectConfirmed + stubReference + evkNo yok', async () => {
      const { svc } = buildService();
      const res: any = await svc.submitCivilLawsuit(civilRequest(), 't1');

      expect(res.success).toBe(true);
      expect(res.evkNo).toBeUndefined();
      expect(res.data.simulated).toBe(true);
      expect(res.data.dispatched).toBe(false);
      expect(res.data.providerAccepted).toBe(false);
      expect(res.data.legalEffectConfirmed).toBe(false);
      expect(res.data.stubReference).toEqual(expect.stringMatching(/^HUKUK-\d+$/));
      assertNoForbiddenClaim(res.data.message);
    });
  });

  describe('kalıcı (persisted) lifecycle/audit truthfulness', () => {
    it('submitCriminalComplaint: caseLifecycle description koşulsuz "UYAP\'a gönderildi" İÇERMEZ + simulation marker taşır', async () => {
      const { svc, prisma } = buildService();
      const res: any = await svc.submitCriminalComplaint(criminalRequest(), 't1');

      const call = prisma.caseLifecycle.create.mock.calls[0][0].data;
      assertNoForbiddenClaim(call.description);
      expect(call.action).toBe('CRIMINAL_COMPLAINT_SUBMITTED'); // taxonomy DEĞİŞMEDİ
      expect(call.metadata.simulated).toBe(true);
      expect(call.metadata.dispatched).toBe(false);
      expect(call.metadata.providerAccepted).toBe(false);
      expect(call.metadata.legalEffectConfirmed).toBe(false);
      expect(call.metadata.evkNo).toBeUndefined();
      expect(call.metadata.stubReference).toBe(res.data.stubReference);
    });

    it('submitCivilLawsuit: caseLifecycle description koşulsuz "UYAP\'a gönderildi" İÇERMEZ + simulation marker taşır', async () => {
      const { svc, prisma } = buildService();
      const res: any = await svc.submitCivilLawsuit(civilRequest(), 't1');

      const call = prisma.caseLifecycle.create.mock.calls[0][0].data;
      assertNoForbiddenClaim(call.description);
      expect(call.action).toBe('CIVIL_LAWSUIT_SUBMITTED'); // taxonomy DEĞİŞMEDİ
      expect(call.metadata.simulated).toBe(true);
      expect(call.metadata.dispatched).toBe(false);
      expect(call.metadata.providerAccepted).toBe(false);
      expect(call.metadata.legalEffectConfirmed).toBe(false);
      expect(call.metadata.evkNo).toBeUndefined();
      expect(call.metadata.stubReference).toBe(res.data.stubReference);
    });

    it('pushHacizRequest: auditLog description yerel simülasyon/dispatched-olmadığını açıkça belirtir', async () => {
      const { svc, prisma } = buildService({ casePolicyEngine: buildCpeAllow() });
      await svc.pushHacizRequest(hacizRequest({ tenantId: 't1' }), 't1');

      const audit = prisma.auditLog.create.mock.calls[0][0].data;
      assertNoForbiddenClaim(audit.description);
      expect(audit.description).toMatch(/simülasyon/i);
      expect(audit.description).toMatch(/gerçek UYAP gönderimi yapılmadı/i);
      expect(audit.action).toBe('HACIZ_REQUEST_SUBMITTED'); // taxonomy DEĞİŞMEDİ
      expect(audit.metadata.simulated).toBe(true);
      expect(audit.metadata.dispatched).toBe(false);
      expect(audit.metadata.providerAccepted).toBe(false);
      expect(audit.metadata.legalEffectConfirmed).toBe(false);
    });
  });

  describe('static guard — yasaklı ifadeler ve top-level evkNo yokluğu', () => {
    it('hiçbir stub-success mesajı "UYAP\'a gönderildi" / "kuyruğuna alındı" / "başarıyla gönderildi" içermez', async () => {
      const { svc } = buildService({ casePolicyEngine: buildCpeAllow() });

      const results: any[] = await Promise.all([
        svc.sendPaymentOrder(paymentRequest(), 't1'),
        svc.pushHacizRequest(hacizRequest(), 't1'),
        svc.submitDocument(documentRequest(), 't1'),
        svc.submitCriminalComplaint(criminalRequest(), 't1'),
        svc.submitCivilLawsuit(civilRequest(), 't1'),
      ]);

      for (const r of results) {
        assertNoForbiddenClaim(r.data.message);
        expect(r.evkNo).toBeUndefined();
        expect(r.data.stubReference).toEqual(expect.stringMatching(/^(EVK|HCZ|DOC|CEZA|HUKUK)-\d+$/));
      }
    });
  });
});
