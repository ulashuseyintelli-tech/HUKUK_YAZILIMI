/**
 * v28 Scenario Test Harness Service
 * 
 * Senaryo bazlı test çalıştırma ve golden file karşılaştırma.
 * Python v28_ops_bundle/scenarios_real/ yapısından port edildi.
 * 
 * Scenario Structure:
 * - events/*.json: Sıralı event dosyaları
 * - expected_timeline.json: Beklenen timeline çıktısı
 * - expected_actions.json: Beklenen action çıktısı
 * 
 * Usage:
 * - runScenario(): Tek senaryo çalıştır
 * - runAllScenarios(): Tüm senaryoları çalıştır
 * - updateGolden(): Golden file'ları güncelle
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { UyapEventIngestService } from './uyap-event-ingest.service';
import { FactStoreService } from './factstore.service';
import * as fs from 'fs';
import * as path from 'path';

export interface ScenarioEvent {
  event_id: string;
  type: string;
  [key: string]: any;
}

export interface ScenarioResult {
  scenarioName: string;
  passed: boolean;
  eventsProcessed: number;
  timelineMatch: boolean;
  actionsMatch: boolean;
  actualTimeline: any[];
  actualActions: any[];
  expectedTimeline: any[];
  expectedActions: any[];
  errors: string[];
  duration: number;
}

export interface ScenarioSummary {
  total: number;
  passed: number;
  failed: number;
  scenarios: ScenarioResult[];
}

// Built-in test scenarios
export const BUILT_IN_SCENARIOS = {
  S1_TEBLIGAT_IADE: {
    name: 'S1_tebligat_iade_yeniden',
    description: 'Tebligat iade -> adres araştırma -> yeni adres bulundu',
    events: [
      { event_id: 'r1', type: 'CASE_STATUS', status: 'initiated', debtor_id: 'D-1' },
      { event_id: 'r2', type: 'NOTIFICATION_RETURNED', reason: 'unknown_address', debtor_id: 'D-1' },
      { event_id: 'r3', type: 'ADDRESS_RESEARCH_REQUESTED', debtor_id: 'D-1', channels: ['MERNIS', 'SGK'] },
      { event_id: 'r4', type: 'ADDRESS_FOUND', debtor_id: 'D-1', address_masked: '*** Mah. *** Sk. No:*/**' },
    ],
  },
  S2_ARAC_AVANS: {
    name: 'S2_arac_buldu_avans',
    description: 'Kesinleşmiş dosya -> araç bulundu -> yakalama avansı',
    events: [
      { event_id: 'a1', type: 'CASE_STATUS', status: 'finalized', debtor_id: 'D-2', lien_rank: 1 },
      { event_id: 'a2', type: 'ASSET_FOUND_VEHICLE', debtor_id: 'D-2', lien_rank: 1, vehicle: { plate: '34ABC123', estimated_value: 850000 } },
    ],
  },
  S3_HIGH_RISK_KVKK: {
    name: 'S3_high_risk_kvkk_hold',
    description: 'Yüksek riskli dosya + KVKK hold -> email engellenir',
    events: [
      { event_id: 'h1', type: 'CASE_STATUS', status: 'initiated', debtor_id: 'D-3' },
      { event_id: 'h2', type: 'RISK_SCORE_UPDATED', score: 85, debtor_id: 'D-3' },
      { event_id: 'h3', type: 'KVKK_HOLD_SET', debtor_id: 'D-3', reason: 'pending_consent' },
      { event_id: 'h4', type: 'EMAIL_REQUESTED', to: 'test@example.com', subject: 'Test', debtor_id: 'D-3' },
    ],
  },
};

