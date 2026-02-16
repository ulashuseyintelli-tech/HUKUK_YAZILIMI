/**
 * ReportCollector — Task 20.2
 *
 * Rapor dizinindeki JSON dosyalarını bulur, parse eder, 3 aşamalı filtreden
 * geçirir (parse → schemaVersion → matrixId) ve runKey'e göre gruplar.
 *
 * Duplicate resolution yapmaz — bu Merger'ın (Task 20.3) sorumluluğundadır.
 *
 * Determinism garantileri:
 *   - Glob sonuçları sort() ile sıralanır (OS-agnostic)
 *   - Boş dizin → warning + boş array (throw yok)
 *   - Warning formatı: key=value (makinece parse edilebilir)
 *
 * @see .kiro/specs/perf-characterization/design.md — Task 20.2
 */

import * as fs from 'fs';
import * as path from 'path';
import { MatrixReport } from './perf-report.types';
import { computeRunKey, MATRIX_ORDER } from './composite-report.types';

// ============================================================================
// Valid MatrixId set — tek kaynak: MATRIX_ORDER
// ============================================================================

const VALID_MATRIX_IDS: Set<string> = new Set(Object.keys(MATRIX_ORDER));

// ============================================================================
// Config
// ============================================================================

export interface CollectorConfig {
  /** Rapor dosyalarının bulunduğu dizin */
  reportDir: string;
  /** Glob pattern (default: '*.json') — sadece dosya adı eşleşmesi, recursive değil */
  globPattern?: string;
}

// ============================================================================
// Result
// ============================================================================

export interface CollectorResult {
  /** Parse + filter sonrası geçerli raporlar */
  reports: MatrixReport[];
  /** Collector seviyesinde üretilen uyarılar (key=value format) */
  warnings: string[];
}

// ============================================================================
// ReportCollector
// ============================================================================

export class ReportCollector {
  /**
   * reportDir altındaki JSON dosyalarını bul, parse et, 3 aşamalı filtreden geçir.
   *
   * Filtre sırası (normatif):
   *   1. JSON parse — fail → warning + skip
   *   2. schemaVersion check — eksik/boş → warning + skip
   *   3. matrixId check — yok/whitelist dışı → warning + skip
   */
  collect(config: CollectorConfig): CollectorResult {
    const warnings: string[] = [];
    const reports: MatrixReport[] = [];
    const pattern = config.globPattern ?? '*.json';

    // --- Dizin varlık kontrolü ---
    if (!fs.existsSync(config.reportDir)) {
      warnings.push(
        `[collector] no report files found dir=${config.reportDir}`,
      );
      return { reports, warnings };
    }

    // --- Dosya listesi (deterministic sort) ---
    const files = this.listFiles(config.reportDir, pattern).sort();

    if (files.length === 0) {
      warnings.push(
        `[collector] no report files found dir=${config.reportDir}`,
      );
      return { reports, warnings };
    }

    // --- 3 aşamalı filtre ---
    for (const file of files) {
      const filePath = path.join(config.reportDir, file);

      // Aşama 1: JSON parse
      let raw: unknown;
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        raw = JSON.parse(content);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push(
          `[collector-parse-fail] file=${file} err=${msg}`,
        );
        continue;
      }

      // Aşama 2: schemaVersion check
      const report = raw as Record<string, unknown>;
      const metadata = report.metadata as Record<string, unknown> | undefined;
      const schemaVersion = metadata?.schemaVersion;

      if (
        !metadata ||
        typeof schemaVersion !== 'string' ||
        schemaVersion.trim().length === 0
      ) {
        warnings.push(
          `[collector-schema-skip] file=${file} schema=${String(schemaVersion ?? 'undefined')} expected=non-empty`,
        );
        continue;
      }

      // Aşama 3: matrixId check
      const matrixId = report.matrixId;
      if (
        typeof matrixId !== 'string' ||
        !VALID_MATRIX_IDS.has(matrixId)
      ) {
        warnings.push(
          `[collector-matrixId-skip] file=${file} matrixId=${String(matrixId ?? 'undefined')}`,
        );
        continue;
      }

      // --- Geçerli rapor ---
      const matrixReport = raw as MatrixReport;

      // RunKey fallback warning
      const { fallback } = computeRunKey(matrixReport);
      if (fallback) {
        const { runKey } = computeRunKey(matrixReport);
        warnings.push(
          `[runKey-fallback] matrixId=${matrixId} file=${file} derivedKey=${runKey}`,
        );
      }

      reports.push(matrixReport);
    }

    return { reports, warnings };
  }

  /**
   * Geçerli raporları runKey'e göre grupla.
   * Duplicate resolution yapmaz — aynı runKey + matrixId birden fazla olabilir.
   */
  groupByRunKey(reports: MatrixReport[]): Map<string, MatrixReport[]> {
    const groups = new Map<string, MatrixReport[]>();

    for (const report of reports) {
      const { runKey } = computeRunKey(report);
      const group = groups.get(runKey);
      if (group) {
        group.push(report);
      } else {
        groups.set(runKey, [report]);
      }
    }

    return groups;
  }

  // ==========================================================================
  // Private helpers
  // ==========================================================================

  /**
   * Dizindeki dosyaları listele — basit pattern eşleşmesi (*.json).
   * Recursive değil — sadece birinci seviye.
   */
  private listFiles(dir: string, pattern: string): string[] {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const regex = this.globToRegex(pattern);
      return entries
        .filter((e) => e.isFile() && regex.test(e.name))
        .map((e) => e.name);
    } catch {
      return [];
    }
  }

  /**
   * Basit glob → regex dönüşümü.
   * Sadece '*' ve '?' desteklenir — yeterli (*.json pattern'ı için).
   */
  private globToRegex(pattern: string): RegExp {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${escaped}$`);
  }
}
