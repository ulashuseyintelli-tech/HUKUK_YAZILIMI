/**
 * UyapEventIngest — Boundary Tenant Resolution (spec-15 §1, Writer B)
 *
 * Doğrular: ingestEvent(UYAP) tenantId taşımayan bir event'te (case_id ile gelir)
 *   1) tenantId'yi caseId'den BOUNDARY'de GERÇEK DB lookup ile bir kez çözer,
 *   2) çözülen tenantId'yi HER timeline yazımına propagate eder,
 *   3) tenantId'yi engine-runner main path'ine thread eder.
 *
 * NOT: timeline WRITE'ı stub'lanmıştır — çünkü v28 timeline.service.addEntry, Sprint 1'de
 *   zorunlu kılınan `aggregateVersion`'ı sağlamıyor (spec-15 DIŞI pre-existing sorun).
 *   tenantId'nin DB'ye gerçekten yazıldığı Writer A (domain-event-ingest integration,
 *   real DB) testinde kanıtlı. Bu test sadece boundary-resolution + propagasyonu izole eder.
 *
 * Requires: DATABASE_URL (migration applied). DATABASE_URL yoksa otomatik skip.
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

import { UyapEventIngestService } from '../uyap-event-ingest.service';

const DATABASE_URL = process.env.DATABASE_URL ?? '';
const describeIf = DATABASE_URL ? describe : describe.skip;

describeIf('UyapEventIngest — Boundary Tenant Resolution (spec-15)', () => {
  let prisma: PrismaClient;
  let service: UyapEventIngestService;
  let timelineStub: { addEntry: jest.Mock };
  let engineRunnerStub: { runRulesForEvent: jest.Mock };
  let tenantId: string;
  let caseId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
    await prisma.$connect();

    const tenant = await prisma.tenant.create({
      data: { name: 'Spec15 Test Tenant', slug: `spec15-${randomUUID()}` },
    });
    tenantId = tenant.id;

    const created = await prisma.case.create({
      data: {
        tenantId,
        fileNumber: `SPEC15-${randomUUID()}`,
        type: 'GENERAL_EXECUTION',
      },
    });
    caseId = created.id;

    // prisma GERÇEK (boundary case.findUnique gerçek lookup yapar).
    // timeline + diğer ağır deps stub: boundary-resolution + propagasyonu izole et.
    timelineStub = { addEntry: jest.fn().mockResolvedValue('entry-id') };
    engineRunnerStub = {
      runRulesForEvent: jest.fn().mockResolvedValue({ matched: [], total: 0 }),
    };
    const factStoreStub = { write: jest.fn().mockResolvedValue(undefined) } as any;
    const ruleLoaderStub = { getActiveRules: jest.fn().mockResolvedValue([]) } as any;

    service = new UyapEventIngestService(
      prisma as any,
      factStoreStub,
      timelineStub as any,
      engineRunnerStub as any,
      ruleLoaderStub,
    );
  });

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('resolves tenantId from the real case row and propagates it to every timeline write', async () => {
    timelineStub.addEntry.mockClear();

    await service.ingestEvent({
      event_id: `evt-${randomUUID()}`,
      case_id: caseId,
      type: 'TEST_EVENT',
    } as any);

    // Boundary, GERÇEK case satırından tenantId çözdü; her addEntry çağrısı onu taşımalı.
    expect(timelineStub.addEntry).toHaveBeenCalled();
    for (const call of timelineStub.addEntry.mock.calls) {
      expect(call[0].tenantId).toBe(tenantId);
    }
  });

  it('threads the resolved tenantId into the engine-runner main path', async () => {
    engineRunnerStub.runRulesForEvent.mockClear();

    await service.ingestEvent({
      event_id: `evt-${randomUUID()}`,
      case_id: caseId,
      type: 'TEST_EVENT',
    } as any);

    // Boundary tek sefer çözüp engine-runner'a EXPLICIT geçirmeli (per-insert lookup değil).
    expect(engineRunnerStub.runRulesForEvent).toHaveBeenCalledWith(
      caseId,
      expect.anything(),
      expect.anything(),
      tenantId,
    );
  });
});
