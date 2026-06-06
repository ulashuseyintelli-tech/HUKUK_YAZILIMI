/**
 * v28 UYAP Event Ingest Service
 * 
 * UYAP'tan gelen event'leri normalize edip engine'e besleyen servis.
 * Python v28_uyap_ingestion_demo/uyap_ingest_v28/views.py'den port edildi.
 * 
 * Flow:
 * 1. UYAP event gelir
 * 2. Timeline'a raw event kaydedilir
 * 3. Event normalize edilir → facts/flags
 * 4. FactStore'a yazılır
 * 5. Engine rules çalıştırılır
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { FactStoreService } from './factstore.service';
import { TimelineService } from './timeline.service';
import { EngineRunnerService, RuleDefinition, RunResult } from './engine-runner.service';
import { RuleLoaderService } from './rule-loader.service';

export interface UyapEvent {
  event_id: string;
  case_id: string;
  type: string;
  timestamp?: string;
  [key: string]: any;
}

export interface IngestResult {
  caseId: string;
  eventId: string;
  factsWritten: number;
  flagsWritten: number;
  rulesMatched: RunResult[];
}

@Injectable()
export class UyapEventIngestService {
  private readonly logger = new Logger(UyapEventIngestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly factStore: FactStoreService,
    private readonly timeline: TimelineService,
    private readonly engineRunner: EngineRunnerService,
    private readonly ruleLoader: RuleLoaderService,
  ) {}

  /**
   * UYAP event'ini işler
   */
  async ingestEvent(event: UyapEvent): Promise<IngestResult> {
    const { case_id: caseId, event_id: eventId, type } = event;

    if (!caseId) {
      throw new Error('case_id is required');
    }

    this.logger.log(`Ingesting UYAP event: ${type} for case ${caseId}`);

    // Boundary resolution (spec-15 §1): UYAP event'i tenantId taşımıyor (case_id ile gelir).
    // tenantId'yi caseId'den BİR KEZ çöz, pipeline boyunca explicit taşı (per-insert lookup yerine).
    const caseRow = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: { tenantId: true },
    });
    const tenantId = caseRow?.tenantId;

    // 1. Timeline: raw UYAP event
    await this.timeline.addEntry({
      caseId,
      tenantId,
      type: 'UYAP_EVENT',
      title: `UYAP event: ${type}`,
      severity: 'info',
      body: event,
      source: 'uyap',
    });

    // 2. Normalize event → facts/flags
    const { facts, flags } = this.normalizeEvent(event);

    // 3. Write to FactStore
    await this.factStore.write(caseId, facts, flags, {
      source: 'uyap_ingest',
      eventId,
    });

    await this.timeline.addEntry({
      caseId,
      tenantId,
      type: 'FACT_WRITE',
      title: 'Facts normalized from UYAP event',
      severity: 'info',
      body: { facts, flags },
      source: 'system',
    });

    // 4. Load and run rules (tenantId threaded into the engine-runner main path)
    const rules = await this.ruleLoader.getActiveRules();
    const { matched } = await this.engineRunner.runRulesForEvent(caseId, event, rules, tenantId);

    return {
      caseId,
      eventId,
      factsWritten: Object.keys(facts).length,
      flagsWritten: Object.keys(flags).length,
      rulesMatched: matched,
    };
  }

  /**
   * UYAP event'ini fact/flag'lere normalize eder
   */
  private normalizeEvent(event: UyapEvent): { facts: Record<string, any>; flags: Record<string, boolean> } {
    const facts: Record<string, any> = {};
    const flags: Record<string, boolean> = {};
    const type = event.type;

    // Common identifiers
    if (event.case_id) facts['case.id'] = event.case_id;
    if (event.debtor_id) facts['debtor.id'] = event.debtor_id;
    if (event.lien_rank !== undefined) facts['lien.rank'] = event.lien_rank;

    // Event type specific normalization
    switch (type) {
      case 'ASSET_FOUND_VEHICLE':
        facts['assets.vehicle.found'] = true;
        facts['assets.vehicle.plate'] = event.vehicle?.plate;
        facts['assets.vehicle.estimated_value'] = event.vehicle?.estimated_value;
        facts['assets.vehicle.brand'] = event.vehicle?.brand;
        facts['assets.vehicle.model'] = event.vehicle?.model;
        facts['assets.vehicle.year'] = event.vehicle?.year;
        flags['HAS_VEHICLE_ASSET'] = true;
        break;

      case 'ASSET_FOUND_REAL_ESTATE':
        facts['assets.real_estate.found'] = true;
        facts['assets.real_estate.address'] = event.real_estate?.address;
        facts['assets.real_estate.type'] = event.real_estate?.type;
        facts['assets.real_estate.estimated_value'] = event.real_estate?.estimated_value;
        facts['assets.real_estate.sqm'] = event.real_estate?.square_meters;
        flags['HAS_REAL_ESTATE_ASSET'] = true;
        break;

      case 'ASSET_FOUND_BANK_ACCOUNT':
        facts['assets.bank.found'] = true;
        facts['assets.bank.bank_name'] = event.bank?.name;
        facts['assets.bank.balance'] = event.bank?.balance;
        facts['assets.bank.iban'] = event.bank?.iban;
        flags['HAS_BANK_ASSET'] = true;
        break;

      case 'ASSET_FOUND_SALARY':
        facts['assets.salary.found'] = true;
        facts['assets.salary.employer'] = event.salary?.employer;
        facts['assets.salary.amount'] = event.salary?.amount;
        facts['assets.salary.sgk_no'] = event.salary?.sgk_no;
        flags['HAS_SALARY_ASSET'] = true;
        break;

      case 'CASE_STATUS':
        facts['case.status'] = event.status;
        facts['case.status_date'] = event.status_date || new Date().toISOString();
        if (event.status === 'finalized') flags['CASE_FINALIZED'] = true;
        if (event.status === 'closed') flags['CASE_CLOSED'] = true;
        break;

      case 'TEBLIGAT_DELIVERED':
        facts['tebligat.delivered'] = true;
        facts['tebligat.delivery_date'] = event.delivery_date;
        facts['tebligat.delivery_type'] = event.delivery_type;
        facts['tebligat.recipient'] = event.recipient;
        flags['TEBLIGAT_COMPLETED'] = true;
        break;

      case 'TEBLIGAT_FAILED':
        facts['tebligat.failed'] = true;
        facts['tebligat.failure_reason'] = event.failure_reason;
        facts['tebligat.failure_date'] = event.failure_date;
        flags['TEBLIGAT_FAILED'] = true;
        break;

      case 'HACIZ_PLACED':
        facts['haciz.placed'] = true;
        facts['haciz.type'] = event.haciz_type;
        facts['haciz.date'] = event.haciz_date;
        facts['haciz.amount'] = event.amount;
        flags['HACIZ_ACTIVE'] = true;
        break;

      case 'HACIZ_LIFTED':
        facts['haciz.lifted'] = true;
        facts['haciz.lift_date'] = event.lift_date;
        facts['haciz.lift_reason'] = event.lift_reason;
        flags['HACIZ_ACTIVE'] = false;
        break;

      case 'PAYMENT_RECEIVED':
        facts['payment.received'] = true;
        facts['payment.amount'] = event.amount;
        facts['payment.date'] = event.payment_date;
        facts['payment.source'] = event.source;
        // Update total collected
        const prevCollected = facts['payment.total_collected'] || 0;
        facts['payment.total_collected'] = prevCollected + (event.amount || 0);
        break;

      case 'SAFAHAT_UPDATE':
        facts['safahat.last_update'] = event.timestamp;
        facts['safahat.entries'] = event.entries;
        facts['safahat.count'] = event.entries?.length || 0;
        break;

      case 'OBJECTION_FILED':
        facts['objection.filed'] = true;
        facts['objection.date'] = event.objection_date;
        facts['objection.type'] = event.objection_type;
        facts['objection.reason'] = event.reason;
        flags['HAS_OBJECTION'] = true;
        break;

      case 'LAWSUIT_FILED':
        facts['lawsuit.filed'] = true;
        facts['lawsuit.type'] = event.lawsuit_type;
        facts['lawsuit.court'] = event.court;
        facts['lawsuit.case_no'] = event.case_no;
        flags['HAS_RELATED_LAWSUIT'] = true;
        break;

      case 'SALE_SCHEDULED':
        facts['sale.scheduled'] = true;
        facts['sale.date'] = event.sale_date;
        facts['sale.type'] = event.sale_type;
        facts['sale.asset_id'] = event.asset_id;
        facts['sale.starting_price'] = event.starting_price;
        flags['SALE_PENDING'] = true;
        break;

      case 'SALE_COMPLETED':
        facts['sale.completed'] = true;
        facts['sale.completion_date'] = event.completion_date;
        facts['sale.final_price'] = event.final_price;
        facts['sale.buyer'] = event.buyer;
        flags['SALE_PENDING'] = false;
        flags['SALE_COMPLETED'] = true;
        break;

      default:
        // Generic event - store raw data
        facts[`event.${type.toLowerCase()}`] = event;
        this.logger.warn(`Unknown event type: ${type}, stored as generic`);
    }

    return { facts, flags };
  }

  /**
   * Batch event işleme
   */
  async ingestBatch(events: UyapEvent[]): Promise<IngestResult[]> {
    const results: IngestResult[] = [];

    for (const event of events) {
      try {
        const result = await this.ingestEvent(event);
        results.push(result);
      } catch (error: any) {
        this.logger.error(`Failed to ingest event ${event.event_id}: ${error.message}`);
        results.push({
          caseId: event.case_id,
          eventId: event.event_id,
          factsWritten: 0,
          flagsWritten: 0,
          rulesMatched: [],
        });
      }
    }

    return results;
  }
}
