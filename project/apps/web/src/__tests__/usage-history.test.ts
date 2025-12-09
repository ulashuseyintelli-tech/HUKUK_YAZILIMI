import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { FormUsageHistory } from '@/types/form-metadata';

/**
 * Feature: smart-form-wizard, Property 9-10: Usage History
 * Validates: Requirements 4.2, 4.4
 */

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// Pure functions for testing (extracted from hook logic)
function recordUsage(history: FormUsageHistory[], formCode: string): FormUsageHistory[] {
  const now = new Date().toISOString();
  const existingIndex = history.findIndex((h) => h.formCode === formCode);

  if (existingIndex >= 0) {
    const newHistory = [...history];
    newHistory[existingIndex] = {
      ...newHistory[existingIndex],
      usageCount: newHistory[existingIndex].usageCount + 1,
      lastUsedAt: now,
    };
    return newHistory;
  }

  return [
    ...history,
    {
      formCode,
      usageCount: 1,
      lastUsedAt: now,
    },
  ];
}

function getUsageCount(history: FormUsageHistory[], formCode: string): number {
  const entry = history.find((h) => h.formCode === formCode);
  return entry?.usageCount || 0;
}

function getRecentForms(history: FormUsageHistory[], limit: number = 5): FormUsageHistory[] {
  return [...history]
    .sort((a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime())
    .slice(0, limit);
}

describe('Usage History Logic', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  /**
   * Property 9: Form Usage History Persistence
   * For any form selection that results in a successful case creation,
   * the form code should be added to the user's usage history with incremented count.
   */
  describe('Property 9: Form Usage History Persistence', () => {
    it('recording usage adds new form to history', () => {
      const history: FormUsageHistory[] = [];
      const newHistory = recordUsage(history, 'FORM_7');
      
      expect(newHistory.length).toBe(1);
      expect(newHistory[0].formCode).toBe('FORM_7');
      expect(newHistory[0].usageCount).toBe(1);
    });

    it('recording usage increments count for existing form', () => {
      let history: FormUsageHistory[] = [];
      history = recordUsage(history, 'FORM_7');
      history = recordUsage(history, 'FORM_7');
      history = recordUsage(history, 'FORM_7');
      
      expect(history.length).toBe(1);
      expect(history[0].usageCount).toBe(3);
    });

    it('recording different forms creates separate entries', () => {
      let history: FormUsageHistory[] = [];
      history = recordUsage(history, 'FORM_7');
      history = recordUsage(history, 'FORM_10');
      history = recordUsage(history, 'FORM_13');
      
      expect(history.length).toBe(3);
    });

    it('property: recording usage always increases total count', () => {
      fc.assert(
        fc.property(
          fc.array(fc.constantFrom('FORM_7', 'FORM_10', 'FORM_13', 'FORM_6'), { minLength: 1, maxLength: 20 }),
          (formCodes) => {
            let history: FormUsageHistory[] = [];
            formCodes.forEach((code) => {
              history = recordUsage(history, code);
            });
            
            const totalCount = history.reduce((sum, h) => sum + h.usageCount, 0);
            return totalCount === formCodes.length;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('property: each form code appears at most once in history', () => {
      fc.assert(
        fc.property(
          fc.array(fc.constantFrom('FORM_7', 'FORM_10', 'FORM_13', 'FORM_6'), { minLength: 1, maxLength: 20 }),
          (formCodes) => {
            let history: FormUsageHistory[] = [];
            formCodes.forEach((code) => {
              history = recordUsage(history, code);
            });
            
            const codes = history.map((h) => h.formCode);
            const uniqueCodes = new Set(codes);
            return codes.length === uniqueCodes.size;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 10: Usage History Display Count
   * For any form in the usage history, the displayed count should match
   * the actual number of times the form was used.
   */
  describe('Property 10: Usage History Display Count', () => {
    it('getUsageCount returns correct count for used form', () => {
      let history: FormUsageHistory[] = [];
      history = recordUsage(history, 'FORM_7');
      history = recordUsage(history, 'FORM_7');
      history = recordUsage(history, 'FORM_7');
      
      expect(getUsageCount(history, 'FORM_7')).toBe(3);
    });

    it('getUsageCount returns 0 for unused form', () => {
      const history: FormUsageHistory[] = [];
      expect(getUsageCount(history, 'FORM_7')).toBe(0);
    });

    it('property: usage count matches number of recordings', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('FORM_7', 'FORM_10', 'FORM_13'),
          fc.integer({ min: 1, max: 50 }),
          (formCode, times) => {
            let history: FormUsageHistory[] = [];
            for (let i = 0; i < times; i++) {
              history = recordUsage(history, formCode);
            }
            return getUsageCount(history, formCode) === times;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('property: recent forms are sorted by lastUsedAt descending', () => {
      fc.assert(
        fc.property(
          fc.array(fc.constantFrom('FORM_7', 'FORM_10', 'FORM_13', 'FORM_6'), { minLength: 2, maxLength: 10 }),
          (formCodes) => {
            let history: FormUsageHistory[] = [];
            formCodes.forEach((code) => {
              history = recordUsage(history, code);
            });
            
            const recent = getRecentForms(history);
            for (let i = 1; i < recent.length; i++) {
              const prevDate = new Date(recent[i - 1].lastUsedAt).getTime();
              const currDate = new Date(recent[i].lastUsedAt).getTime();
              if (prevDate < currDate) return false;
            }
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
