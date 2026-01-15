"use client";

/**
 * PreviewStatusBanner Component
 * 
 * Preview coordinator'dan gelen durumu kullanıcıya gösterir:
 * - FULL: Yeşil onay (veya hiç banner yok)
 * - PARTIAL: Amber uyarı - hangi hesaplama eksik
 * - UNAVAILABLE: Kırmızı hata - servis erişilemiyor
 * - VERSION_MISMATCH: Amber uyarı - sürüm uyumsuzluğu
 * 
 * @see hooks/usePreviewCoordinator.ts
 */

import { AlertCircle, AlertTriangle, CheckCircle, Info, RefreshCw } from "lucide-react";
import { PreviewBundle, PreviewStatus, PreviewWarning, PreviewError } from "@/hooks/usePreviewCoordinator";

// ============================================================================
// TYPES
// ============================================================================

interface PreviewStatusBannerProps {
  bundle: PreviewBundle;
  loading?: boolean;
  onRetry?: () => void;
  showOnFull?: boolean;
  className?: string;
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function WarningItem({ warning }: { warning: PreviewWarning }) {
  const Icon = warning.severity === 'warning' ? AlertTriangle : Info;
  const colorClass = warning.severity === 'warning' ? 'text-amber-600' : 'text-blue-600';
  
  return (
    <div className={`flex items-start gap-2 text-xs ${colorClass}`}>
      <Icon className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
      <span>{warning.message}</span>
    </div>
  );
}

function ErrorItem({ error }: { error: PreviewError }) {
  const sourceLabel = error.source === 'interest' ? 'Faiz' : 'Masraf';
  
  return (
    <div className="flex items-start gap-2 text-xs text-red-600">
      <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
      <span>
        <strong>{sourceLabel}:</strong> {error.message}
      </span>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function PreviewStatusBanner({
  bundle,
  loading = false,
  onRetry,
  showOnFull = false,
  className = "",
}: PreviewStatusBannerProps) {
  const { status, warnings, errors, versionMismatch } = bundle;
  
  // Loading state
  if (loading) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-md ${className}`}>
        <RefreshCw className="h-4 w-4 text-blue-600 animate-spin" />
        <span className="text-xs text-blue-700">Önizleme hesaplanıyor...</span>
      </div>
    );
  }
  
  // IDLE - henüz hesaplama yok
  if (status === 'IDLE') {
    return null;
  }
  
  // FULL - başarılı (opsiyonel gösterim)
  if (status === 'FULL') {
    // Version mismatch varsa uyarı göster
    if (versionMismatch) {
      return (
        <div className={`px-3 py-2 bg-amber-50 border border-amber-200 rounded-md ${className}`}>
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span className="text-xs font-medium text-amber-800">Sürüm Uyumsuzluğu</span>
          </div>
          <p className="text-xs text-amber-700 ml-6">
            Faiz ve masraf hesaplamaları farklı motor sürümlerinden geliyor olabilir.
            Sonuçlar tutarlı olmayabilir.
          </p>
        </div>
      );
    }
    
    // showOnFull false ise hiç gösterme
    if (!showOnFull) {
      return null;
    }
    
    return (
      <div className={`flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-md ${className}`}>
        <CheckCircle className="h-4 w-4 text-green-600" />
        <span className="text-xs text-green-700">Önizleme hazır</span>
      </div>
    );
  }
  
  // PARTIAL - kısmi başarı
  if (status === 'PARTIAL') {
    const hasInterest = bundle.interest !== null;
    const hasFee = bundle.fee !== null;
    
    return (
      <div className={`px-3 py-2 bg-amber-50 border border-amber-200 rounded-md ${className}`}>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span className="text-xs font-medium text-amber-800">Kısmi Önizleme</span>
          </div>
          {onRetry && (
            <button
              onClick={onRetry}
              className="text-xs text-amber-700 hover:text-amber-900 underline"
            >
              Tekrar Dene
            </button>
          )}
        </div>
        
        <div className="ml-6 space-y-1">
          <div className="flex items-center gap-4 text-xs">
            <span className={hasInterest ? 'text-green-600' : 'text-red-600'}>
              {hasInterest ? '✓' : '✗'} Faiz
            </span>
            <span className={hasFee ? 'text-green-600' : 'text-red-600'}>
              {hasFee ? '✓' : '✗'} Masraf
            </span>
          </div>
          
          {errors.length > 0 && (
            <div className="mt-2 space-y-1">
              {errors.map((error, idx) => (
                <ErrorItem key={idx} error={error} />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }
  
  // UNAVAILABLE - tamamen başarısız
  if (status === 'UNAVAILABLE') {
    return (
      <div className={`px-3 py-2 bg-red-50 border border-red-200 rounded-md ${className}`}>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <span className="text-xs font-medium text-red-800">Önizleme Üretilemedi</span>
          </div>
          {onRetry && (
            <button
              onClick={onRetry}
              className="text-xs text-red-700 hover:text-red-900 underline"
            >
              Tekrar Dene
            </button>
          )}
        </div>
        
        <p className="text-xs text-red-700 ml-6 mb-2">
          Hesaplama servisleri şu an erişilemiyor. Lütfen daha sonra tekrar deneyin.
        </p>
        
        {errors.length > 0 && (
          <div className="ml-6 space-y-1">
            {errors.map((error, idx) => (
              <ErrorItem key={idx} error={error} />
            ))}
          </div>
        )}
      </div>
    );
  }
  
  // Warnings (herhangi bir durumda)
  if (warnings.length > 0) {
    return (
      <div className={`px-3 py-2 bg-amber-50 border border-amber-200 rounded-md ${className}`}>
        <div className="space-y-1">
          {warnings.map((warning, idx) => (
            <WarningItem key={idx} warning={warning} />
          ))}
        </div>
      </div>
    );
  }
  
  return null;
}

// ============================================================================
// COMPACT VERSION (for inline use)
// ============================================================================

interface PreviewStatusBadgeProps {
  status: PreviewStatus;
  loading?: boolean;
  className?: string;
}

export function PreviewStatusBadge({
  status,
  loading = false,
  className = "",
}: PreviewStatusBadgeProps) {
  if (loading) {
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700 ${className}`}>
        <RefreshCw className="h-3 w-3 animate-spin" />
        Hesaplanıyor
      </span>
    );
  }
  
