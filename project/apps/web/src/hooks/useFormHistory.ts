"use client";

import { useState, useEffect, useCallback } from "react";
import { FormUsageHistory } from "@/types/form-metadata";

const STORAGE_KEY = "form_usage_history";
const MAX_RECENT_FORMS = 5;

export function useFormHistory() {
  const [history, setHistory] = useState<FormUsageHistory[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load history from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setHistory(JSON.parse(stored));
      }
    } catch (error) {
      console.error("Failed to load form history:", error);
    }
    setIsLoaded(true);
  }, []);

  // Save history to localStorage
  const saveHistory = useCallback((newHistory: FormUsageHistory[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory));
      setHistory(newHistory);
    } catch (error) {
      console.error("Failed to save form history:", error);
    }
  }, []);

  // Record form usage
  const recordUsage = useCallback(
    (formCode: string) => {
      const now = new Date().toISOString();
      const existingIndex = history.findIndex((h) => h.formCode === formCode);

      let newHistory: FormUsageHistory[];

      if (existingIndex >= 0) {
        // Update existing entry
        newHistory = [...history];
        newHistory[existingIndex] = {
          ...newHistory[existingIndex],
          usageCount: newHistory[existingIndex].usageCount + 1,
          lastUsedAt: now,
        };
      } else {
        // Add new entry
        newHistory = [
          ...history,
          {
            formCode,
            usageCount: 1,
            lastUsedAt: now,
          },
        ];
      }

      saveHistory(newHistory);
    },
    [history, saveHistory]
  );

  // Get recent forms (sorted by last used)
  const getRecentForms = useCallback((): FormUsageHistory[] => {
    return [...history]
      .sort((a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime())
      .slice(0, MAX_RECENT_FORMS);
  }, [history]);

  // Get most used forms (sorted by usage count)
  const getMostUsedForms = useCallback((): FormUsageHistory[] => {
    return [...history].sort((a, b) => b.usageCount - a.usageCount).slice(0, MAX_RECENT_FORMS);
  }, [history]);

  // Get usage count for a specific form
  const getUsageCount = useCallback(
    (formCode: string): number => {
      const entry = history.find((h) => h.formCode === formCode);
      return entry?.usageCount || 0;
    },
    [history]
  );

  // Clear history
  const clearHistory = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      setHistory([]);
    } catch (error) {
      console.error("Failed to clear form history:", error);
    }
  }, []);

  return {
    history,
    isLoaded,
    recordUsage,
    getRecentForms,
    getMostUsedForms,
    getUsageCount,
    clearHistory,
  };
}
