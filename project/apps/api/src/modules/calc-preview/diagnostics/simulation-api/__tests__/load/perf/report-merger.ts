/**
 * ReportMerger — Task 20.3
 *
 * MatrixReport[] → tek CompositePerfReport birleştirmesi.
 *
 * Merge algoritması (deterministik):
 *   1. groupByRunKey → runKey'leri lexical sort
 *   2. En büyük grup seçilir (eşitlikte ilk runKey)
 *   3. Diğer gruplar → warning
 *   4. Grup içinde: sort by (matrixId ASC, completedAt ASC)
 *   5. Slot boşsa set, doluysa overwrite (last-write-wins)
 *   6. Overwritten → duplicates[]
 *   7. overheadDelta: M0+M1 varsa computeOverheadDelta()
 *   8. capacityEnvelope: M0+M1 varsa doğrudan taşı
 *
 * @see .kiro/specs/perf-characterization/design.md — Task 20.3
 */

import {
  MatrixReport,
  MatrixId,
  OverheadDelta,
} from './perf-report.types';
import {
  CompositePerfReport,
  CompositeDiagnostics,
  M4DiagnosticsData,
  MatrixIndexEntry,
  DuplicateRecord,
  buildIndexEntry,
  compareMatrixId,
  computeOverheadDelta,
} from './composite-report.types';
import { ReportCollector } from './report-collector';

// ============================================================================
// MergerResult
// ============================================================================

export interface MergerResult {
  report: CompositePerfReport;
  warnings: string[];
}

// ============================================================================
// ReportMerger
// ============================================================================

export class ReportMerger {
  private collector = new ReportCollector();

  /**
   * Birden fazla MatrixReport'u tek CompositePerfReport'a birleştir.
   *
   * @param reports - Collector'dan gelen geçerli raporlar
   * @param collectorWarnings - Collector'dan gelen uyarılar (passthrough)
   */
  merge(reports: MatrixReport[], collectorWarnings: string[] = []): MergerResult {
    const warnings: string[] = [...collectorWarnings];

    // --- Boş input ---
    if (reports.length === 0) {
      warnings.push('[merger] no reports to merge');
      return {
        report: this.createEmptyComposite(warnings),
        warnings,
      };
    }

    // --- 1. Group by runKey ---
    const groups = this.collector.groupByRunKey(reports);

    // --- 2. En büyük grubu seç (lexical sort tie-break) ---
    const { selectedRunKey, selectedReports } = this.selectLargestGroup(
      groups,
      warnings,
    );

    // --- 3. Deterministik sıralama: matrixId ASC, completedAt ASC ---
    const sorted = [...selectedReports].sort((a, b) => {
      const matrixCmp = compareMatrixId(a.matrixId, b.matrixId);
      if (matrixCmp !== 0) return matrixCmp;
      return a.completedAt.localeCompare(b.completedAt);
    });

    // --- 4. Duplicate resolution: last-write-wins ---
    const slots = new Map<MatrixId, MatrixReport>();
    const duplicates: DuplicateRecord[] = [];

    for (const report of sorted) {
      const existing = slots.get(report.matrixId);
      if (!existing) {
        slots.set(report.matrixId, report);
      } else {
        // Last-write-wins: sorted by completedAt ASC → incoming is newer
        duplicates.push({
          matrixId: report.matrixId,
          runKey: selectedRunKey,
          keptRunId: report.metadata.runId,
          keptCompletedAt: report.completedAt,
          droppedRunId: existing.metadata.runId,
          droppedCompletedAt: existing.completedAt,
          reason: 'latest-wins',
        });
        slots.set(report.matrixId, report);
      }
    }

    // --- 5. Canonical sıralama (M0→M5) ---
    const matrices = Array.from(slots.values()).sort((a, b) =>
      compareMatrixId(a.matrixId, b.matrixId),
    );

    // --- 6. Index üret ---
    const index: MatrixIndexEntry[] = matrices.map((r) =>
      buildIndexEntry(r, selectedRunKey),
    );

    // --- 7. overheadDelta: M0+M1 varsa compute ---
    const m0 = slots.get('M0');
    const m1 = slots.get('M1');
    let overheadDelta: OverheadDelta | null = null;
    if (m0 && m1) {
      overheadDelta = computeOverheadDelta(m0, m1);
    }

    // --- 8. capacityEnvelope: M0+M1 varsa taşı ---
    let capacityEnvelope: CompositePerfReport['capacityEnvelope'] = null;
    if (m0?.sweep && m1?.sweep) {
      capacityEnvelope = {
        phase7Off: m0.sweep.capacityEnvelope,
        phase7On: m1.sweep.capacityEnvelope,
      };
    }

    // --- 9. Metadata ---
    const firstReport = matrices[0];
    const metadata: CompositePerfReport['metadata'] = {
      schemaVersion: '2.0.0',
      compositeRunKey: selectedRunKey,
      generatedAt: new Date().toISOString(),
      gitSha: firstReport?.metadata.gitSha ?? '',
      environmentSnapshotHash:
        firstReport?.metadata.environmentSnapshotHash ?? '',
    };

    // --- 10. Duplicate warnings ---
    for (const dup of duplicates) {
      warnings.push(
        `[merger-duplicate] matrixId=${dup.matrixId} runKey=${dup.runKey} kept=${dup.keptRunId} dropped=${dup.droppedRunId} reason=${dup.reason}`,
      );
    }

    // --- 11. Diagnostics extraction (M4 warnings JSON → typed) ---
    const { diagnostics, normalizationsApplied } =
      this.extractDiagnostics(slots, warnings);

    const report: CompositePerfReport = {
      metadata,
      index,
      matrices,
      overheadDelta,
      capacityEnvelope,
      duplicates,
      diagnostics,
      normalizationsApplied,
      warnings,
    };

    return { report, warnings };
  }

