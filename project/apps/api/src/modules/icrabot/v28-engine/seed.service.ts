/**
 * v28 Seed Service
 * 
 * Test verisi oluşturma servisi.
 * Django v28_django_timeline/engine_v28/seed.py'den port edildi.
 * 
 * Usage:
 *   POST /api/icrabot/v28/seed/:caseId
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { TimelineService } from './timeline.service';
import { OutboxService } from './outbox.service';
import { EngineRunService } from './engine-run.service';
import * as crypto from 'crypto';

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly timeline: TimelineService,
    private readonly outbox: OutboxService,
    private readonly engineRun: EngineRunService,
  ) {}

  /**
   * Dosya için örnek timeline verisi oluşturur
   */
  async seedCase(caseId: string): Promise<{
    runId: string;
    timelineEntries: number;
    outboxActions: number;
  }> {
    // outbox-tenancy: seedCase yalnız caseId alır (demo); tenantId boundary'de TEK SEFER çözülür,
    // sonra timeline + outbox yazımlarına explicit thread'lenir (per-insert lookup değil).
    const seedCase_ = await (this.prisma as any).case.findUnique({
      where: { id: caseId },
      select: { tenantId: true },
    });
    const tenantId: string | undefined = seedCase_?.tenantId ?? undefined;

    // 1. Engine Run oluştur
    const snapshotHash = `sha256:${crypto.randomBytes(16).toString('hex')}`;
    const runId = await this.engineRun.startRun({
      caseId,
      ruleId: 'post_asset_discovery',
      triggerEventId: `uyap:evt:${Date.now()}`,
      snapshotHash,
    });

    // 2. UYAP Event - Araç bulundu
    await this.timeline.addEntry({
      caseId,
      tenantId,
      type: 'UYAP_EVENT',
      title: 'Araç bulundu',
      severity: 'info',
      body: { plate: '34ABC123', brand: 'Toyota', model: 'Corolla', year: 2020 },
      source: 'uyap',
    });

    // 3. COMPUTE - Risk & Recovery
    await this.timeline.addEntry({
      caseId,
      tenantId,
      type: 'COMPUTE',
      title: 'Risk & Recovery computed',
      severity: 'info',
      body: {
        compute: {
          risk: { score: 73, band: 'MEDIUM', model: 'risk-v3.2.1' },
          recovery: { expected: 54000, p50: 64000, p90: 12000, eta_days: 110 },
        },
        inputs: {
          lien_rank: 1,
          vehicle_estimate: 850000,
          case_status: 'finalized',
        },
      },
      runId,
      source: 'engine',
    });

    // 4. DECISION - Avans maili
    await this.timeline.addEntry({
      caseId,
      tenantId,
      type: 'DECISION',
      title: 'Avans maili kuyruğa alındı',
      severity: 'warn',
      body: {
        if: 'recovery.p50 >= 50000 AND risk.score < 80',
        because: [
          'Recovery p50=64.000 ≥ 50.000',
          'Risk score=73 < 80',
          'Lien rank=1 (priority)',
        ],
        actions: [
          {
            action_id: `a_${crypto.randomBytes(8).toString('hex')}`,
            type: 'enqueue',
            queue: 'advance_request_email',
          },
        ],
      },
      runId,
      source: 'engine',
    });

    // 5. ACTION - Outbox'a ekle
    const actionId = await this.outbox.createAction({
      caseId,
      tenantId,
      actionType: 'enqueue',
      idempotencyKey: `enqueue:${caseId}:advance_request_email:${Date.now()}`,
      payload: { queue: 'advance_request_email', case_id: caseId },
      runId,
    });

    await this.timeline.addEntry({
      caseId,
      tenantId,
      type: 'ACTION',
      title: 'Action enqueued: advance_request_email',
      severity: 'info',
      body: { action_id: actionId, action_type: 'enqueue', queue: 'advance_request_email' },
      runId,
      source: 'engine',
    });

    // 6. Engine Run'ı başarılı olarak işaretle
    await this.engineRun.markSucceeded(runId, {
      risk: { score: 73, band: 'MEDIUM' },
      recovery: { p50: 64000 },
    });

    this.logger.log(`Seeded case ${caseId} with run ${runId}`);

    return {
      runId,
      timelineEntries: 4,
      outboxActions: actionId ? 1 : 0,
    };
  }

  /**
   * Dosya için örnek UYAP event'leri oluşturur
   */
  async seedUyapEvents(caseId: string, count = 5): Promise<number> {
    // outbox-tenancy: tenantId boundary'de tek sefer çözülür, sonra her timeline yazımına thread.
    const seedCase_ = await (this.prisma as any).case.findUnique({
      where: { id: caseId },
      select: { tenantId: true },
    });
    const tenantId: string | undefined = seedCase_?.tenantId ?? undefined;

    const eventTypes = [
      { type: 'ARAC_BULUNDU', title: 'Araç bulundu', body: { plate: '34XYZ789' } },
      { type: 'TASINMAZ_BULUNDU', title: 'Taşınmaz bulundu', body: { ada: '123', parsel: '45' } },
      { type: 'BANKA_HESABI', title: 'Banka hesabı bulundu', body: { bank: 'Garanti', iban: 'TR...' } },
      { type: 'SGK_KAYDI', title: 'SGK kaydı bulundu', body: { employer: 'ABC Ltd.' } },
      { type: 'MAAS_HACZI', title: 'Maaş haczi uygulandı', body: { amount: 5000 } },
    ];

    for (let i = 0; i < count; i++) {
      const event = eventTypes[i % eventTypes.length];
      await this.timeline.addEntry({
        caseId,
        tenantId,
        type: 'UYAP_EVENT',
        title: event.title,
        severity: 'info',
        body: event.body,
        source: 'uyap',
      });
    }

    return count;
  }
}
