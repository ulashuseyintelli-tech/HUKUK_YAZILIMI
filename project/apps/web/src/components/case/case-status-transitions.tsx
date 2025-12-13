'use client';

import { useState } from 'react';
import { ArrowRight, Check, X, AlertTriangle, Loader2, ChevronDown } from 'lucide-react';

interface StatusTransition {
  from: string;
  to: string;
  requiredFields?: string[];
  requiresApproval?: boolean;
  confirmMessage?: string;
}

interface CaseStatusTransitionsProps {
  caseId: string;
  currentStatus: string;
  onStatusChange: (newStatus: string) => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  DERDEST: { label: 'Derdest', color: 'bg-blue-100 text-blue-700' },
  ISLEMDE: { label: 'İşlemde', color: 'bg-yellow-100 text-yellow-700' },
  BEKLEMEDE: { label: 'Beklemede', color: 'bg-orange-100 text-orange-700' },
  HITAM: { label: 'Hitam', color: 'bg-green-100 text-green-700' },
  DERKENAR: { label: 'Derkenar', color: 'bg-gray-100 text-gray-700' },
  IPTAL: { label: 'İptal', color: 'bg-red-100 text-red-700' },
};

const TRANSITIONS: StatusTransition[] = [
  { from: 'DERDEST', to: 'ISLEMDE' },
  { from: 'DERDEST', to: 'BEKLEMEDE' },
  { from: 'ISLEMDE', to: 'DERDEST' },
  { from: 'ISLEMDE', to: 'BEKLEMEDE' },
  { from: 'ISLEMDE', to: 'HITAM', requiredFields: ['closingReason'], confirmMessage: 'Dosyayı kapatmak istediğinize emin misiniz?' },
  { from: 'BEKLEMEDE', to: 'DERDEST' },
  { from: 'BEKLEMEDE', to: 'ISLEMDE' },
  { from: 'BEKLEMEDE', to: 'DERKENAR', requiresApproval: true, confirmMessage: 'Dosyayı derkenara almak için onay gereklidir.' },
  { from: 'HITAM', to: 'DERDEST', requiresApproval: true, confirmMessage: 'Kapalı dosyayı yeniden açmak için onay gereklidir.' },
  { from: 'DERKENAR', to: 'DERDEST', requiresApproval: true },
  { from: 'DERDEST', to: 'IPTAL', requiresApproval: true, requiredFields: ['cancelReason'], confirmMessage: 'Dosyayı iptal etmek istediğinize emin misiniz?' },
];

export function CaseStatusTransitions({ caseId, currentStatus, onStatusChange }: CaseStatusTransitionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [showConfirm, setShowConfirm] = useState<StatusTransition | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});

  const availableTransitions = TRANSITIONS.filter(t => t.from === currentStatus);
  const currentConfig = STATUS_CONFIG[currentStatus] || STATUS_CONFIG.DERDEST;

  const handleTransition = (transition: StatusTransition) => {
    if (transition.confirmMessage || transition.requiredFields?.length) {
      setShowConfirm(transition);
      setFormData({});
    } else {
      executeTransition(transition.to);
    }
  };

  const executeTransition = async (newStatus: string) => {
    setTransitioning(true);
    try {
      // API call would go here
      await new Promise(resolve => setTimeout(resolve, 500));
      onStatusChange(newStatus);
      setShowConfirm(null);
      setIsOpen(false);
    } catch (e) {
      alert('Durum değişikliği başarısız');
    } finally {
      setTransitioning(false);
    }
  };

  const canConfirm = () => {
    if (!showConfirm?.requiredFields) return true;
    return showConfirm.requiredFields.every(field => formData[field]?.trim());
  };

  const getFieldLabel = (field: string) => {
    const labels: Record<string, string> = {
      closingReason: 'Kapanış Nedeni',
      cancelReason: 'İptal Nedeni',
      approvalNote: 'Onay Notu',
    };
    return labels[field] || field;
  };

  return (
    <div className="relative">
      {/* Current Status Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium ${currentConfig.color}`}
      >
        {currentConfig.label}
        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-white rounded-lg shadow-lg border z-50">
          <div className="p-2">
            <p className="text-xs text-gray-500 px-2 py-1">Durum Değiştir</p>
            {availableTransitions.length === 0 ? (
              <p className="text-sm text-gray-400 px-2 py-2">Geçiş yapılabilecek durum yok</p>
            ) : (
              availableTransitions.map((transition) => {
                const toConfig = STATUS_CONFIG[transition.to];
                return (
                  <button
                    key={transition.to}
                    onClick={() => handleTransition(transition)}
                    className="w-full flex items-center gap-2 px-2 py-2 hover:bg-gray-50 rounded text-left"
                  >
                    <ArrowRight className="h-4 w-4 text-gray-400" />
                    <span className={`px-2 py-0.5 rounded text-xs ${toConfig.color}`}>
                      {toConfig.label}
                    </span>
                    {transition.requiresApproval && (
                      <AlertTriangle className="h-3 w-3 text-orange-500 ml-auto" title="Onay gerektirir" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-orange-100 rounded-full">
                <AlertTriangle className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <h3 className="font-semibold">Durum Değişikliği</h3>
                <p className="text-sm text-gray-500">
                  {currentConfig.label} → {STATUS_CONFIG[showConfirm.to].label}
                </p>
              </div>
            </div>

            {showConfirm.confirmMessage && (
              <p className="text-sm text-gray-600 mb-4">{showConfirm.confirmMessage}</p>
            )}

            {showConfirm.requiresApproval && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-orange-700 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Bu işlem yönetici onayı gerektirir
                </p>
              </div>
            )}

            {showConfirm.requiredFields?.map((field) => (
              <div key={field} className="mb-4">
                <label className="block text-sm font-medium mb-1">
                  {getFieldLabel(field)} *
                </label>
                <textarea
                  value={formData[field] || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, [field]: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 resize-none"
                  rows={3}
                  placeholder={`${getFieldLabel(field)} giriniz...`}
                />
              </div>
            ))}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowConfirm(null)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                İptal
              </button>
              <button
                onClick={() => executeTransition(showConfirm.to)}
                disabled={!canConfirm() || transitioning}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {transitioning ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Onayla
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Click outside to close */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}
