"use client";

import React, { useState, useEffect } from "react";
import { AlertTriangle, CheckCircle, Info, XCircle, Loader2, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { api, ValidationGateResult, ValidationError } from "@/lib/api";

interface ValidationPanelProps {
  caseId?: string;
  gateId?: "GATE_1_CASE_CREATION" | "GATE_2_ORNEK1_GENERATION" | "GATE_3_SERVICE_OF_PROCESS" | "GATE_4_UYAP_INTEGRATION";
  additionalData?: Record<string, any>;
  onValidationComplete?: (result: ValidationGateResult) => void;
  autoValidate?: boolean;
  compact?: boolean;
  className?: string;
}

const GATE_NAMES: Record<string, string> = {
  GATE_1_CASE_CREATION: "Takip Olusturma",
  GATE_2_ORNEK1_GENERATION: "Ornek 1 Uretimi",
  GATE_3_SERVICE_OF_PROCESS: "Tebligat",
  GATE_4_UYAP_INTEGRATION: "UYAP Gonderimi",
};

export function ValidationPanel({
  caseId,
  gateId = "GATE_1_CASE_CREATION",
  additionalData,
  onValidationComplete,
  autoValidate = false,
  compact = false,
  className = "",
}: ValidationPanelProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ValidationGateResult | null>(null);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (autoValidate && caseId) {
      validate();
    }
  }, [autoValidate, caseId, gateId]);

  const validate = async () => {
    if (!caseId) return;
    
    setLoading(true);
    try {
      const validationResult = await api.validateGate(caseId, gateId, additionalData);
      setResult(validationResult);
      onValidationComplete?.(validationResult);
    } catch (err: any) {
      console.error("Validasyon hatasi:", err);
      setResult({
        gateId,
        gateName: GATE_NAMES[gateId] || gateId,
        passed: false,
        errors: [{ code: "VALIDATION_ERROR", message: err.message || "Validasyon sirasinda hata olustu", severity: "error" }],
        warnings: [],
        infos: [],
        validatedAt: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  };

  const renderIcon = (severity: "error" | "warning" | "info") => {
    switch (severity) {
      case "error":
        return <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />;
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />;
      case "info":
        return <Info className="h-4 w-4 text-blue-500 flex-shrink-0" />;
    }
  };

  const renderMessage = (item: ValidationError) => (
    <div key={item.code} className="flex items-start gap-2 py-1.5">
      {renderIcon(item.severity)}
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${
          item.severity === "error" ? "text-red-700" :
          item.severity === "warning" ? "text-amber-700" :
          "text-blue-700"
        }`}>
          {item.message}
        </p>
        {item.field && (
          <p className="text-xs text-gray-500 mt-0.5">Alan: {item.field}</p>
        )}
      </div>
    </div>
  );

  if (compact && !result) {
    return null;
  }

  return (
    <div className={`rounded-lg border ${
      result?.passed ? "border-green-200 bg-green-50" :
      result?.errors?.length ? "border-red-200 bg-red-50" :
      result?.warnings?.length ? "border-amber-200 bg-amber-50" :
      "border-gray-200 bg-gray-50"
    } ${className}`}>
      {/* Header */}
      <div 
        className="flex items-center justify-between px-3 py-2 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
          ) : result?.passed ? (
            <CheckCircle className="h-4 w-4 text-green-500" />
          ) : result?.errors?.length ? (
            <XCircle className="h-4 w-4 text-red-500" />
          ) : result?.warnings?.length ? (
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          ) : (
            <Info className="h-4 w-4 text-gray-400" />
          )}
          <span className="text-sm font-medium">
            {GATE_NAMES[gateId] || gateId} Validasyonu
          </span>
          {result && (
            <span className={`text-xs px-1.5 py-0.5 rounded ${
              result.passed ? "bg-green-100 text-green-700" :
              result.errors?.length ? "bg-red-100 text-red-700" :
              "bg-amber-100 text-amber-700"
            }`}>
              {result.passed ? "Gecti" : result.errors?.length ? `${result.errors.length} Hata` : `${result.warnings?.length} Uyari`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {caseId && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); validate(); }}
              disabled={loading}
              className="p-1 hover:bg-white/50 rounded"
              title="Yeniden kontrol et"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-gray-500 ${loading ? "animate-spin" : ""}`} />
            </button>
          )}
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          )}
        </div>
      </div>

      {/* Content */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-gray-200/50">
          {!result && !loading && (
            <p className="text-sm text-gray-500 py-2">
              Validasyon henuz calistirilmadi.
              {caseId && (
                <button
                  type="button"
                  onClick={validate}
                  className="ml-2 text-primary hover:underline"
                >
                  Simdi kontrol et
                </button>
              )}
            </p>
          )}

          {loading && (
            <div className="flex items-center gap-2 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
              <span className="text-sm text-gray-500">Kontrol ediliyor...</span>
            </div>
          )}

          {result && !loading && (
            <div className="space-y-2 pt-2">
              {/* Errors */}
              {result.errors?.length > 0 && (
                <div className="space-y-1">
                  {result.errors.map(renderMessage)}
                </div>
              )}

              {/* Warnings */}
              {result.warnings?.length > 0 && (
                <div className="space-y-1">
                  {result.warnings.map(renderMessage)}
                </div>
              )}

              {/* Infos */}
              {result.infos?.length > 0 && (
                <div className="space-y-1">
                  {result.infos.map(renderMessage)}
                </div>
              )}

              {/* Success message */}
              {result.passed && result.errors?.length === 0 && result.warnings?.length === 0 && (
                <div className="flex items-center gap-2 py-1">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="text-sm text-green-700">Tum kontroller basarili!</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
