import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { formMetadata, formCategories } from '@/config/form-metadata';
import { FormMetadata, FormCategory } from '@/types/form-metadata';

/**
 * Feature: smart-form-wizard, Property 13: Form Metadata Schema Completeness
 * Validates: Requirements 6.1
 * 
 * For any form metadata object, it must contain all required fields:
 * code, name, title, description, category, uyapCode, iikMaddesi, 
 * usageScenario, hasJudgment, needsMortgage, isKambiyo, isRental
 */
describe('Form Metadata Schema Completeness', () => {
  const requiredFields: (keyof FormMetadata)[] = [
    'code',
    'name',
    'title',
    'description',
    'category',
    'uyapCode',
    'iikMaddesi',
    'usageScenario',
    'exampleCase',
    'requiredDocuments',
    'hasJudgment',
    'needsMortgage',
    'isKambiyo',
    'isRental',
  ];

  const validCategories: FormCategory[] = ['GENEL_ICRA', 'KAMBIYO', 'IPOTEK_REHIN', 'IFLAS', 'KIRA'];

  it('should have all required fields for every form', () => {
    formMetadata.forEach((form) => {
      requiredFields.forEach((field) => {
        expect(form).toHaveProperty(field);
        expect(form[field]).toBeDefined();
      });
    });
  });

  it('should have valid category for every form', () => {
    formMetadata.forEach((form) => {
      expect(validCategories).toContain(form.category);
    });
  });

  it('should have non-empty string fields', () => {
    formMetadata.forEach((form) => {
      expect(form.code.length).toBeGreaterThan(0);
      expect(form.name.length).toBeGreaterThan(0);
      expect(form.title.length).toBeGreaterThan(0);
      expect(form.description.length).toBeGreaterThan(0);
      expect(form.uyapCode.length).toBeGreaterThan(0);
      expect(form.iikMaddesi.length).toBeGreaterThan(0);
      expect(form.usageScenario.length).toBeGreaterThan(0);
    });
  });

  it('should have boolean flags as actual booleans', () => {
    formMetadata.forEach((form) => {
      expect(typeof form.hasJudgment).toBe('boolean');
      expect(typeof form.needsMortgage).toBe('boolean');
      expect(typeof form.isKambiyo).toBe('boolean');
      expect(typeof form.isRental).toBe('boolean');
    });
  });

  it('should have requiredDocuments as non-empty array', () => {
    formMetadata.forEach((form) => {
      expect(Array.isArray(form.requiredDocuments)).toBe(true);
      expect(form.requiredDocuments.length).toBeGreaterThan(0);
    });
  });

  it('should have unique form codes', () => {
    const codes = formMetadata.map((f) => f.code);
    const uniqueCodes = new Set(codes);
    expect(uniqueCodes.size).toBe(codes.length);
  });

  it('should have all 5 categories represented', () => {
    const categoriesInForms = new Set(formMetadata.map((f) => f.category));
    validCategories.forEach((cat) => {
      expect(categoriesInForms.has(cat)).toBe(true);
    });
  });

  it('PR-3: FORM_10 (Kambiyo) çek/bono/poliçe alt-formlarına sahip (manuel akış sub-breakdown)', () => {
    const form10 = formMetadata.find((f) => f.code === 'FORM_10');
    expect(form10?.subForms?.map((s) => s.code)).toEqual(['FORM_10_CEK', 'FORM_10_BONO', 'FORM_10_POLICE']);
  });

  it('should have valid subForms structure when present', () => {
    formMetadata.forEach((form) => {
      if (form.subForms) {
        expect(Array.isArray(form.subForms)).toBe(true);
        form.subForms.forEach((subForm) => {
          expect(subForm.code.length).toBeGreaterThan(0);
          expect(subForm.name.length).toBeGreaterThan(0);
          expect(subForm.title.length).toBeGreaterThan(0);
          expect(subForm.uyapCode.length).toBeGreaterThan(0);
          expect(subForm.usageScenario.length).toBeGreaterThan(0);
        });
      }
    });
  });

  // Property-based test: Any randomly selected form should have all required fields
  it('property: randomly selected forms have complete schema', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: formMetadata.length - 1 }),
        (index) => {
          const form = formMetadata[index];
          return (
            requiredFields.every((field) => form[field] !== undefined) &&
            validCategories.includes(form.category)
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});
