import * as fs from 'fs';
import * as path from 'path';
import { UyapCpeDecisionLinkWriterService } from './uyap-cpe-decision-link-writer.service';
import { LinkCpeDecisionCommand } from './uyap-cpe-decision-link-writer.types';
import {
  UyapCpeDecisionLinkConflictError,
  UyapCpeDecisionLinkValidationError,
} from './uyap-cpe-decision-link-writer.errors';

const CMD: LinkCpeDecisionCommand = {
  tenantId: 'tenant-1',
  caseId: 'case-1',
  operationId: 'op-1',
  attemptId: 'att-1',
  cpeDecisionLogId: 'dec-1',
};

function makeTx() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(1),
    uyapAttemptCpeDecisionLink: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };
}

function makeService(tx: ReturnType<typeof makeTx>) {
  const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
  return new UyapCpeDecisionLinkWriterService(prisma as any);
}

describe('UYAP-P05C-P03 — linkAttempt', () => {
  it('yeni kayitta advisory lock alir ve CREATED doner', async () => {
    const tx = makeTx();
    tx.uyapAttemptCpeDecisionLink.findUnique.mockResolvedValue(null);
    tx.uyapAttemptCpeDecisionLink.create.mockResolvedValue({ id: 'l-1', ...CMD });

    const r = await makeService(tx).linkAttempt(CMD);

    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(r.created).toBe(true);
    expect(r.reason).toBe('CREATED');
    const data = tx.uyapAttemptCpeDecisionLink.create.mock.calls[0][0].data;
    expect(data).toEqual(CMD); // yalniz referential alanlar; actor/lawyer YOK
  });

  it('exact ayni iliski zaten bagliysa IDEMPOTENT_REPLAY (yeni yazim YOK)', async () => {
    const tx = makeTx();
    tx.uyapAttemptCpeDecisionLink.findUnique.mockResolvedValue({ id: 'l-1', ...CMD });

    const r = await makeService(tx).linkAttempt(CMD);

    expect(r.created).toBe(false);
    expect(r.reason).toBe('IDEMPOTENT_REPLAY');
    expect(r.link.id).toBe('l-1');
    expect(tx.uyapAttemptCpeDecisionLink.create).not.toHaveBeenCalled();
  });

  it('ayni cpeDecisionLogId farkli iliskiye bagliysa HARD CONFLICT', async () => {
    for (const patch of [
      { tenantId: 'other' },
      { caseId: 'other' },
      { operationId: 'other' },
      { attemptId: 'other' },
    ]) {
      const tx = makeTx();
      tx.uyapAttemptCpeDecisionLink.findUnique.mockResolvedValue({ id: 'l-1', ...CMD, ...patch });
      await expect(makeService(tx).linkAttempt(CMD)).rejects.toThrow(UyapCpeDecisionLinkConflictError);
      expect(tx.uyapAttemptCpeDecisionLink.create).not.toHaveBeenCalled();
    }
  });

  it('zorunlu referential alanlar dogrulanir', async () => {
    const tx = makeTx();
    for (const field of ['tenantId', 'caseId', 'operationId', 'attemptId', 'cpeDecisionLogId'] as const) {
      await expect(
        makeService(tx).linkAttempt({ ...CMD, [field]: '' }),
      ).rejects.toThrow(UyapCpeDecisionLinkValidationError);
    }
    expect(tx.uyapAttemptCpeDecisionLink.create).not.toHaveBeenCalled();
  });
});

describe('UYAP-P05C-P03 — linkWithinTransaction', () => {
  it('caller-tx icinde calisir, nested transaction ACMAZ', async () => {
    const tx = makeTx();
    tx.uyapAttemptCpeDecisionLink.findUnique.mockResolvedValue(null);
    tx.uyapAttemptCpeDecisionLink.create.mockResolvedValue({ id: 'l-1', ...CMD });
    const prisma = { $transaction: jest.fn() };
    const svc = new UyapCpeDecisionLinkWriterService(prisma as any);

    const r = await svc.linkWithinTransaction(tx as any, CMD);

    expect(r.created).toBe(true);
    expect(prisma.$transaction).not.toHaveBeenCalled(); // kendi tx'ini acmaz
  });
});

describe('UYAP-P05C-P03 — DORMANCY + BOUNDARY static guard', () => {
  const dir = __dirname;
  const stripComments = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const service = stripComments(fs.readFileSync(path.join(dir, 'uyap-cpe-decision-link-writer.service.ts'), 'utf8'));
  const types = stripComments(fs.readFileSync(path.join(dir, 'uyap-cpe-decision-link-writer.types.ts'), 'utf8'));
  const moduleSrc = fs.readFileSync(path.resolve(dir, '../uyap.module.ts'), 'utf8');

  it('UyapModule link writer’i KAYDETMEZ (dormant)', () => {
    expect(moduleSrc).not.toContain('UyapCpeDecisionLinkWriterService');
    expect(moduleSrc).not.toContain('cpe-decision-link-writer');
  });

  it('actor/lawyer/signer input ALMAZ (Karar C)', () => {
    for (const forbidden of ['actorUserId', 'actingLawyerId', 'signatureOwnerId', 'approverId', 'lawyerId']) {
      expect(service).not.toContain(forbidden);
      expect(types).not.toContain(forbidden);
    }
  });

  it('schema/migration EKLEMEZ, CPE karar uretmez, state mutation YAPMAZ', () => {
    expect(service).not.toMatch(/internalState|providerState|legalEffectState/);
    expect(service).not.toContain('canPerformAction');
    expect(service).not.toContain('cpeDecisionLog.create');
    const files = fs.readdirSync(dir);
    expect(files.filter((f) => /uyap-cpe-decision-link-writer.*\.(prisma|sql|controller|dto)\.ts$/.test(f))).toHaveLength(0);
  });

  it('composite unique/FK’yi authoritative kabul eder (advisory lock + fail-closed)', () => {
    expect(service).toContain('pg_advisory_xact_lock');
    expect(service).toContain("cpeDecisionLogId");
    // FK/unique ihlalleri typed hataya cevrilir (otomatik duzeltme yok)
    expect(service).toContain('P2002');
    expect(service).toContain('P2003');
  });
});
