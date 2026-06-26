// P3-1b — ConfirmationTokenService testleri (issue/verify/consume; mock Config + Audit).
import { ConfigService } from '@nestjs/config';
import {
  ConfirmationTokenService,
  ConfirmTokenBinding,
} from '../guided-edge/confirmation-token.service';
import { stableJsonHash } from '../guided-edge/canonical-json';
import { AuditService } from '../../audit/audit.service';
import { ActionCode } from '../../policy-engine/types/action-code.enum';

const T0 = 1_700_000_000_000; // sabit referans zaman (Date.now'a bağımlılık yok)

function makeService(
  configMap: Record<string, string | undefined> = {
    GUIDED_OPEN_CONFIRM_TOKEN_SECRET: 'unit-test-secret',
  },
  auditOverrides: Partial<Record<'log' | 'hasPriorConfirmTokenConsumption', jest.Mock>> = {},
) {
  const config = { get: jest.fn((k: string) => configMap[k]) } as unknown as ConfigService;
  const audit = {
    log: auditOverrides.log ?? jest.fn().mockResolvedValue(undefined),
    hasPriorConfirmTokenConsumption:
      auditOverrides.hasPriorConfirmTokenConsumption ?? jest.fn().mockResolvedValue(false),
  } as unknown as AuditService;
  const svc = new ConfirmationTokenService(config, audit);
  return { svc, config, audit: audit as unknown as { log: jest.Mock; hasPriorConfirmTokenConsumption: jest.Mock } };
}

function binding(over: Partial<ConfirmTokenBinding> = {}): ConfirmTokenBinding {
  return {
    tenantId: 't1',
    actorUserId: 'u1',
    actionCode: ActionCode.CHANGE_STATUS,
    surface: '/case-status/:caseId/change',
    targetRef: 'c1',
    payloadHash: stableJsonHash({ status: 'CLOSED', reason: 'x' }),
    ...over,
  };
}

