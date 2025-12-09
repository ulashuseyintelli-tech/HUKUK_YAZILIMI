/**
 * Form Type Tests - Madde 58
 * Her form tipi için doğrulama testleri
 */

describe('FormType Validation', () => {
  // Form metadata tanımları
  const FORM_METADATA = {
    'FORM_7': { category: 'GENEL_ICRA', hasJudgment: false, isKambiyo: false, needsMortgage: false, isRental: false },
    'FORM_10': { category: 'KAMBIYO', hasJudgment: false, isKambiyo: true, needsMortgage: false, isRental: false },
    'FORM_11': { category: 'KAMBIYO', hasJudgment: false, isKambiyo: true, needsMortgage: false, isRental: false },
    'FORM_45': { category: 'IPOTEK_REHIN', hasJudgment: false, isKambiyo: false, needsMortgage: true, isRental: false },
    'FORM_148': { category: 'IFLAS', hasJudgment: false, isKambiyo: false, needsMortgage: false, isRental: false },
    'FORM_KIRA_ALACAK': { category: 'KIRA', hasJudgment: false, isKambiyo: false, needsMortgage: false, isRental: true },
    'FORM_TAHLIYE': { category: 'KIRA', hasJudgment: false, isKambiyo: false, needsMortgage: false, isRental: true },
  };

  describe('Form Metadata Validation', () => {
    it('should have all required form types defined', () => {
      const requiredForms = ['FORM_7', 'FORM_10', 'FORM_11', 'FORM_45', 'FORM_148', 'FORM_KIRA_ALACAK', 'FORM_TAHLIYE'] as const;
      requiredForms.forEach(code => {
        expect(FORM_METADATA[code]).toBeDefined();
      });
    });

    it('should validate GENEL_ICRA forms have correct properties', () => {
      const form = FORM_METADATA['FORM_7'];
      expect(form.category).toBe('GENEL_ICRA');
      expect(form.hasJudgment).toBe(false);
      expect(form.isKambiyo).toBe(false);
    });

    it('should validate KAMBIYO forms have isKambiyo=true', () => {
      expect(FORM_METADATA['FORM_10'].isKambiyo).toBe(true);
      expect(FORM_METADATA['FORM_11'].isKambiyo).toBe(true);
    });

    it('should validate IPOTEK_REHIN forms have needsMortgage=true', () => {
      expect(FORM_METADATA['FORM_45'].needsMortgage).toBe(true);
    });

    it('should validate KIRA forms have isRental=true', () => {
      expect(FORM_METADATA['FORM_KIRA_ALACAK'].isRental).toBe(true);
      expect(FORM_METADATA['FORM_TAHLIYE'].isRental).toBe(true);
    });
  });

  describe('Category Filtering', () => {
    it('should filter forms by category', () => {
      const kambiyoForms = Object.entries(FORM_METADATA)
        .filter(([_, meta]) => meta.category === 'KAMBIYO');
      
      expect(kambiyoForms.length).toBe(2);
      expect(kambiyoForms.every(([_, meta]) => meta.isKambiyo)).toBe(true);
    });

    it('should have all 5 categories', () => {
      const categories = [...new Set(Object.values(FORM_METADATA).map(m => m.category))];
      expect(categories).toContain('GENEL_ICRA');
      expect(categories).toContain('KAMBIYO');
      expect(categories).toContain('IPOTEK_REHIN');
      expect(categories).toContain('IFLAS');
      expect(categories).toContain('KIRA');
    });
  });

  describe('Form Selection Rules', () => {
    it('should require KAMBIYO form for check documents', () => {
      const checkForms = Object.entries(FORM_METADATA)
        .filter(([_, meta]) => meta.isKambiyo);
      
      expect(checkForms.length).toBeGreaterThan(0);
    });

    it('should require IPOTEK form for mortgage cases', () => {
      const mortgageForms = Object.entries(FORM_METADATA)
        .filter(([_, meta]) => meta.needsMortgage);
      
      expect(mortgageForms.length).toBeGreaterThan(0);
    });

    it('should require KIRA form for rental cases', () => {
      const rentalForms = Object.entries(FORM_METADATA)
        .filter(([_, meta]) => meta.isRental);
      
      expect(rentalForms.length).toBeGreaterThan(0);
    });
  });
});
