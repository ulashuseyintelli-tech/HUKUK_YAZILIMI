/**
 * Phase 5.2 - Regression Runner
 * 
 * Golden scenario'ları çalıştırır ve sonuçları karşılaştırır
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  GoldenScenario,
  RegressionRunnerConfig,
  RegressionRunResult,
  ComparisonResult,
  DiffSeverity,
  ResultBaseline,
  TraceBaseline,
} from './regression.types';
import { CalcPreviewResponse } from '../../types';
import { TraceBundle } from '../../trace';
import { compareResults } from './compare/compare-result';
import { compareTraces } from './compare/compare-trace';
import { getMaxSeverity } from './compare/diff-classifier';
import { reportToConsole } from './reporters/console-reporter';
import { generateJUnitXml } from './reporters/junit-reporter';

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: RegressionRunnerConfig = {
  scenariosDir: './regression/scenarios',
  baselinesDir: './regression/baselines',
  allowlistsDir: './regression/allowlists',
  apiBaseUrl: 'http://localhost:3001',
  concurrency: 1,
  timeoutMs: 30000,
  failOnSeverity: 'MAJOR',
  updateBaselines: false,
  forceTrace: true,
};

// ============================================================================
// RUNNER
// ============================================================================

export class RegressionRunner {
  private config: RegressionRunnerConfig;
  
  constructor(config: Partial<RegressionRunnerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  /**
   * Tüm senaryoları çalıştır
   */
  async runAll(): Promise<RegressionRunResult> {
    const startTime = Date.now();
    
    // Load scenarios
    const scenarios = this.loadScenarios();
    
    if (scenarios.length === 0) {
      console.warn('No scenarios found!');
      return this.emptyResult(startTime);
    }
    
    console.log(`Running ${scenarios.length} regression scenarios...`);
    
    // Run scenarios
    const results: ComparisonResult[] = [];
    
    for (const scenario of scenarios) {
      try {
        const result = await this.runScenario(scenario);
        results.push(result);
      } catch (error) {
        console.error(`Error running scenario ${scenario.id}:`, error);
        results.push(this.errorResult(scenario, error as Error));
      }
    }
    
    // Build result
    const runResult = this.buildRunResult(results, startTime);
    
    // Report
    reportToConsole(runResult);
    
    // Write JUnit XML
    this.writeJUnitReport(runResult);
    
    // Write JSON report
    this.writeJsonReport(runResult);
    
    return runResult;
  }
  
  /**
   * Tek senaryo çalıştır
   */
  async runScenario(scenario: GoldenScenario): Promise<ComparisonResult> {
    const startTime = Date.now();
    
    console.log(`  Running: ${scenario.id} - ${scenario.name}`);
    
    // Call API
    const { result, trace } = await this.callPreviewApi(scenario);
    
    // Load baselines
    const resultBaseline = this.loadResultBaseline(scenario.id);
    const traceBaseline = this.loadTraceBaseline(scenario.id);
    
    // Compare results
    const resultComparison = resultBaseline
      ? compareResults(resultBaseline.result, result, scenario)
      : { diffs: [], assertionFailures: [], passed: true };
    
    // Compare traces
    const traceComparison = trace
      ? compareTraces(traceBaseline?.trace as TraceBundle | null, trace, scenario)
      : { diffs: [], assertionFailures: [], passed: true };
    
    // Merge results
    const allDiffs = [...resultComparison.diffs, ...traceComparison.diffs];
    const allFailures = [...resultComparison.assertionFailures, ...traceComparison.assertionFailures];
    const severity = getMaxSeverity(allDiffs);
    const passed = resultComparison.passed && traceComparison.passed;
    
    // Update baselines if requested
    if (this.config.updateBaselines) {
      this.updateBaselines(scenario.id, result, trace);
    }
    
    return {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      passed,
      severity,
      diffs: allDiffs,
      resultDiffs: resultComparison.diffs,
      traceDiffs: traceComparison.diffs,
      assertionFailures: allFailures,
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }
  
  /**
   * Preview API'yi çağır
   */
  private async callPreviewApi(scenario: GoldenScenario): Promise<{
    result: CalcPreviewResponse;
    trace: TraceBundle | null;
  }> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Tenant-Id': scenario.request.tenantId,
      ...scenario.request.headers,
    };
    
    if (this.config.forceTrace) {
      headers['X-Force-Trace'] = 'true';
    }
    
    // Call preview endpoint
    const response = await fetch(`${this.config.apiBaseUrl}/calc/preview/light`, {
      method: 'POST',
      headers,
      body: JSON.stringify(scenario.request.payload),
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    
    const result = await response.json() as CalcPreviewResponse;
    
    // Get trace if available
    let trace: TraceBundle | null = null;
    const traceId = response.headers.get('X-Trace-Id');
    
    if (traceId) {
      try {
        const traceResponse = await fetch(`${this.config.apiBaseUrl}/calc/trace/${traceId}`, {
          headers: { 'X-Tenant-Id': scenario.request.tenantId },
        });
        
        if (traceResponse.ok) {
          trace = await traceResponse.json() as TraceBundle;
        }
      } catch {
        console.warn(`  Could not fetch trace: ${traceId}`);
      }
    }
    
    return { result, trace };
  }
  
  /**
   * Senaryoları yükle
   */
  private loadScenarios(): GoldenScenario[] {
    const scenariosPath = path.resolve(this.config.scenariosDir);
    
    if (!fs.existsSync(scenariosPath)) {
      return [];
    }
    
    const files = fs.readdirSync(scenariosPath)
      .filter(f => f.endsWith('.json'))
      .sort();
    
    return files.map(file => {
      const content = fs.readFileSync(path.join(scenariosPath, file), 'utf-8');
      return JSON.parse(content) as GoldenScenario;
    });
  }
  
  /**
   * Result baseline yükle
   */
  private loadResultBaseline(scenarioId: string): ResultBaseline | null {
    const baselinePath = path.resolve(
      this.config.baselinesDir,
      `${scenarioId}.expected.json`
    );
    
    if (!fs.existsSync(baselinePath)) {
      return null;
    }
    
    const content = fs.readFileSync(baselinePath, 'utf-8');
    return JSON.parse(content) as ResultBaseline;
  }
  
  /**
   * Trace baseline yükle
   */
  private loadTraceBaseline(scenarioId: string): TraceBaseline | null {
    const baselinePath = path.resolve(
      this.config.baselinesDir,
      `${scenarioId}.trace.expected.json`
    );
    
    if (!fs.existsSync(baselinePath)) {
      return null;
    }
    
    const content = fs.readFileSync(baselinePath, 'utf-8');
    return JSON.parse(content) as TraceBaseline;
  }
  
  /**
   * Baseline'ları güncelle
   */
  private updateBaselines(
    scenarioId: string,
    result: CalcPreviewResponse,
    trace: TraceBundle | null,
  ): void {
    const baselinesPath = path.resolve(this.config.baselinesDir);
    
    if (!fs.existsSync(baselinesPath)) {
      fs.mkdirSync(baselinesPath, { recursive: true });
    }
    
    // Result baseline
    const resultBaseline: ResultBaseline = {
      scenarioId,
      generatedAt: new Date().toISOString(),
      generatedBy: process.env.USER || 'unknown',
      result,
    };
    
    fs.writeFileSync(
      path.join(baselinesPath, `${scenarioId}.expected.json`),
      JSON.stringify(resultBaseline, null, 2),
    );
    
    // Trace baseline
    if (trace) {
      const traceBaseline: TraceBaseline = {
        scenarioId,
        generatedAt: new Date().toISOString(),
        generatedBy: process.env.USER || 'unknown',
        trace,
      };
      
      fs.writeFileSync(
        path.join(baselinesPath, `${scenarioId}.trace.expected.json`),
        JSON.stringify(traceBaseline, null, 2),
      );
    }
    
    console.log(`  Updated baselines for ${scenarioId}`);
  }
  
  /**
   * Run result oluştur
   */
  private buildRunResult(results: ComparisonResult[], startTime: number): RegressionRunResult {
    const bySeverity: Record<DiffSeverity, number> = {
      NOISE: 0,
      MINOR: 0,
      MAJOR: 0,
      CRITICAL: 0,
    };
    
    let passed = 0;
    let failed = 0;
    
    for (const result of results) {
      bySeverity[result.severity]++;
      
      if (result.passed) {
        passed++;
      } else {
        failed++;
      }
    }
    
    return {
      totalScenarios: results.length,
      passed,
      failed,
      skipped: 0,
      bySeverity,
      results,
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }
  
  /**
   * Boş sonuç
   */
  private emptyResult(startTime: number): RegressionRunResult {
    return {
      totalScenarios: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      bySeverity: { NOISE: 0, MINOR: 0, MAJOR: 0, CRITICAL: 0 },
      results: [],
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }
  
  /**
   * Hata sonucu
   */
  private errorResult(scenario: GoldenScenario, error: Error): ComparisonResult {
    return {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      passed: false,
      severity: 'CRITICAL',
      diffs: [],
      resultDiffs: [],
      traceDiffs: [],
      assertionFailures: [{
        type: 'must',
        path: 'execution',
        expected: 'success',
        actual: error.message,
        message: `Execution error: ${error.message}`,
      }],
      durationMs: 0,
      timestamp: new Date().toISOString(),
    };
  }
  
  /**
   * JUnit raporu yaz
   */
  private writeJUnitReport(result: RegressionRunResult): void {
    const xml = generateJUnitXml(result);
    const outputPath = path.resolve('./artifacts/regression-junit.xml');
    
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(outputPath, xml);
    console.log(`JUnit report written to: ${outputPath}`);
  }
  
  /**
   * JSON raporu yaz
   */
  private writeJsonReport(result: RegressionRunResult): void {
    const outputPath = path.resolve('./artifacts/regression-report.json');
    
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.log(`JSON report written to: ${outputPath}`);
  }
}

// ============================================================================
// CLI ENTRY POINT
// ============================================================================

export async function runRegressionTests(args: string[] = []): Promise<void> {
  const config: Partial<RegressionRunnerConfig> = {};
  
  // Parse args
  for (const arg of args) {
    if (arg === '--update-baselines') {
      config.updateBaselines = true;
    } else if (arg.startsWith('--api-url=')) {
      config.apiBaseUrl = arg.split('=')[1];
    } else if (arg.startsWith('--fail-on=')) {
      config.failOnSeverity = arg.split('=')[1] as DiffSeverity;
    }
  }
  
  const runner = new RegressionRunner(config);
  const result = await runner.runAll();
  
  // Exit with error if failed
  if (result.failed > 0) {
    process.exit(1);
  }
}
