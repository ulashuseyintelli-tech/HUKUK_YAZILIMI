import * as path from 'node:path';
import {
  CANONICAL_RICH_INTEREST_CODES,
  classifyRichInterestUyapReadiness,
  type RichInterestUyapInventoryRow,
} from '../rich-interest-uyap-readiness.core';
import { assembleClaimBuckets } from '../../../interest-engine/assembler/claim-bucket-assembler';
import {
  CLASSIFIER_ONLY_FIXTURES,
  PERSISTED_FIXTURES,
  RICH_INTEREST_FIXTURE_MANIFEST,
  type RichInterestFixtureManifestEntry,
} from './fixtures/rich-interest-uyap/manifest';
import { extractFaiztMapping, extractNumericMapping } from './fixtures/rich-interest-uyap/exporter-parity-ast';

function inventoryRow(entry: RichInterestFixtureManifestEntry): RichInterestUyapInventoryRow {
  const claim = entry.claimItemInput;
  const due = entry.dueProjection;
  return {
    tenantId: 'pra42-fixture-tenant', caseTenantId: 'pra42-fixture-tenant',
    caseId: `${entry.fixtureId}-case`, claimItemId: `${entry.fixtureId}-claim`,
    itemType: claim.itemType, status: claim.status, currency: claim.currency,
    richCode: claim.richInterestTypeCode, legacyType: claim.legacyInterestType,
    interestRate: entry.executionTier === 'CLASSIFIER_ONLY' ? entry.classifierOnlyRate! : claim.interestRate,
    accrualStatus: claim.interestAccrualStatus, interestStartDate: claim.interestStartDate,
    interestEndDate: null, interestStartDateProvenance: claim.interestStartDateProvenance,
    noInterestReasonPresent: Boolean(claim.noInterestAudit?.reason),
    noInterestActorPresent: Boolean(claim.noInterestAudit?.confirmedById),
    noInterestTimePresent: Boolean(claim.noInterestAudit?.confirmedAt),
    caseLegacyType: entry.caseInput.legacyInterestType, linkedDueId: `${entry.fixtureId}-due`,
    dueRichCode: due?.richInterestTypeCode ?? null, dueLegacyType: due?.legacyInterestType ?? null,
    dueInterestStartDate: due?.interestStartDate ?? null,
    depositTermEvidence: claim.depositTermProvenance, maturityPresent: false,
    termDurationPresent: false, rateScheduleSourcePresent: false, legacyUyapCodeProvenance: null,
  };
}

function actualRelation(finding: ReturnType<typeof classifyRichInterestUyapReadiness>): string {
  if (finding.numericExporter.silentFallback || finding.faiztExporter.silentFallback) return 'SILENT_FALLBACK_RISK';
  return finding.exporterComparison === 'BOTH_OMITTED' ? 'MISSING' : finding.exporterComparison;
}