  // ==========================================================================
  // Private helpers
  // ==========================================================================

  /**
   * En büyük grubu seç. Eşitlikte lexical olarak ilk runKey kazanır.
   * Diğer gruplar warning'e yazılır.
   */
  private selectLargestGroup(
    groups: Map<string, MatrixReport[]>,
    warnings: string[],
  ): { selectedRunKey: string; selectedReports: MatrixReport[] } {
    const sortedKeys = Array.from(groups.keys()).sort();

    let selectedRunKey = sortedKeys[0];
    let maxCount = groups.get(selectedRunKey)!.length;

    for (const key of sortedKeys) {
      const count = groups.get(key)!.length;
      if (count > maxCount) {
        maxCount = count;
        selectedRunKey = key;
      }
    }

    // Diğer grupları warning'e yaz
    for (const key of sortedKeys) {
      if (key !== selectedRunKey) {
        warnings.push(
          `[merger-multirun-skip] runKey=${key} count=${groups.get(key)!.length} selected=${selectedRunKey}`,
        );
      }
    }

    return {
      selectedRunKey,
      selectedReports: groups.get(selectedRunKey)!,
    };
  }

  /**
   * M4 warnings[]'den JSON diagnostics'i extract et.
   *
   * Kural:
   *   - warnings içinde 'm4Diagnostics' key'li JSON varsa parse et
   *   - Parse ok → diagnostics.m4'e taşı, warnings'den çıkar
   *   - Parse fail → dokunma (string kalsın)
   *   - Birden fazla JSON varsa en sonuncuyu al
   */
  private extractDiagnostics(
    slots: Map<MatrixId, MatrixReport>,
    warnings: string[],
  ): { diagnostics: CompositeDiagnostics; normalizationsApplied: string[] } {
    const diagnostics: CompositeDiagnostics = { m4: null, m5: null };
    const normalizationsApplied: string[] = [];

    const m4 = slots.get('M4');
    if (!m4) return { diagnostics, normalizationsApplied };

    // M4 warnings'den m4Diagnostics JSON'larını bul
    const diagIndices: number[] = [];
    const diagParsed: M4DiagnosticsData[] = [];

    for (let i = 0; i < m4.warnings.length; i++) {
      const w = m4.warnings[i];
      if (!w.includes('m4Diagnostics')) continue;

      try {
        const parsed = JSON.parse(w);
        if (parsed.m4Diagnostics) {
          diagIndices.push(i);
          diagParsed.push(parsed.m4Diagnostics as M4DiagnosticsData);
        }
      } catch {
        // Parse fail → dokunma
        warnings.push(
          `[merger-diag-parse-fail] matrixId=M4 warningIndex=${i}`,
        );
      }
    }

    if (diagParsed.length === 0) return { diagnostics, normalizationsApplied };

    // En sonuncuyu al (birden fazla varsa)
    diagnostics.m4 = diagParsed[diagParsed.length - 1];

    // warnings'den çıkar (ters sırada — index kayması önlenir)
    const indicesToRemove = new Set(diagIndices);
    m4.warnings = m4.warnings.filter((_, i) => !indicesToRemove.has(i));

    normalizationsApplied.push('m4-warnings-json-moved-to-diagnostics');

    return { diagnostics, normalizationsApplied };
  }

  /**
   * Boş composite rapor oluştur (input yoksa).
   */
  private createEmptyComposite(warnings: string[]): CompositePerfReport {
    return {
      metadata: {
        schemaVersion: '2.0.0',
        compositeRunKey: '',
        generatedAt: new Date().toISOString(),
        gitSha: '',
        environmentSnapshotHash: '',
      },
      index: [],
      matrices: [],
      overheadDelta: null,
      capacityEnvelope: null,
      duplicates: [],
      diagnostics: { m4: null, m5: null },
      normalizationsApplied: [],
      warnings,
    };
  }
}
