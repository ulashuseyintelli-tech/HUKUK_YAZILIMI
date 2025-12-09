"use client";

import { Info, ChevronDown, ChevronUp, Star } from "lucide-react";
import { useState } from "react";
import { FormMetadata, SubFormMetadata } from "@/types/form-metadata";

interface FormCardProps {
  form: FormMetadata;
  isSelected: boolean;
  isRecommended?: boolean;
  onSelect: (form: FormMetadata, subForm?: SubFormMetadata) => void;
  onInfoClick: (form: FormMetadata) => void;
}

export function FormCard({ form, isSelected, isRecommended, onSelect, onInfoClick }: FormCardProps) {
  const [showSubForms, setShowSubForms] = useState(isSelected);
  const hasSubForms = form.subForms && form.subForms.length > 0;

  const handleClick = () => {
    if (hasSubForms) {
      setShowSubForms(!showSubForms);
    } else {
      onSelect(form);
    }
  };

  const handleSubFormSelect = (subForm: SubFormMetadata) => {
    onSelect(form, subForm);
  };

  return (
    <div className="relative">
      {isRecommended && (
        <div className="absolute -top-2 -right-2 z-10">
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-400 text-yellow-900 text-xs font-medium rounded-full shadow-sm">
            <Star className="h-3 w-3 fill-current" />
            Önerilen
          </span>
        </div>
      )}
      
      <button
        onClick={handleClick}
        className={`w-full p-4 border-2 rounded-lg text-left transition-all ${
          isSelected
            ? "border-primary bg-primary/5 shadow-sm"
            : isRecommended
            ? "border-yellow-300 bg-yellow-50 hover:border-yellow-400"
            : "border-gray-200 hover:border-primary/50 hover:bg-gray-50"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Hukuki başlık */}
            <h3 className="font-semibold text-gray-900 mb-1">{form.title}</h3>
            
            {/* Form numarası ve İİK maddesi */}
            <p className="text-sm text-gray-500 mb-2">
              {form.name} • {form.iikMaddesi} • UYAP: {form.uyapCode}
            </p>
            
            {/* Kullanım senaryosu */}
            <p className="text-sm text-gray-600 line-clamp-2">{form.usageScenario}</p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onInfoClick(form);
              }}
              className="p-1.5 text-gray-400 hover:text-primary hover:bg-primary/10 rounded-full transition-colors"
              title="Detaylı bilgi"
            >
              <Info className="h-4 w-4" />
            </button>
            
            {hasSubForms && (
              <div className="text-gray-400">
                {showSubForms ? (
                  <ChevronUp className="h-5 w-5" />
                ) : (
                  <ChevronDown className="h-5 w-5" />
                )}
              </div>
            )}
          </div>
        </div>

        {hasSubForms && (
          <div className="mt-2 pt-2 border-t border-gray-100">
            <span className="text-xs text-blue-600 font-medium">
              {form.subForms!.length} alt kategori
            </span>
          </div>
        )}
      </button>

      {/* Alt formlar */}
      {hasSubForms && showSubForms && (
        <div className="ml-4 mt-2 pl-4 border-l-2 border-primary/30 space-y-2">
          {form.subForms!.map((subForm) => (
            <button
              key={subForm.code}
              onClick={() => handleSubFormSelect(subForm)}
              className="w-full p-3 border rounded-lg text-left hover:border-primary hover:bg-primary/5 transition-colors bg-white"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm text-gray-900">{subForm.title}</p>
                  <p className="text-xs text-gray-500">{subForm.name} • UYAP: {subForm.uyapCode}</p>
                </div>
              </div>
              <p className="text-xs text-gray-600 mt-1">{subForm.usageScenario}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
