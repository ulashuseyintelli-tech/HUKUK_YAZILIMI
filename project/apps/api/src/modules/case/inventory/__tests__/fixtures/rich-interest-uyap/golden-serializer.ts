import {
  CANONICAL_RICH_INTEREST_CODES,
  type RichInterestUyapFinding,
  type RichInterestUyapInventorySummary,
} from '../../../rich-interest-uyap-readiness.core';
import type { RichInterestFixtureManifestEntry } from './manifest';

export interface FixtureEvidenceRow {
  fixtureId: string;
  executionTier: string;
  richCode: string | null;
  legacyType: string | null;
  integrityClasses: string[];
  uyapReadinessClasses: string[];
  diagnosticReasons: string[];
  mappingBlockers: string[];
  exporter: { numeric: string | null; faizt: string | null; relation: string };
  calculation: { authoritySource: string; authority: string; outcome: string; diagnostics: string[] };
}

function sorted(values: readonly string[]): string[] { return [...new Set(values)].sort(); }

export function evidenceRow(
  entry: RichInterestFixtureManifestEntry,
  finding?: RichInterestUyapFinding,
): FixtureEvidenceRow {
  return {
    fixtureId: entry.fixtureId,
    executionTier: entry.executionTier,
    richCode: entry.claimItemInput.richInterestTypeCode,
    legacyType: entry.claimItemInput.legacyInterestType,
    integrityClasses: sorted(finding?.integrityClasses ?? entry.expectedIntegrityClasses),
    uyapReadinessClasses: sorted(finding?.uyapReadinessClasses ?? entry.expectedUyapReadinessClasses),
    diagnosticReasons: sorted(finding?.diagnosticReasons ?? entry.expectedDiagnosticReasons),
    mappingBlockers: sorted(entry.expectedMappingBlockers),
    exporter: {
      numeric: finding?.numericExporter.outputCode ?? entry.expectedExporterComparison.numeric,
      faizt: finding?.faiztExporter.outputCode ?? entry.expectedExporterComparison.faizt,
      relation: entry.expectedExporterComparison.relation,
    },
    calculation: {
      authoritySource: entry.expectedCalculationAuthoritySource,
      authority: entry.expectedCalculationAuthority,
      outcome: entry.expectedCalculationOutcome,
      diagnostics: sorted(entry.expectedAssemblerDiagnostics),
    },
  };
}

export function serializeDetailedGolden(rows: readonly FixtureEvidenceRow[]): string {
  return [...rows]
    .sort((a, b) => a.fixtureId.localeCompare(b.fixtureId))
    .map((row) => JSON.stringify(row))
    .join('\n') + '\n';
}

export function serializeSummaryGolden(
  inventory: RichInterestUyapInventorySummary,
  rows: readonly FixtureEvidenceRow[],
): string {
  const counts = (selector: (row: FixtureEvidenceRow) => readonly string[]) => {
    const result: Record<string, number> = {};
    for (const value of rows.flatMap((row) => [...selector(row)]).sort()) result[value] = (result[value] ?? 0) + 1;
    return result;
  };
  const richCoverage = Object.fromEntries(CANONICAL_RICH_INTEREST_CODES.map((code) => [
    code,
    rows.filter((row) => row.richCode === code).length,
  ]));
  const summary = {
    fixtureVersion: 'PR-A4-2-v1',
    persistedFixtureCount: rows.filter((row) => row.executionTier === 'PERSISTED_DB').length,
    classifierOnlyFixtureCount: rows.filter((row) => row.executionTier === 'CLASSIFIER_ONLY').length,
    inventoryProcessedRecordCount: inventory.processedRecordCount,
    inventoryPageSize: inventory.pageSize,
    richCodeCoverage: richCoverage,
    integrityCoverage: counts((row) => row.integrityClasses),
    uyapReadinessCoverage: counts((row) => row.uyapReadinessClasses),
    mappingBlockerCoverage: counts((row) => row.mappingBlockers),
    calculationOutcomeCoverage: Object.fromEntries(
      ['BLOCKED', 'BUCKET_CREATED', 'NO_BUCKET'].map((outcome) => [outcome, rows.filter((row) => row.calculation.outcome === outcome).length]),
    ),
    evidenceBoundary: {
      syntheticEvidence: 'AVAILABLE',
      productionEmpiricalEvidence: 'ABSENT',
      exactLegalUyapMapping: 'NOT_DECIDED',
    },
  };
  return JSON.stringify(summary, null, 2) + '\n';
}