  switch (status) {
    case 'FULL':
      return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700 ${className}`}>
          <CheckCircle className="h-3 w-3" />
          Hazır
        </span>
      );
    case 'PARTIAL':
      return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-700 ${className}`}>
          <AlertTriangle className="h-3 w-3" />
          Kısmi
        </span>
      );
    case 'UNAVAILABLE':
      return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-700 ${className}`}>
          <AlertCircle className="h-3 w-3" />
          Erişilemez
        </span>
      );
    default:
      return null;
  }
}

// ============================================================================
// UNAVAILABLE VALUE DISPLAY
// ============================================================================

interface UnavailableValueProps {
  label?: string;
  className?: string;
}

/**
 * Hesaplanamayan değer için placeholder
 * "0" yerine "—" veya "Hesaplanamadı" gösterir
 */
export function UnavailableValue({
  label = "Hesaplanamadı",
  className = "",
}: UnavailableValueProps) {
  return (
    <span className={`text-gray-400 italic ${className}`}>
      {label}
    </span>
  );
}

/**
 * Koşullu değer gösterimi
 * Değer null/undefined ise UnavailableValue gösterir
 */
export function ConditionalValue({
  value,
  formatter,
  unavailableLabel,
  className = "",
}: {
  value: number | null | undefined;
  formatter?: (val: number) => string;
  unavailableLabel?: string;
  className?: string;
}) {
  if (value === null || value === undefined) {
    return <UnavailableValue label={unavailableLabel} className={className} />;
  }
  
  const formatted = formatter ? formatter(value) : value.toString();
  return <span className={className}>{formatted}</span>;
}

export default PreviewStatusBanner;
