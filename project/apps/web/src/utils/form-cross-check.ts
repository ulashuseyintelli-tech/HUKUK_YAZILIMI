/**
 * Form Cross-Check Utility
 * Form seçimi ile veri tutarlılığını kontrol eder
 */

import { FormMetadata } from '@/types/form-metadata';

export interface CaseData {
  hasJudgment?: boolean;
  hasKambiyoSenedi?: boolean;
  hasMortgage?: boolean;
  hasRentalContract?: boolean;
  debtorType?: 'INDIVIDUAL' | 'COMPANY' | 'PUBLIC_INSTITUTION';
}

// Alias for test compatibility
export interface CaseDataForCheck {
  hasKambiyoDocument?: boolean;
  isRentalClaim?: boolean;
  hasMortgage?: boolean;
  hasJudgment?: boolean;
}

export interface CrossCheckResult {
  isConsistent: boolean;
  isValid: boolean; // Alias for isConsistent
  warnings: CrossCheckWarning[];
  warning?: string;
  suggestedFormCode?: string;
  suggestedForm?: FormMetadata;
}

export interface CrossCheckWarning {
  type: 'KAMBIYO_MISMATCH' | 'RENTAL_MISMATCH' | 'JUDGMENT_MISMATCH' | 'MORTGAGE_MISMATCH';
  message: string;
  severity: 'warning' | 'error';
  suggestedFormCode?: string;
}

/**
 * Form seçimi ile veri tutarlılığını kontrol et
 */
export function checkFormConsistency(
  selectedForm: FormMetadata,
  caseData: CaseData | CaseDataForCheck
): CrossCheckResult {
  const warnings: CrossCheckWarning[] = [];

  // Normalize case data (support both interfaces)
  const normalizedData = {
    hasKambiyoSenedi: 'hasKambiyoDocument' in caseData ? caseData.hasKambiyoDocument : (caseData as CaseData).hasKambiyoSenedi,
    hasRentalContract: 'isRentalClaim' in caseData ? caseData.isRentalClaim : (caseData as CaseData).hasRentalContract,
    hasMortgage: caseData.hasMortgage,
    hasJudgment: caseData.hasJudgment,
  };

  // Property 11: Kambiyo tutarsızlığı
  if (normalizedData.hasKambiyoSenedi !== undefined) {
    if (normalizedData.hasKambiyoSenedi && !selectedForm.isKambiyo) {
      warnings.push({
        type: 'KAMBIYO_MISMATCH',
        message: 'Kambiyo senedi (çek/senet) var ancak kambiyo takibi seçilmedi.',
        severity: 'warning',
        suggestedFormCode: 'FORM_10',
      });
    }

    if (!normalizedData.hasKambiyoSenedi && selectedForm.isKambiyo) {
      warnings.push({
        type: 'KAMBIYO_MISMATCH',
        message: 'Kambiyo takibi seçildi ancak kambiyo senedi belirtilmedi.',
        severity: 'warning',
        suggestedFormCode: 'FORM_7',
      });
    }
  }

  // Property 12: Kira tutarsızlığı
  if (normalizedData.hasRentalContract !== undefined) {
    if (normalizedData.hasRentalContract && !selectedForm.isRental) {
      warnings.push({
        type: 'RENTAL_MISMATCH',
        message: 'Kira sözleşmesi var ancak kira takibi seçilmedi.',
        severity: 'warning',
        suggestedFormCode: 'FORM_13',
      });
    }

    if (!normalizedData.hasRentalContract && selectedForm.isRental) {
      warnings.push({
        type: 'RENTAL_MISMATCH',
        message: 'Kira takibi seçildi ancak kira sözleşmesi belirtilmedi.',
        severity: 'warning',
        suggestedFormCode: 'FORM_7',
      });
    }
  }

  // İlam tutarsızlığı
  if (normalizedData.hasJudgment !== undefined) {
    if (normalizedData.hasJudgment && !selectedForm.hasJudgment) {
      warnings.push({
        type: 'JUDGMENT_MISMATCH',
        message: 'Mahkeme kararı (ilam) var ancak ilamsız takip seçildi.',
        severity: 'warning',
        suggestedFormCode: 'FORM_2_3_4_5',
      });
    }

    if (!normalizedData.hasJudgment && selectedForm.hasJudgment) {
      warnings.push({
        type: 'JUDGMENT_MISMATCH',
        message: 'İlamlı takip seçildi ancak mahkeme kararı belirtilmedi.',
        severity: 'error',
        suggestedFormCode: 'FORM_7',
      });
    }
  }

  // İpotek/Rehin tutarsızlığı
  if (normalizedData.hasMortgage !== undefined) {
    if (normalizedData.hasMortgage && !selectedForm.needsMortgage) {
      warnings.push({
        type: 'MORTGAGE_MISMATCH',
        message: 'İpotek/rehin var ancak rehinli takip seçilmedi.',
        severity: 'warning',
        suggestedFormCode: normalizedData.hasJudgment ? 'FORM_6' : 'FORM_9',
      });
    }

    if (!normalizedData.hasMortgage && selectedForm.needsMortgage) {
      warnings.push({
        type: 'MORTGAGE_MISMATCH',
        message: 'Rehinli takip seçildi ancak ipotek/rehin belirtilmedi.',
        severity: 'error',
        suggestedFormCode: 'FORM_7',
      });
    }
  }

  // En yüksek öncelikli öneriyi belirle
  const suggestedFormCode = warnings.find((w) => w.severity === 'error')?.suggestedFormCode ||
                           warnings[0]?.suggestedFormCode;

  const isValid = warnings.length === 0;

  return {
    isConsistent: isValid,
    isValid,
    warnings,
    warning: warnings[0]?.message,
    suggestedFormCode,
  };
}

/**
 * Uyarı mesajını kullanıcı dostu formata çevir
 */
export function formatWarningMessage(warning: CrossCheckWarning): string {
  return warning.message;
}

/**
 * Tüm uyarıları tek bir mesaj olarak birleştir
 */
export function combineWarnings(warnings: CrossCheckWarning[]): string {
  if (warnings.length === 0) return '';
  if (warnings.length === 1) return warnings[0].message;
  
  return warnings.map((w) => `• ${w.message}`).join('\n');
}
