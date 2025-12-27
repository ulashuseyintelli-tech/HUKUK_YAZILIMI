"use client";

import { useState, useCallback } from "react";
import { api, ValidationGateResult, ValidationError } from "@/lib/api";

export type GateId = "GATE_1_CASE_CREATION" | "GATE_2_ORNEK1_GENERATION" | "GATE_3_SERVICE_OF_PROCESS" | "GATE_4_UYAP_INTEGRATION";

interface UseValidationOptions {
  onError?: (errors: ValidationError[]) => void;
  onWarning?: (warnings: ValidationError[]) => void;
  onSuccess?: () => void;
}

interface ValidationState {
  loading: boolean;
  result: ValidationGateResult | null;
  errors: ValidationError[];
  warnings: ValidationError[];
}

/**
 * Pre-submit validasyon hook'u
 * Case olusturulmadan once frontend'de validasyon yapar
 */
export function usePreSubmitValidation() {
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [warnings, setWarnings] = useState<ValidationError[]>([]);

  /**
   * Takip olusturma oncesi validasyon
   */
  const validateCaseCreation = useCallback((data: {
    takipTuruId?: string;
    mahiyetKodu?: string;
    lawyers?: any[];
    creditors?: any[];
    caseDebtors?: any[];
    dues?: any[];
    subCategory?: string;
    currency?: string;
  }): { valid: boolean; errors: ValidationError[]; warnings: ValidationError[] } => {
    const newErrors: ValidationError[] = [];
    const newWarnings: ValidationError[] = [];

    // Takip turu kontrolu
    if (!data.takipTuruId) {
      newErrors.push({
        code: "MISSING_CASE_TYPE",
        message: "Takip turu secilmedi",
        field: "takipTuruId",
        severity: "error",
      });
    }

    // Avukat kontrolu
    if (!data.lawyers || data.lawyers.length === 0) {
      newErrors.push({
        code: "MISSING_LAWYER",
        message: "En az bir avukat eklenmeli",
        field: "lawyers",
        severity: "error",
      });
    } else {
      // Sorumlu avukat kontrolu
      const hasResponsible = data.lawyers.some(l => l.isResponsible);
      if (!hasResponsible) {
        newWarnings.push({
          code: "NO_RESPONSIBLE_LAWYER",
          message: "Sorumlu avukat belirlenmedi",
          field: "lawyers",
          severity: "warning",
        });
      }
    }

    // Muvekkil kontrolu
    if (!data.creditors || data.creditors.length === 0) {
      newErrors.push({
        code: "MISSING_CREDITOR",
        message: "En az bir muvekkil eklenmeli",
        field: "creditors",
        severity: "error",
      });
    }

    // Borclu kontrolu
    if ((!data.caseDebtors || data.caseDebtors.length === 0)) {
      newErrors.push({
        code: "MISSING_DEBTOR",
        message: "En az bir borclu eklenmeli",
        field: "caseDebtors",
        severity: "error",
      });
    }

    // Alacak kalemi kontrolu
    if (!data.dues || data.dues.length === 0) {
      newWarnings.push({
        code: "NO_CLAIM_ITEMS",
        message: "Alacak kalemi eklenmedi - sonra ekleyebilirsiniz",
        field: "dues",
        severity: "warning",
      });
    }

    // Kambiyo takiplerinde ozel kontroller
    if (data.mahiyetKodu === "CEK" || data.mahiyetKodu === "SENET") {
      // Cek/Senet bilgisi kontrolu (ileride CaseInstrument ile)
      newWarnings.push({
        code: "INSTRUMENT_INFO_PENDING",
        message: `${data.mahiyetKodu === "CEK" ? "Cek" : "Senet"} bilgileri dosya olusturulduktan sonra eklenebilir`,
        severity: "info",
      });
    }

    // Doviz takiplerinde kur kontrolu
    if (data.currency && data.currency !== "TRY") {
      newWarnings.push({
        code: "FOREIGN_CURRENCY_NOTICE",
        message: `Doviz cinsi: ${data.currency} - Kur hesaplamasi otomatik yapilacak`,
        severity: "info",
      });
    }

    setErrors(newErrors);
    setWarnings(newWarnings);

    return {
      valid: newErrors.length === 0,
      errors: newErrors,
      warnings: newWarnings,
    };
  }, []);

  const clearValidation = useCallback(() => {
    setErrors([]);
    setWarnings([]);
  }, []);

  return {
    errors,
    warnings,
    validateCaseCreation,
    clearValidation,
    hasErrors: errors.length > 0,
    hasWarnings: warnings.length > 0,
  };
}

