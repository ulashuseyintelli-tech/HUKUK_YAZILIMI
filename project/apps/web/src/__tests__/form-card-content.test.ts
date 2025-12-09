import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { formMetadata } from '@/config/form-metadata';
import { FormMetadata } from '@/types/form-metadata';

/**
 * Feature: smart-form-wizard, Property 8: Form Card Content Completeness
 * Validates: Requirements 3.1, 3.2
 * 
 * For any form metadata, the rendered card should contain the title, name,
 * uyapCode, and iikMaddesi fields.
 */
describe('Form Card Content Completeness', () => {
  // Simulates what FormCard would render
  const getCardContent = (form: FormMetadata): string[] => {
    return [form.title, form.name, form.uyapCode, form.iikMaddesi, form.usageScenario];
  };

  it('every form has title for card heading', () => {
    formMetadata.forEach((form) => {
      expect(form.title).toBeDefined();
      expect(form.title.length).toBeGreaterThan(0);
    });
  });

  it('every form has name for card subheading', () => {
    formMetadata.forEach((form) => {
      expect(form.name).toBeDefined();
      expect(form.name.length).toBeGreaterThan(0);
    });
  });

  it('every form has uyapCode for card display', () => {
    formMetadata.forEach((form) => {
      expect(form.uyapCode).toBeDefined();
      expect(form.uyapCode.length).toBeGreaterThan(0);
    });
  });

  it('every form has iikMaddesi for card display', () => {
    formMetadata.forEach((form) => {
      expect(form.iikMaddesi).toBeDefined();
      expect(form.iikMaddesi.length).toBeGreaterThan(0);
    });
  });

  it('every form has usageScenario for card description', () => {
    formMetadata.forEach((form) => {
      expect(form.usageScenario).toBeDefined();
      expect(form.usageScenario.length).toBeGreaterThan(0);
    });
  });

  it('property: card content has all required fields', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: formMetadata.length - 1 }),
        (index) => {
          const form = formMetadata[index];
          const content = getCardContent(form);
          return content.every((field) => field && field.length > 0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('property: title is human-readable (not a code)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: formMetadata.length - 1 }),
        (index) => {
          const form = formMetadata[index];
          // Title should not start with "FORM_" (that's a code pattern)
          return !form.title.startsWith('FORM_');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('property: iikMaddesi contains "İİK" reference', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: formMetadata.length - 1 }),
        (index) => {
          const form = formMetadata[index];
          return form.iikMaddesi.includes('İİK');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('property: usageScenario is descriptive (min 20 chars)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: formMetadata.length - 1 }),
        (index) => {
          const form = formMetadata[index];
          return form.usageScenario.length >= 20;
        }
      ),
      { numRuns: 100 }
    );
  });
});
