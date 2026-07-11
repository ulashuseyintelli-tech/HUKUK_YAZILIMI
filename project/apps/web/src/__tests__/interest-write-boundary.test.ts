import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  buildUiInterestWriteIntent,
  getInterestReadDisplayLabel,
  mapApiToUiInterestType,
  mapUiToApiInterestType,
} from '../lib/interest-type-resolver';
import { buildCreateCaseDuesPayload, formatCaseDueValidationError } from '../lib/case-due-payload';

describe('PR-A2 frontend rich interest write boundary', () => {
  it.each([
    ['YASAL', 'LEGAL_3095', 'YASAL'],
    ['TICARI_DEGISEN', 'COMMERCIAL_AVANS_3095_2_2', 'TICARI'],
    ['BANKA_TL', 'MEVDUAT_TL_BANKALARCA', null],
    ['KAMU_BANKA_TL', 'MEVDUAT_TL_KAMU', null],
  ] as const)('%s intentini exact variable rich code olarak kurar', (uiType, code, legacy) => {
    expect(buildUiInterestWriteIntent(uiType, 99)).toEqual({
      interestTypeCode: code,
      interestType: legacy,
      interestRate: null,
      interestAccrualStatus: 'UNKNOWN',
    });
  });

  it.each([
    ['TICARI_SABIT', 'COMMERCIAL_FIXED', 'SABIT'],
    ['AKDI', 'CONTRACTUAL', null],
  ] as const)('%s için pozitif sabit oranı taşır', (uiType, code, legacy) => {
    expect(buildUiInterestWriteIntent(uiType, 18.5)).toEqual({
      interestTypeCode: code,
      interestType: legacy,
      interestRate: 18.5,
      interestAccrualStatus: 'UNKNOWN',
    });
  });

  it('YOK niyetini omission veya YOKSUN yapmadan korur', () => {
    expect(buildUiInterestWriteIntent('YOK', null, '  sözleşmede faiz yok  ')).toEqual({
      interestTypeCode: null,
      interestType: null,
      interestRate: null,
      interestAccrualStatus: 'NO_INTEREST',
      noInterestReason: 'sözleşmede faiz yok',
    });
  });

  it('unknown, eksik fixed rate ve gerekçesiz YOK için fail-closed olur', () => {
    expect(() => mapUiToApiInterestType('UNKNOWN' as any)).toThrow(/Bilinmeyen/);
    expect(() => buildUiInterestWriteIntent('AKDI')).toThrow(/oran/);
    expect(() => buildUiInterestWriteIntent('TICARI_SABIT', 0)).toThrow(/oran/);
    expect(() => buildUiInterestWriteIntent('YOK')).toThrow(/gerekçe/);
  });

  it('payload rich intenti ve null variable oranı düşürmez', () => {
    const [payload] = buildCreateCaseDuesPayload([{
      type: 'PRINCIPAL', amount: '1000', dueDate: '2026-01-01',
      interestType: 'YASAL', interestTypeCode: 'LEGAL_3095', interestRate: null,
      interestAccrualStatus: 'UNKNOWN',
    }]);
    expect(payload).toMatchObject({
      interestType: 'YASAL', interestTypeCode: 'LEGAL_3095', interestRate: null,
      interestAccrualStatus: 'UNKNOWN',
    });
  });

  it('nested backend alan yolunu indeksli kullanıcı mesajına dönüştürür', () => {
    expect(formatCaseDueValidationError({ body: { message: ['dues.0.interestTypeCode must be a valid enum value'] } }))
      .toBe('1. alacak kalemindeki faiz türü geçersiz.');
    expect(formatCaseDueValidationError({ body: { message: ['dues.1.interestRate must be a number'] } }))
      .toBe('2. alacak kalemindeki sabit faiz oranı geçersiz veya eksik.');
    expect(formatCaseDueValidationError({ body: { message: ['unrelated error'] } })).toBeNull();
  });

  it('PR-A3 rich-only presentation exact label kullanır ve false-YASAL fallback yapmaz', () => {
    expect(getInterestReadDisplayLabel({ interestTypeCode: 'CONTRACTUAL', interestType: null }))
      .toBe('Sözleşmesel (Akdi) Faiz');
    expect(getInterestReadDisplayLabel({ interestTypeCode: 'TTK_1530', interestType: null }))
      .toBe('TTK 1530 Geç Ödeme Faizi');
    expect(getInterestReadDisplayLabel({ interestTypeCode: 'MEVDUAT_USD_BANKALARCA', interestType: null }))
      .toBe('Bankalarca Uygulanan USD Mevduat Faizi');
    expect(getInterestReadDisplayLabel({ interestTypeCode: null, interestType: null })).toBeNull();
  });

  it('PR-A3 NO_INTEREST presentation precedence ve unknown rich fail-closed davranışını korur', () => {
    expect(getInterestReadDisplayLabel({
      interestAccrualStatus: 'NO_INTEREST',
      interestTypeCode: 'LEGAL_3095',
      interestType: 'YASAL',
    })).toBe('Faiz Yok');
    expect(() => mapApiToUiInterestType('UNKNOWN')).toThrow(/Bilinmeyen API faiz türü/);
    expect(() => getInterestReadDisplayLabel({ interestTypeCode: 'UNKNOWN' })).toThrow(/Bilinmeyen API faiz türü/);
  });

  it('PR-A3 active ClaimItem ve Due read yüzeyleri ortak rich-first label resolver kullanır', () => {
    const claimItemPanel = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/claim-item/ClaimItemPanel.tsx'),
      'utf8',
    );
    const caseDetail = fs.readFileSync(
      path.resolve(process.cwd(), 'src/app/(dashboard)/cases/[id]/page.tsx'),
      'utf8',
    );
    expect(claimItemPanel).toContain('getInterestReadDisplayLabel(item)');
    expect(caseDetail).toContain('getInterestReadDisplayLabel(due)');
    expect(caseDetail).not.toContain("(caseData.type === 'CHECK' || caseData.type === 'BOND') ? 'Ticari (TCMB Avans)' : 'Yasal Faiz'");
  });
});
