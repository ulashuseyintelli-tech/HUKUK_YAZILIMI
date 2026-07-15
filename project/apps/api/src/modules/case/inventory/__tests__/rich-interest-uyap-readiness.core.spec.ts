import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  ACTIVE_UYAP_EXPORTER_MODELS,
  CANONICAL_RICH_INTEREST_CODES,
  READ_ONLY_REPEATABLE_READ_SQL,
  RICH_INTEREST_CASE_COUNTS_SQL,
  RICH_INTEREST_UYAP_PAGE_SQL,
  classifyRichInterestUyapReadiness,
  runReadOnlyRichInterestUyapInventory,
  type RichInterestInventoryDatabaseRow,
  type RichInterestUyapInventoryRow,
} from '../rich-interest-uyap-readiness.core';
import {
  formatDetailedFinding,
  formatInventorySummary,
  parseRichInterestInventoryArgs,
} from '../rich-interest-uyap-readiness.cli';

const row = (overrides: Partial<RichInterestUyapInventoryRow> = {}): RichInterestUyapInventoryRow => ({
  tenantId: 'tenant-1', caseTenantId: 'tenant-1', caseId: 'case-1', claimItemId: 'ci-1',
  itemType: 'PRINCIPAL', status: 'ACTIVE', currency: 'TRY', richCode: 'LEGAL_3095',
  legacyType: null, interestRate: null, accrualStatus: 'ACCRUES',
  interestStartDate: '2026-01-01', interestEndDate: null,
  interestStartDateProvenance: 'DEFAULT_NOTICE_DATE', noInterestReasonPresent: false,
  noInterestActorPresent: false, noInterestTimePresent: false, caseLegacyType: 'YASAL',
  linkedDueId: null, dueRichCode: null, dueLegacyType: null, dueInterestStartDate: null,
  depositTermEvidence: null, maturityPresent: false, termDurationPresent: false,
  rateScheduleSourcePresent: false, legacyUyapCodeProvenance: null, ...overrides,
});

const databaseRow = (
  id: string,
  overrides: Partial<RichInterestInventoryDatabaseRow> = {},
): RichInterestInventoryDatabaseRow => ({
  tenant_id: 'tenant-1', case_tenant_id: 'tenant-1', case_id: 'case-1', claim_item_id: id,
  item_type: 'PRINCIPAL', status: 'ACTIVE', currency: 'TRY', rich_code: 'LEGAL_3095',
  legacy_type: null, interest_rate: null, accrual_status: 'ACCRUES',
  interest_start_date: '2026-01-01', interest_end_date: null,
  interest_start_date_provenance: 'DEFAULT_NOTICE_DATE', no_interest_reason_present: false,
  no_interest_actor_present: false, no_interest_time_present: false, case_legacy_type: 'YASAL',
  linked_due_id: null, due_rich_code: null, due_legacy_type: null,
  due_interest_start_date: null, deposit_term_evidence: null, maturity_present: false,
  term_duration_present: false, rate_schedule_source_present: false,
  legacy_uyap_code_provenance: null, ...overrides,
});

