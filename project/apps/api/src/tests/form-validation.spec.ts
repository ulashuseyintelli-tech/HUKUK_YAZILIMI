/**
 * Form Validation & Auto-Correction Tests - Madde 63
 * Hatalı form seçimi → otomatik düzeltme testi
 */

describe('Form Validation & Auto-Correction', () => {
  const mockFormTypes = [
    { code: 'FORM_7', category: 'GENEL_ICRA', hasJudgment: false, isKambiyo: false, needsMortgage: false, isRental: false },
    { code: 'FORM_10', category: 'KAMBIYO', hasJudgment: false, isKambiyo: true, needsMortgage: false, isRental: false },
    { code: 'FORM_11', category: 'KAMBIYO', hasJudgment: false, isKambiyo: true, needsMortgage: false, isRental: false },
    { code: 'FORM_45', category: 'IPOTEK_REHIN', hasJudgment: false, isKambiyo: false, needsMortgage: true, isRental: false },
    { code: 'FORM_KIRA_ALACAK', category: 'KIRA', hasJudgment: false, isKambiyo: false, needsMortgage: false, isRental: true },
    { code: 'FORM_TAHLIYE', category: 'KIRA', hasJudgment: false, isKambiyo: false, needsMortgage: false, isRental: true },
    { code: 'FORM_148', category: 'IFLAS', hasJudgment: false, isKambiyo: false, needsMortgage: false, isRental: false },
  ];

  describe('Form Selection Validation', () => {
    it('should suggest KAMBIYO form when check document is selected with GENEL_ICRA form', () => {
      const userSelection = {
        formCode: 'FORM_7',
        documentType: 'CHECK',
        hasJudgment: false,
      };

      const validation = validateFormSelection(userSelection, mockFormTypes);

      expect(validation.isValid).toBe(false);
      expect(validation.suggestedForm).toBe('FORM_10');
      expect(validation.warning).toContain('Kambiyo');
    });

    it('should suggest IPOTEK form when mortgage is involved', () => {
      const userSelection = {
        formCode: 'FORM_7',
        documentType: 'GENERAL',
        hasMortgage: true,
        hasJudgment: false,
      };

      const validation = validateFormSelection(userSelection, mockFormTypes);

      expect(validation.isValid).toBe(false);
      expect(validation.suggestedForm).toBe('FORM_45');
      expect(validation.warning).toMatch(/potek/i);
    });

    it('should suggest KIRA form for rental debt', () => {
      const userSelection = {
        formCode: 'FORM_7',
        documentType: 'RENTAL',
        hasJudgment: false,
      };

      const validation = validateFormSelection(userSelection, mockFormTypes);

      expect(validation.isValid).toBe(false);
      expect(validation.suggestedForm).toBe('FORM_KIRA_ALACAK');
      expect(validation.warning).toMatch(/[Kk]ira/);
    });

    it('should accept correct form selection', () => {
      const userSelection = {
        formCode: 'FORM_7',
        documentType: 'GENERAL',
        hasJudgment: false,
        hasMortgage: false,
      };

      const validation = validateFormSelection(userSelection, mockFormTypes);

      expect(validation.isValid).toBe(true);
      expect(validation.suggestedForm).toBeNull();
    });

    it('should accept FORM_11 for bond document', () => {
      const userSelection = {
        formCode: 'FORM_11',
        documentType: 'BOND',
        hasJudgment: false,
      };

      const validation = validateFormSelection(userSelection, mockFormTypes);

      expect(validation.isValid).toBe(true);
    });
  });

  describe('Auto-Correction Suggestions', () => {
    it('should prioritize mortgage form when both mortgage and kambiyo apply', () => {
      const userSelection = {
        formCode: 'FORM_7',
        documentType: 'CHECK',
        hasMortgage: true,
        hasJudgment: false,
      };

      const validation = validateFormSelection(userSelection, mockFormTypes);
      expect(validation.suggestedForm).toBe('FORM_45');
    });

    it('should suggest TAHLIYE form for eviction cases', () => {
      const userSelection = {
        formCode: 'FORM_7',
        documentType: 'RENTAL',
        isEviction: true,
        hasJudgment: false,
      };

      const validation = validateFormSelection(userSelection, mockFormTypes);
      expect(validation.suggestedForm).toBe('FORM_TAHLIYE');
    });
  });

  describe('Warning Messages', () => {
    it('should provide clear warning message for wrong selection', () => {
      const userSelection = {
        formCode: 'FORM_7',
        documentType: 'CHECK',
        hasJudgment: false,
      };

      const validation = validateFormSelection(userSelection, mockFormTypes);

      expect(validation.warning).toBeDefined();
      expect(validation.warning.length).toBeGreaterThan(10);
    });

    it('should include legal reference in warning', () => {
      const userSelection = {
        formCode: 'FORM_7',
        documentType: 'CHECK',
        hasJudgment: false,
      };

      const validation = validateFormSelection(userSelection, mockFormTypes);
      expect(validation.warning).toMatch(/İİK|m\.|madde/i);
    });
  });
});

// Form validation helper function
interface FormSelection {
  formCode: string;
  documentType: string;
  hasJudgment?: boolean;
  hasMortgage?: boolean;
  isEviction?: boolean;
}

interface ValidationResult {
  isValid: boolean;
  suggestedForm: string | null;
  warning: string;
}

function validateFormSelection(selection: FormSelection, formTypes: any[]): ValidationResult {
  const selectedForm = formTypes.find(f => f.code === selection.formCode);
  
  if (!selectedForm) {
    return {
      isValid: false,
      suggestedForm: null,
      warning: 'Seçilen form bulunamadı',
    };
  }

  // İpotek kontrolü (en yüksek öncelik)
  if (selection.hasMortgage && !selectedForm.needsMortgage) {
    return {
      isValid: false,
      suggestedForm: 'FORM_45',
      warning: 'İpotekli alacaklar için Form 45 kullanılmalıdır (İİK m. 148-150)',
    };
  }

  // Kambiyo senedi kontrolü
  if ((selection.documentType === 'CHECK' || selection.documentType === 'BOND') && !selectedForm.isKambiyo) {
    const suggestedForm = selection.documentType === 'CHECK' ? 'FORM_10' : 'FORM_11';
    return {
      isValid: false,
      suggestedForm,
      warning: `Kambiyo senetleri için ${suggestedForm} kullanılmalıdır (İİK m. 167-176)`,
    };
  }

  // Kira kontrolü
  if (selection.documentType === 'RENTAL' && !selectedForm.isRental) {
    const suggestedForm = selection.isEviction ? 'FORM_TAHLIYE' : 'FORM_KIRA_ALACAK';
    return {
      isValid: false,
      suggestedForm,
      warning: `Kira alacakları için ${suggestedForm} kullanılmalıdır (İİK m. 269)`,
    };
  }

  return {
    isValid: true,
    suggestedForm: null,
    warning: '',
  };
}
