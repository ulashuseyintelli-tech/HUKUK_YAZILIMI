"use client";

import { X, FileText, Scale, Folder, Lightbulb } from "lucide-react";
import { FormMetadata } from "@/types/form-metadata";

interface FormDetailModalProps {
  form: FormMetadata;
  isOpen: boolean;
  onClose: () => void;
  onSelect: () => void;
}

export function FormDetailModal({ form, isOpen, onClose, onSelect }: FormDetailModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{form.title}</h2>
            <p className="text-sm text-gray-500">{form.name} • {form.description}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 overflow-y-auto max-h-[60vh]">
          {/* İİK Maddesi */}
          <div className="flex items-start gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Scale className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-medium text-gray-900">İlgili Mevzuat</h3>
              <p className="text-sm text-gray-600">{form.iikMaddesi}</p>
              <p className="text-xs text-gray-500 mt-1">UYAP Kodu: {form.uyapCode}</p>
            </div>
          </div>

          {/* Kullanım Senaryosu */}
          <div className="flex items-start gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Lightbulb className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <h3 className="font-medium text-gray-900">Ne Zaman Kullanılır?</h3>
              <p className="text-sm text-gray-600">{form.usageScenario}</p>
            </div>
          </div>

          {/* Örnek Senaryo */}
          <div className="flex items-start gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <FileText className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h3 className="font-medium text-gray-900">Örnek Senaryo</h3>
              <p className="text-sm text-gray-600">{form.exampleCase}</p>
            </div>
          </div>

          {/* Gerekli Belgeler */}
          <div className="flex items-start gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Folder className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <h3 className="font-medium text-gray-900">Gerekli Belgeler</h3>
              <ul className="mt-1 space-y-1">
                {form.requiredDocuments.map((doc, index) => (
                  <li key={index} className="text-sm text-gray-600 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-orange-400 rounded-full" />
                    {doc.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Alt Formlar */}
          {form.subForms && form.subForms.length > 0 && (
            <div className="pt-4 border-t">
              <h3 className="font-medium text-gray-900 mb-2">Alt Kategoriler ({form.subForms.length})</h3>
              <div className="space-y-2">
                {form.subForms.map((subForm) => (
                  <div key={subForm.code} className="p-2 bg-gray-50 rounded-lg">
                    <p className="font-medium text-sm text-gray-900">{subForm.title}</p>
                    <p className="text-xs text-gray-500">{subForm.name} • UYAP: {subForm.uyapCode}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-4 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
          >
            Kapat
          </button>
          <button
            onClick={onSelect}
            className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            Bu Formu Seç
          </button>
        </div>
      </div>
    </div>
  );
}
