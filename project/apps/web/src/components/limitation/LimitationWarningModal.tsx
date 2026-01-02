'use client';

import { useState } from 'react';
import { AlertTriangle, Clock, CheckCircle, XCircle, Info } from 'lucide-react';

// ============================================
// TİPLER
// ============================================

export type LimitationLevel = 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';

export interface LimitationStatus {
  level: LimitationLevel;
  ruleCode: string;
  ruleName: string;
  expiryDate: string | null;
  daysLeft: number | null;
  years: number | null;
  baseStartDate: string | null;
  legalBasis: string;
  message: string;
}

export interface LimitationCheckResult {
  status: LimitationStatus;
  shouldShowModal: boolean;
  modalType: 'YELLOW' | 'RED' | null;
  modalTitle?: string;
  modalMessage?: string;
  suggestions?: string[];
}

interface LimitationWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProceed: () => void;
  result: LimitationCheckResult;
}

// ============================================
// YARDIMCI FONKSİYONLAR
// ============================================

const getLevelConfig = (level: LimitationLevel) => {
  switch (level) {
    case 'GREEN':
      return {
        icon: CheckCircle,
        color: 'text-green-600',
        bgColor: 'bg-green-50',
        borderColor: 'border-green-200',
        label: 'Uygun',
      };
    case 'YELLOW':
      return {
        icon: Clock,
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-50',
        borderColor: 'border-yellow-200',
        label: 'Yaklaşıyor',
      };
    case 'RED':
      return {
        icon: XCircle,
        color: 'text-red-600',
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200',
        label: 'Dolmuş',
      };
    case 'UNKNOWN':
    default:
      return {
        icon: Info,
        color: 'text-gray-600',
        bgColor: 'bg-gray-50',
        borderColor: 'border-gray-200',
        label: 'Hesaplanamadı',
      };
  }
};

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('tr-TR');
};

// ============================================
// MODAL KOMPONENTİ
// ============================================

