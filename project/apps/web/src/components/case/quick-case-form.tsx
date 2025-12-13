'use client';

import { useState } from 'react';
import { Plus, Loader2, Check, FileText, User, DollarSign } from 'lucide-react';

interface QuickCaseFormProps {
  onSubmit?: (data: QuickCaseData) => Promise<void>;
  onCancel?: () => void;
}

interface QuickCaseData {
  fileNumber: string;
  debtorName: string;
  debtorTckn: string;
  clientId: string;
  principalAmount: number;
  caseType: string;
}

const CASE_TYPES = [
  { id: 'ILAMSIZ', label: 'İlamsız' },
  { id: 'ILAMLI', label: 'İlamlı' },
  { id: 'KAMBIYO', label: 'Kambiyo' },
];

export function QuickCaseForm({ onSubmit, onCancel }: QuickCaseFormProps) {
  const [formData, setFormData] = useState<QuickCaseData>({
    fileNumber: '',
    debtorName: '',
    debtorTckn: '',
    clientId: '',
    principalAmount: 0,
    caseType: 'ILAMSIZ',
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.debtorName || !formData.principalAmount) return;

    setSubmitting(true);
    try {
      await onSubmit?.(formData);
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setFormData({
          fileNumber: '',
          debtorName: '',
          debtorTckn: '',
          clientId: '',
          principalAmount: 0,
          caseType: 'ILAMSIZ',
        });
      }, 1500);
    } catch (e) {
      alert('Dosya oluşturulamadı');
    } finally {
      setSubmitting(false);
    }
  };

  const updateField = <K extends keyof QuickCaseData>(key: K, value: QuickCaseData[K]) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  if (success) {
    return (
      <div className="text-center py-8">
        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <Check className="h-6 w-6 text-green-600" />
        </div>
        <p className="font-medium text-green-600">Dosya Oluşturuldu!</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 bg-blue-100 rounded-lg">
          <Plus className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <h3 className="font-semibold">Hızlı Dosya Oluştur</h3>
          <p className="text-xs text-gray-500">Minimal bilgi ile yeni dosya</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* File Number */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            <FileText className="h-3 w-3 inline mr-1" />
            Dosya No (opsiyonel)
          </label>
          <input
            type="text"
            value={formData.fileNumber}
            onChange={(e) => updateField('fileNumber', e.target.value)}
            placeholder="Otomatik"
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </div>

        {/* Case Type */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Takip Türü</label>
          <select
            value={formData.caseType}
            onChange={(e) => updateField('caseType', e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          >
            {CASE_TYPES.map((type) => (
              <option key={type.id} value={type.id}>{type.label}</option>
            ))}
          </select>
        </div>

        {/* Debtor Name */}
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1">
            <User className="h-3 w-3 inline mr-1" />
            Borçlu Adı *
          </label>
          <input
            type="text"
            value={formData.debtorName}
            onChange={(e) => updateField('debtorName', e.target.value)}
            placeholder="Ad Soyad veya Unvan"
            className="w-full border rounded-lg px-3 py-2 text-sm"
            required
          />
        </div>

        {/* Debtor TCKN */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">TCKN/VKN</label>
          <input
            type="text"
            value={formData.debtorTckn}
            onChange={(e) => updateField('debtorTckn', e.target.value)}
            placeholder="11 haneli"
            maxLength={11}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </div>

        {/* Principal Amount */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            <DollarSign className="h-3 w-3 inline mr-1" />
            Ana Para *
          </label>
          <input
            type="number"
            value={formData.principalAmount || ''}
            onChange={(e) => updateField('principalAmount', parseFloat(e.target.value) || 0)}
            placeholder="0.00"
            className="w-full border rounded-lg px-3 py-2 text-sm"
            required
            min={0}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2">
        <button
          type="submit"
          disabled={submitting || !formData.debtorName || !formData.principalAmount}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Oluştur
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border rounded-lg hover:bg-gray-50 text-sm"
          >
            İptal
          </button>
        )}
      </div>

      <p className="text-xs text-gray-400 text-center">
        Detaylı bilgiler dosya oluşturulduktan sonra eklenebilir
      </p>
    </form>
  );
}

// Modal wrapper
interface QuickCaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit?: (data: QuickCaseData) => Promise<void>;
}

export function QuickCaseModal({ isOpen, onClose, onSubmit }: QuickCaseModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <QuickCaseForm onSubmit={onSubmit} onCancel={onClose} />
      </div>
    </div>
  );
}
