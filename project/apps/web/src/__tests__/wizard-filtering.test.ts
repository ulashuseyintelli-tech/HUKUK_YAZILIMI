import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { 
  getRecommendedFormCode, 
  filterFormsByWizardAnswers,
  WizardAnswer,
} from '@/types/wizard';
import { formMetadata } from '@/config/form-metadata';
import { FormMetadata } from '@/types/form-metadata';

/**
 * Feature: smart-form-wizard, Property 1-4: Wizard Answer Filtering
 * Validates: Requirements 1.2, 1.3, 1.4, 1.5
 */
describe('Wizard Filtering Logic', () => {
  // Helper to create answers
  const createAnswers = (
    hasJudgment: boolean | null,
    hasKambiyo: boolean | null,
    hasMortgage: boolean | null,
    isRental: boolean | null
  ): WizardAnswer => ({ hasJudgment, hasKambiyo, hasMortgage, isRental });

  // Helper to filter forms
  const filterFormsByAnswers = (answers: WizardAnswer): FormMetadata[] => {
    const codes = filterFormsByWizardAnswers(formMetadata, answers);
    return formMetadata.filter((f) => codes.includes(f.code));
  };

  // Helper to get recommended form
  const getRecommendedForm = (answers: WizardAnswer): FormMetadata | null => {
    // Check if all answers are provided
    if (
      answers.hasJudgment === null ||
      answers.hasKambiyo === null ||
      answers.hasMortgage === null ||
      answers.isRental === null
    ) {
      return null;
    }
    const code = getRecommendedFormCode(answers);
    return formMetadata.find((f) => f.code === code) || null;
  };

  /**
   * Property 1: Wizard Answer Filtering - Judgment
   */
  describe('Property 1: Judgment Filtering', () => {
    it('should filter forms by hasJudgment when answered true', () => {
      const answers = createAnswers(true, null, null, null);
      const filtered = filterFormsByAnswers(answers);
      filtered.forEach((form: FormMetadata) => {
        expect(form.hasJudgment).toBe(true);
      });
    });

    it('should filter forms by hasJudgment when answered false', () => {
      const answers = createAnswers(false, null, null, null);
      const filtered = filterFormsByAnswers(answers);
      filtered.forEach((form: FormMetadata) => {
        expect(form.hasJudgment).toBe(false);
      });
    });

    it('property: hasJudgment filter consistency', () => {
      fc.assert(
        fc.property(fc.boolean(), (hasJudgment) => {
          const answers = createAnswers(hasJudgment, null, null, null);
          const filtered = filterFormsByAnswers(answers);
          return filtered.every((form: FormMetadata) => form.hasJudgment === hasJudgment);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 2: Wizard Answer Filtering - Kambiyo
   */
  describe('Property 2: Kambiyo Filtering', () => {
    it('should filter forms by isKambiyo when answered true', () => {
      const answers = createAnswers(null, true, null, null);
      const filtered = filterFormsByAnswers(answers);
      filtered.forEach((form: FormMetadata) => {
        expect(form.isKambiyo).toBe(true);
      });
    });

    it('should filter forms by isKambiyo when answered false', () => {
      const answers = createAnswers(null, false, null, null);
      const filtered = filterFormsByAnswers(answers);
      filtered.forEach((form: FormMetadata) => {
        expect(form.isKambiyo).toBe(false);
      });
    });

    it('property: isKambiyo filter consistency', () => {
      fc.assert(
        fc.property(fc.boolean(), (isKambiyo) => {
          const answers = createAnswers(null, isKambiyo, null, null);
          const filtered = filterFormsByAnswers(answers);
          return filtered.every((form: FormMetadata) => form.isKambiyo === isKambiyo);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 3: Wizard Answer Filtering - Mortgage
   */
  describe('Property 3: Mortgage Filtering', () => {
    it('should filter forms by needsMortgage when answered true', () => {
      const answers = createAnswers(null, null, true, null);
      const filtered = filterFormsByAnswers(answers);
      filtered.forEach((form: FormMetadata) => {
        expect(form.needsMortgage).toBe(true);
      });
    });

    it('should filter forms by needsMortgage when answered false', () => {
      const answers = createAnswers(null, null, false, null);
      const filtered = filterFormsByAnswers(answers);
      filtered.forEach((form: FormMetadata) => {
        expect(form.needsMortgage).toBe(false);
      });
    });

    it('property: hasMortgage filter consistency', () => {
      fc.assert(
        fc.property(fc.boolean(), (hasMortgage) => {
          const answers = createAnswers(null, null, hasMortgage, null);
          const filtered = filterFormsByAnswers(answers);
          return filtered.every((form: FormMetadata) => form.needsMortgage === hasMortgage);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 4: Wizard Answer Filtering - Rental
   */
  describe('Property 4: Rental Filtering', () => {
    it('should filter forms by isRental when answered true', () => {
      const answers = createAnswers(null, null, null, true);
      const filtered = filterFormsByAnswers(answers);
      filtered.forEach((form: FormMetadata) => {
        expect(form.isRental).toBe(true);
      });
    });

    it('should filter forms by isRental when answered false', () => {
      const answers = createAnswers(null, null, null, false);
      const filtered = filterFormsByAnswers(answers);
      filtered.forEach((form: FormMetadata) => {
        expect(form.isRental).toBe(false);
      });
    });

    it('property: isRental filter consistency', () => {
      fc.assert(
        fc.property(fc.boolean(), (isRental) => {
          const answers = createAnswers(null, null, null, isRental);
          const filtered = filterFormsByAnswers(answers);
          return filtered.every((form: FormMetadata) => form.isRental === isRental);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Combined filtering tests
   */
  describe('Combined Filtering', () => {
    it('should return all forms when no answers provided', () => {
      const answers = createAnswers(null, null, null, null);
      const filtered = filterFormsByAnswers(answers);
      expect(filtered.length).toBe(formMetadata.length);
    });

    it('property: combined filters are conjunctive (AND)', () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          fc.boolean(),
          fc.boolean(),
          fc.boolean(),
          (hasJudgment, isKambiyo, hasMortgage, isRental) => {
            const answers = createAnswers(hasJudgment, isKambiyo, hasMortgage, isRental);
            const filtered = filterFormsByAnswers(answers);
            return filtered.every(
              (form: FormMetadata) =>
                form.hasJudgment === hasJudgment &&
                form.isKambiyo === isKambiyo &&
                form.needsMortgage === hasMortgage &&
                form.isRental === isRental
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Recommended form tests
   */
  describe('Recommended Form Logic', () => {
    it('should return null when not all questions answered', () => {
      const answers = createAnswers(true, null, null, null);
      const recommended = getRecommendedForm(answers);
      expect(recommended).toBeNull();
    });

    it('should return Form 7 for basic ilamsız case', () => {
      const answers = createAnswers(false, false, false, false);
      const recommended = getRecommendedForm(answers);
      expect(recommended?.code).toBe('FORM_7');
    });

    it('should return Form 10 for kambiyo case', () => {
      const answers = createAnswers(false, true, false, false);
      const recommended = getRecommendedForm(answers);
      expect(recommended?.code).toBe('FORM_10');
    });

    it('should return Form 13 for rental case', () => {
      const answers = createAnswers(false, false, false, true);
      const recommended = getRecommendedForm(answers);
      expect(recommended?.code).toBe('FORM_13');
    });

    it('should return ilamlı form for judgment case', () => {
      const answers = createAnswers(true, false, false, false);
      const recommended = getRecommendedForm(answers);
      expect(recommended?.code).toBe('FORM_2_3_4_5');
    });

    it('property: recommended form always matches at least one filter criterion', () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          fc.boolean(),
          fc.boolean(),
          fc.boolean(),
          (hasJudgment, isKambiyo, hasMortgage, isRental) => {
            const answers = createAnswers(hasJudgment, isKambiyo, hasMortgage, isRental);
            const recommended = getRecommendedForm(answers);
            if (!recommended) return true; // null is valid when no match

            // At least one criterion should match
            return (
              recommended.isRental === isRental ||
              recommended.isKambiyo === isKambiyo ||
              recommended.needsMortgage === hasMortgage ||
              recommended.hasJudgment === hasJudgment
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