export function LimitationWarningModal({
  isOpen,
  onClose,
  onProceed,
  result,
}: LimitationWarningModalProps) {
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const { status, modalTitle, modalMessage, suggestions } = result;
  const config = getLevelConfig(status.level);
  const Icon = config.icon;

  const handleProceed = async () => {
    setIsLoading(true);
    try {
      // Risk logunu kaydet
      await fetch('/api/limitation-engine/log-risk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claimTypeCode: status.ruleCode,
          level: status.level,
          ackAction: 'PROCEED',
        }),
      });
      onProceed();
    } catch (error) {
      console.error('Risk log kaydedilemedi:', error);
      onProceed();
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = async () => {
    try {
      await fetch('/api/limitation-engine/log-risk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claimTypeCode: status.ruleCode,
          level: status.level,
          ackAction: 'BACK',
        }),
      });
    } catch (error) {
      console.error('Risk log kaydedilemedi:', error);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={handleBack} />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className={`px-6 py-4 ${config.bgColor} border-b ${config.borderColor}`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${config.bgColor}`}>
              <AlertTriangle className={`w-6 h-6 ${config.color}`} />
            </div>
            <div>
              <h3 className={`text-lg font-semibold ${config.color}`}>
                {modalTitle || 'Zamanaşımı Uyarısı'}
              </h3>
              <p className="text-sm text-gray-600">{status.ruleName}</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4">
          {/* Ana mesaj */}
          <p className="text-gray-700">
            {modalMessage || status.message}
          </p>

          {/* Detay bilgileri */}
          <div className={`p-4 rounded-lg ${config.bgColor} border ${config.borderColor}`}>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-500">Alacak Türü:</span>
                <p className="font-medium">{status.ruleName}</p>
              </div>
              <div>
                <span className="text-gray-500">Yasal Dayanak:</span>
                <p className="font-medium">{status.legalBasis}</p>
              </div>
              <div>
                <span className="text-gray-500">Başlangıç Tarihi:</span>
                <p className="font-medium">{formatDate(status.baseStartDate)}</p>
              </div>
              <div>
                <span className="text-gray-500">Bitiş Tarihi:</span>
                <p className="font-medium">{formatDate(status.expiryDate)}</p>
              </div>
              {status.daysLeft !== null && (
                <div className="col-span-2">
                  <span className="text-gray-500">Kalan Süre:</span>
                  <p className={`font-semibold ${config.color}`}>
                    {status.daysLeft > 0 
                      ? `${status.daysLeft} gün` 
                      : `${Math.abs(status.daysLeft)} gün önce doldu`}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Öneriler */}
          {suggestions && suggestions.length > 0 && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm font-medium text-blue-800 mb-1">Öneriler:</p>
              <ul className="text-sm text-blue-700 list-disc list-inside">
                {suggestions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Sorumluluk uyarısı (RED için) */}
          {status.level === 'RED' && (
            <p className="text-sm text-red-600 font-medium">
              ⚠️ Bu şekilde takip başlatılmasının sonuçları alacaklıya aittir.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t flex justify-end gap-3">
          <button
            onClick={handleBack}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {status.level === 'RED' ? 'Geri Dön' : 'İncele'}
          </button>
          <button
            onClick={handleProceed}
            disabled={isLoading}
            className={`px-4 py-2 text-white rounded-lg transition-colors disabled:opacity-50 ${
              status.level === 'RED'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isLoading ? 'Kaydediliyor...' : 'Devam Et'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// BADGE KOMPONENTİ (Liste görünümü için)
// ============================================

interface LimitationBadgeProps {
  level: LimitationLevel;
  daysLeft?: number | null;
  showDays?: boolean;
  size?: 'sm' | 'md';
}

export function LimitationBadge({ level, daysLeft, showDays = true, size = 'sm' }: LimitationBadgeProps) {
  const config = getLevelConfig(level);
  const Icon = config.icon;

  const sizeClasses = size === 'sm' 
    ? 'text-xs px-2 py-0.5' 
    : 'text-sm px-3 py-1';

  return (
    <span className={`inline-flex items-center gap-1 rounded-full ${config.bgColor} ${config.color} ${sizeClasses}`}>
      <Icon className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} />
      <span className="font-medium">{config.label}</span>
      {showDays && daysLeft !== null && daysLeft !== undefined && (
        <span className="opacity-75">
          ({daysLeft > 0 ? `${daysLeft}g` : `${Math.abs(daysLeft)}g önce`})
        </span>
      )}
    </span>
  );
}

// ============================================
// BANNER KOMPONENTİ (Form üstü için)
// ============================================

interface LimitationBannerProps {
  status: LimitationStatus;
  onDismiss?: () => void;
}

export function LimitationBanner({ status, onDismiss }: LimitationBannerProps) {
  const config = getLevelConfig(status.level);
  const Icon = config.icon;

  if (status.level === 'GREEN') return null;

  return (
    <div className={`p-4 rounded-lg ${config.bgColor} border ${config.borderColor} mb-4`}>
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 ${config.color} mt-0.5`} />
        <div className="flex-1">
          <p className={`font-medium ${config.color}`}>
            {status.level === 'YELLOW' && 'Zamanaşımı Yaklaşıyor'}
            {status.level === 'RED' && 'Zamanaşımı Riski'}
            {status.level === 'UNKNOWN' && 'Zamanaşımı Hesaplanamadı'}
          </p>
          <p className="text-sm text-gray-600 mt-1">{status.message}</p>
          {status.legalBasis && (
            <p className="text-xs text-gray-500 mt-1">Dayanak: {status.legalBasis}</p>
          )}
        </div>
        {onDismiss && (
          <button onClick={onDismiss} className="text-gray-400 hover:text-gray-600">
            <XCircle className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
}

export default LimitationWarningModal;