describe('PR-A4-0 rich interest / UYAP readiness classifier', () => {
  it.each(CANONICAL_RICH_INTEREST_CODES)('%s rich kodunu ayrı ve fail-closed sınıflandırır', (code) => {
    const finding = classifyRichInterestUyapReadiness(row({
      richCode: code,
      interestRate: code === 'COMMERCIAL_FIXED' || code === 'CONTRACTUAL' ? 12.5 : null,
    }));
    expect(finding.richCode).toBe(code);
    expect(finding.integrityClasses).toContain('RICH_ONLY');
    if (code.startsWith('MEVDUAT_')) {
      expect(finding.uyapReadinessClasses).toContain('UYAP_DEPOSIT_TERM_AMBIGUOUS');
    }
  });

  it('rich-only, legacy-only, matching mirror ve mirror drift ayrımını korur', () => {
    expect(classifyRichInterestUyapReadiness(row()).integrityClasses).toContain('RICH_ONLY');
    expect(classifyRichInterestUyapReadiness(row({ richCode: null, legacyType: 'YASAL' })).integrityClasses)
      .toEqual(expect.arrayContaining(['LEGACY_ONLY']));
    expect(classifyRichInterestUyapReadiness(row({ legacyType: 'YASAL' })).integrityClasses)
      .toContain('RICH_AND_LEGACY_MATCH');
    expect(classifyRichInterestUyapReadiness(row({ legacyType: 'TICARI' })).integrityClasses)
      .toContain('RICH_AND_LEGACY_DRIFT');
  });

  it('unsupported legacy değerleri compatibility authority yapmaz', () => {
    const finding = classifyRichInterestUyapReadiness(row({ richCode: null, legacyType: 'YOKSUN' }));
    expect(finding.integrityClasses).toContain('UNSUPPORTED_LEGACY');
    expect(finding.uyapReadinessClasses).toContain('UYAP_SILENT_FALLBACK_RISK');
  });

  it('ClaimItem numeric exporter desteğini persistence enumundan ayırır', () => {
    expect(classifyRichInterestUyapReadiness(row({ richCode: null, legacyType: 'AVANS' })).integrityClasses)
      .not.toContain('UNSUPPORTED_LEGACY');
    expect(classifyRichInterestUyapReadiness(row({ richCode: null, legacyType: 'SABIT' })).integrityClasses)
      .toContain('UNSUPPORTED_LEGACY');
  });

  it('NO_INTEREST valid, conflict ve principal audit eksiklerini ayırır', () => {
    const valid = classifyRichInterestUyapReadiness(row({
      richCode: null, legacyType: null, interestRate: null, accrualStatus: 'NO_INTEREST',
      interestStartDate: null, interestStartDateProvenance: null,
      noInterestReasonPresent: true, noInterestActorPresent: true, noInterestTimePresent: true,
    }));
    expect(valid.integrityClasses).toEqual(expect.arrayContaining(['NO_INTEREST_VALID', 'NO_INTEREST_AUTHORITY']));
    expect(valid.uyapReadinessClasses).toEqual(['UYAP_NO_INTEREST']);

    const conflict = classifyRichInterestUyapReadiness(row({ accrualStatus: 'NO_INTEREST' }));
    expect(conflict.integrityClasses).toEqual(expect.arrayContaining([
      'NO_INTEREST_CONFLICT', 'NO_INTEREST_AUDIT_INCOMPLETE', 'NO_INTEREST_AUTHORITY',
    ]));
  });

  it.each([
    [12.5, 'FIXED_RATE_VALID'],
    [null, 'FIXED_RATE_MISSING'],
    [0, 'FIXED_RATE_INVALID'],
    [-1, 'FIXED_RATE_INVALID'],
    [Number.NaN, 'FIXED_RATE_INVALID'],
    [Number.POSITIVE_INFINITY, 'FIXED_RATE_INVALID'],
  ] as const)('COMMERCIAL_FIXED rate=%s durumunu %s sınıflandırır', (rate, expected) => {
    const finding = classifyRichInterestUyapReadiness(row({ richCode: 'COMMERCIAL_FIXED', interestRate: rate }));
    expect(finding.integrityClasses).toContain(expected);
    expect(finding.uyapReadinessClasses).toContain('UYAP_COMMERCIAL_FIXED_MAPPING_MISSING');
  });

  it('variable rich kodda stray fixed rate görünürdür', () => {
    expect(classifyRichInterestUyapReadiness(row({ interestRate: 99 })).integrityClasses)
      .toContain('VARIABLE_RATE_WITH_STRAY_FIXED_RATE');
  });

  it('CONTRACTUAL için geçerli oran mapping kararı üretmez', () => {
    const finding = classifyRichInterestUyapReadiness(row({ richCode: 'CONTRACTUAL', interestRate: 20 }));
    expect(finding.integrityClasses).toContain('FIXED_RATE_VALID');
    expect(finding.uyapReadinessClasses).toContain('UYAP_CONTRACTUAL_MAPPING_MISSING');
  });

  it('numeric-only, FAIZT-only, equivalent ve conflict exporter sonuçlarını ayırır', () => {
    const numericOnly = classifyRichInterestUyapReadiness(row({ legacyType: 'YASAL' }));
    expect(numericOnly.exporterComparison).toBe('NUMERIC_ONLY');
    expect(numericOnly.uyapReadinessClasses).toContain('UYAP_READY_ONLY_IN_NUMERIC_EXPORTER');

    const faiztOnly = classifyRichInterestUyapReadiness(row({
      legacyType: null, dueLegacyType: 'YASAL', dueInterestStartDate: '2026-01-01',
    }));
    expect(faiztOnly.exporterComparison).toBe('FAIZT_ONLY');

    const equivalent = classifyRichInterestUyapReadiness(row({
      legacyType: 'YASAL', dueLegacyType: 'YASAL', dueInterestStartDate: '2026-01-01',
    }));
    expect(equivalent.exporterComparison).toBe('EQUIVALENT');
    expect(equivalent.uyapReadinessClasses).toContain('UYAP_READY_EXACT');

    const conflict = classifyRichInterestUyapReadiness(row({
      richCode: 'COMMERCIAL_AVANS_3095_2_2', legacyType: 'TICARI',
      dueLegacyType: 'TICARI', dueInterestStartDate: '2026-01-01',
    }));
    expect(conflict.exporterComparison).toBe('CONFLICT');
    expect(conflict.uyapReadinessClasses).toContain('UYAP_EXPORTER_CONFLICT');
  });

  it.each([
    'MEVDUAT_TL_BANKALARCA', 'MEVDUAT_USD_BANKALARCA', 'MEVDUAT_EUR_BANKALARCA',
    'MEVDUAT_TL_KAMU', 'MEVDUAT_USD_KAMU', 'MEVDUAT_EUR_KAMU',
  ])('%s için tarih/orandan vade tahmin etmez', (richCode) => {
    const ambiguous = classifyRichInterestUyapReadiness(row({
      richCode, interestStartDate: '2020-01-01', interestEndDate: '2030-01-01',
      interestRate: 45, maturityPresent: true, depositTermEvidence: null,
    }));
    expect(ambiguous.uyapReadinessClasses).toContain('UYAP_DEPOSIT_TERM_AMBIGUOUS');

    const explicit = classifyRichInterestUyapReadiness(row({ richCode, depositTermEvidence: 'LONG' }));
    expect(explicit.uyapReadinessClasses).not.toContain('UYAP_DEPOSIT_TERM_AMBIGUOUS');
    expect(explicit.diagnosticReasons).toContain('DEPOSIT_TERM_EXPLICIT_LONG_MAPPING_NOT_FROZEN');
  });

  it('ClaimItem authority yokluğunu ve case fallback bilgisini yalnız diagnostic yapar', () => {
    const finding = classifyRichInterestUyapReadiness(row({
      richCode: null, legacyType: null, caseLegacyType: 'YASAL',
    }));
    expect(finding.integrityClasses).toContain('NO_CLAIMITEM_INTEREST_AUTHORITY');
    expect(finding.uyapReadinessClasses).toContain('UYAP_MAPPING_MISSING');
  });
});