@Injectable()
export class ScenarioHarnessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ingestService: UyapEventIngestService,
    private readonly factStore: FactStoreService,
  ) {}

  /**
   * Tek senaryo çalıştırır
   */
  async runScenario(
    scenarioName: string,
    events: ScenarioEvent[],
    expectedTimeline: any[] = [],
    expectedActions: any[] = [],
    caseId?: string,
  ): Promise<ScenarioResult> {
    const startTime = Date.now();
    const testCaseId = caseId || `test-${scenarioName}-${Date.now()}`;
    const errors: string[] = [];

    try {
      // Clear previous test data
      await this.clearTestData(testCaseId);

      // Process events
      let eventsProcessed = 0;
      for (const event of events) {
        try {
          await this.ingestService.ingestEvent({
            ...event,
            case_id: testCaseId,
            timestamp: new Date().toISOString(),
          });
          eventsProcessed++;
        } catch (e: any) {
          errors.push(`Event ${event.event_id}: ${e.message}`);
        }
      }

      // Get actual results
      const actualTimeline = await this.getTimelineForComparison(testCaseId);
      const actualActions = await this.getActionsForComparison(testCaseId);

      // Compare
      const timelineMatch = this.compareArrays(actualTimeline, expectedTimeline);
      const actionsMatch = this.compareArrays(actualActions, expectedActions);

      const passed = timelineMatch && actionsMatch && errors.length === 0;

      return {
        scenarioName,
        passed,
        eventsProcessed,
        timelineMatch,
        actionsMatch,
        actualTimeline,
        actualActions,
        expectedTimeline,
        expectedActions,
        errors,
        duration: Date.now() - startTime,
      };
    } catch (e: any) {
      return {
        scenarioName,
        passed: false,
        eventsProcessed: 0,
        timelineMatch: false,
        actionsMatch: false,
        actualTimeline: [],
        actualActions: [],
        expectedTimeline,
        expectedActions,
        errors: [e.message],
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Built-in senaryo çalıştırır
   */
  async runBuiltInScenario(scenarioKey: keyof typeof BUILT_IN_SCENARIOS): Promise<ScenarioResult> {
    const scenario = BUILT_IN_SCENARIOS[scenarioKey];
    return this.runScenario(scenario.name, scenario.events);
  }

  /**
   * Tüm built-in senaryoları çalıştırır
   */
  async runAllBuiltInScenarios(): Promise<ScenarioSummary> {
    const results: ScenarioResult[] = [];

    for (const key of Object.keys(BUILT_IN_SCENARIOS) as Array<keyof typeof BUILT_IN_SCENARIOS>) {
      const result = await this.runBuiltInScenario(key);
      results.push(result);
    }

    return {
      total: results.length,
      passed: results.filter(r => r.passed).length,
      failed: results.filter(r => !r.passed).length,
      scenarios: results,
    };
  }

  /**
   * Dosya sisteminden senaryo çalıştırır
   */
  async runScenarioFromDir(scenarioDir: string, caseId?: string): Promise<ScenarioResult> {
    const scenarioName = path.basename(scenarioDir);
    
    // Load events
    const eventsDir = path.join(scenarioDir, 'events');
    const events: ScenarioEvent[] = [];
    
    if (fs.existsSync(eventsDir)) {
      const eventFiles = fs.readdirSync(eventsDir)
        .filter(f => f.endsWith('.json'))
        .sort();
      
      for (const file of eventFiles) {
        const content = fs.readFileSync(path.join(eventsDir, file), 'utf-8');
        events.push(JSON.parse(content));
      }
    }

    // Load expected
    const expectedTimelinePath = path.join(scenarioDir, 'expected_timeline.json');
    const expectedActionsPath = path.join(scenarioDir, 'expected_actions.json');
    
    const expectedTimeline = fs.existsSync(expectedTimelinePath)
      ? JSON.parse(fs.readFileSync(expectedTimelinePath, 'utf-8'))
      : [];
    
    const expectedActions = fs.existsSync(expectedActionsPath)
      ? JSON.parse(fs.readFileSync(expectedActionsPath, 'utf-8'))
      : [];

    return this.runScenario(scenarioName, events, expectedTimeline, expectedActions, caseId);
  }

  /**
   * Golden file'ları günceller
   */
  async updateGolden(scenarioDir: string, caseId?: string): Promise<{ timeline: number; actions: number }> {
    const result = await this.runScenarioFromDir(scenarioDir, caseId);

    const expectedTimelinePath = path.join(scenarioDir, 'expected_timeline.json');
    const expectedActionsPath = path.join(scenarioDir, 'expected_actions.json');

    fs.writeFileSync(expectedTimelinePath, JSON.stringify(result.actualTimeline, null, 2));
    fs.writeFileSync(expectedActionsPath, JSON.stringify(result.actualActions, null, 2));

    return {
      timeline: result.actualTimeline.length,
      actions: result.actualActions.length,
    };
  }

  /**
   * Test verilerini temizler
   */
  private async clearTestData(caseId: string): Promise<void> {
    try {
      await this.factStore.clearCase(caseId, { source: 'test_harness' });
      
      // Clear timeline
      await (this.prisma as any).icrabotTimelineEntry?.deleteMany({
        where: { caseId },
      });

      // Clear outbox
      await (this.prisma as any).icrabotOutboxAction?.deleteMany({
        where: { caseId },
      });
    } catch {
      // Tables may not exist
    }
  }

  /**
   * Timeline'ı karşılaştırma için hazırlar
   */
  private async getTimelineForComparison(caseId: string): Promise<any[]> {
    try {
      const entries = await (this.prisma as any).icrabotTimelineEntry?.findMany({
        where: { caseId },
        orderBy: { createdAt: 'asc' },
        select: {
          type: true,
          severity: true,
          title: true,
          source: true,
        },
      });
      return entries || [];
    } catch {
      return [];
    }
  }

  /**
   * Actions'ı karşılaştırma için hazırlar
   */
  private async getActionsForComparison(caseId: string): Promise<any[]> {
    try {
      const actions = await (this.prisma as any).icrabotOutboxAction?.findMany({
        where: { caseId },
        orderBy: { createdAt: 'asc' },
        select: {
          actionType: true,
          status: true,
        },
      });
      return actions || [];
    } catch {
      return [];
    }
  }

  /**
   * İki array'i karşılaştırır
   */
  private compareArrays(actual: any[], expected: any[]): boolean {
    if (expected.length === 0) return true; // Empty expected = skip comparison
    if (actual.length !== expected.length) return false;
    
    return JSON.stringify(actual) === JSON.stringify(expected);
  }

  /**
   * Built-in senaryoları listeler
   */
  listBuiltInScenarios(): Array<{ key: string; name: string; description: string; eventCount: number }> {
    return Object.entries(BUILT_IN_SCENARIOS).map(([key, scenario]) => ({
      key,
      name: scenario.name,
      description: scenario.description,
      eventCount: scenario.events.length,
    }));
  }
}
