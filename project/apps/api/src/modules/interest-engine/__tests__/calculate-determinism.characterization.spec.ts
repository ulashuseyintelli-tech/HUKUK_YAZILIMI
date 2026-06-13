/**
 * CHARACTERIZATION — InterestEngineService.calculate() DETERMINISM + AUDIT CONTRACT
 *
 * Amaç (D-A PR-1, test-only): calculate()'in MEVCUT davranışını pure-split ÖNCESİ kilitlemek.
 *   - Sabit (request, rates) → normalize edilmiş result DETERMINISTIK (iki koşu birebir).
 *   - Non-deterministic alanlar (calculatedAt = duvar-saati; auditLogId = generateId) snapshot DIŞI,
 *     ama well-formed.
 *   - "calculate() = saf hesap + TAM BİR audit yazımı" ayrım sözleşmesi:
 *       exactly 1 audit record, result.auditLogId === record.id, record özeti result ile tutarlı.
 *
 * NOT: AuditWriterService IN-MEMORY (Map; "replace with Prisma in production"). Bu yüzden audit
 *   yazımı DB'siz gözlemlenir (getRecordsForCase/getRecord + clearAll). Ürün kodu DEĞİŞTİRİLMEDİ.
 *
 * PR-2 (computeBalance pure çıkınca): bu dosya DEĞİŞMEDEN geçmeli (davranış-koruma kanıtı);
 *   o zaman EK assert eklenir → computeBalance() == calculate() normalize-result (auditLogId hariç)
 *   ve computeBalance TEK BAŞINA audit YAZMAZ.
 *
 * Kural: snapshot kütüphanesi yok; determinizm iki-koşu eşitliğiyle + invariant assert'lerle pinlenir.
 */

import { InterestEngineService } from '../interest-engine.service';
import { PolicyGateV2Service } from '../policy-gate/policy-gate-v2.service';
import { SegmentBuilderService } from '../segments/segment-builder.service';
import { AllocationEngineService } from '../allocation/allocation-engine.service';
import { TBK100AllocatorService } from '../allocation/tbk100-allocator.service';
import { ClaimPriorityService, ClaimPriorityRule } from '../allocation/claim-priority.service';
import { LegalReportRendererService } from '../reporter/legal-report-renderer.service';
import { SegmentReporterService } from '../reporter/segment-reporter.service';
import { AuditWriterService } from '../audit/audit-writer.service';
import { VersionPinningService } from '../version/version-pinning.service';
import { RateEntry, RateSourceType } from '../rates/rate-entry.entity';
import { CalculationRequest, CalculationRequestSchema, GapPolicy, CalculationResult, DEFAULT_INTERPRETATION_PROFILE_ID } from '../types/calculation.types';
import { ClaimBucket, InterestTypeCode } from '../types/domain.types';
import { CalculationMode, RoundingMode, RoundingScope, SameDayPaymentRule } from '../types/common.types';