describe('PR-A4-2 canonical fixture manifest', () => {
  it('machine-readable manifest schema, IDs and stable dates are deterministic', () => {
    expect(RICH_INTEREST_FIXTURE_MANIFEST.length).toBeGreaterThanOrEqual(30);
    expect(new Set(RICH_INTEREST_FIXTURE_MANIFEST.map((entry) => entry.fixtureId)).size)
      .toBe(RICH_INTEREST_FIXTURE_MANIFEST.length);
    expect(RICH_INTEREST_FIXTURE_MANIFEST.map((entry) => entry.fixtureId))
      .toEqual([...RICH_INTEREST_FIXTURE_MANIFEST.map((entry) => entry.fixtureId)].sort());
    for (const entry of RICH_INTEREST_FIXTURE_MANIFEST) {
      expect(entry.fixtureId).toMatch(/^pra42-f\d{3}$/);
      for (const date of [entry.caseInput.interestStartDate, entry.claimItemInput.interestStartDate,
        entry.claimItemInput.noInterestAudit?.confirmedAt, entry.dueProjection?.interestStartDate]) {
        if (date) expect(Number.isNaN(Date.parse(date))).toBe(false);
      }
      expect(entry.expectedIntegrityClasses).toEqual([...entry.expectedIntegrityClasses].sort());
      expect(entry.expectedUyapReadinessClasses).toEqual([...entry.expectedUyapReadinessClasses].sort());
      expect(entry.expectedDiagnosticReasons).toEqual([...entry.expectedDiagnosticReasons].sort());
      expect(entry.expectedMappingBlockers).toEqual([...entry.expectedMappingBlockers].sort());
    }
  });

  it('11/11 rich code ve integrity/NO_INTEREST/fixed-variable coverage tamdır', () => {
    const rich = new Set(RICH_INTEREST_FIXTURE_MANIFEST.map((entry) => entry.claimItemInput.richInterestTypeCode).filter(Boolean));
    expect([...rich].sort()).toEqual([...CANONICAL_RICH_INTEREST_CODES].sort());
    const integrity = new Set(RICH_INTEREST_FIXTURE_MANIFEST.flatMap((entry) => entry.expectedIntegrityClasses));
    for (const classification of [
      'RICH_ONLY', 'LEGACY_ONLY', 'RICH_AND_LEGACY_MATCH', 'RICH_AND_LEGACY_DRIFT',
      'NO_CLAIMITEM_INTEREST_AUTHORITY', 'UNSUPPORTED_LEGACY', 'NO_INTEREST_VALID',
      'NO_INTEREST_CONFLICT', 'NO_INTEREST_AUDIT_INCOMPLETE', 'NO_INTEREST_AUTHORITY',
      'FIXED_RATE_VALID', 'FIXED_RATE_MISSING', 'FIXED_RATE_INVALID', 'VARIABLE_RATE_WITH_STRAY_FIXED_RATE',
    ]) expect(integrity.has(classification)).toBe(true);
    expect(CLASSIFIER_ONLY_FIXTURES).toHaveLength(2);
    expect(CLASSIFIER_ONLY_FIXTURES.map((entry) => entry.classifierOnlyRate).every((rate) => !Number.isFinite(rate))).toBe(true);
  });

  it('altı mevduat kodunun her biri SHORT/LONG/AMBIGUOUS kanıt taşır', () => {
    const depositCodes = CANONICAL_RICH_INTEREST_CODES.filter((code) => code.startsWith('MEVDUAT_'));
    for (const code of depositCodes) {
      const terms = RICH_INTEREST_FIXTURE_MANIFEST
        .filter((entry) => entry.claimItemInput.richInterestTypeCode === code)
        .map((entry) => entry.claimItemInput.depositTermProvenance === null ? 'AMBIGUOUS' : entry.claimItemInput.depositTermProvenance);
      expect(new Set(terms)).toEqual(new Set(['SHORT', 'LONG', 'AMBIGUOUS']));
    }
  });

  it('classifier-only NaN/Infinity expected manifest sonucuyla birebir eşleşir', () => {
    for (const entry of CLASSIFIER_ONLY_FIXTURES) {
      const finding = classifyRichInterestUyapReadiness(inventoryRow(entry));
      expect([...finding.integrityClasses].sort()).toEqual(entry.expectedIntegrityClasses);
      expect([...finding.uyapReadinessClasses].sort()).toEqual(entry.expectedUyapReadinessClasses);
      expect(finding.diagnosticReasons).toEqual(entry.expectedDiagnosticReasons);
    }
  });
});

describe('PR-A4-2 calculation authority evidence', () => {
  it.each(RICH_INTEREST_FIXTURE_MANIFEST)('$fixtureId $description', (entry) => {
    const claim = entry.claimItemInput;
    const result = assembleClaimBuckets([{
      id: `${entry.fixtureId}-claim`, itemType: claim.itemType,
      demandedAmount: Number(claim.amount), amount: Number(claim.amount), currency: claim.currency,
      interestType: claim.legacyInterestType,
      interestTypeCode: claim.richInterestTypeCode as never,
      interestRate: entry.executionTier === 'CLASSIFIER_ONLY' ? entry.classifierOnlyRate : claim.interestRate,
      interestStartDate: claim.interestStartDate,
      interestAccrualStatus: claim.interestAccrualStatus,
      interestStartDateProvenance: claim.interestStartDateProvenance,
      status: claim.status,
    }], {
      interestType: entry.caseInput.legacyInterestType,
      interestStartDate: entry.caseInput.interestStartDate,
    });
    const diagnosticCodes = [...new Set(result.diagnostics.map((diagnostic) => diagnostic.code))].sort();
    expect(diagnosticCodes).toEqual(entry.expectedAssemblerDiagnostics);
    if (entry.expectedCalculationOutcome === 'BUCKET_CREATED') {
      expect(result.buckets).toHaveLength(1);
      expect(result.buckets[0].interestType).toBe(entry.expectedCalculationAuthority);
      if (!['COMMERCIAL_FIXED', 'CONTRACTUAL'].includes(String(entry.expectedCalculationAuthority))) {
        expect(result.buckets[0].fixedRate).toBeUndefined();
      }
    } else {
      expect(result.buckets).toHaveLength(0);
    }
    for (const forbidden of entry.forbiddenOutcomes) {
      expect(JSON.stringify(result)).not.toContain(`\"interestType\":\"${forbidden}\"`);
    }
  });
});

