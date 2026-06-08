/**
 * CHARACTERIZATION (kademe-2) — payment boundary + END_OF_DAY default
 * (legal-time strand, PR-1)
 *
 * AMAÇ: MEVCUT "END_OF_DAY default + ödeme sınırı" davranışını gerçek koddan
 *       exact-literal kilitlemek. Davranış DOĞRULANMAZ; OLDUĞU GİBİ yakalanır.
 *       PR-2 (default END_OF_DAY → START_OF_DAY) sonrası hangi pinlerin BİLİNÇLE
 *       değişeceği bu suite üzerinden net görünür.
 *
 * KATMANLAR:
 *   A — Default resolution: sistemin varsayılanı START_OF_DAY (doc 23 Q5 hukuki politika).
 *       (Zod CalculationOptionsSchema default + 5 case-type stratejisi)
 *       → PR-2'de FLIP edildi: önceki default END_OF_DAY → START_OF_DAY (bu commit).
 *   B — Timeline boundary: END_OF_DAY → ödeme sınırı P+1; START_OF_DAY → P.
 *   C — Segment sonucu: boundary segment bölünmesini (ve per-segment rounding ile
 *       toplamı 0.01) etkiliyor.
 *   B/C explicit END_OF_DAY pinleri PR-2'de DEĞİŞMEZ (enum korunuyor);
 *   B/C START_OF_DAY kontrast pinleri PR-2 default'unun üreteceği sonucu gösterir.
 *
 * TZ-INVARIANT (PR-3 sonrası): day-count-calculator UTC-anchored hale geldi;
 *   adjustEndDateForPayment(END_OF_DAY) → addDays zinciri artık server-TZ'den BAĞIMSIZ
 *   (UTC = Istanbul aynı P+1). Bu yüzden eski spec-içi TZ pin KALDIRILDI; değerler her
 *   TZ'de (CI=UTC dahil) aynı kalır. Determinizm kanıtı: day-count-calculator.characterization.
 *
 * Değerler gerçek koddan (geçici harness ile) capture edildi; elle hesaplanmadı.
 */

import { CalculationOptionsSchema } from '../types/calculation.types';
import {
  SameDayPaymentRule,
  DayCountBasis,
  RoundingMode,
  RoundingScope,
} from '../types/common.types';
import { generateTimeline } from '../segments/timeline-generator';
import { SegmentBuilderService } from '../segments/segment-builder.service';
import { RateEntry, RateSourceType } from '../rates/rate-entry.entity';
import { generateRateEntryHash } from '../rates/rate-version-hash';
import { InterestTypeCode, ClaimBucket } from '../types/domain.types';
import {
  KambiyoSenediStrategy,
  IlamsizGenelStrategy,
  IlamliStrategy,
  TTK1530Strategy,
  KiraAlacagiStrategy,
} from '../strategy/case-type-strategy.registry';

// sprint-2.spec deseniyle birebir mock factory'ler
const createMockRate = (
  id: string,
  validFrom: string,
  validTo: string | null,
  annualRate: number,
): RateEntry => ({
  id,
  interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2,
  validFrom,
  validTo,
  annualRate,
  source: RateSourceType.TCMB,
  sourceReference: `TCMB ${validFrom}`,
  versionHash: generateRateEntryHash({
    interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2,
    validFrom,
    annualRate,
    source: RateSourceType.TCMB,
  }),
  createdAt: new Date().toISOString(),
});

const createMockClaimBucket = (
  id: string,
  amount: number,
  startDate: string,
  fixedRate?: number,
): ClaimBucket => ({
  id,
  amount,
  currency: 'TRY',
  startDate,
  interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2,
  dayCountBasis: 365,
  fixedRate,
});