describe('ConfirmationTokenService (P3-1b substrate)', () => {
  it('[4] issue token, expiresAt, bindingHash, nonce ve auditRef döner', async () => {
    const { svc } = makeService();
    const out = await svc.issue(binding(), { atMs: T0 });
    expect(out.token).toMatch(/^go\.confirm\.v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(out.expiresAt).toBe(new Date(T0 + 300_000).toISOString()); // default TTL 300s
    expect(out.bindingHash).toMatch(/^[0-9a-f]{64}$/);
    expect(out.nonce).toMatch(/^[0-9a-f]{32}$/);
    expect(out.auditRef).toBe(out.nonce);
  });

  it('round-trip: issue → verify VALID → consume CONSUMED', async () => {
    const { svc, audit } = makeService();
    const b = binding();
    const { token } = await svc.issue(b, { atMs: T0 });
    expect(svc.verify(token, b, { atMs: T0 + 1000 }).result).toBe('VALID');
    const c = await svc.consume(token, b, { atMs: T0 + 1000 });
    expect(c).toMatchObject({ ok: true, result: 'CONSUMED' });
    expect(audit.hasPriorConfirmTokenConsumption).toHaveBeenCalledTimes(1);
  });

  // [5]-[10] + [12]-[16]: her bağlama alanı token'a girer; farklı bağlam → MISMATCH
  const fields: Array<[keyof ConfirmTokenBinding, string]> = [
    ['tenantId', 't_other'],
    ['actorUserId', 'u_other'],
    ['actionCode', ActionCode.EDIT_PARTIES],
    ['surface', '/other/surface'],
    ['targetRef', 'c_other'],
    ['payloadHash', stableJsonHash({ status: 'ACTIVE' })],
  ];
  it.each(fields)('[5-16] token %s alanına bağlıdır → yanlış değer MISMATCH', async (field, wrong) => {
    const { svc } = makeService();
    const b = binding();
    const { token } = await svc.issue(b, { atMs: T0 });
    const wrongCtx = binding({ [field]: wrong } as Partial<ConfirmTokenBinding>);
    const r = svc.verify(token, wrongCtx, { atMs: T0 + 1000 });
    expect(r.result).toBe('MISMATCH');
    // ayrıca: imzalı payload gerçekten doğru değeri taşıyor (binds)
    expect((r.payload as unknown as Record<string, unknown>)[field as string]).toBe(b[field]);
  });

  it('[11] kurcalanmış payload doğrulamayı geçemez (FORGED)', async () => {
    const { svc } = makeService();
    const b = binding();
    const { token } = await svc.issue(b, { atMs: T0 });
    // payloadB64 segmentinin ilk karakterini değiştir → imza tutmaz
    const parts = token.split('.'); // [go, confirm, v1, payloadB64, sig]
    const ch = parts[3][0] === 'A' ? 'B' : 'A';
    parts[3] = ch + parts[3].slice(1);
    const tampered = parts.join('.');
    expect(svc.verify(tampered, b, { atMs: T0 + 1000 }).result).toBe('FORGED');
  });

  it('[17] süresi geçmiş token EXPIRED', async () => {
    const { svc } = makeService();
    const b = binding();
    const { token } = await svc.issue(b, { atMs: T0 });
    expect(svc.verify(token, b, { atMs: T0 + 300_000 }).result).toBe('EXPIRED'); // tam TTL sınırı
    expect(svc.verify(token, b, { atMs: T0 + 300_001 }).result).toBe('EXPIRED');
  });

  it('[18] biçimsiz token FORGED', () => {
    const { svc } = makeService();
    const b = binding();
    for (const bad of ['', 'not-a-token', 'go.confirm.v1.onlyone', 'go.confirm.v2.aa.bb', 'a.b.c.d.e']) {
      expect(svc.verify(bad, b, { atMs: T0 }).result).toBe('FORGED');
    }
  });

  it('TTL env (GUIDED_OPEN_CONFIRM_TOKEN_TTL_SECONDS) ile yapılandırılır', async () => {
    const { svc } = makeService({
      GUIDED_OPEN_CONFIRM_TOKEN_SECRET: 'unit-test-secret',
      GUIDED_OPEN_CONFIRM_TOKEN_TTL_SECONDS: '60',
    });
    const out = await svc.issue(binding(), { atMs: T0 });
    expect(out.expiresAt).toBe(new Date(T0 + 60_000).toISOString());
  });

  it('secret yoksa JWT_SECRET geri-düşüşü kullanılır', async () => {
    const { svc } = makeService({ JWT_SECRET: 'jwt-fallback' });
    const b = binding();
    const { token } = await svc.issue(b, { atMs: T0 });
    expect(svc.verify(token, b, { atMs: T0 + 1 }).result).toBe('VALID');
  });

  it('[20] issue audit metadata ham token/body İÇERMEZ', async () => {
    const log = jest.fn().mockResolvedValue(undefined);
    const { svc } = makeService(undefined, { log });
    const b = binding();
    const out = await svc.issue(b, { atMs: T0, decisionSource: 'CONFIRM_REQUIRED', outcome: 'CONFIRM_REQUIRED' });
    const call = log.mock.calls.find((c) => c[0].action === 'CONFIRM_TOKEN_ISSUED')![0];
    expect(call.entityType).toBe('GUIDED_OPEN_CONFIRM');
    expect(call.entityId).toBe(b.targetRef);
    expect(call.userId).toBe(b.actorUserId);
    expect(call.metadata).toMatchObject({
      nonce: out.nonce,
      actionCode: b.actionCode,
      surface: b.surface,
      targetRef: b.targetRef,
      payloadHash: b.payloadHash,
      outcome: 'CONFIRM_REQUIRED',
      decisionSource: 'CONFIRM_REQUIRED',
    });
    const serialized = JSON.stringify(call);
    expect(serialized).not.toContain(out.token); // ham token yazılmaz
    expect(call.metadata).not.toHaveProperty('token');
    expect(call.metadata).not.toHaveProperty('body');
    expect(call.metadata).not.toHaveProperty('status'); // ham request alanı yazılmaz
  });

  it('[21] consume audit GERÇEK aktör/tenant + result yazar', async () => {
    const log = jest.fn().mockResolvedValue(undefined);
    const { svc } = makeService(undefined, { log });
    const b = binding();
    const { token } = await svc.issue(b, { atMs: T0 });
    await svc.consume(token, b, { atMs: T0 + 1000 });
    const call = log.mock.calls.find((c) => c[0].action === 'CONFIRM_TOKEN_CONSUMED')![0];
    expect(call.userId).toBe(b.actorUserId); // truthful, asla system/unknown
    expect(call.tenantId).toBe(b.tenantId);
    expect(call.entityId).toBe(b.targetRef);
    expect(call.metadata.result).toBe('CONSUMED');
    expect(JSON.stringify(call)).not.toContain(token);
  });

  it('[21] başarısız consume (MISMATCH) yine gerçek aktörle audit yazar', async () => {
    const log = jest.fn().mockResolvedValue(undefined);
    const { svc } = makeService(undefined, { log });
    const b = binding();
    const { token } = await svc.issue(b, { atMs: T0 });
    const wrongCtx = binding({ tenantId: 't_other' });
    const r = await svc.consume(token, wrongCtx, { atMs: T0 + 1000 });
    expect(r).toMatchObject({ ok: false, result: 'MISMATCH' });
    const call = log.mock.calls.find((c) => c[0].action === 'CONFIRM_TOKEN_CONSUMED')![0];
    expect(call.userId).toBe(wrongCtx.actorUserId);
    expect(call.metadata.result).toBe('MISMATCH');
  });

  it('[22] replay tespiti çalışır (önceki CONSUMED → REPLAY)', async () => {
    const hasPrior = jest.fn().mockResolvedValue(true);
    const log = jest.fn().mockResolvedValue(undefined);
    const { svc } = makeService(undefined, { log, hasPriorConfirmTokenConsumption: hasPrior });
    const b = binding();
    const { token } = await svc.issue(b, { atMs: T0 });
    const r = await svc.consume(token, b, { atMs: T0 + 1000 });
    expect(r).toMatchObject({ ok: false, result: 'REPLAY' });
    const call = log.mock.calls.find((c) => c[0].metadata?.result === 'REPLAY')![0];
    expect(call.action).toBe('CONFIRM_TOKEN_CONSUMED');
  });

  it('[23] secret yoksa issue/verify THROW eder ve audit YAZILMAZ (hata izole/contained)', async () => {
    const log = jest.fn().mockResolvedValue(undefined);
    const { svc } = makeService({}, { log }); // hiçbir secret yok
    await expect(svc.issue(binding(), { atMs: T0 })).rejects.toThrow(/secret yapılandırılmamış/);
    expect(() => svc.verify('go.confirm.v1.a.b', binding(), { atMs: T0 })).toThrow(
      /secret yapılandırılmamış/,
    );
    expect(log).not.toHaveBeenCalled(); // hiçbir yan etki yok
  });
});
