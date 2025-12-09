import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { checkFormConsistency, CaseDataForCheck } from '@/utils/form-cross-check';
import { formMetadata } from '@/config/form-metadata';

/**
 * Feature: smart-form-wizard, Property 11-12: Cross-check Logic
 * Validates: Requirements 5.1, 5.2
 */
describe('Cross-check Logic', () => {
  const getFormByCode = (code: string) => formMetadata.find((f) => f.code === code)!;

  /**
   * Property 11: Cross-check Kambiyo Inconsistency
   * For any case where Form 10 (Kambiyo) is selected but the case data indicates
   * no kambiyo document, the system should generate a warning suggesting Form 7.
   */
  describe('Property 11: Kambiyo Inconsistency', () => {
    it('should warn when kambiyo form selected without kambiyo document', () => {
      const form10 = getFormByCode('FORM_10');
      const caseData: CaseDataForCheck = { hasKambiyoDocument: false };
      
      const result = checkFormConsistency(form10, caseData);
      
      expect(result.isValid).toBe(false);
      expect(result.warning).toBeDefined();
      expect(result.suggestedFormCode).toBe('FORM_7');
    });

    it('should not warn when kambiyo form selected with kambiyo document', () => {
      const form10 = getFormByCode('FORM_10');
      const caseData: CaseDataForCheck = { hasKambiyoDocument: true };
      
      const result = checkFormConsistency(form10, caseData);
      
      expect(result.isValid).toBe(true);
    });

    it('should not warn when kambiyo document status is undefined', () => {
      const form10 = getFormByCode('FORM_10');
      const caseData: CaseDataForCheck = {};
      
      const result = checkFormConsistency(form10, caseData);
      
      expect(result.isValid).toBe(true);
    });

    it('property: all kambiyo forms trigger warning when hasKambiyoDocument is false', () => {
      const kambiyoForms = formMetadata.filter((f) => f.isKambiyo);
      
      fc.assert(
        fc.property(
          fc.constantFrom(...kambiyoForms),
          (form) => {
            const caseData: CaseDataForCheck = { hasKambiyoDocument: false };
            const result = checkFormConsistency(form, caseData);
            return !result.isValid && result.suggestedFormCode === 'FORM_7';
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 12: Cross-check Rental Inconsistency
   * For any case where Form 7 (İlamsız) is selected but the case data indicates
   * rental-related claim, the system should generate a warning suggesting Form 13.
   */
  describe('Property 12: Rental Inconsistency', () => {
    it('should warn when non-rental form selected with rental claim', () => {
      const form7 = getFormByCode('FORM_7');
      const caseData: CaseDataForCheck = { isRentalClaim: true };
      
      const result = checkFormConsistency(form7, caseData);
      
      expect(result.isValid).toBe(false);
      expect(result.warning).toBeDefined();
      expect(result.suggestedFormCode).toBe('FORM_13');
    });

    it('should not warn when rental form selected with rental claim', () => {
      const form13 = getFormByCode('FORM_13');
      const caseData: CaseDataForCheck = { isRentalClaim: true };
      
      const result = checkFormConsistency(form13, caseData);
      
      expect(result.isValid).toBe(true);
    });

    it('should not warn when non-rental form selected without rental claim', () => {
      const form7 = getFormByCode('FORM_7');
      const caseData: CaseDataForCheck = { isRentalClaim: false };
      
      const result = checkFormConsistency(form7, caseData);
      
      expect(result.isValid).toBe(true);
    });

    it('property: non-rental forms trigger warning when isRentalClaim is true', () => {
      const nonRentalForms = formMetadata.filter((f) => !f.isRental);
      
      fc.assert(
        fc.property(
          fc.constantFrom(...nonRentalForms),
          (form) => {
            const caseData: CaseDataForCheck = { isRentalClaim: true };
            const result = checkFormConsistency(form, caseData);
            return !result.isValid && result.suggestedFormCode === 'FORM_13';
          }
        ),
        { numRuns: 100 }
      );
    });

    it('property: rental forms never trigger rental warning', () => {
      const rentalForms = formMetadata.filter((f) => f.isRental);
      
      fc.assert(
        fc.property(
          fc.constantFrom(...rentalForms),
          fc.boolean(),
          (form, isRentalClaim) => {
            const caseData: CaseDataForCheck = { isRentalClaim };
            const result = checkFormConsistency(form, caseData);
            // Rental forms should not get rental-related warnings
            return result.suggestedFormCode !== 'FORM_13';
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Additional cross-check tests
   */
  describe('Additional Cross-checks', () => {
    it('should warn when non-mortgage form selected with mortgage', () => {
      const form7 = getFormByCode('FORM_7');
      const caseData: CaseDataForCheck = { hasMortgage: true, hasJudgment: false };
      
      const result = checkFormConsistency(form7, caseData);
      
      expect(result.isValid).toBe(false);
      expect(result.suggestedFormCode).toBe('FORM_9');
    });

    it('should suggest ilamlı mortgage form when judgment exists', () => {
      const form7 = getFormByCode('FORM_7');
      const caseData: CaseDataForCheck = { hasMortgage: true, hasJudgment: true };
      
      const result = checkFormConsistency(form7, caseData);
      
      expect(result.isValid).toBe(false);
      expect(result.suggestedFormCode).toBe('FORM_6');
    });

    it('should return valid when no inconsistencies', () => {
      const form7 = getFormByCode('FORM_7');
      const caseData: CaseDataForCheck = {
        hasKambiyoDocument: false,
        isRentalClaim: false,
        hasMortgage: false,
        hasJudgment: false,
      };
      
      const result = checkFormConsistency(form7, caseData);
      
      expect(result.isValid).toBe(true);
    });

    it('property: valid result has no warning or suggestion', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...formMetadata),
          (form) => {
            // Create case data that matches the form
            const caseData: CaseDataForCheck = {
              hasKambiyoDocument: form.isKambiyo ? true : undefined,
              isRentalClaim: form.isRental ? true : false,
              hasMortgage: form.needsMortgage ? true : false,
              hasJudgment: form.hasJudgment ? true : undefined,
            };
            
            const result = checkFormConsistency(form, caseData);
            if (result.isValid) {
              return result.warning === undefined && result.suggestedForm === undefined;
            }
            return true; // Skip invalid results for this property
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
