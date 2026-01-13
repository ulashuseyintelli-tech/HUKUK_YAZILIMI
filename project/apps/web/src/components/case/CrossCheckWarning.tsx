'use client';

import { AlertTriangle, ArrowRight, X } from 'lucide-react';
import { CrossCheckResult } from '@/utils/form-cross-check';
import { getFormByCode } from '@/config/form-metadata';
import { cn } from '@/lib/utils';

interface CrossCheckWarningProps {
  result: CrossCheckResult;
  onChangeForm: (formCode: string) => void;
  onDismiss: () => void;
}

export function CrossCheckWarning({ result, onChangeForm, onDismiss }: CrossCheckWarningProps) {
  if (result.isConsistent || result.warnings.length === 0) {
    return null;
  }

  const hasError = result.warnings.some((w) => w.severity === 'error');
  const suggestedForm = result.suggestedFormCode 
    ? getFormByCode(result.suggestedFormCode) 
    : null;

  return (
    <div className={cn(
      "relative rounded-lg border p-4",
      hasError ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"
    )}>
      <div className="flex items-start gap-3">
        <AlertTriangle className={cn("h-5 w-5 mt-0.5", hasError ? "text-red-500" : "text-amber-500")} />
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h4 className={cn("font-medium", hasError ? "text-red-800" : "text-amber-800")}>
              Form Tutarsızlığı Tespit Edildi
            </h4>
            <button
              type="button"
              onClick={onDismiss}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          
          <ul className="list-disc list-inside space-y-1 text-sm mt-2">
            {result.warnings.map((warning, index) => (
              <li key={index} className={warning.severity === 'error' ? 'text-red-600' : 'text-amber-700'}>
                {warning.message}
              </li>
            ))}
          </ul>

          {suggestedForm && (
            <div className="flex items-center gap-2 pt-3">
              <button
                type="button"
                onClick={() => onChangeForm(result.suggestedFormCode!)}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md border bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
              >
                <ArrowRight className="h-4 w-4" />
                {suggestedForm.title} ile Devam Et
              </button>
              <button
                type="button"
                onClick={onDismiss}
                className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-800"
              >
                Yine de Devam Et
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
