import * as fs from 'fs';
import * as path from 'path';
import { UyapOperationWriterService } from './uyap-operation-writer.service';
import {
  isCanonicalUyapOperationIdempotencyKey,
  newUyapOperationIdempotencyKey,
  rehydrateUyapOperationIdempotencyKey,
  UyapOperationEnvelope,
  UyapOperationIdempotencyKey,
} from './uyap-operation-writer.types';
import {
  uyapOperationAttemptLockKey,
  uyapOperationCreateLockKey,
} from './uyap-operation-writer-lock';
import {
  UyapOperationClaimLostError,
  UyapOperationIdempotencyConflictError,
  UyapOperationNotFoundError,
  UyapOperationWriterValidationError,
} from './uyap-operation-writer.errors';

/**
 * UYAP-OPERATION-ATTEMPT-WRITER-P05B — DB'siz unit + dormancy/boundary static guard.
 */

const ENVELOPE: UyapOperationEnvelope = {
  tenantId: 'tenant-1',
  caseId: 'case-1',
  operationType: 'HACIZ_TALEBI',
  actorUserId: 'user-1',
  actingLawyerId: null,
  representedPartyId: null,
  approverId: null,
  signatureOwnerId: null,
};

function makeTx() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(1),
    uyapOperation: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    uyapAttempt: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  };
}

function makeService(tx: ReturnType<typeof makeTx>) {
  const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
  return new UyapOperationWriterService(prisma as any);
}

describe('UYAP-P05B — idempotency key branded factory', () => {
  it('kanonik "UYAP-OP/v1:<uuid>" biçiminde üretir ve her çağrıda farklıdır', () => {
    const a = newUyapOperationIdempotencyKey();
    const b = newUyapOperationIdempotencyKey();
    expect(a.startsWith('UYAP-OP/v1:')).toBe(true);
    expect(isCanonicalUyapOperationIdempotencyKey(a)).toBe(true);
    expect(a).not.toEqual(b);
  });

  it('PII veya payload hash içermez — yalnız sabit prefix + UUID', () => {
    const key = newUyapOperationIdempotencyKey();
    const suffix = key.slice('UYAP-OP/v1:'.length);
    expect(suffix).toMatch(/^[0-9a-fA-F-]{36}$/);
  });

  it('rehydrate YALNIZ persist edilmiş kanonik satırdan geri kazanır', () => {
    const key = newUyapOperationIdempotencyKey();
    expect(rehydrateUyapOperationIdempotencyKey({ idempotencyKey: key })).toEqual(key);
  });

  it('rehydrate client/keyfi string biçimini REDDEDER (aklama yolu yok)', () => {
    for (const bad of ['client-supplied-123', 'UYAP-OP/v2:' + '0'.repeat(36), '', 'UYAP-OP/v1:not-a-uuid']) {
      expect(() => rehydrateUyapOperationIdempotencyKey({ idempotencyKey: bad })).toThrow(
        UyapOperationWriterValidationError,
      );
    }
  });
});

describe('UYAP-P05B — lock keys saf ve deterministik', () => {
  it('aynı girdi için birebir aynı string (her iki uçta serialize eder)', () => {
    expect(uyapOperationCreateLockKey('t1', 'k1')).toEqual(uyapOperationCreateLockKey('t1', 'k1'));
    expect(uyapOperationAttemptLockKey('t1', 'op1')).toEqual(uyapOperationAttemptLockKey('t1', 'op1'));
  });

  it('create ve attempt scope birbirinden ayrıdır; tenant/kaynak ayrımı korunur', () => {
    expect(uyapOperationCreateLockKey('t1', 'x')).not.toEqual(uyapOperationAttemptLockKey('t1', 'x'));
    expect(uyapOperationCreateLockKey('t1', 'k')).not.toEqual(uyapOperationCreateLockKey('t2', 'k'));
  });
});