describe('InterestEngineService.calculate() — determinism + audit contract (characterization)', () => {
  let engine: InterestEngineService;
  let auditWriter: AuditWriterService;

  const TENANT = 'tenant-det';

  // Sabit, deterministik senaryo (golden 15.1 deseni: kambiyo, 3 oran değişimi, sürekli kapsama).
  const rates: RateEntry[] = [
    { id: 'r1', interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2, validFrom: '2025-01-01', validTo: '2025-04-01', annualRate: 0.4225, source: RateSourceType.TCMB, versionHash: 'h1', createdAt: '2025-01-01T00:00:00Z' },
    { id: 'r2', interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2, validFrom: '2025-04-01', validTo: '2025-07-01', annualRate: 0.4500, source: RateSourceType.TCMB, versionHash: 'h2', createdAt: '2025-04-01T00:00:00Z' },
    { id: 'r3', interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2, validFrom: '2025-07-01', validTo: null, annualRate: 0.3975, source: RateSourceType.TCMB, versionHash: 'h3', createdAt: '2025-07-01T00:00:00Z' },
  ];

  const buildRequest = (caseId: string): CalculationRequest => {
    const claim: ClaimBucket = { id: 'c1', amount: 100000, currency: 'TRY', startDate: '2025-02-15', interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2, dayCountBasis: 365 };
    return {
      caseId,
      claimBuckets: [claim],
      asOfDate: '2025-08-15',
      mode: CalculationMode.PREVIEW,
      options: { dayCountBasis: 365, sameDayPaymentRule: SameDayPaymentRule.END_OF_DAY, roundingMode: RoundingMode.HALF_UP, roundingScope: RoundingScope.PER_SEGMENT, gapPolicy: GapPolicy.BLOCK, claimPriorityRule: ClaimPriorityRule.OLDEST_DUE_FIRST },
    };
  };

  /** Non-deterministic alanları (calculatedAt, auditLogId) snapshot dışına alır. */
  const normalize = (r: CalculationResult): CalculationResult => ({
    ...r,
    calculatedAt: '<excluded>',
    auditLogId: '<excluded>',
  });

  beforeEach(() => {
    const policyGate = new PolicyGateV2Service();
    const segmentBuilder = new SegmentBuilderService();
    const tbk100Allocator = new TBK100AllocatorService();
    const claimPriority = new ClaimPriorityService();
    const allocationEngine = new AllocationEngineService(tbk100Allocator, claimPriority);
    const segmentReporter = new SegmentReporterService();
    const reportRenderer = new LegalReportRendererService(segmentReporter);
    auditWriter = new AuditWriterService();
    const versionPinning = new VersionPinningService();
    engine = new InterestEngineService(policyGate, segmentBuilder, allocationEngine, reportRenderer, auditWriter, versionPinning);
    auditWriter.clearAll();
  });

  it('1) sabit request+rates → normalize edilmiş result deterministik (iki koşu birebir)', async () => {
    const r1 = await engine.calculate(buildRequest('det-1'), rates, TENANT);
    const r2 = await engine.calculate(buildRequest('det-1'), rates, TENANT);
    expect(normalize(r1)).toEqual(normalize(r2));
  });

  it('2) calculatedAt ISO string ama snapshot dışı', async () => {
    const r = await engine.calculate(buildRequest('det-2'), rates, TENANT);
    expect(typeof r.calculatedAt).toBe('string');
    expect(r.calculatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/); // ISO8601
    expect(normalize(r).calculatedAt).toBe('<excluded>');
  });

  it('3) auditLogId non-empty ama snapshot dışı', async () => {
    const r = await engine.calculate(buildRequest('det-3'), rates, TENANT);
    expect(typeof r.auditLogId).toBe('string');
    expect(r.auditLogId.length).toBeGreaterThan(0);
    expect(normalize(r).auditLogId).toBe('<excluded>');
  });

  it('4) tam olarak 1 audit record yazılır', async () => {
    await engine.calculate(buildRequest('det-4'), rates, TENANT);
    const records = await auditWriter.getRecordsForCase('det-4', TENANT);
    expect(records).toHaveLength(1);
  });

  it('5) result.auditLogId === yazılan audit record id', async () => {
    const r = await engine.calculate(buildRequest('det-5'), rates, TENANT);
    const records = await auditWriter.getRecordsForCase('det-5', TENANT);
    expect(records[0].id).toBe(r.auditLogId);
  });

  it('6) audit record inputHash/rateTableVersion/result özeti calculate sonucu ile tutarlı', async () => {
    const r = await engine.calculate(buildRequest('det-6'), rates, TENANT);
    const rec = await auditWriter.getRecord(r.auditLogId);
    expect(rec).not.toBeNull();
    expect(rec!.inputHash).toBe(r.inputHash);
    expect(rec!.rateTableVersion).toBe(r.rateTableVersion);
    expect(rec!.totalInterest).toBe(r.totalInterest);
    expect(rec!.totalDue).toBe(r.totalDue);
  });

  // ── PR-2: pure-split (computeBalance) sözleşmesi ───────────────────────────
  it('7) computeBalance(fixedNow, profil) deterministik (saf + sabit → birebir)', () => {
    const fixedNow = '2025-08-15T10:00:00.000Z';
    const cb1 = engine.computeBalance(buildRequest('cb-1'), rates, fixedNow, DEFAULT_INTERPRETATION_PROFILE_ID);
    const cb2 = engine.computeBalance(buildRequest('cb-1'), rates, fixedNow, DEFAULT_INTERPRETATION_PROFILE_ID);
    expect(cb1).toEqual(cb2);
  });

  it('7b) computeBalance saf çekirdeği calculate() ile aynı sonucu üretir (audit/now hariç)', async () => {
    const cb = engine.computeBalance(buildRequest('cb-1b'), rates, '2025-08-15T10:00:00.000Z', DEFAULT_INTERPRETATION_PROFILE_ID);
    const r = await engine.calculate(buildRequest('cb-1b'), rates, TENANT);
    expect(normalize(cb)).toEqual(normalize(r));
  });

  it('8) computeBalance TEK BAŞINA audit YAZMAZ', async () => {
    engine.computeBalance(buildRequest('cb-2'), rates, '2025-08-15T10:00:00.000Z', DEFAULT_INTERPRETATION_PROFILE_ID);
    const records = await auditWriter.getRecordsForCase('cb-2', TENANT);
    expect(records).toHaveLength(0);
  });

  // ── PR-3: interpretationProfileId (engine-türetimli; hash + audit'e pinli) ──────────────
  it('9) farklı interpretationProfileId → farklı inputHash', () => {
    const now = '2025-08-15T10:00:00.000Z';
    const hA = engine.computeBalance(buildRequest('p9'), rates, now, 'PROFILE_A').inputHash;
    const hB = engine.computeBalance(buildRequest('p9'), rates, now, 'PROFILE_B').inputHash;
    expect(hA).not.toBe(hB);
  });

  it('10) aynı interpretationProfileId → aynı inputHash (determinizm korunur)', () => {
    const now = '2025-08-15T10:00:00.000Z';
    const h1 = engine.computeBalance(buildRequest('p10'), rates, now, 'PROFILE_A').inputHash;
    const h2 = engine.computeBalance(buildRequest('p10'), rates, now, 'PROFILE_A').inputHash;
    expect(h1).toBe(h2);
  });

  it('11) audit record + result, calculate() türettiği profili (DEFAULT) taşır', async () => {
    const r = await engine.calculate(buildRequest('p11'), rates, TENANT);
    expect(r.interpretationProfileId).toBe(DEFAULT_INTERPRETATION_PROFILE_ID); // result echo
    const rec = await auditWriter.getRecord(r.auditLogId);
    expect(rec!.interpretationProfileId).toBe(DEFAULT_INTERPRETATION_PROFILE_ID); // audit pin
  });

  it('12) computeBalance interpretationProfileId olmadan çağrılamaz (TS-zorunlu)', () => {
    // @ts-expect-error — interpretationProfileId ZORUNLU param; eksik 4. arg derleme hatası vermeli
    const typecheck = () => engine.computeBalance(buildRequest('p12'), rates, '2025-08-15T10:00:00.000Z');
    expect(typeof typecheck).toBe('function');
  });

  it('13) CalculationRequestSchema DEĞİŞMEDİ — profil request şemasında YOK (FE/API kırılmadı)', () => {
    expect(() => CalculationRequestSchema.parse(buildRequest('p13'))).not.toThrow();
    expect('interpretationProfileId' in CalculationRequestSchema.shape).toBe(false);
  });
});
