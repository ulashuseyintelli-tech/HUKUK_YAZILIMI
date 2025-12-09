"use client";

import { Zap } from "lucide-react";
import { FormMetadata } from "@/types/form-metadata";
import { formMetadata, frequentFormCodes } from "@/config/form-metadata";

interface FrequentFormsProps {
  onSelect: (form: FormMetadata) => void;
}

export function FrequentForms({ onSelect }: FrequentFormsProps) {
  const frequentForms = frequentFormCodes
    .map((code) => formMetadata.find((f) => f.code === code))
    .filter((f): f is FormMetadata => f !== undefined);

  if (frequentForms.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Zap className="h-4 w-4 text-yellow-500" />
        <h3 className="text-sm font-medium text-gray-700">Sık Kullanılanlar</h3>
      </div>
      <div className="flex flex-wrap gap-2">
        {frequentForms.map((form) => (
          <button
            key={form.code}
            onClick={() => onSelect(form)}
            className="inline-flex items-center gap-2 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-sm hover:bg-yellow-100 hover:border-yellow-300 transition-colors"
          >
            <span className="font-medium text-yellow-800">{form.title}</span>
            <span className="text-yellow-600 text-xs">({form.name})</span>
          </button>
        ))}
      </div>
    </div>
  );
}
