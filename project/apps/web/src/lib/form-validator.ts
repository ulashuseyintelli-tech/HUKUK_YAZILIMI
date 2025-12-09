/**
 * Form Validation & Auto-Correction System
 * Hatalı form seçimini tespit eder ve doğru formu önerir
 */

export interface FormValidationInput {
  formCode: string;
  documentType?: 'GENERAL' | 'CHECK' | 'BOND' | 'RENTAL' | 'MORTGAGE';
  hasJudgment?: boolean;
  hasMortgage?: boolean;
  isEviction?: boolean;
  debtAmount?: number;
}

export interface FormValidationResult {
  isValid: boolean;
  suggestedFormCode: string | null;
  suggestedFormName: string | null;
  warning: string | null;
  severity: 'error' | 'warning' | 'info' | null;
  legalReference: string | null;
}

// Form metadata for validation
const FORM_RULES: Record<string, {
  isKambiyo: boolean;
  needsMortgage: boolean;
  isRental: boolean;
  hasJudgment: boolean;
}> = {
  'FORM_7': { isKambiyo: false, needsMortgage: false, isRental: false, hasJudgment: false },
  'FORM_10': { isKambiyo: true, needsMortgage: false, isRental: false, hasJudgment: false },
  'FORM_11': { isKambiyo: true, needsMortgage: false, isRental: false, hasJudgment: false },
  'FORM_45': { isKambiyo: false, needsMortgage: true, isRental: false, hasJudgment: false },
  'FORM_148': { isKambiyo: false, needsMortgage: false, isRental: false, hasJudgment: false },
  'FORM_KIRA_ALACAK': { isKambiyo: false, needsMortgage: false, isRental: true, hasJudgment: false },
  'FORM_TAHLIYE': { isKambiyo: false, needsMortgage: false, isRental: true, hasJudgment: false },
};

export function validateFormSelection(input: FormValidationInput): FormValidationResult {
  const selectedFormRules = FORM_RULES[input.formCode];
  
  if (!selectedFormRules) {
    return {
      isValid: true,
      suggestedFormCode: null,
      suggestedFormName: null,
      warning: null,
      severity: null,
      legalReference: null,
    };
  }

  // 1. İpotek kontrolü (en yüksek öncelik)
  if (input.hasMortgage && !selectedFormRules.needsMortgage) {
    return {
      isValid: false,
      suggestedFormCode: 'FORM_45',
      suggestedFormName: 'Form 45 - İpoteğin Paraya Çevrilmesi',
      warning: 'İpotekli alacaklar için Form 45 kullanılmalıdır. Seçtiğiniz form ipotek takibi için uygun değil.',
      severity: 'error',
      legalReference: 'İİK m. 148-150',
    };
  }

  // 2. Kambiyo senedi kontrolü
  if (input.documentType === 'CHECK' && !selectedFormRules.isKambiyo) {
    return {
      isValid: false,
      suggestedFormCode: 'FORM_10',
      suggestedFormName: 'Form 10 - Çeke Dayalı Kambiyo Takibi',
      warning: 'Çek takipleri için Form 10 kullanılmalıdır. Kambiyo senetleri özel takip prosedürüne tabidir.',
      severity: 'error',
      legalReference: 'İİK m. 167-176',
    };
  }

  if (input.documentType === 'BOND' && !selectedFormRules.isKambiyo) {
    return {
      isValid: false,
      suggestedFormCode: 'FORM_11',
      suggestedFormName: 'Form 11 - Senede Dayalı Kambiyo Takibi',
      warning: 'Senet takipleri için Form 11 kullanılmalıdır. Kambiyo senetleri özel takip prosedürüne tabidir.',
      severity: 'error',
      legalReference: 'İİK m. 167-176',
    };
  }

  // 3. Kira kontrolü
  if (input.documentType === 'RENTAL' && !selectedFormRules.isRental) {
    if (input.isEviction) {
      return {
        isValid: false,
        suggestedFormCode: 'FORM_TAHLIYE',
        suggestedFormName: 'Tahliye Takibi',
        warning: 'Tahliye talepleri için özel tahliye formu kullanılmalıdır.',
        severity: 'error',
        legalReference: 'İİK m. 269-276',
      };
    }
    return {
      isValid: false,
      suggestedFormCode: 'FORM_KIRA_ALACAK',
      suggestedFormName: 'Kira Alacağı Takibi',
      warning: 'Kira alacakları için özel kira takip formu kullanılmalıdır.',
      severity: 'error',
      legalReference: 'İİK m. 269',
    };
  }

  // 4. Uyarı seviyesinde kontroller
  
  // Yüksek tutarlı alacaklar için kambiyo önerisi
  if (input.debtAmount && input.debtAmount > 100000 && 
      input.documentType === 'GENERAL' && !selectedFormRules.isKambiyo) {
    return {
      isValid: true, // Geçerli ama öneri var
      suggestedFormCode: null,
      suggestedFormName: null,
      warning: 'Yüksek tutarlı alacaklar için kambiyo senedi (çek/senet) varsa daha hızlı takip yapılabilir.',
      severity: 'info',
      legalReference: null,
    };
  }

  return {
    isValid: true,
    suggestedFormCode: null,
    suggestedFormName: null,
    warning: null,
    severity: null,
    legalReference: null,
  };
}

/**
 * Wizard cevaplarından form önerisi
 */
export function suggestFormFromWizard(answers: {
  hasJudgment: boolean;
  documentType: string;
  hasMortgage: boolean;
  isRental: boolean;
  isEviction?: boolean;
}): { formCode: string; formName: string; reason: string } {
  // İlamlı takip
  if (answers.hasJudgment) {
    return {
      formCode: 'FORM_2',
      formName: 'Form 2 - İlamlı Takip',
      reason: 'Mahkeme kararı (ilam) mevcut olduğu için ilamlı takip başlatılmalıdır.',
    };
  }

  // İpotek/Rehin
  if (answers.hasMortgage) {
    return {
      formCode: 'FORM_45',
      formName: 'Form 45 - İpoteğin Paraya Çevrilmesi',
      reason: 'İpotek veya rehin teminatı bulunduğu için özel takip prosedürü uygulanır.',
    };
  }

  // Kira
  if (answers.isRental) {
    if (answers.isEviction) {
      return {
        formCode: 'FORM_TAHLIYE',
        formName: 'Tahliye Takibi',
        reason: 'Kiracının tahliyesi talep edildiği için tahliye takibi başlatılmalıdır.',
      };
    }
    return {
      formCode: 'FORM_KIRA_ALACAK',
      formName: 'Kira Alacağı Takibi',
      reason: 'Kira alacağı için özel takip prosedürü uygulanır.',
    };
  }

  // Kambiyo
  if (answers.documentType === 'CHECK') {
    return {
      formCode: 'FORM_10',
      formName: 'Form 10 - Çeke Dayalı Kambiyo Takibi',
      reason: 'Çek, kambiyo senedi olduğu için özel ve hızlı takip prosedürü uygulanır.',
    };
  }

  if (answers.documentType === 'BOND') {
    return {
      formCode: 'FORM_11',
      formName: 'Form 11 - Senede Dayalı Kambiyo Takibi',
      reason: 'Senet, kambiyo senedi olduğu için özel ve hızlı takip prosedürü uygulanır.',
    };
  }

  // Genel ilamsız takip
  return {
    formCode: 'FORM_7',
    formName: 'Form 7 - İlamsız İcra Takibi',
    reason: 'Genel alacak için standart ilamsız icra takibi başlatılır.',
  };
}
