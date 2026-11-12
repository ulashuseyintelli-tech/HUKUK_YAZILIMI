import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { DueType } from '../../../case/dto/case.dto';
import { mapDueTypeToClaimItemType } from '../../../case/due-to-claim-item.mapper';
import { sumClaimSummaryTotals } from '../../../claim-item/claim-summary-currency';
import { CreateClaimItemDto } from '../../../claim-item/dto/claim-item.dto';
import { defaultInterestAccrualStatusForItemType } from '../../../claim-item/interest-accrual-policy';
import { computeTemplateTotals, getClaimItemTypeLabel } from '../../../template-engine/template-case-classification';
import { TBK100AllocatorService } from '../../allocation/tbk100-allocator.service';
import { AncillaryType, TBK100_ALLOCATION_ORDER } from '../../types/domain.types';
import { classifyClaimItemType, isCostItemType, mapItemTypeToAncillary } from '../claim-item-classifier';

/**
 * Yargılama Gideri türü (owner 12.11.2026 GO-COMPLETE "P02 yargılama gideri temsil engelini gider").
 *
 * Kanıtlanan:
 *  1. Kayıt: DueType.YARGILAMA_GIDERI → ClaimItemType.YARGILAMA_GIDERI (EXPENSE değil); claim-item DTO türü kabul eder.
 *  2. Motor: masraf kademesi (COST), kendi yardımcı türü AncillaryType.YARGILAMA_GIDERI — TEBLIGAT_MASRAFI ile birleşmez;
 *     TBK 100 dağıtımında ayrı satır ("Yargılama Gideri"), tutar bir kez dağıtılır.
 *  3. Faiz: tür eklenmesi faiz kararı DEĞİL — açık değer yoksa varsayılan UNKNOWN (EXPENSE'in NO_INTEREST varsayılanı değişmedi).
 *  4. Özet / belge: masraf toplamına TEK KEZ girer ("Diğer"e düşmez); belge etiketi "Yargılama Gideri".
 *  5. Gerileme: EXPENSE → TEBLIGAT_MASRAFI, KOMISYON → EXPENSE ve diğer eski eşlemeler AYNEN.
 */
