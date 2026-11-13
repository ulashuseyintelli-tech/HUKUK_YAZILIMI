/**
 * Anaparasız dosya (yalnız masraf / fer'i; örn. ilam vekâlet ücreti + yargılama gideri) — kanonik bakiye sözleşmesi.
 *
 * Ölçülen kusur (13.11.2026, yerel pilot dosyası; gerçek değerler BURADA YOK — bütün tutarlar sentetik):
 * - Principal kovası ve ödeme olmayınca para birimi grubu kurulmuyor, currencyResults boş kalıyordu.
 * - Ücret projeksiyonu boş kümeyi FEE_PROJECTION_CURRENCY_MISMATCH (BLOCKER) sayıyor, kayıtlı tutarlar null oluyordu.
 * - Görünüm para birimini UNKNOWN (MULTI_CURRENCY_DISPLAY_UNSAFE) ve hiçbir şey hesaplanmadığı halde durumu OK gösteriyordu.
 * - Eski özet uyumluluğu SCALAR_CONTRACT_MULTI_CURRENCY_UNAVAILABLE ile kapanıyordu.
 *
 * Kural:
 * - Para birimi kalemin kendisinden okunur, kaynak tutarlar görünür.
 * - Faiz UNKNOWN kalır (0 / "işlemez" yapılmaz); nihai toplam üretilmez.
 * - Gerçek para birimi uyuşmazlığı, çoklu para birimi, anaparalı ve ödemeli dosyalar DEĞİŞMEZ.
 */

import { CaseBalanceService } from '../case-balance.service';
import { InterestEngineService } from '../../interest-engine.service';
import { PolicyGateV2Service } from '../../policy-gate/policy-gate-v2.service';
import { SegmentBuilderService } from '../../segments/segment-builder.service';
import { AllocationEngineService } from '../../allocation/allocation-engine.service';
import { TBK100AllocatorService } from '../../allocation/tbk100-allocator.service';
import { ClaimPriorityService } from '../../allocation/claim-priority.service';
import { LegalReportRendererService } from '../../reporter/legal-report-renderer.service';
import { SegmentReporterService } from '../../reporter/segment-reporter.service';
import { AuditWriterService } from '../../audit/audit-writer.service';
import { VersionPinningService } from '../../version/version-pinning.service';
import { AncillaryType, InterestTypeCode } from '../../types/domain.types';
import { RateSourceType } from '../../rates/rate-entry.entity';
import { toCaseBalanceDisplay } from '../case-balance-display';
import { buildCaseBalanceFeeProjection } from '../case-balance-fee-projection';
import { buildCaseCalculationSummaryCompatibilityAdapter, LEGACY_CALCULATION_SUMMARY_NUMERIC_FIELDS } from '../../../case/case-calculation-summary.compatibility';
import { buildAnaparasizKalemDokumu } from '../../../case/case-calculation-summary.principal-free';

function realEngine(): InterestEngineService {
  const auditWriter = new AuditWriterService();
  auditWriter.clearAll();
  return new InterestEngineService(
    new PolicyGateV2Service(),
    new SegmentBuilderService(),
    new AllocationEngineService(new TBK100AllocatorService(), new ClaimPriorityService()),
    new LegalReportRendererService(new SegmentReporterService()),
    auditWriter,
    new VersionPinningService(),
  );
}

const legalRate = () => [{ id: 'r1', interestType: InterestTypeCode.LEGAL_3095, validFrom: '2025-01-01', validTo: null, annualRate: 0.24, source: RateSourceType.TCMB, versionHash: 'h1', createdAt: '2025-01-01T00:00:00Z' }];

