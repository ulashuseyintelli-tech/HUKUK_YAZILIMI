import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { formMetadata, formCategories, filterFormsByCategory, groupFormsByCategory } from '@/config/form-metadata';
import { FormCategory } from '@/types/form-metadata';

/**
 * Feature: smart-form-wizard, Property 5-7: Category Filtering
 * Validates: Requirements 2.1, 2.2, 2.3
 */
describe('Category Filtering Logic', () => {
  const validCategories: FormCategory[] = ['GENEL_ICRA', 'KAMBIYO', 'IPOTEK_REHIN', 'IFLAS', 'KIRA'];

  /**
   * Property 5: Category Grouping Completeness
   * For any form in the form list, the form must belong to exactly one of the 5 defined categories.
   */
  describe('Property 5: Category Grouping Completeness', () => {
    it('every form belongs to exactly one valid category', () => {
      formMetadata.forEach((form) => {
        expect(validCategories).toContain(form.category);
      });
    });

    it('all 5 categories have at least one form', () => {
      const grouped = groupFormsByCategory();
      validCategories.forEach((category) => {
        expect(grouped[category]).toBeDefined();
        expect(grouped[category].length).toBeGreaterThan(0);
      });
    });

    it('property: every form has exactly one category', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: formMetadata.length - 1 }),
          (index) => {
            const form = formMetadata[index];
            const matchingCategories = validCategories.filter((cat) => cat === form.category);
            return matchingCategories.length === 1;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 6: Category Filter Correctness
   * For any selected category filter, the filtered form list should contain
   * only forms whose category matches the selected filter.
   */
  describe('Property 6: Category Filter Correctness', () => {
    it('filtering by GENEL_ICRA returns only GENEL_ICRA forms', () => {
      const filtered = filterFormsByCategory('GENEL_ICRA');
      filtered.forEach((form) => {
        expect(form.category).toBe('GENEL_ICRA');
      });
    });

    it('filtering by KAMBIYO returns only KAMBIYO forms', () => {
      const filtered = filterFormsByCategory('KAMBIYO');
      filtered.forEach((form) => {
        expect(form.category).toBe('KAMBIYO');
      });
    });

    it('filtering by IPOTEK_REHIN returns only IPOTEK_REHIN forms', () => {
      const filtered = filterFormsByCategory('IPOTEK_REHIN');
      filtered.forEach((form) => {
        expect(form.category).toBe('IPOTEK_REHIN');
      });
    });

    it('filtering by IFLAS returns only IFLAS forms', () => {
      const filtered = filterFormsByCategory('IFLAS');
      filtered.forEach((form) => {
        expect(form.category).toBe('IFLAS');
      });
    });

    it('filtering by KIRA returns only KIRA forms', () => {
      const filtered = filterFormsByCategory('KIRA');
      filtered.forEach((form) => {
        expect(form.category).toBe('KIRA');
      });
    });

    it('property: filtered forms match selected category', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...validCategories),
          (category) => {
            const filtered = filterFormsByCategory(category);
            return filtered.every((form) => form.category === category);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 7: All Forms Category Distribution
   * For any form list displayed with "Tümü" filter, grouping forms by category
   * should produce non-overlapping groups that together contain all forms.
   */
  describe('Property 7: All Forms Category Distribution', () => {
    it('filtering by ALL returns all forms', () => {
      const filtered = filterFormsByCategory('ALL');
      expect(filtered.length).toBe(formMetadata.length);
    });

    it('filtering by null returns all forms', () => {
      const filtered = filterFormsByCategory(null);
      expect(filtered.length).toBe(formMetadata.length);
    });

    it('grouped forms total equals all forms', () => {
      const grouped = groupFormsByCategory();
      const totalGrouped = Object.values(grouped).reduce((sum, forms) => sum + forms.length, 0);
      expect(totalGrouped).toBe(formMetadata.length);
    });

    it('groups are non-overlapping (no form in multiple groups)', () => {
      const grouped = groupFormsByCategory();
      const allGroupedCodes: string[] = [];
      Object.values(grouped).forEach((forms) => {
        forms.forEach((form) => {
          expect(allGroupedCodes).not.toContain(form.code);
          allGroupedCodes.push(form.code);
        });
      });
    });

    it('property: sum of category filters equals all forms', () => {
      fc.assert(
        fc.property(fc.constant(null), () => {
          const allForms = filterFormsByCategory('ALL');
          const categoryTotals = validCategories.reduce(
            (sum, cat) => sum + filterFormsByCategory(cat).length,
            0
          );
          return allForms.length === categoryTotals;
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Additional category tests
   */
  describe('Category Configuration', () => {
    it('formCategories has all 5 categories', () => {
      expect(formCategories.length).toBe(5);
      const codes = formCategories.map((c) => c.code);
      validCategories.forEach((cat) => {
        expect(codes).toContain(cat);
      });
    });

    it('each category has a label and icon', () => {
      formCategories.forEach((category) => {
        expect(category.label.length).toBeGreaterThan(0);
        expect(category.icon.length).toBeGreaterThan(0);
      });
    });
  });
});
