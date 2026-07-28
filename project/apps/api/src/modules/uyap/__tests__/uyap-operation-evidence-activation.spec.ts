import { BadRequestException } from '@nestjs/common';
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
 * P05C-P04 — UyapService activation davranışı (DB'siz): flag-OFF parity, fail-closed,
 * actorUserId provenance, UYAP_QUERY exclusion.
 */

function makeCpeAllowed() {
  return {
    canPerformAction: jest.fn(async () => ({
      allowed: true,
      decisionId: 'dec-1',
      traceId: 'trace-1',
      warnings: [],
    })),
  };
}

/**
 * UYAP-AUTHORITY-FRESHNESS-TX-I01: evidence flag ON iken `UyapService` artık Phase 1
 * authority snapshot'ı ÜRETMEK ZORUNDADIR (CPE "allowed" sonucu TX-1 authority'si değildir).
 * Bu dosyanın konusu AKTİVASYON/SIRALAMA olduğu için buraya "her zaman başarılı" bir
 * snapshot servisi stub'ı verilir; tazelik davranışı kendi spec'inde test edilir
 * (`uyap-authority-freshness-tx.spec.ts`).
 */
function makeSnapshotService() {
  return {
    build: jest.fn(async () => ({
      ok: true,
      snapshot: { snapshotVersion: 'UYAP-AUTHORITY-SNAPSHOT/v1', authorityDigest: 'f'.repeat(64) },
    })),
  };
}

function makeService(opts: {
  orchestrator?: any;
  snapshots?: any;
} = {}) {
  const prisma = {
    case: { findFirst: buildAuthorizedCaseFindFirst() },
    uyapRequestLog: { create: jest.fn(async () => ({ id: 'req-1' })), update: jest.fn() },
  };
  const poa = buildAuthorizedPoaService();
  const validationGate = {};
  const errorReporter = { report: jest.fn() };
  const cpe = makeCpeAllowed();
  const snapshots = opts.snapshots ?? makeSnapshotService();
  const svc = new UyapService(
    prisma as any,
    poa as any,
    validationGate as any,
    errorReporter as any,
    cpe as any,
    opts.orchestrator,
    snapshots as any,
  );
  // logRequest/logResponse/auditHacizDecision özel metotlarını no-op'la (transport stub).
  jest.spyOn(svc as any, 'logRequest').mockResolvedValue('req-1');
  jest.spyOn(svc as any, 'logResponse').mockResolvedValue(undefined);
  jest.spyOn(svc as any, 'auditHacizDecision').mockResolvedValue(undefined);
  jest.spyOn(svc as any, 'validatePowerOfAttorney').mockResolvedValue({ isValid: true });
  return { svc, cpe, snapshots, logRequestSpy: (svc as any).logRequest as jest.Mock };
}

const PAYMENT = { caseId: 'c1', creditor: {}, debtor: {}, amount: 100, tenantId: 't1' } as any;
const HACIZ = { caseId: 'c1', targetType: 'BANK', targetDetails: {}, amount: 100, tenantId: 't1', skipPoaCheck: true } as any;

describe('P05C-P04 — flag OFF / orchestrator yok → legacy parity', () => {
  it('sendPaymentOrder: orchestrator YOK → evidence yazılmaz, logRequest çağrılır (header gereksiz)', async () => {
    const { svc, logRequestSpy } = makeService(); // orchestrator undefined
    await svc.sendPaymentOrder(PAYMENT, 't1'); // actorUserId/header YOK
    expect(logRequestSpy).toHaveBeenCalled(); // legacy akış devam etti
  });

  it('pushHacizRequest: orchestrator YOK → legacy parity', async () => {
    const { svc, logRequestSpy } = makeService();
    await svc.pushHacizRequest(HACIZ, 't1');
    expect(logRequestSpy).toHaveBeenCalled();
  });

  it('orchestrator VAR ama isEnabled=false → evidence yazılmaz, header gereksiz', async () => {
    const orchestrator = { isEnabled: jest.fn(() => false), recordEvidence: jest.fn() };
    const { svc, logRequestSpy } = makeService({ orchestrator });
    await svc.sendPaymentOrder(PAYMENT, 't1'); // header YOK ama flag OFF → sorun yok
    expect(orchestrator.recordEvidence).not.toHaveBeenCalled();
    expect(logRequestSpy).toHaveBeenCalled();
  });
});

describe('P05C-P04 — flag ON: fail-closed + evidence', () => {
  it('enabled + Idempotency-Key YOK → fail-closed (dispatch/logRequest başlamaz)', async () => {
    const orchestrator = { isEnabled: jest.fn(() => true), recordEvidence: jest.fn() };
    const { svc, logRequestSpy } = makeService({ orchestrator });
    await expect(svc.sendPaymentOrder(PAYMENT, 't1', 'user-1' /* header YOK */)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(orchestrator.recordEvidence).not.toHaveBeenCalled();
    expect(logRequestSpy).not.toHaveBeenCalled(); // dispatch başlamadı
  });

  it('enabled + header VAR → recordEvidence çağrılır, SONRA logRequest', async () => {
    const orchestrator = { isEnabled: jest.fn(() => true), recordEvidence: jest.fn(async () => ({})) };
    const { svc, logRequestSpy } = makeService({ orchestrator });
    await svc.sendPaymentOrder(PAYMENT, 't1', 'user-1', 'stable-token-123');
    expect(orchestrator.recordEvidence).toHaveBeenCalledTimes(1);
    const evCmd = orchestrator.recordEvidence.mock.calls[0][0];
    expect(evCmd.action).toBe('UYAP_SEND');
    expect(evCmd.actorUserId).toBe('user-1'); // server-authoritative (body lawyerId DEĞİL)
    expect(evCmd.cpeDecisionLogId).toBe('dec-1');
    // sıra: evidence önce, logRequest sonra
    const evOrder = orchestrator.recordEvidence.mock.invocationCallOrder[0];
    const logOrder = logRequestSpy.mock.invocationCallOrder[0];
    expect(evOrder).toBeLessThan(logOrder);
  });

  it('enabled + TX-1 failure → fail-closed, logRequest başlamaz', async () => {
    const orchestrator = {
      isEnabled: jest.fn(() => true),
      recordEvidence: jest.fn(async () => {
        throw new Error('TX-1 boom');
      }),
    };
    const { svc, logRequestSpy } = makeService({ orchestrator });
    await expect(svc.sendPaymentOrder(PAYMENT, 't1', 'user-1', 'stable-token-123')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(logRequestSpy).not.toHaveBeenCalled(); // dispatch başlamadı
  });

  it('pushHacizRequest: enabled + header → TRIGGER_HACIZ evidence, actorUserId server-authoritative', async () => {
    const orchestrator = { isEnabled: jest.fn(() => true), recordEvidence: jest.fn(async () => ({})) };
    const { svc } = makeService({ orchestrator });
    // body.lawyerId client-controlled; actorUserId AYRI (server) geçirilir
    await svc.pushHacizRequest({ ...HACIZ, lawyerId: 'client-lawyer-X' }, 't1', 'authenticated-user-1', 'token-abc-123');
    const evCmd = orchestrator.recordEvidence.mock.calls[0][0];
    expect(evCmd.action).toBe('TRIGGER_HACIZ');
    expect(evCmd.actorUserId).toBe('authenticated-user-1'); // client lawyerId DEĞİL
  });
});