describe('Yargılama Gideri türü — kayıt / motor / özet / belge temsili ve eski türlerin değişmezliği', () => {
  it('kayıt: DueType.YARGILAMA_GIDERI kendi ClaimItem türüne gider; eski eşlemeler aynen', () => {
    expect(mapDueTypeToClaimItemType(DueType.YARGILAMA_GIDERI)).toBe('YARGILAMA_GIDERI');
    expect(mapDueTypeToClaimItemType(DueType.EXPENSE)).toBe('EXPENSE');
    expect(mapDueTypeToClaimItemType(DueType.KOMISYON)).toBe('EXPENSE');
    expect(mapDueTypeToClaimItemType(DueType.VEKALET_UCRETI)).toBe('ATTORNEY_FEE');
    expect(mapDueTypeToClaimItemType(DueType.OTHER)).toBe('OTHER');
    expect(mapDueTypeToClaimItemType(DueType.NAFAKA)).toBeNull();
  });

  it('kayıt: alacak kalemi DTO YARGILAMA_GIDERI türünü kabul eder, bilinmeyen türü reddeder', () => {
    const ok = plainToInstance(CreateClaimItemDto, { caseId: 'c-1', itemType: 'YARGILAMA_GIDERI', amount: 415 });
    expect(validateSync(ok).filter((e) => e.property === 'itemType')).toHaveLength(0);
    const bad = plainToInstance(CreateClaimItemDto, { caseId: 'c-1', itemType: 'TEBLIGAT_YARGILAMA', amount: 415 });
    expect(validateSync(bad).filter((e) => e.property === 'itemType')).toHaveLength(1);
  });

  it('motor: YARGILAMA_GIDERI masraf kademesinde kendi yardımcı türüyle; EXPENSE hâlâ TEBLIGAT_MASRAFI', () => {
    expect(mapItemTypeToAncillary('YARGILAMA_GIDERI')).toBe(AncillaryType.YARGILAMA_GIDERI);
    expect(mapItemTypeToAncillary('YARGILAMA_GIDERI')).not.toBe(AncillaryType.TEBLIGAT_MASRAFI);
    expect(isCostItemType('YARGILAMA_GIDERI')).toBe(true);
    expect(classifyClaimItemType('YARGILAMA_GIDERI')).toEqual({ category: 'COST', ancillaryType: AncillaryType.YARGILAMA_GIDERI });
    // Gerileme: eski türler aynen.
    expect(classifyClaimItemType('EXPENSE')).toEqual({ category: 'COST', ancillaryType: AncillaryType.TEBLIGAT_MASRAFI });
    expect(classifyClaimItemType('FEE')).toEqual({ category: 'COST', ancillaryType: AncillaryType.HARC });
    expect(classifyClaimItemType('ATTORNEY_FEE')).toEqual({ category: 'ANCILLARY', ancillaryType: AncillaryType.VEKALET_UCRETI });
    expect(classifyClaimItemType('OTHER')).toEqual({ category: 'ANCILLARY', ancillaryType: AncillaryType.DIGER });
    // Belgelenmiş TBK 100 sırası: masraf kademesinde, fer'ilerden önce.
    expect(TBK100_ALLOCATION_ORDER.indexOf(AncillaryType.YARGILAMA_GIDERI)).toBeLessThan(TBK100_ALLOCATION_ORDER.indexOf(AncillaryType.VEKALET_UCRETI));
  });

  it('motor: TBK 100 dağıtımında yargılama gideri ayrı satır; tebligat masrafıyla birleşmez, tutar bir kez dağıtılır', () => {
    const allocator = new TBK100AllocatorService();
    const debt = {
      principal: 1000,
      accruedInterest: 50,
      costs: new Map<AncillaryType, number>([
        [AncillaryType.TEBLIGAT_MASRAFI, 100],
        [AncillaryType.YARGILAMA_GIDERI, 415],
      ]),
      ancillaries: new Map<AncillaryType, number>([[AncillaryType.VEKALET_UCRETI, 12500]]),
    };
    const res = allocator.allocate(300, debt);
    const byLabel = Object.fromEntries(res.allocations.map((a) => [a.label, a.amountAllocated]));
    expect(byLabel['Tebligat Masrafı']).toBe(100);
    expect(byLabel['Yargılama Gideri']).toBe(200);
    expect(res.allocations.filter((a) => a.label === 'Yargılama Gideri')).toHaveLength(1);
    expect(res.remainingPayment).toBe(0);
    expect(res.newDebtState.costs.get(AncillaryType.YARGILAMA_GIDERI)).toBe(215);
    expect(res.newDebtState.costs.get(AncillaryType.TEBLIGAT_MASRAFI)).toBe(0);
    // Faiz ve anapara masraflar ödenmeden dağıtım almaz.
    expect(res.newDebtState.accruedInterest).toBe(50);
    expect(res.newDebtState.principal).toBe(1000);
  });

  it('faiz: tür eklenmesi faiz kararı değil — YARGILAMA_GIDERI varsayılanı UNKNOWN; EXPENSE varsayılanı NO_INTEREST (değişmedi)', () => {
    expect(defaultInterestAccrualStatusForItemType('YARGILAMA_GIDERI')).toBe('UNKNOWN');
    expect(defaultInterestAccrualStatusForItemType('EXPENSE')).toBe('NO_INTEREST');
    expect(defaultInterestAccrualStatusForItemType('PRINCIPAL')).toBe('UNKNOWN');
  });

  it('hesap özeti: yargılama gideri masraf toplamına TEK KEZ girer, "Diğer"e düşmez; genel toplam bir kez sayar', () => {
    const totals = sumClaimSummaryTotals([
      { itemType: 'ATTORNEY_FEE', amount: 12500, currency: 'TRY' },
      { itemType: 'YARGILAMA_GIDERI', amount: 415, currency: 'TRY' },
      { itemType: 'EXPENSE', amount: 100, currency: 'TRY' },
    ]);
    expect(totals.expense).toBe(515);
    expect(totals.attorneyFee).toBe(12500);
    expect(totals.other).toBe(0);
    expect(totals.grandTotal).toBe(13015);
  });

  it('belge: etiket "Yargılama Gideri" (tebligat / masraf etiketi DEĞİL); toplamda masraf kovasında bir kez', () => {
    expect(getClaimItemTypeLabel('YARGILAMA_GIDERI')).toBe('Yargılama Gideri');
    expect(getClaimItemTypeLabel('EXPENSE')).toBe('Masraf');
    const t = computeTemplateTotals(
      [
        { type: 'ATTORNEY_FEE', amount: 12500 },
        { type: 'YARGILAMA_GIDERI', amount: 415 },
      ],
      'TRY',
    );
    expect(t).toEqual({ principal: 0, interest: 0, fees: 12915, total: 12915, currency: 'TRY' });
  });
});
