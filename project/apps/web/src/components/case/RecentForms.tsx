"use client";

import { Clock, FileText } from "lucide-react";
import { FormMetadata, FormUsageHistory } from "@/types/form-metadata";
import { formMetadata } from "@/config/form-metadata";

interface RecentFormsProps {
  recentHistory: FormUsageHistory[];
  onSelect: (form: FormMetadata) => void;
}

export function RecentForms({ recentHistory, onSelect }: RecentFormsProps) {
  if (recentHistory.length === 0) return null;

  const recentForms = recentHistory
    .map((h) => ({
      form: formMetadata.find((f) => f.code === h.formCode),
      history: h,
    }))
    .filter((item): item is { form: FormMetadata; history: FormUsageHistory } => item.form !== undefined);

  if (recentForms.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="h-4 w-4 text-blue-500" />
        <h3 className="text-sm font-medium text-gray-700">Son Kullandıkların</h3>
      </div>
      <div className="flex flex-wrap gap-2">
        {recentForms.map(({ form, history }) => (
          <button
            key={form.code}
            onClick={() => onSelect(form)}
            className="inline-flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm hover:bg-blue-100 hover:border-blue-300 transition-colors"
          >
            <FileText className="h-4 w-4 text-blue-500" />
            <span className="font-medium text-blue-800">{form.title}</span>
            <span className="text-blue-600 text-xs bg-blue-100 px-1.5 py-0.5 rounded">
              {history.usageCount} dosya
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
