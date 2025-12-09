"use client";

import { AlertTriangle, ArrowRight, X } from "lucide-react";
import { FormMetadata } from "@/types/form-metadata";
import { CrossCheckResult } from "@/utils/form-cross-check";

interface CrossCheckWarningProps {
  result: CrossCheckResult;
  currentForm: FormMetadata;
  onChangeForm: (form: FormMetadata) => void;
  onContinue: () => void;
  onDismiss: () => void;
}

export function CrossCheckWarning({
  result,
  currentForm,
  onChangeForm,
  onContinue,
  onDismiss,
}: CrossCheckWarningProps) {
  if (result.isValid || !result.warning) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onDismiss} />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 bg-yellow-50 border-b border-yellow-200">
          <div className="p-2 bg-yellow-100 rounded-full">
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-yellow-800">Form Uyumsuzluğu Tespit Edildi</h3>
          </div>
          <button
            onClick={onDismiss}
            className="p-1 text-yellow-600 hover:text-yellow-800 rounded-full hover:bg-yellow-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          <p className="text-gray-700">{result.warning}</p>

          {/* Current vs Suggested */}
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <div className="flex-1">
              <p className="text-xs text-gray-500 mb-1">Seçili Form</p>
              <p className="font-medium text-gray-900">{currentForm.title}</p>
              <p className="text-xs text-gray-500">{currentForm.name}</p>
            </div>
            <ArrowRight className="h-5 w-5 text-gray-400" />
            <div className="flex-1">
              <p className="text-xs text-gray-500 mb-1">Önerilen Form</p>
              <p className="font-medium text-green-700">{result.suggestedForm?.title}</p>
              <p className="text-xs text-gray-500">{result.suggestedForm?.name}</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-4 border-t bg-gray-50">
          <button
            onClick={onContinue}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
          >
            Yine de Devam Et
          </button>
          <button
            onClick={() => result.suggestedForm && onChangeForm(result.suggestedForm)}
            className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            Formu Değiştir
          </button>
        </div>
      </div>
    </div>
  );
}