describe('CHARACTERIZATION: payment boundary + END_OF_DAY default', () => {
  // (PR-3) TZ pin YOK — day-count-calculator UTC-anchored, değerler server-TZ'den bağımsız.

  // ───────────────────────────────────────────────────────────────────────────
  // KATMAN A — Default resolution (PR-2'de FLIP edecek pinler)
  // ───────────────────────────────────────────────────────────────────────────
  describe('A — sistem varsayılanı START_OF_DAY (PR-2 sonrası)', () => {
    it('Zod CalculationOptionsSchema default = START_OF_DAY', () => {
      const parsed = CalculationOptionsSchema.parse({});
      expect(parsed.sameDayPaymentRule).toBe(SameDayPaymentRule.START_OF_DAY);
    });

    it('5 case-type stratejisinin TÜMÜ START_OF_DAY', () => {
      const strategies = [
        new KambiyoSenediStrategy(),
        new IlamsizGenelStrategy(),
        new IlamliStrategy(),
        new TTK1530Strategy(),
        new KiraAlacagiStrategy(),
      ];
      expect(strategies).toHaveLength(5);
      for (const s of strategies) {
        expect(s.getPolicyConfig().sameDayPaymentRule).toBe('START_OF_DAY');
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // KATMAN B — Timeline boundary (generateTimeline)
  // P = 2025-01-15; END_OF_DAY → P+1 (2025-01-16), START_OF_DAY → P (2025-01-15)
  // ───────────────────────────────────────────────────────────────────────────
  describe('B — payment boundary timeline', () => {
    const rate = createMockRate('r1', '2025-01-01', null, 0.5);

    it('END_OF_DAY: ödeme sınırı P+1 (2025-01-16)', () => {
      const timeline = generateTimeline('2025-01-01', '2025-01-31', [rate], {
        paymentDates: ['2025-01-15'],
        sameDayPaymentRule: SameDayPaymentRule.END_OF_DAY,
      });
      expect(timeline).toEqual(['2025-01-01', '2025-01-16', '2025-01-31']);
    });

    it('START_OF_DAY (kontrast): ödeme sınırı P (2025-01-15)', () => {
      const timeline = generateTimeline('2025-01-01', '2025-01-31', [rate], {
        paymentDates: ['2025-01-15'],
        sameDayPaymentRule: SameDayPaymentRule.START_OF_DAY,
      });
      expect(timeline).toEqual(['2025-01-01', '2025-01-15', '2025-01-31']);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // KATMAN C — Segment sonucu (segment-builder.buildSegments)
  // Principal sabit + tek oran → boundary segment BÖLÜNMESİNİ değiştirir;
  // per-segment HALF_UP rounding ile toplam 0.01 farklanır (4109.58 vs 4109.59).
  // NOT: principal-indirimi (gerçek tutar etkisi) allocation katmanındadır — ayrı.
  // ───────────────────────────────────────────────────────────────────────────
  describe('C — segment-builder payment boundary etkisi', () => {
    const segmentBuilder = new SegmentBuilderService();
    const rate = createMockRate('r1', '2025-01-01', null, 0.5);
    const claim = createMockClaimBucket('c1', 100000, '2025-01-01');
    const baseOpts = {
      dayCountBasis: 365 as DayCountBasis,
      roundingMode: RoundingMode.HALF_UP,
      roundingScope: RoundingScope.PER_SEGMENT,
      paymentDates: ['2025-01-15'],
    };

    it('END_OF_DAY: split 15/15 gün, segment 2054.79/2054.79, total 4109.58', () => {
      const res = segmentBuilder.buildSegments(claim, '2025-01-31', [rate], {
        ...baseOpts,
        sameDayPaymentRule: SameDayPaymentRule.END_OF_DAY,
      });
      expect(res.timeline).toEqual(['2025-01-01', '2025-01-16', '2025-01-31']);
      expect(res.segments).toHaveLength(2);
      expect(res.segments[0]).toMatchObject({
        periodStart: '2025-01-01',
        periodEnd: '2025-01-16',
        days: 15,
        segmentInterest: 2054.79,
      });
      expect(res.segments[1]).toMatchObject({
        periodStart: '2025-01-16',
        periodEnd: '2025-01-31',
        days: 15,
        segmentInterest: 2054.79,
      });
      expect(res.totalInterest).toBe(4109.58);
    });

    it('START_OF_DAY (kontrast): split 14/16 gün, segment 1917.81/2191.78, total 4109.59', () => {
      const res = segmentBuilder.buildSegments(claim, '2025-01-31', [rate], {
        ...baseOpts,
        sameDayPaymentRule: SameDayPaymentRule.START_OF_DAY,
      });
      expect(res.timeline).toEqual(['2025-01-01', '2025-01-15', '2025-01-31']);
      expect(res.segments).toHaveLength(2);
      expect(res.segments[0]).toMatchObject({
        periodStart: '2025-01-01',
        periodEnd: '2025-01-15',
        days: 14,
        segmentInterest: 1917.81,
      });
      expect(res.segments[1]).toMatchObject({
        periodStart: '2025-01-15',
        periodEnd: '2025-01-31',
        days: 16,
        segmentInterest: 2191.78,
      });
      expect(res.totalInterest).toBe(4109.59);
    });
  });
});
