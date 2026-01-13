/**
 * Task 10.1 - Legal Text Templates
 * 
 * Her InterestTypeCode için Türkçe hukuki metin
 * Mahkemeye sunulabilir format
 */

import { InterestTypeCode } from '../types/domain.types';
import { CalculationMode, RoundingMode, RoundingScope, SameDayPaymentRule } from '../types/common.types';

// ═══════════════════════════════════════════════════════════════════════════
// INTEREST TYPE LEGAL TEXTS
// ═══════════════════════════════════════════════════════════════════════════

export const INTEREST_TYPE_LEGAL_TEXTS: Record<InterestTypeCode, string> = {
  [InterestTypeCode.LEGAL_3095]: 
    '3095 sayılı Kanuni Faiz ve Temerrüt Faizine İlişkin Kanun m.1 uyarınca yasal faiz',
  
  [InterestTypeCode.COMMERCIAL_AVANS_3095_2_2]: 
    '3095 sayılı Kanun m.2/2 uyarınca ticari işlerde temerrüt faizi (TCMB kısa vadeli avans işlemlerinde uygulanan faiz oranı)',
  
  [InterestTypeCode.COMMERCIAL_FIXED]: 
    'Taraflar arasındaki sözleşme hükümleri uyarınca sabit oranlı ticari faiz',
  
  [InterestTypeCode.TTK_1530]: 
    '6102 sayılı Türk Ticaret Kanunu m.1530 uyarınca geç ödeme faizi',
  
  [InterestTypeCode.CONTRACTUAL]: 
    'Taraflar arasındaki sözleşme hükümleri uyarınca akdi faiz',
  
  [InterestTypeCode.MEVDUAT_TL_BANKALARCA]: 
    'Bankalarca uygulanan TL mevduat faiz oranı',
  
  [InterestTypeCode.MEVDUAT_USD_BANKALARCA]: 
    'Bankalarca uygulanan USD mevduat faiz oranı',
  
  [InterestTypeCode.MEVDUAT_EUR_BANKALARCA]: 
    'Bankalarca uygulanan EUR mevduat faiz oranı',
  
  [InterestTypeCode.MEVDUAT_TL_KAMU]: 
    'Kamu bankalarınca uygulanan TL mevduat faiz oranı',
  
  [InterestTypeCode.MEVDUAT_USD_KAMU]: 
    'Kamu bankalarınca uygulanan USD mevduat faiz oranı',
  
  [InterestTypeCode.MEVDUAT_EUR_KAMU]: 
    'Kamu bankalarınca uygulanan EUR mevduat faiz oranı',
};

// ═══════════════════════════════════════════════════════════════════════════
// DAY COUNT RULE TEXTS
// ═══════════════════════════════════════════════════════════════════════════

export const DAY_COUNT_RULE_TEXTS: Record<number, string> = {
  365: 'Fiili gün / 365 (Actual/365)',
  360: 'Fiili gün / 360 (Actual/360)',
};

// ═══════════════════════════════════════════════════════════════════════════
// ROUNDING MODE TEXTS
// ═══════════════════════════════════════════════════════════════════════════

export const ROUNDING_MODE_TEXTS: Record<RoundingMode, string> = {
  [RoundingMode.HALF_UP]: 'Yarım yukarı yuvarlama (0.005 → 0.01)',
  [RoundingMode.BANKERS]: 'Bankacı yuvarlaması (en yakın çift sayıya)',
};

export const ROUNDING_SCOPE_TEXTS: Record<RoundingScope, string> = {
  [RoundingScope.PER_SEGMENT]: 'Her segment sonunda yuvarlama',
  [RoundingScope.TOTAL_ONLY]: 'Sadece toplam tutarda yuvarlama',
};

// ═══════════════════════════════════════════════════════════════════════════
// SAME DAY PAYMENT RULE TEXTS
// ═══════════════════════════════════════════════════════════════════════════

