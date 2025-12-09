"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { FormMetadata, FormCategory } from "@/types/form-metadata";

interface UseFormTypesResult {
  formTypes: FormMetadata[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  getByCategory: (category: FormCategory) => FormMetadata[];
  getByCode: (code: string) => FormMetadata | undefined;
}

// API'den gelen veriyi frontend FormMetadata tipine dönüştür
function mapApiToFormMetadata(apiData: any): FormMetadata {
  return {
    code: apiData.code,
    name: apiData.name,
    title: apiData.title,
    description: apiData.description || "",
    category: apiData.category,
    uyapCode: apiData.uyapCode || "",
    iikMaddesi: apiData.iikMaddesi || "",
    usageScenario: apiData.usageScenario || "",
    exampleCase: apiData.exampleCase || "",
    requiredDocuments: apiData.requiredDocuments || [],
    hasJudgment: apiData.hasJudgment,
    needsMortgage: apiData.needsMortgage,
    isKambiyo: apiData.isKambiyo,
    isRental: apiData.isRental,
    subForms: apiData.subForms?.map((sub: any) => ({
      code: sub.code,
      name: sub.name,
      title: sub.title,
      uyapCode: sub.uyapCode || "",
      usageScenario: sub.usageScenario || "",
    })),
  };
}

export function useFormTypes(): UseFormTypesResult {
  const [formTypes, setFormTypes] = useState<FormMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFormTypes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.getFormTypes();
      const mapped = (response || []).map(mapApiToFormMetadata);
      setFormTypes(mapped);
    } catch (err: any) {
      console.error("Form tipleri yüklenemedi:", err);
      setError(err.message || "Form tipleri yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFormTypes();
  }, [fetchFormTypes]);

  const getByCategory = useCallback(
    (category: FormCategory): FormMetadata[] => {
      return formTypes.filter((f) => f.category === category);
    },
    [formTypes]
  );

  const getByCode = useCallback(
    (code: string): FormMetadata | undefined => {
      return formTypes.find((f) => f.code === code);
    },
    [formTypes]
  );

  return {
    formTypes,
    loading,
    error,
    refetch: fetchFormTypes,
    getByCategory,
    getByCode,
  };
}
