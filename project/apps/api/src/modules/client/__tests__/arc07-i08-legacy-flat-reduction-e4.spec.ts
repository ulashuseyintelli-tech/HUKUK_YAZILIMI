/**
 * C2-I08 E4 — I08 executor çekirdeği kanıtı (owner zorunlulukları birebir):
 * A4-parity sınıflandırma · fail-closed plan (YALNIZ_FLAT/FARKLI → apply RED) ·
 * üç kapı + DB hedef guard'ı · idempotent koşullu yazım · audit (alan ADI, PII yok) ·
 * hata → throw (çağıran tx ROLLBACK) · before/after sayaç malzemesi.
 */
import {
  applyI08ReductionForTenant,
  classifyI08Bucket,
  evaluateI08ApplyGuards,
  planI08Reduction,
} from '../arc07-i08-legacy-flat-reduction.core';

const row = (over: Record<string, unknown>) => ({ id: 'c1', tenantId: 't1', ...over } as never);

describe('E4 — classifyI08Bucket (A4 SQL birebir)', () => {
  it('BOS / YALNIZ_FLAT / YALNIZ_RELATIONAL / ESIT / FARKLI', () => {
    expect(classifyI08Bucket(row({}))).toBe('BOS');
    expect(classifyI08Bucket(row({ address: 'Cad 1' }))).toBe('YALNIZ_FLAT');
    expect(classifyI08Bucket(row({ primaryCurrent: { street: 'S', city: 'X', district: 'Y' } }))).toBe('YALNIZ_RELATIONAL');
    expect(
      classifyI08Bucket(row({
        address: 'Uzun Cad 5, Merkez',
        city: ' İzmir ',
        district: 'Konak',
        primaryCurrent: { street: 'Uzun Cad 5', city: 'İzmir', district: ' Konak ' },
      })),
    ).toBe('ESIT');
    expect(
      classifyI08Bucket(row({
        address: 'Başka Cad 9',
        city: 'İzmir',
        district: 'Konak',
        primaryCurrent: { street: 'Uzun Cad 5', city: 'İzmir', district: 'Konak' },
      })),
    ).toBe('FARKLI');
  });
});

describe('E4 — planI08Reduction fail-closed', () => {
  it('conflict (FARKLI/YALNIZ_FLAT) varsa ok=false; ESIT eligible listelenir; sayaçlar tam', () => {
    const plan = planI08Reduction([
      row({ id: 'a' }),
      row({ id: 'b', address: 'X' }),
      row({ id: 'c', address: 'S, M', city: 'C', district: 'D', primaryCurrent: { street: 'S', city: 'C', district: 'D' } }),
    ]);
    expect(plan.ok).toBe(false);
    expect(plan.counters).toEqual({ BOS: 1, YALNIZ_FLAT: 1, YALNIZ_RELATIONAL: 0, ESIT: 1, FARKLI: 0 });
    expect(plan.eligible).toEqual([{ id: 'c', tenantId: 't1' }]);
    expect(plan.conflicts).toEqual([{ id: 'b', tenantId: 't1', bucket: 'YALNIZ_FLAT' }]);
  });

  it('conflict yoksa ok=true (BOS/YALNIZ_RELATIONAL no-op)', () => {
    expect(planI08Reduction([row({}), row({ id: 'r', primaryCurrent: { street: 's' } })]).ok).toBe(true);
  });
});

describe('E4 — evaluateI08ApplyGuards (üç kapı + DB hedefi)', () => {
  const base = { apply: true, allowDbWrite: true, confirmReviewed: true, databaseUrl: 'postgresql://u@localhost:5432/hukuk_db' };
  it('üç kapı + loopback → allowed', () => {
    expect(evaluateI08ApplyGuards(base).allowed).toBe(true);
  });
  it('eksik her kapı ayrı reason üretir; uzak/prod/unknown hedef HARD-STOP', () => {
    expect(evaluateI08ApplyGuards({ ...base, apply: false }).allowed).toBe(false);
    expect(evaluateI08ApplyGuards({ ...base, allowDbWrite: false }).reasons.join()).toContain('DB_WRITE_CONSENT_MISSING');
    expect(evaluateI08ApplyGuards({ ...base, confirmReviewed: false }).allowed).toBe(false);
    expect(evaluateI08ApplyGuards({ ...base, databaseUrl: 'postgresql://u@db.prod.internal/hukuk_db' }).allowed).toBe(false);
    expect(evaluateI08ApplyGuards({ ...base, databaseUrl: 'postgresql://u@10.0.0.5/hukuk_db' }).allowed).toBe(false);
    expect(evaluateI08ApplyGuards({ ...base, databaseUrl: undefined }).allowed).toBe(false);
  });
});

describe('E4 — applyI08ReductionForTenant (injected tx)', () => {
  function buildTx(countPerCall: number[] = []) {
    let call = 0;
    return {
      client: {
        updateMany: jest.fn().mockImplementation(async () => ({ count: countPerCall[call++] ?? 1 })),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
  }

  it('koşullu yazım: yalnız flat taşıyan satır; audit ALAN ADI taşır, ham değer YOK', async () => {
    const tx = buildTx([1]);
    const res = await applyI08ReductionForTenant(tx as never, 't1', ['c1'], 'run-1');
    expect(res).toEqual({ cleared: 1, audited: 1, skipped: [] });
    const upd = (tx.client.updateMany as jest.Mock).mock.calls[0][0];
    expect(upd.where).toMatchObject({ id: 'c1', tenantId: 't1' });
    expect(upd.data).toEqual({ address: null, city: null, district: null, region: null, postalCode: null });
    const audit = (tx.auditLog.create as jest.Mock).mock.calls[0][0].data;
    expect(audit).toMatchObject({
      tenantId: 't1', action: 'CLIENT_FLAT_ADDRESS_REDUCED_I08', entityType: 'CLIENT', entityId: 'c1',
    });
    expect(audit.metadata.clearedFields).toEqual(['address', 'city', 'district', 'region', 'postalCode']);
    expect(JSON.stringify(audit)).not.toContain('Cad');
  });

  it('idempotent: count=0 (yarış/zaten temiz) → skipped, audit ÜRETİLMEZ', async () => {
    const tx = buildTx([0]);
    const res = await applyI08ReductionForTenant(tx as never, 't1', ['c1'], 'run-1');
    expect(res).toEqual({ cleared: 0, audited: 0, skipped: ['c1'] });
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('audit yazım hatası → throw (çağıran $transaction ROLLBACK eder)', async () => {
    const tx = buildTx([1]);
    (tx.auditLog.create as jest.Mock).mockRejectedValue(new Error('audit down'));
    await expect(applyI08ReductionForTenant(tx as never, 't1', ['c1'], 'run-1')).rejects.toThrow('audit down');
  });
});