describe('PR-A4-0 CLI boundary', () => {
  it('tenant, output mode ve bounded page-size gerektirir', () => {
    expect(parseRichInterestInventoryArgs([
      '--tenant', 'tenant-1', '--mode', 'detailed', '--page-size', '1000',
    ])).toEqual({ tenantId: 'tenant-1', mode: 'detailed', pageSize: 1000 });
    expect(parseRichInterestInventoryArgs(['--tenant', 'tenant-1', '--mode', 'summary']))
      .toEqual({ tenantId: 'tenant-1', mode: 'summary', pageSize: 250 });
  });

  it.each([
    ['--apply', 'true'],
    ['--rollback', 'true'],
    ['--all-tenants', 'true'],
    ['--output-file', 'inventory.json'],
  ])('%s mutation veya hassas export yüzeyini reddeder', (flag, value) => {
    expect(() => parseRichInterestInventoryArgs([
      '--tenant', 'tenant-1', '--mode', 'summary', flag, value,
    ])).toThrow(/desteklenmez/);
  });

  it('eksik tenant, bilinmeyen mode ve sınır dışı page-size fail-closed olur', () => {
    expect(() => parseRichInterestInventoryArgs(['--mode', 'summary'])).toThrow(/tenant/);
    expect(() => parseRichInterestInventoryArgs(['--tenant', 'tenant-1', '--mode', 'csv']))
      .toThrow(/summary veya detailed/);
    expect(() => parseRichInterestInventoryArgs([
      '--tenant', 'tenant-1', '--mode', 'summary', '--page-size', '1001',
    ])).toThrow(/1 ile 1000/);
  });

  it('detailed ve summary satırlarını deterministic JSON envelope ile üretir', () => {
    const finding = classifyRichInterestUyapReadiness(row());
    const findingEnvelope = JSON.parse(formatDetailedFinding(finding));
    expect(findingEnvelope).toEqual({ type: 'finding', data: finding });

    const summary = {
      inventoryVersion: 'PR-A4-0-v1', mode: 'READ_ONLY', tenantId: 'tenant-1', pageSize: 250,
      processedRecordCount: 0, richCodeCoverage: {}, integrityDistribution: {},
      uyapReadinessDistribution: {}, exporterComparisonDistribution: {}, exporterConflictCount: 0,
      ambiguousDepositCount: 0, contractualBlockerCount: 0, commercialFixedBlockerCount: 0,
      exporterModels: ACTIVE_UYAP_EXPORTER_MODELS,
      realTenantExecution: 'CALLER_CONTROLLED_SEPARATE_AUTHORIZATION_REQUIRED',
      exactUyapMapping: 'NOT_FROZEN',
    } as const;
    expect(JSON.parse(formatInventorySummary(summary))).toEqual({ type: 'summary', data: summary });
  });
});