describe('UYAP-P05B — createOperationWithFirstAttempt', () => {
  it('yeni kayıtta advisory lock alır, operation + attempt#1 (previousAttemptId NULL) yazar', async () => {
    const tx = makeTx();
    tx.uyapOperation.findUnique.mockResolvedValue(null);
    tx.uyapOperation.create.mockResolvedValue({ id: 'op-1', ...ENVELOPE, version: 1 });
    tx.uyapAttempt.create.mockResolvedValue({ id: 'att-1', attemptNumber: 1 });

    const key = newUyapOperationIdempotencyKey();
    const result = await makeService(tx).createOperationWithFirstAttempt({ idempotencyKey: key, envelope: ENVELOPE });

    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(result.created).toBe(true);
    const attemptData = tx.uyapAttempt.create.mock.calls[0][0].data;
    expect(attemptData.attemptNumber).toBe(1);
    expect(attemptData.previousAttemptId).toBeNull();
  });

  it('aynı key + aynı envelope → IDEMPOTENT_REUSE (yeni yazım YOK)', async () => {
    const tx = makeTx();
    const key = newUyapOperationIdempotencyKey();
    tx.uyapOperation.findUnique.mockResolvedValue({ id: 'op-1', ...ENVELOPE });
    tx.uyapAttempt.findFirst.mockResolvedValue({ id: 'att-1', attemptNumber: 1 });

    const result = await makeService(tx).createOperationWithFirstAttempt({ idempotencyKey: key, envelope: ENVELOPE });

    expect(result.created).toBe(false);
    expect(result.reason).toBe('IDEMPOTENT_REUSE');
    expect(tx.uyapOperation.create).not.toHaveBeenCalled();
    expect(tx.uyapAttempt.create).not.toHaveBeenCalled();
  });

  it('aynı key + FARKLI envelope → IdempotencyConflictError', async () => {
    const tx = makeTx();
    tx.uyapOperation.findUnique.mockResolvedValue({ ...ENVELOPE, id: 'op-1', operationType: 'BASKA_TIP' });

    await expect(
      makeService(tx).createOperationWithFirstAttempt({
        idempotencyKey: newUyapOperationIdempotencyKey(),
        envelope: ENVELOPE,
      }),
    ).rejects.toThrow(UyapOperationIdempotencyConflictError);
  });

  it('envelope 8 alanının HER BİRİ conflict tetikler', async () => {
    const fields: Array<[keyof UyapOperationEnvelope, string]> = [
      ['tenantId', 'other-tenant'],
      ['caseId', 'other-case'],
      ['operationType', 'OTHER'],
      ['actorUserId', 'other-user'],
      ['actingLawyerId', 'lawyer-x'],
      ['representedPartyId', 'client-x'],
      ['approverId', 'approver-x'],
      ['signatureOwnerId', 'signer-x'],
    ];
    for (const [field, value] of fields) {
      const tx = makeTx();
      tx.uyapOperation.findUnique.mockResolvedValue({ id: 'op-1', ...ENVELOPE, [field]: value });
      await expect(
        makeService(tx).createOperationWithFirstAttempt({
          idempotencyKey: newUyapOperationIdempotencyKey(),
          envelope: ENVELOPE,
        }),
      ).rejects.toThrow(UyapOperationIdempotencyConflictError);
    }
  });

  it('client string idempotency key runtime guard ile reddedilir', async () => {
    const tx = makeTx();
    await expect(
      makeService(tx).createOperationWithFirstAttempt({
        idempotencyKey: 'client-supplied' as unknown as UyapOperationIdempotencyKey,
        envelope: ENVELOPE,
      }),
    ).rejects.toThrow(UyapOperationWriterValidationError);
    expect(tx.uyapOperation.create).not.toHaveBeenCalled();
  });

  it('zorunlu envelope alanları doğrulanır', async () => {
    const tx = makeTx();
    for (const patch of [{ tenantId: '' }, { operationType: '  ' }, { actorUserId: '' }]) {
      await expect(
        makeService(tx).createOperationWithFirstAttempt({
          idempotencyKey: newUyapOperationIdempotencyKey(),
          envelope: { ...ENVELOPE, ...patch },
        }),
      ).rejects.toThrow(UyapOperationWriterValidationError);
    }
  });
});

describe('UYAP-P05B — appendRetryAttempt lineage', () => {
  it('max+1 ve previousAttemptId = son attempt (aynı operation)', async () => {
    const tx = makeTx();
    tx.uyapOperation.findFirst.mockResolvedValue({ id: 'op-1', tenantId: 'tenant-1' });
    tx.uyapAttempt.findFirst.mockResolvedValue({ id: 'att-2', attemptNumber: 2 });
    tx.uyapAttempt.create.mockResolvedValue({ id: 'att-3', attemptNumber: 3 });

    const result = await makeService(tx).appendRetryAttempt({ tenantId: 'tenant-1', operationId: 'op-1' });

    expect(tx.$executeRaw).toHaveBeenCalled();
    const data = tx.uyapAttempt.create.mock.calls[0][0].data;
    expect(data.attemptNumber).toBe(3);
    expect(data.previousAttemptId).toBe('att-2');
    expect(result.attemptNumber).toBe(3);
  });

  it('operation yoksa NotFound (tenant-scoped)', async () => {
    const tx = makeTx();
    tx.uyapOperation.findFirst.mockResolvedValue(null);
    await expect(
      makeService(tx).appendRetryAttempt({ tenantId: 'tenant-1', operationId: 'yok' }),
    ).rejects.toThrow(UyapOperationNotFoundError);
  });

  it('retry eligibility DEĞERLENDİRMEZ — state okumaz, karar üretmez', async () => {
    const tx = makeTx();
    tx.uyapOperation.findFirst.mockResolvedValue({ id: 'op-1', tenantId: 'tenant-1', internalState: 'CANCELLED' });
    tx.uyapAttempt.findFirst.mockResolvedValue({ id: 'att-1', attemptNumber: 1 });
    tx.uyapAttempt.create.mockResolvedValue({ id: 'att-2', attemptNumber: 2 });

    // CANCELLED olsa bile append eder: caizlik kararı P-E5D'ye aittir.
    await expect(
      makeService(tx).appendRetryAttempt({ tenantId: 'tenant-1', operationId: 'op-1' }),
    ).resolves.toBeDefined();
  });
});