describe('PR-A4-2 production exporter AST parity (observation only)', () => {
  const numericPath = path.resolve(__dirname, '../../../uyap/uyap-xml.service.ts');
  const faiztPath = path.resolve(__dirname, '../../../uyap-export/uyap-case-mapper.service.ts');

  it('numeric mapping ve fallback production source ile inventory observation modelinde aynıdır', () => {
    const extracted = extractNumericMapping(numericPath);
    for (const [legacy, output] of Object.entries(extracted.entries)) {
      const entry = PERSISTED_FIXTURES[0];
      const finding = classifyRichInterestUyapReadiness({ ...inventoryRow(entry), richCode: null, legacyType: legacy,
        dueLegacyType: null, dueInterestStartDate: null });
      expect(finding.numericExporter.outputCode).toBe(output);
      expect(finding.numericExporter.silentFallback).toBe(false);
    }
    const unknown = classifyRichInterestUyapReadiness({ ...inventoryRow(PERSISTED_FIXTURES[0]),
      richCode: null, legacyType: 'PRA42_UNKNOWN', dueLegacyType: null, dueInterestStartDate: null });
    expect(extracted.fallback).toBe('99');
    expect(unknown.numericExporter).toMatchObject({ outputCode: '99', silentFallback: true });
  });

  it('FAIZT mapping, fallback ve missing-start omission production source ile aynıdır', () => {
    const extracted = extractFaiztMapping(faiztPath);
    for (const [legacy, output] of Object.entries(extracted.entries)) {
      const finding = classifyRichInterestUyapReadiness({ ...inventoryRow(PERSISTED_FIXTURES[0]),
        richCode: null, legacyType: null, dueLegacyType: legacy, dueInterestStartDate: '2025-01-15' });
      expect(finding.faiztExporter.outputCode).toBe(output);
      expect(finding.faiztExporter.silentFallback).toBe(false);
    }
    const unknown = classifyRichInterestUyapReadiness({ ...inventoryRow(PERSISTED_FIXTURES[0]),
      richCode: null, legacyType: null, dueLegacyType: 'PRA42_UNKNOWN', dueInterestStartDate: '2025-01-15' });
    expect(extracted.fallback).toBe('FAIZT00003');
    expect(unknown.faiztExporter).toMatchObject({ outputCode: 'FAIZT00003', silentFallback: true });
    const omitted = classifyRichInterestUyapReadiness({ ...inventoryRow(PERSISTED_FIXTURES[0]),
      richCode: null, legacyType: null, dueLegacyType: 'YASAL', dueInterestStartDate: null });
    expect(omitted.faiztExporter).toMatchObject({ outputCode: null, silentFallback: false, omittedReason: 'MISSING_START_DATE' });
  });

  it('manifest exporter expectations inventory observation ile uyumludur', () => {
    for (const entry of RICH_INTEREST_FIXTURE_MANIFEST) {
      const finding = classifyRichInterestUyapReadiness(inventoryRow(entry));
      expect(finding.numericExporter.outputCode).toBe(entry.expectedExporterComparison.numeric);
      expect(finding.faiztExporter.outputCode).toBe(entry.expectedExporterComparison.faizt);
      expect(actualRelation(finding)).toBe(entry.expectedExporterComparison.relation);
    }
  });
});
