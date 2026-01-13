'use client';

import { useState, useEffect, useCallback } from 'react';
import { FormUsageHistory } from '@/types/form-metadata';

const STORAGE_KEY = 'form-usage-history';
const MAX_RECENT_FORMS = 5;

interface UseFormHistoryReturn {
  history: FormUsageHistory[];
  frequentForms: FormUsageHistory[];
  recentForms: FormUsageHistory[];
  recordUsage: (formCode: string) => void;
  clearHistory: () => void;
}

export function useFormHistory(): UseFormHistoryReturn {
  const [history, setHistory] = useState<FormUsageHistory[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setHistory(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Failed to load form history:', error);
    }
  }, []);

  // Save to localStorage when history changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch (error) {
      console.error('Failed to save form history:', error);
    }
  }, [history]);

  // Record form usage
  const recordUsage = useCallback((formCode: string) => {
    setHistory((prev) => {
      const existing = prev.find((h) => h.formCode === formCode);
      const now = new Date().toISOString();

      if (existing) {
        // Update existing entry
        return prev.map((h) =>
          h.formCode === formCode
            ? { ...h, usageCount: h.usageCount + 1, lastUsedAt: now }
            : h
        );
      } else {
        // Add new entry
        return [...prev, { formCode, usageCount: 1, lastUsedAt: now }];
      }
    });
  }, []);

  // Clear all history
  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // Get frequent forms (sorted by usage count, top 3)
  const frequentForms = [...history]
    .sort((a, b) => b.usageCount - a.usageCount)
    .slice(0, 3);

  // Get recent forms (sorted by last used, top 5)
  const recentForms = [...history]
    .sort((a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime())
    .slice(0, MAX_RECENT_FORMS);

  return {
    history,
    frequentForms,
    recentForms,
    recordUsage,
    clearHistory,
  };
}
