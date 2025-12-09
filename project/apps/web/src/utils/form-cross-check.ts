import { FormMetadata } from "@/types/form-metadata";
import { formMetadata } from "@/config/form-metadata";

export interface CrossCheckResult {
  isValid: boolean;
  warning?: string;
  suggestedForm?: FormMetadata;
  suggestedFormCode?: string;
}

export interface CaseDataForCheck {
  hasKambiyoDocument?: boolean;
  isRentalClaim?: boolean;
  hasMortgage?: boolean;
  hasJudgment?: boolean;
}

/**
 * Cross-check form selection against case data
 * Returns warning if there's an inconsistency
 */
export function checkFormConsistency(
  selectedForm: FormMetadata,
  caseData: CaseDataForCheck
): CrossCheckResult {
  // Check 1: Kambiyo form selected but no kambiyo document
  if (selectedForm.isKambiyo && caseData.hasKambiyoDocument === false) {
    const suggestedForm = formMetadata.find((f) => f.code === "FORM_7");
    return {
      isValid: false,
      warning:
        "Kambiyo senedi olmadan kambiyo takibi yapılamaz. İlamsız İcra (Form 7) daha uygun görünüyor.",
      suggestedForm,
      suggestedFormCode: "FORM_7",
    };
  }

  // Check 2: Non-rental form selected but rental claim indicated
  if (!selectedForm.isRental && caseData.isRentalClaim === true) {
    const suggestedForm = formMetadata.find((f) => f.code === "FORM_13");
    return {
      isValid: false,
      warning:
        "Kira alacakları için özel form mevcut (Form 13). Kira Alacağı Takibi daha uygun görünüyor.",
      suggestedForm,
      suggestedFormCode: "FORM_13",
    };
  }

  // Check 3: Non-mortgage form selected but mortgage indicated
  if (!selectedForm.needsMortgage && caseData.hasMortgage === true) {
    const suggestedForm = caseData.hasJudgment
      ? formMetadata.find((f) => f.code === "FORM_6")
      : formMetadata.find((f) => f.code === "FORM_9");
    return {
      isValid: false,
      warning: `İpotek/rehin alacakları için özel form mevcut. ${
        caseData.hasJudgment ? "İpotekli İlamlı Takip (Form 6)" : "İpotekli İlamsız Takip (Form 9)"
      } daha uygun görünüyor.`,
      suggestedForm,
      suggestedFormCode: caseData.hasJudgment ? "FORM_6" : "FORM_9",
    };
  }

  // Check 4: İlamsız form selected but judgment indicated
  if (!selectedForm.hasJudgment && caseData.hasJudgment === true && !selectedForm.isKambiyo) {
    const suggestedForm = formMetadata.find((f) => f.code === "FORM_2_3_4_5");
    return {
      isValid: false,
      warning:
        "İlam varken ilamsız takip yerine İlamlı İcra (Form 2-3-4-5) daha uygun görünüyor.",
      suggestedForm,
      suggestedFormCode: "FORM_2_3_4_5",
    };
  }

  return { isValid: true };
}

/**
 * Get form by code
 */
export function getFormByCode(code: string): FormMetadata | undefined {
  return formMetadata.find((f) => f.code === code);
}
