"use client";

import { useState } from "react";
import { FileCode, Download, AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { api, UyapExportResult, UyapValidationResult } from "@/lib/api";

interface UyapExportButtonProps {
  caseId: string;
  fileNumber: string;
  variant?: "button" | "icon";
}

export function UyapExportButton({ caseId, fileNumber, variant = "button" }: UyapExportButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [validation, setValidation] = useState<UyapValidationResult | null>(null);
  const [result, setResult] = useState<UyapExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleOpen = async () => {
    setIsOpen(true);
    setError(null);
    setResult(null);
    setIsValidating(true);
    
    try {
      const res = await api.validateCaseForUyapExport(caseId);
      setValidation(res);
    } catch (err: any) {
      setError(err.message || "Validasyon hatası");
    } finally {
      setIsValidating(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    setError(null);
    
    try {
      const blob = await api.downloadCaseXml(caseId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `etakip_${fileNumber.replace(/\//g, "-")}_${Date.now()}.xml`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      setResult({ success: true, fileName: a.download, fileSize: blob.size, caseCount: 1 });
    } catch (err: any) {
      setError(err.message || "Export hatası");
    } finally {
      setIsExporting(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setValidation(null);
    setResult(null);
    setError(null);
  };

  return (
    <>
      {variant === "icon" ? (
        <button
          onClick={handleOpen}
          className="p-2 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
          title="UYAP'a Aktar"
        >
          <FileCode className="w-4 h-4" />
        </button>
      ) : (
        <button
          onClick={handleOpen}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors"
        >
          <FileCode className="w-4 h-4" />
          UYAP'a Aktar
        </button>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">UYAP e-Takip Export</h3>
              <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <div className="p-4 space-y-4">
              <div className="text-sm text-gray-600">
                <span className="font-medium">Dosya:</span> {fileNumber}
              </div>

              {isValidating && (
                <div className="flex items-center gap-2 text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Dosya kontrol ediliyor...
                </div>
              )}

              {validation && !result && (
                <div className="space-y-3">
                  {validation.errors.length > 0 && (
                    <div className="p-3 bg-red-50 rounded-lg">
                      <div className="flex items-center gap-2 text-red-700 font-medium mb-2">
                        <AlertCircle className="w-4 h-4" />
                        Hatalar ({validation.errors.length})
                      </div>
                      <ul className="text-sm text-red-600 space-y-1">
                        {validation.errors.map((e, i) => (
                          <li key={i}>• {e}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {validation.warnings.length > 0 && (
                    <div className="p-3 bg-amber-50 rounded-lg">
                      <div className="flex items-center gap-2 text-amber-700 font-medium mb-2">
                        <AlertCircle className="w-4 h-4" />
                        Uyarılar ({validation.warnings.length})
                      </div>
                      <ul className="text-sm text-amber-600 space-y-1">
                        {validation.warnings.map((w, i) => (
                          <li key={i}>• {w}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {validation.isValid && validation.warnings.length === 0 && (
                    <div className="flex items-center gap-2 text-green-600 p-3 bg-green-50 rounded-lg">
                      <CheckCircle className="w-4 h-4" />
                      Dosya UYAP export için hazır
                    </div>
                  )}
                </div>
              )}

              {result?.success && (
                <div className="p-3 bg-green-50 rounded-lg">
                  <div className="flex items-center gap-2 text-green-700 font-medium">
                    <CheckCircle className="w-4 h-4" />
                    XML başarıyla indirildi
                  </div>
                  <div className="text-sm text-green-600 mt-1">
                    {result.fileName} ({(result.fileSize / 1024).toFixed(1)} KB)
                  </div>
                </div>
              )}

              {error && (
                <div className="p-3 bg-red-50 rounded-lg text-red-600 text-sm">
                  {error}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 p-4 border-t bg-gray-50 rounded-b-xl">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Kapat
              </button>
              {validation?.isValid && !result && (
                <button
                  onClick={handleExport}
                  disabled={isExporting}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg disabled:opacity-50"
                >
                  {isExporting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  XML İndir
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