function setup(opts: { claimItems?: unknown[]; collections?: unknown[]; rates?: unknown[] }) {
  const claimItems = opts.claimItems ?? [];
  const prisma = {
    case: { findFirst: jest.fn().mockResolvedValue({ interestType: 'YASAL', interestStartDate: null, caseDate: new Date('2025-02-01'), metadata: null }) },
    claimItem: {
      findMany: jest.fn().mockImplementation(async (args?: any) => {
        const excludedStatus = args?.where?.status?.not;
        return excludedStatus ? claimItems.filter((item: any) => item.status !== excludedStatus) : claimItems;
      }),
    },
    ledgerEntry: { findMany: jest.fn().mockResolvedValue([]) },
    collection: { findMany: jest.fn().mockResolvedValue(opts.collections ?? []) },
    collectionOverpayment: { findMany: jest.fn().mockResolvedValue([]) },
    icrabotTimelineEntry: { findMany: jest.fn().mockResolvedValue([]) },
    due: { findMany: jest.fn().mockResolvedValue([]) },
    claimFormationSnapshot: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const rateProvider = { getRatesForPeriod: jest.fn().mockResolvedValue(opts.rates ?? []) };
  const engine = realEngine();
  const computeBalanceSpy = jest.spyOn(engine, 'computeBalance');
  const service = new CaseBalanceService(prisma as never, rateProvider as never, engine);
  return { service, rateProvider, computeBalanceSpy };
}

// Sentetik kalemler (gerçek dosya tutarı / tarihi DEĞİL)
const vekalet = (p: Record<string, unknown> = {}) => ({
  id: 'ci-vu', itemType: 'ATTORNEY_FEE', demandedAmount: 4321.1, amount: 4321.1, currency: 'TRY',
  interestType: 'YASAL', interestTypeCode: 'LEGAL_3095', interestRate: null, interestStartDate: new Date('2025-01-10'),
  interestAccrualStatus: 'UNKNOWN', status: 'ACTIVE', metadata: null, description: 'İLAM VEKALET ÜCRETİ', ...p,
});
const yargilama = (p: Record<string, unknown> = {}) => ({
  id: 'ci-yg', itemType: 'YARGILAMA_GIDERI', demandedAmount: 1234.56, amount: 1234.56, currency: 'TRY',
  interestType: 'YASAL', interestTypeCode: 'LEGAL_3095', interestRate: null, interestStartDate: new Date('2025-01-10'),
  interestAccrualStatus: 'UNKNOWN', status: 'ACTIVE', metadata: null, description: 'YARGILAMA GİDERİ', ...p,
});
const principal = (p: Record<string, unknown> = {}) => ({
  id: 'ci-p', itemType: 'PRINCIPAL', demandedAmount: 10000, amount: 10000, currency: 'TRY',
  interestType: 'YASAL', interestRate: null, interestStartDate: new Date('2025-01-01'), status: 'ACTIVE', metadata: null, ...p,
});
const collection = (p: Record<string, unknown> = {}) => ({
  id: 'col-1', status: 'CONFIRMED', cancelledAt: null, amount: 500, currency: 'TRY',
  date: new Date('2025-03-01'), sourceType: 'BANKA', channel: null, ...p,
});
const AS_OF = '2025-06-01';
const display = (balance: Awaited<ReturnType<CaseBalanceService['computeCaseBalance']>>) =>
  toCaseBalanceDisplay({ tenantId: 't1', caseId: 'case1', balance, generatedAt: '2025-06-01T00:00:00.000Z' });
const legacyInput = () => ({
  caseId: 'case1',
  hesapTarihi: AS_OF,
  ...Object.fromEntries(LEGACY_CALCULATION_SUMMARY_NUMERIC_FIELDS.map((field) => [field, 0])),
  icraMasraflari: 1431.1,
  vekaletUcreti: 9000,
  toplamBorc: 10431.1,
}) as never;

describe('Ücret projeksiyonu (saf) — anaparasız para birimi', () => {
  const kaynak = [
    { sourceItemId: 'ci-yg', itemType: 'YARGILAMA_GIDERI', category: 'COST' as const, code: AncillaryType.YARGILAMA_GIDERI, amount: 1234.56, currency: 'TRY', sourceStatus: 'AVAILABLE' as const },
    { sourceItemId: 'ci-vu', itemType: 'ATTORNEY_FEE', category: 'ANCILLARY' as const, code: AncillaryType.VEKALET_UCRETI, amount: 4321.1, currency: 'TRY', sourceStatus: 'AVAILABLE' as const },
  ];

  it('T1: NO_PRINCIPAL_BASIS satırı → kaynak tutarlar AVAILABLE, para birimi toplamı, açıklayıcı INFO; MISMATCH / LEGAL_BALANCE yok', () => {
    const fp = buildCaseBalanceFeeProjection({
      sourceItems: kaynak,
      currencyResults: [{ currency: 'TRY', resultAvailable: false, skippedReason: 'NO_PRINCIPAL_BASIS' }],
    });
    expect(fp.status).toBe('AVAILABLE');
    expect(fp.authority).toBe('SOURCE_PROJECTION_ONLY');
    expect(fp.groups).toHaveLength(1);
    expect(fp.groups[0]).toMatchObject({ currency: 'TRY', status: 'AVAILABLE', totalProjectedAmount: 5555.66 });
    expect(fp.groups[0].lines.map((l) => [l.code, l.amount, l.status])).toEqual([
      [AncillaryType.VEKALET_UCRETI, 4321.1, 'AVAILABLE'],
      [AncillaryType.YARGILAMA_GIDERI, 1234.56, 'AVAILABLE'],
    ]);
    const codes = fp.diagnostics.map((d) => d.code);
    expect(codes).toContain('FEE_PROJECTION_PRINCIPAL_FREE_BASIS');
    expect(codes).not.toContain('FEE_PROJECTION_CURRENCY_MISMATCH');
    expect(codes).not.toContain('FEE_PROJECTION_LEGAL_BALANCE_BLOCKED');
  });

  it('T2: işaretsiz boş küme → MISMATCH aynen (saf sözleşme değişmedi)', () => {
    const fp = buildCaseBalanceFeeProjection({ sourceItems: kaynak, currencyResults: [] });
    expect(fp.status).toBe('UNAVAILABLE');
    expect(fp.groups[0].lines.every((l) => l.amount === null)).toBe(true);
    expect(fp.diagnostics.find((d) => d.code === 'FEE_PROJECTION_CURRENCY_MISMATCH')?.severity).toBe('BLOCKER');
    expect(fp.diagnostics.map((d) => d.code)).not.toContain('FEE_PROJECTION_PRINCIPAL_FREE_BASIS');
  });

  it('T3: gerçek çapraz para birimi (TRY sonuç + USD masraf) → USD MISMATCH aynen; NO_PRINCIPAL_BASIS başka para birimini açmaz', () => {
    const fp = buildCaseBalanceFeeProjection({
      sourceItems: [{ ...kaynak[0], currency: 'USD' }],
      currencyResults: [
        { currency: 'TRY', resultAvailable: true },
        { currency: 'EUR', resultAvailable: false, skippedReason: 'NO_PRINCIPAL_BASIS' },
      ],
    });
    expect(fp.groups[0]).toMatchObject({ currency: 'USD', status: 'UNAVAILABLE' });
    expect(fp.groups[0].diagnosticCodes).toEqual(['FEE_PROJECTION_CURRENCY_MISMATCH']);
  });
});

describe('Anaparasız dosya — servis + görünüm + eski özet uyumluluğu', () => {
  it('T4: ilam vekâlet ücreti + yargılama gideri, faiz UNKNOWN, ödeme yok → açık satır + neden; motor / oran çağrılmaz', async () => {
    const { service, computeBalanceSpy, rateProvider } = setup({ claimItems: [vekalet(), yargilama()], rates: legalRate() });
    const res = await service.computeCaseBalance('t1', 'case1', AS_OF);

    expect(res.currencyResults).toEqual([{ currency: 'TRY', result: null, skippedReason: 'NO_PRINCIPAL_BASIS', grossPrincipal: 0 }]);
    expect(res.diagnostics.fatal).toEqual([]);
    expect(res.diagnostics.perCurrency.map((d) => d.code).sort()).toEqual(
      ['ANCILLARY_INTEREST_UNKNOWN', 'ANCILLARY_INTEREST_UNKNOWN', 'NO_PRINCIPAL_BASIS'],
    );
    expect(computeBalanceSpy).not.toHaveBeenCalled();
    expect(rateProvider.getRatesForPeriod).not.toHaveBeenCalled();
    expect(res.principalFreeBasis).toEqual([{
      currency: 'TRY',
      projectedAmount: 5555.66,
      items: [
        { claimItemId: 'ci-vu', itemType: 'ATTORNEY_FEE', category: 'ANCILLARY', code: AncillaryType.VEKALET_UCRETI, amount: 4321.1, interestAccrualStatus: 'UNKNOWN', description: 'İLAM VEKALET ÜCRETİ' },
        { claimItemId: 'ci-yg', itemType: 'YARGILAMA_GIDERI', category: 'COST', code: AncillaryType.YARGILAMA_GIDERI, amount: 1234.56, interestAccrualStatus: 'UNKNOWN', description: 'YARGILAMA GİDERİ' },
      ],
    }]);
    // İki kalem AYRI kodlarla (yargılama gideri tebligat masrafı değil; vekâlet ücreti fer'i)
    expect(res.projections).toEqual({ costs: { [AncillaryType.YARGILAMA_GIDERI]: 1234.56 }, ancillaries: { [AncillaryType.VEKALET_UCRETI]: 4321.1 } });
    expect(res.feeProjection.status).toBe('AVAILABLE');
    expect(res.feeProjection.groups[0].totalProjectedAmount).toBe(5555.66);
  });

  it('T5: görünüm → TRY, UNAVAILABLE (NO_PRINCIPAL_BASIS), kalem kovaları kaynak tutar, faiz ve anapara null, toplamlar null', async () => {
    const { service } = setup({ claimItems: [vekalet(), yargilama()] });
    const view = display(await service.computeCaseBalance('t1', 'case1', AS_OF));

    expect(view.currency).toBe('TRY');
    expect(view.status).toBe('UNAVAILABLE');
    expect(view.authority).toBe('UNSAFE_FOR_PRIMARY_DISPLAY');
    expect(view.unavailableReason).toBe('NO_PRINCIPAL_BASIS');
    expect(view.readiness.blockers).toEqual([
      expect.objectContaining({ code: 'INTEREST_BASE', sourceCodes: ['ANCILLARY_INTEREST_UNKNOWN', 'NO_PRINCIPAL_BASIS'] }),
    ]);
    const bucket = (code: string) => view.buckets.find((b) => b.code === code);
    expect(bucket('EXPENSE')).toMatchObject({ amount: 1234.56, displayable: true });
    expect(bucket('ATTORNEY_FEE')).toMatchObject({ amount: 4321.1, displayable: true });
    expect(bucket('ACCRUED_INTEREST')).toEqual({
      code: 'ACCRUED_INTEREST', currency: 'TRY', amount: null, displayable: false, source: 'UNAVAILABLE', diagnosticCodes: ['NO_PRINCIPAL_BASIS'],
    });
    expect(bucket('PRINCIPAL')).toMatchObject({ amount: null, displayable: false, diagnosticCodes: ['NO_PRINCIPAL_BASIS'] });
    expect(Object.values(view.totals).every((v) => v === null)).toBe(true);
    expect(view.currencies).toEqual([expect.objectContaining({ currency: 'TRY', interest: null, claimRemaining: null, skippedReason: 'NO_PRINCIPAL_BASIS' })]);
    const codes = view.diagnostics.map((d) => d.code);
    expect(codes).toContain('NO_PRINCIPAL_BASIS');
    expect(codes).not.toContain('MULTI_CURRENCY_DISPLAY_UNSAFE');
    expect(view.feeProjection.diagnostics.map((d) => d.code)).not.toContain('FEE_PROJECTION_CURRENCY_MISMATCH');
    const tani = view.diagnostics.find((d) => d.code === 'NO_PRINCIPAL_BASIS');
    expect(tani).toMatchObject({ severity: 'BLOCKER', details: { currencies: ['TRY'], projectedAmountByCurrency: { TRY: 5555.66 } } });
    expect((tani?.details?.observations as Array<Record<string, unknown>>).every((o) => o.accruedInterest === null && o.interestAccrualStatus === 'UNKNOWN')).toBe(true);
    // Faiz hiçbir yerde 0 olarak gösterilmez
    expect(view.buckets.filter((b) => b.code === 'ACCRUED_INTEREST').every((b) => b.amount === null)).toBe(true);
  });

  it('T6: eski özet uyumluluğu → SCALAR… yok, CANONICAL_DISPLAY_BLOCKED; açıklayıcı döküm yükseltmesiz, nihai toplam null', async () => {
    const { service } = setup({ claimItems: [vekalet(), yargilama()] });
    const view = display(await service.computeCaseBalance('t1', 'case1', AS_OF));
    const compat = buildCaseCalculationSummaryCompatibilityAdapter({ legacy: legacyInput(), display: view });
    const codes = compat.diagnostics.map((d) => d.code);
    expect(codes).not.toContain('SCALAR_CONTRACT_MULTI_CURRENCY_UNAVAILABLE');
    expect(codes).not.toContain('LEGACY_CANONICAL_CONFLICT');
    expect(codes).toContain('CANONICAL_DISPLAY_BLOCKED');
    expect(compat.status).toBe('BLOCKED');
    expect(compat.consumerSwitchAuthorized).toBe(false);

    const dokum = buildAnaparasizKalemDokumu(view);
    expect(dokum).toEqual({
      durum: 'NIHAI_TOPLAM_HESAPLANAMADI',
      otorite: 'ACIKLAYICI_DOKUM',
      kanonikOtorite: 'UNSAFE_FOR_PRIMARY_DISPLAY',
      gerekce: 'NO_PRINCIPAL_BASIS',
      paraBirimleri: [{
        paraBirimi: 'TRY',
        kalemler: [
          { claimItemId: 'ci-vu', kod: 'VEKALET_UCRETI', kalemTuru: 'ATTORNEY_FEE', etiket: 'Vekâlet Ücreti (alacak kalemi) — İLAM VEKALET ÜCRETİ', tutar: 4321.1, faizDurumu: 'BELIRLENEMEDI' },
          { claimItemId: 'ci-yg', kod: 'YARGILAMA_GIDERI', kalemTuru: 'YARGILAMA_GIDERI', etiket: 'Yargılama Gideri', tutar: 1234.56, faizDurumu: 'BELIRLENEMEDI' },
        ],
        kalemTutarlariToplami: 5555.66,
      }],
      faizDurumu: 'BELIRLENEMEDI',
      nihaiBorcToplami: null,
      mesaj: expect.stringContaining('nihai borç toplamı hesaplanamadı'),
    });
    // Takip vekâlet ücreti (eski özetin tarife hesabı 9000) dökümde YOK; ilam kalemi yerine geçmez
    expect(JSON.stringify(dokum)).not.toContain('9000');
  });

  it('T7: anaparasız çok para birimi (TRY yargılama gideri + USD vekâlet ücreti) → iki ayrı grup; çapraz toplam yok; MULTI', async () => {
    const { service } = setup({ claimItems: [vekalet({ currency: 'USD' }), yargilama()] });
    const res = await service.computeCaseBalance('t1', 'case1', AS_OF);
    expect(res.currencyResults.map((r) => [r.currency, r.skippedReason])).toEqual([['TRY', 'NO_PRINCIPAL_BASIS'], ['USD', 'NO_PRINCIPAL_BASIS']]);
    expect(res.feeProjection.groups.map((g) => [g.currency, g.status, g.totalProjectedAmount])).toEqual([['TRY', 'AVAILABLE', 1234.56], ['USD', 'AVAILABLE', 4321.1]]);
    expect(res.feeProjection.totalProjectedAmount).toBeNull();
    expect(res.feeProjection.diagnostics.map((d) => d.code)).toContain('FEE_PROJECTION_CROSS_CURRENCY_TOTAL_FORBIDDEN');
    const view = display(res);
    expect(view.currency).toBe('MULTI');
    expect(Object.values(view.totals).every((v) => v === null)).toBe(true);
    const compat = buildCaseCalculationSummaryCompatibilityAdapter({ legacy: legacyInput(), display: view });
    expect(compat.diagnostics.map((d) => d.code)).toContain('SCALAR_CONTRACT_MULTI_CURRENCY_UNAVAILABLE');
    const dokum = buildAnaparasizKalemDokumu(view);
    expect(dokum?.paraBirimleri.map((pb) => [pb.paraBirimi, pb.kalemTutarlariToplami])).toEqual([['TRY', 1234.56], ['USD', 4321.1]]);
  });

  it('T8: anaparasız + tahsilat → bugünkü NO_BUCKETS yolu aynen (anaparasız yol devreye girmez)', async () => {
    const { service } = setup({ claimItems: [vekalet(), yargilama()], collections: [collection()] });
    const res = await service.computeCaseBalance('t1', 'case1', AS_OF);
    expect(res.currencyResults).toEqual([{ currency: 'TRY', result: null, skippedReason: 'NO_BUCKETS', grossPrincipal: 0 }]);
    expect(res.diagnostics.fatal.map((f) => f.code)).toEqual(['NO_BUCKETS']);
    expect(res.principalFreeBasis).toBeUndefined();
    expect(res.diagnostics.perCurrency.map((d) => d.code)).not.toContain('NO_PRINCIPAL_BASIS');
  });

  it('T9: anaparalı dosya + vekâlet ücreti kalemi → motor çalışır, anaparasız alan / kodu YOK (mevcut davranış)', async () => {
    const { service, computeBalanceSpy } = setup({ claimItems: [principal(), vekalet()], rates: legalRate() });
    const res = await service.computeCaseBalance('t1', 'case1', AS_OF);
    expect(computeBalanceSpy).toHaveBeenCalledTimes(1);
    expect(res.currencyResults).toHaveLength(1);
    expect(res.currencyResults[0].result).not.toBeNull();
    expect(res.currencyResults[0].skippedReason).toBeUndefined();
    expect(res.principalFreeBasis).toBeUndefined();
    expect(res.feeProjection.diagnostics.map((d) => d.code)).not.toContain('FEE_PROJECTION_PRINCIPAL_FREE_BASIS');
    expect(display(res).diagnostics.map((d) => d.code)).not.toContain('NO_PRINCIPAL_BASIS');
  });

  it('T10: anaparasız, kalem para birimi desteksiz / boş → satır YOK, varsayılan para birimi atanmaz; projeksiyon kendi engelini verir', async () => {
    const { service } = setup({ claimItems: [vekalet({ currency: 'XAU' }), yargilama({ currency: '' })] });
    const res = await service.computeCaseBalance('t1', 'case1', AS_OF);
    expect(res.currencyResults).toEqual([]);
    expect(res.principalFreeBasis).toBeUndefined();
    const issues = res.feeProjection.groups.flatMap((g) => g.diagnosticCodes ?? []);
    expect(issues).toEqual(expect.arrayContaining(['FEE_PROJECTION_CURRENCY_MISSING', 'FEE_PROJECTION_CURRENCY_UNSUPPORTED']));
    expect(res.feeProjection.groups.every((g) => g.lines.every((l) => l.amount === null))).toBe(true);
  });

  it('T11: anaparasız, bir kalem tutarı 0 → o para birimi grubu SOURCE_AMOUNT_INVALID (bugünkü kural); satır geçerli kalem için', async () => {
    const { service } = setup({ claimItems: [vekalet(), yargilama({ amount: 0, demandedAmount: 0 })] });
    const res = await service.computeCaseBalance('t1', 'case1', AS_OF);
    expect(res.currencyResults.map((r) => r.skippedReason)).toEqual(['NO_PRINCIPAL_BASIS']);
    expect(res.principalFreeBasis?.[0].items.map((i) => i.claimItemId)).toEqual(['ci-vu']);
    expect(res.feeProjection.groups[0]).toMatchObject({ status: 'UNAVAILABLE', totalProjectedAmount: null });
    expect(res.feeProjection.groups[0].diagnosticCodes).toEqual(['FEE_PROJECTION_SOURCE_AMOUNT_INVALID']);
  });

  it('T12: fer\'i ACCRUES → hesaplanmadı kodu + mevcut motor uyarısı; açık NO_INTEREST → faiz kodu yok ama nihai engel sürer', async () => {
    const accrues = setup({ claimItems: [vekalet({ interestAccrualStatus: 'ACCRUES' })] });
    const r1 = await accrues.service.computeCaseBalance('t1', 'case1', AS_OF);
    expect(r1.diagnostics.perCurrency.map((d) => d.code).sort()).toEqual(['ANCILLARY_INTEREST_NOT_COMPUTED', 'NO_PRINCIPAL_BASIS']);
    expect(r1.diagnostics.assembler.map((d) => d.code)).toContain('ACCRUAL_ENGINE_UNSUPPORTED');
    expect(display(r1).status).toBe('UNAVAILABLE');

    const none = setup({ claimItems: [yargilama({ interestAccrualStatus: 'NO_INTEREST', interestType: null, interestTypeCode: null, interestStartDate: null })] });
    const r2 = await none.service.computeCaseBalance('t1', 'case1', AS_OF);
    expect(r2.diagnostics.perCurrency.map((d) => d.code)).toEqual(['NO_PRINCIPAL_BASIS']);
    const v2 = display(r2);
    expect(v2.status).toBe('UNAVAILABLE');
    expect(Object.values(v2.totals).every((v) => v === null)).toBe(true);
    expect(buildAnaparasizKalemDokumu(v2)?.paraBirimleri[0].kalemler[0].faizDurumu).toBe('ISLEMEZ_KAYITLI');
  });

  it('dökümde iptal edilmiş kalem yer almaz (assembler CANCELLED / WAIVED dışlar)', async () => {
    const { service } = setup({ claimItems: [vekalet(), yargilama({ status: 'WAIVED' })] });
    const res = await service.computeCaseBalance('t1', 'case1', AS_OF);
    expect(res.principalFreeBasis?.[0].items.map((i) => i.claimItemId)).toEqual(['ci-vu']);
    expect(res.principalFreeBasis?.[0].projectedAmount).toBe(4321.1);
  });

  it('anaparasız değilse döküm üretilmez (buildAnaparasizKalemDokumu → undefined)', async () => {
    const { service } = setup({ claimItems: [principal(), vekalet()], rates: legalRate() });
    expect(buildAnaparasizKalemDokumu(display(await service.computeCaseBalance('t1', 'case1', AS_OF)))).toBeUndefined();
    expect(buildAnaparasizKalemDokumu(null)).toBeUndefined();
  });
});