describe('PR-A4-0 read-only paginated adapter', () => {
  it('keyset pagination ile deterministic finding stream ve 11-code summary üretir', async () => {
    const pages = [
      [databaseRow('ci-1'), databaseRow('ci-2', { rich_code: 'CONTRACTUAL', interest_rate: '12.5' })],
      [databaseRow('ci-3', { rich_code: 'MEVDUAT_USD_KAMU' })],
    ];
    const tx = {
      $executeRawUnsafe: jest.fn(async () => undefined),
      $queryRawUnsafe: jest.fn(async (query: string, _tenantId: string, afterId?: string) => {
        if (query === RICH_INTEREST_CASE_COUNTS_SQL) {
          return [
            { rich_code: 'LEGAL_3095', case_count: '1' },
            { rich_code: 'CONTRACTUAL', case_count: '1' },
            { rich_code: 'MEVDUAT_USD_KAMU', case_count: '1' },
          ];
        }
        if (afterId === '') return pages[0];
        if (afterId === 'ci-2') return pages[1];
        return [];
      }),
    };
    const prisma = { $transaction: jest.fn(async (callback: any) => callback(tx)) };
    const streamed: string[] = [];
    const summary = await runReadOnlyRichInterestUyapInventory(prisma, {
      tenantId: 'tenant-1', pageSize: 2, onFinding: (finding) => streamed.push(finding.claimItemId),
    });

    expect(streamed).toEqual(['ci-1', 'ci-2', 'ci-3']);
    expect(summary.processedRecordCount).toBe(3);
    expect(Object.keys(summary.richCodeCoverage)).toEqual([...CANONICAL_RICH_INTEREST_CODES]);
    expect(summary.richCodeCoverage.CONTRACTUAL.fixedRateInvalidCount).toBe(0);
    expect(summary.richCodeCoverage.MEVDUAT_USD_KAMU.caseCount).toBe(1);
    expect(summary.exporterModels).toEqual(ACTIVE_UYAP_EXPORTER_MODELS);
    expect(summary.exporterModels.every((model) => model.readsRichCode === false)).toBe(true);
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(READ_ONLY_REPEATABLE_READ_SQL);
    expect(tx.$queryRawUnsafe).toHaveBeenCalledWith(RICH_INTEREST_UYAP_PAGE_SQL, 'tenant-1', '', 2);
    expect(tx.$queryRawUnsafe).toHaveBeenCalledWith(RICH_INTEREST_UYAP_PAGE_SQL, 'tenant-1', 'ci-2', 2);
  });

  it('tenant ve page-size guardlarını fail-closed uygular', async () => {
    const prisma = { $transaction: jest.fn() };
    await expect(runReadOnlyRichInterestUyapInventory(prisma, { tenantId: '' })).rejects.toThrow('--tenant');
    await expect(runReadOnlyRichInterestUyapInventory(prisma, { tenantId: 't', pageSize: 1001 }))
      .rejects.toThrow('1..1000');
  });

  it.each([
    ['ClaimItem tenant', { tenant_id: 'tenant-2' }],
    ['case tenant', { case_tenant_id: 'tenant-2' }],
    ['missing case', { case_tenant_id: null }],
  ])('query sonucu %s scope dışına çıkarsa durur', async (_label, overrides) => {
    const tx = {
      $executeRawUnsafe: jest.fn(async () => undefined),
      $queryRawUnsafe: jest.fn(async (query: string) => query === RICH_INTEREST_CASE_COUNTS_SQL
        ? []
        : [databaseRow('ci-1', overrides)]),
    };
    const prisma = { $transaction: jest.fn(async (callback: any) => callback(tx)) };
    await expect(runReadOnlyRichInterestUyapInventory(prisma, { tenantId: 'tenant-1' }))
      .rejects.toThrow('tenant/case-scope');
  });

  it('SQL yalnız CTE/SELECT ve transaction READ ONLY sözleşmesini taşır', () => {
    for (const sql of [RICH_INTEREST_CASE_COUNTS_SQL, RICH_INTEREST_UYAP_PAGE_SQL]) {
      expect(sql).toMatch(/^\s*WITH\b/i);
      expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|UPSERT|MERGE|CALL|EXECUTE|CREATE|ALTER|DROP)\b/i);
    }
    expect(RICH_INTEREST_UYAP_PAGE_SQL).toContain('c."tenantId" = $1');
    expect(RICH_INTEREST_UYAP_PAGE_SQL).toContain('inst."tenantId" = $1');
    expect(READ_ONLY_REPEATABLE_READ_SQL).toContain('REPEATABLE READ, READ ONLY');
  });

  it('production exporter/schema dosyaları diagnostic modülü import etmez', () => {
    const numericExporter = fs.readFileSync(path.resolve(__dirname, '../../../uyap/uyap-xml.service.ts'), 'utf8');
    const faiztExporter = fs.readFileSync(path.resolve(__dirname, '../../../uyap-export/uyap-case-mapper.service.ts'), 'utf8');
    const schema = fs.readFileSync(path.resolve(__dirname, '../../../../../prisma/schema.prisma'), 'utf8');
    for (const source of [numericExporter, faiztExporter, schema]) {
      expect(source).not.toContain('rich-interest-uyap-readiness');
    }
    // Sessiz DIGER/99 fallback (PR #1176, fc84ba22) kaldırıldı; güncel fail-closed
    // sözleşme hem eski deseni yasaklar hem de tipli hata kodunu zorunlu kılar.
    expect(numericExporter).not.toContain('UYAP_FAIZ_KODLARI');
    expect(numericExporter).toContain("error: 'UYAP_NUMERIC_INTEREST_PROJECTION_FAILED'");
    expect(faiztExporter).toContain("return codeMap[interestType] || 'FAIZT00003'");
  });

  it('diagnostic core mutation veya UYAP submit çağrısı içermez', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../rich-interest-uyap-readiness.core.ts'), 'utf8');
    expect(source).not.toMatch(/\.(create|update|updateMany|upsert|delete|deleteMany)\s*\(/);
    expect(source).not.toMatch(/submitDocument\s*\(|generateFromCase\s*\(|mapCasesToETakipDosyasi\s*\(/);
    expect(source).not.toMatch(/from ['"].*modules\/(uyap|uyap-export)/);
  });
});