describe('UYAP-P05B — compareAndBumpVersion', () => {
  it('count===1 → version+1; YALNIZ version yazılır', async () => {
    const tx = makeTx();
    tx.uyapOperation.updateMany.mockResolvedValue({ count: 1 });

    const result = await makeService(tx).compareAndBumpVersion({ id: 'op-1', tenantId: 't1', expectedVersion: 3 });

    expect(result.version).toBe(4);
    const call = tx.uyapOperation.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'op-1', tenantId: 't1', version: 3 });
    expect(Object.keys(call.data)).toEqual(['version']);
    expect(call.data.version).toEqual({ increment: 1 });
  });

  it('count!==1 → ClaimLostError', async () => {
    const tx = makeTx();
    tx.uyapOperation.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      makeService(tx).compareAndBumpVersion({ id: 'op-1', tenantId: 't1', expectedVersion: 3 }),
    ).rejects.toThrow(UyapOperationClaimLostError);
  });

  it('expectedVersion >= 1 tam sayı olmalı', async () => {
    const tx = makeTx();
    for (const bad of [0, -1, 1.5, undefined as any]) {
      await expect(
        makeService(tx).compareAndBumpVersion({ id: 'op-1', tenantId: 't1', expectedVersion: bad }),
      ).rejects.toThrow(UyapOperationWriterValidationError);
    }
  });
});

describe('UYAP-P05B — DORMANCY + BOUNDARY static guard', () => {
  const dir = __dirname;

  /** Guard'ların niyeti "KOD referansı yok" — yorum/doküman metni kod değildir, soyulur. */
  const stripComments = (src: string): string =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  const read = (p: string) => stripComments(fs.readFileSync(p, 'utf8'));
  const serviceSrc = read(path.join(dir, 'uyap-operation-writer.service.ts'));
  const moduleSrc = read(path.resolve(dir, '../uyap.module.ts'));
  const uyapServiceSrc = read(path.resolve(dir, '../uyap.service.ts'));

  it('UyapModule writer’ı KAYDETMEZ (dormant: provider/export yok)', () => {
    expect(moduleSrc).not.toContain('UyapOperationWriterService');
    expect(moduleSrc).not.toContain('operation-writer');
  });

  it('UyapService writer’ı import ETMEZ (injection yok)', () => {
    expect(uyapServiceSrc).not.toContain('operation-writer');
    expect(uyapServiceSrc).not.toContain('UyapOperationWriterService');
  });

  it('writer UyapRequestLog’a HİÇ dokunmaz (dual-write yok)', () => {
    expect(serviceSrc).not.toContain('uyapRequestLog');
    expect(serviceSrc).not.toContain('UyapRequestLog');
  });

  it('writer state mutation YAPMAZ (internalState/provider/legal-effect yazımı yok — P-E5D sınırı)', () => {
    expect(serviceSrc).not.toMatch(/internalState:\s/);
    expect(serviceSrc).not.toMatch(/providerState:\s/);
    expect(serviceSrc).not.toMatch(/legalEffectState:\s/);
  });

  it('writer CPE/controller/DTO yüzeyine bağlanmaz', () => {
    expect(serviceSrc).not.toContain('Controller');
    expect(serviceSrc).not.toContain('CasePolicyEngine');
    expect(serviceSrc).not.toContain('cpeDecisionLog');
    const files = fs.readdirSync(dir);
    expect(files.filter((f) => /\.(controller|dto)\.ts$/.test(f))).toHaveLength(0);
  });

  it('schema/migration dosyası bu birimde YOKTUR', () => {
    const files = fs.readdirSync(dir);
    expect(files.filter((f) => /\.(prisma|sql)$/.test(f))).toHaveLength(0);
  });
});
