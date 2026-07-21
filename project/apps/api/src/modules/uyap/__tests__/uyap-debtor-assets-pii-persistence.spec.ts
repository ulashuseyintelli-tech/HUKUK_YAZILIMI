import { UyapService } from '../uyap.service';

/**
 * UYAP-EVIDENCE-PII-PERSISTENCE-P01 — CAP-11 `queryDebtorAssets` durable PII containment.
 *
 * Kapsam (yalnız durable persistence sink'i):
 * - `UyapRequestLog.requestData` ve `UyapRequestLog.responseData` içinde ham `debtorIdentityNo`
 *   (veya masked/last-four/reversible fragment) KALMAZ.
 * - Caller'a dönen public/runtime response shape/value DEĞİŞMEZ (masked/kırık değil).
 * - stdout masked log (`maskIdentity`) ve tenant/case davranışı DEĞİŞMEZ.
 * - Başka UYAP capability'lerinin durable log payload'ı DEĞİŞMEZ.
 * - schema/migration DEĞİŞMEZ; historical rows / backfill / delete YOK.
 *
 * Not: keyed digest / HMAC / field-level encryption BU DİLİMDE YOK; yalnız non-sensitive
 * envelope (caseId + identityProvided boolean) durable olarak tutulur.
 */
describe('UYAP-EVIDENCE-PII-PERSISTENCE-P01 — queryDebtorAssets durable PII containment', () => {
  const RAW_IDENTITY = '11111111110'; // sahte 11-hane TCKN benzeri test değeri
  const LAST_FOUR = RAW_IDENTITY.slice(-4); // '1110'
  const CASE_ID = 'case-xyz';
  const TENANT_ID = 'tenant-abc';

  type CapturedCreate = { data: any };
  type CapturedUpdate = { where: any; data: any };

  const buildService = (opts?: { failFirstUpdate?: boolean }) => {
    const createCalls: CapturedCreate[] = [];
    const updateCalls: CapturedUpdate[] = [];
    let idSeq = 0;

    const update = jest.fn(async (arg: CapturedUpdate) => {
      updateCalls.push(arg);
      if (opts?.failFirstUpdate && updateCalls.length === 1) {
        throw new Error('SIMULATED_DB_UPDATE_FAILURE'); // ham identity İÇERMEZ
      }
      return { id: arg.where.id, requestType: 'queryDebtorAssets', retryCount: 0 };
    });

    const prisma: any = {
      uyapRequestLog: {
        create: jest.fn(async (arg: CapturedCreate) => {
          createCalls.push(arg);
          idSeq += 1;
          return { id: `req-${idSeq}` };
        }),
        update,
      },
    };
    const poaService: any = { checkValidPoa: jest.fn() };
    const validationGate: any = {};
    const errorReporter: any = { report: jest.fn() };

    const service = new UyapService(prisma, poaService, validationGate, errorReporter);
    return { service, createCalls, updateCalls, errorReporter };
  };

  const jsonOf = (v: any) => JSON.stringify(v ?? {});

  it('T1 — requestData ham debtorIdentityNo İÇERMEZ (yalnız caseId + identityProvided)', async () => {
    const { service, createCalls } = buildService();
    await service.queryDebtorAssets(RAW_IDENTITY, CASE_ID, TENANT_ID);

    expect(createCalls).toHaveLength(1);
    const requestData = createCalls[0].data.requestData;
    expect(requestData).toEqual({ caseId: CASE_ID, identityProvided: true });
    expect(requestData.debtorIdentityNo).toBeUndefined();
  });

  it('T2 — responseData ham debtorIdentityNo İÇERMEZ (sanitize edilmiş log kopyası)', async () => {
    const { service, updateCalls } = buildService();
    await service.queryDebtorAssets(RAW_IDENTITY, CASE_ID, TENANT_ID);

    expect(updateCalls).toHaveLength(1);
    const responseData = updateCalls[0].data.responseData;
    expect(responseData.data.debtorIdentityNo).toBeUndefined();
    // non-sensitive sonuç özeti korunur (assets/message stub truthfulness)
    expect(responseData.data.message).toContain('STUB');
    expect(responseData.success).toBe(true);
  });

  it('T3 — persist edilen JSON stringify sonucu identity/last-four substring TAŞIMAZ', async () => {
    const { service, createCalls, updateCalls } = buildService();
    await service.queryDebtorAssets(RAW_IDENTITY, CASE_ID, TENANT_ID);

    const persisted = jsonOf(createCalls[0].data.requestData) + jsonOf(updateCalls[0].data.responseData);
    expect(persisted).not.toContain(RAW_IDENTITY);
    expect(persisted).not.toContain(LAST_FOUR);
  });

  it('T4 — masked/last-four fragment durable payload’da YOK', async () => {
    const { service, createCalls, updateCalls } = buildService();
    await service.queryDebtorAssets(RAW_IDENTITY, CASE_ID, TENANT_ID);

    const persisted = jsonOf(createCalls[0].data.requestData) + jsonOf(updateCalls[0].data.responseData);
    // masked biçim (ilk3 + *** + son2) veya son-4 hiçbir reversible fragment bulunmamalı
    expect(persisted).not.toMatch(/\d{3}\*+\d{2}/);
    expect(persisted).not.toContain(RAW_IDENTITY.slice(0, 3));
  });

  it('T5 — caller’a dönen public/runtime response shape/value DEĞİŞMEZ (ham identity döner)', async () => {
    const { service } = buildService();
    const res = await service.queryDebtorAssets(RAW_IDENTITY, CASE_ID, TENANT_ID);

    expect(res.success).toBe(true);
    expect((res.data as any).debtorIdentityNo).toBe(RAW_IDENTITY); // maskelenmez/kırılmaz
    expect((res.data as any).assets).toEqual({
      bankAccounts: [],
      vehicles: [],
      properties: [],
      companies: [],
    });
    expect((res.data as any).message).toContain('STUB');
  });

  it('T6 — tenantId ve caseId durable davranışı DEĞİŞMEZ', async () => {
    const { service, createCalls } = buildService();
    await service.queryDebtorAssets(RAW_IDENTITY, CASE_ID, TENANT_ID);

    expect(createCalls[0].data.tenantId).toBe(TENANT_ID);
    expect(createCalls[0].data.caseId).toBe(CASE_ID);
  });

  it('T7 — identityProvided=false when identity boş (envelope davranışı)', async () => {
    const { service, createCalls } = buildService();
    await service.queryDebtorAssets('', CASE_ID, TENANT_ID);
    expect(createCalls[0].data.requestData).toEqual({ caseId: CASE_ID, identityProvided: false });
  });

  it('T8 — failure path error/audit metadata ham identity TAŞIMAZ', async () => {
    const { service, updateCalls, errorReporter } = buildService({ failFirstUpdate: true });
    const res = await service.queryDebtorAssets(RAW_IDENTITY, CASE_ID, TENANT_ID);

    // catch → errorResponse + ikinci logResponse
    expect(res.success).toBe(false);
    const allUpdateJson = updateCalls.map((u) => jsonOf(u.data)).join('');
    expect(allUpdateJson).not.toContain(RAW_IDENTITY);
    expect(allUpdateJson).not.toContain(LAST_FOUR);
    // ErrorReporter'a giden metadata da ham identity içermemeli
    const reportJson = jsonOf((errorReporter.report as jest.Mock).mock.calls);
    expect(reportJson).not.toContain(RAW_IDENTITY);
  });

  it('T9 — başka UYAP capability (checkMtsStatus) durable log payload’ı DEĞİŞMEZ', async () => {
    const { service, createCalls } = buildService();
    await service.checkMtsStatus('MTS-REF-9', TENANT_ID);
    // checkMtsStatus envelope'u bu görevle değişmedi: mtsReferenceNo hâlâ requestData'da
    expect(createCalls[0].data.requestType).toBe('checkMtsStatus');
    expect(createCalls[0].data.requestData).toEqual({ mtsReferenceNo: 'MTS-REF-9' });
  });

  it('T10 — fail-closed tenant guard korunur (tenantId yoksa ForbiddenException, log yazılmaz)', async () => {
    const { service, createCalls } = buildService();
    await expect(service.queryDebtorAssets(RAW_IDENTITY, CASE_ID, '')).rejects.toThrow(
      'Tenant context required',
    );
    expect(createCalls).toHaveLength(0);
  });
});