/**
 * Backend validasyon hook'u
 * Mevcut case icin gate validasyonu yapar
 */
export function useGateValidation(options?: UseValidationOptions) {
  const [state, setState] = useState<ValidationState>({
    loading: false,
    result: null,
    errors: [],
    warnings: [],
  });

  const validateGate = useCallback(async (
    caseId: string,
    gateId: GateId,
    additionalData?: Record<string, any>
  ): Promise<ValidationGateResult | null> => {
    setState(prev => ({ ...prev, loading: true }));

    try {
      const result = await api.validateGate(caseId, gateId, additionalData);
      
      setState({
        loading: false,
        result,
        errors: result.errors || [],
        warnings: result.warnings || [],
      });

      if (result.errors?.length > 0) {
        options?.onError?.(result.errors);
      } else if (result.warnings?.length > 0) {
        options?.onWarning?.(result.warnings);
      } else {
        options?.onSuccess?.();
      }

      return result;
    } catch (err: any) {
      const errorResult: ValidationGateResult = {
        gateId,
        gateName: gateId,
        passed: false,
        errors: [{ code: "API_ERROR", message: err.message || "Validasyon hatasi", severity: "error" }],
        warnings: [],
        infos: [],
        validatedAt: new Date().toISOString(),
      };

      setState({
        loading: false,
        result: errorResult,
        errors: errorResult.errors,
        warnings: [],
      });

      options?.onError?.(errorResult.errors);
      return errorResult;
    }
  }, [options]);

  const validateAllGates = useCallback(async (
    caseId: string,
    additionalData?: Record<string, any>
  ): Promise<Record<GateId, ValidationGateResult> | null> => {
    setState(prev => ({ ...prev, loading: true }));

    try {
      const results = await api.validateAllGates(caseId, additionalData);
      
      // Tum hatalari ve uyarilari topla
      const allErrors: ValidationError[] = [];
      const allWarnings: ValidationError[] = [];
      
      Object.values(results).forEach(result => {
        if (result.errors) allErrors.push(...result.errors);
        if (result.warnings) allWarnings.push(...result.warnings);
      });

      setState({
        loading: false,
        result: null,
        errors: allErrors,
        warnings: allWarnings,
      });

      return results as Record<GateId, ValidationGateResult>;
    } catch (err: any) {
      setState(prev => ({
        ...prev,
        loading: false,
        errors: [{ code: "API_ERROR", message: err.message || "Validasyon hatasi", severity: "error" }],
      }));
      return null;
    }
  }, []);

  const clearValidation = useCallback(() => {
    setState({
      loading: false,
      result: null,
      errors: [],
      warnings: [],
    });
  }, []);

  return {
    ...state,
    validateGate,
    validateAllGates,
    clearValidation,
    hasErrors: state.errors.length > 0,
    hasWarnings: state.warnings.length > 0,
  };
}

/**
 * Cek tazminati bilgisi hook'u
 */
export function useCheckCompensation() {
  const [info, setInfo] = useState<{
    defaultOn: boolean;
    rate: number;
    ratePercent: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchInfo = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getCheckCompensationInfo();
      setInfo(data);
    } catch (err) {
      console.error("Cek tazminati bilgisi alinamadi:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  return { info, loading, fetchInfo };
}

/**
 * Adres onerileri hook'u
 */
export function useAddressSuggestions() {
  const [suggestions, setSuggestions] = useState<{
    createTask: boolean;
    suggestions: string[];
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getAddressSuggestions();
      setSuggestions(data);
    } catch (err) {
      console.error("Adres onerileri alinamadi:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  return { suggestions, loading, fetchSuggestions };
}