export const SAME_DAY_PAYMENT_TEXTS: Record<SameDayPaymentRule, string> = {
  [SameDayPaymentRule.END_OF_DAY]: 'Ödeme gün sonunda uygulanmıştır (ödeme günü faiz işler)',
  [SameDayPaymentRule.START_OF_DAY]: 'Ödeme gün başında uygulanmıştır (ödeme günü faiz işlemez)',
};

// ═══════════════════════════════════════════════════════════════════════════
// DISCLAIMER TEXTS
// ═══════════════════════════════════════════════════════════════════════════

export const PREVIEW_DISCLAIMER = `
⚠️ BU BİR ÖNİZLEMEDİR - RESMİ HESAPLAMA DEĞİLDİR

Bu hesaplama sonucu yalnızca bilgilendirme amaçlıdır.
Mahkemeye veya resmi kurumlara sunulamaz.
Oran tablosunda eksiklik olabilir.
Kesin hesaplama için "Hesapla" butonunu kullanınız.
`.trim();

export const PREVIEW_DISCLAIMER_SHORT = 
  'Bu bir önizlemedir, resmi hesaplama değildir.';

// ═══════════════════════════════════════════════════════════════════════════
// LEGAL TEXT BUILDER
// ═══════════════════════════════════════════════════════════════════════════

export interface LegalTextOptions {
  interestType: InterestTypeCode;
  dayCountBasis: 365 | 360;
  roundingMode: RoundingMode;
  roundingScope: RoundingScope;
  sameDayPaymentRule?: SameDayPaymentRule;
  rates: { rate: number; source: string }[];
  mode: CalculationMode;
}

export function buildLegalText(options: LegalTextOptions): string {
  const lines: string[] = [];

  // Interest type
  lines.push(INTEREST_TYPE_LEGAL_TEXTS[options.interestType] + ' uyarınca hesaplanan faiz.');
  lines.push('');

  // Rate information
  const uniqueRates = [...new Set(options.rates.map(r => r.rate))];
  if (uniqueRates.length > 1) {
    lines.push('Dönemsel oran değişiklikleri dikkate alınmıştır.');
    lines.push(`Uygulanan oranlar: ${uniqueRates.map(r => `%${(r * 100).toFixed(2)}`).join(', ')}`);
  } else if (uniqueRates.length === 1) {
    lines.push(`Uygulanan oran: %${(uniqueRates[0] * 100).toFixed(2)}`);
  }
  lines.push('');

  // Day count rule
  lines.push(`Gün sayımı kuralı: ${DAY_COUNT_RULE_TEXTS[options.dayCountBasis]}`);

  // Same-day payment rule
  if (options.sameDayPaymentRule) {
    lines.push(SAME_DAY_PAYMENT_TEXTS[options.sameDayPaymentRule]);
  }

  // Rounding
  lines.push(`Yuvarlama: ${ROUNDING_MODE_TEXTS[options.roundingMode]}, ${ROUNDING_SCOPE_TEXTS[options.roundingScope]}`);

  // Disclaimer for PREVIEW
  if (options.mode === CalculationMode.PREVIEW) {
    lines.push('');
    lines.push(PREVIEW_DISCLAIMER_SHORT);
  }

  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// ALLOCATION LEGAL TEXT
// ═══════════════════════════════════════════════════════════════════════════

export const TBK100_ALLOCATION_TEXT = `
6098 sayılı Türk Borçlar Kanunu m.100 uyarınca ödeme mahsubu:
1. Öncelikle işlemiş faize,
2. Sonra masraflara,
3. Ardından fer'i alacaklara,
4. En son anaparaya mahsup edilmiştir.
`.trim();

export const CLAIM_PRIORITY_TEXTS = {
  OLDEST_DUE_FIRST: 'Alacak kalemleri vadesi en eski olandan başlayarak sıralanmıştır.',
  HIGHEST_RATE_FIRST: 'Alacak kalemleri faiz oranı en yüksek olandan başlayarak sıralanmıştır.',
  CUSTOM: 'Alacak kalemleri belirlenen öncelik sırasına göre sıralanmıştır.',
};
