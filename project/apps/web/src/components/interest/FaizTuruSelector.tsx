'use client';

import { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  Lock,
  Info,
  ChevronDown,
} from 'lucide-react';
import { Badge } from '@hukuk/ui';
import {
  InterestTypeCode,
  formatRate,
} from '@/lib/api/interest-engine';

// UI için faiz türü seçenekleri
export interface FaizTuruOption {
  value: string;
  label: string;
  shortLabel: string;
  description: string;
  variable: boolean;
  defaultRate?: number;
  engineType: InterestTypeCode;
}

export const FAIZ_TURU_SECENEKLERI: FaizTuruOption[] = [
  {
    value: 'YOK',
    label: 'Faiz Yok',
    shortLabel: 'Yok',
    description: 'Bu kalem için faiz hesaplanmaz',
    variable: false,
    defaultRate: 0,
    engineType: InterestTypeCode.LEGAL_3095, // Placeholder
  },
  {
    value: 'TICARI_DEGISEN',
    label: 'Ticari Temerrüt - TCMB Avans (Değişen)',
    shortLabel: 'Ticari (Değişen)',
    description: 'TCMB avans faiz oranı tablosuna göre dönemsel hesaplama. Çek, senet, fatura için önerilir.',
    variable: true,
    engineType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2,
  },
  {
    value: 'TICARI_SABIT',
    label: 'Ticari - Sabit Oran',
    shortLabel: 'Ticari (Sabit)',
    description: 'Kullanıcının belirlediği sabit oran. Sözleşmede belirli oran varsa kullanın.',
    variable: false,
    defaultRate: 48,
    engineType: InterestTypeCode.COMMERCIAL_FIXED,
  },
  {
    value: 'YASAL',
    label: 'Yasal Faiz (%9 / %24)',
    shortLabel: 'Yasal',
    description: '3095 sayılı Kanun m.1 - Adi alacaklar için. 2024 öncesi %9, sonrası %24.',
    variable: true,
    engineType: InterestTypeCode.LEGAL_3095,
  },
  {
    value: 'AKDI',
    label: 'Akdi Faiz (Sözleşme)',
    shortLabel: 'Akdi',
    description: 'Sözleşmede belirtilen faiz oranı. Kredi sözleşmeleri için.',
    variable: false,
    defaultRate: undefined, // Kullanıcı girmeli
    engineType: InterestTypeCode.CONTRACTUAL,
  },
  {
    value: 'BANKA_TL',
    label: 'Mevduat Faizi TL (Bankalar)',
    shortLabel: 'Mevduat TL',
    description: 'Bankalarca uygulanan en yüksek mevduat faizi. Döviz alacakları için.',
    variable: true,
    engineType: InterestTypeCode.MEVDUAT_TL_BANKALARCA,
  },
  {
    value: 'KAMU_BANKA_TL',
    label: 'Mevduat Faizi TL (Kamu)',
    shortLabel: 'Mevduat TL (K)',
    description: 'Kamu bankalarınca uygulanan en yüksek mevduat faizi.',
    variable: true,
    engineType: InterestTypeCode.MEVDUAT_TL_KAMU,
  },
];

interface FaizTuruSelectorProps {
  value: string;
  onChange: (value: string, fixedRate?: number) => void;
  fixedRate?: number;
  onFixedRateChange?: (rate: number) => void;
  disabled?: boolean;
  showDescription?: boolean;
  compact?: boolean;
  className?: string;
}

export function FaizTuruSelector({
  value,
  onChange,
  fixedRate,
  onFixedRateChange,
  disabled = false,
  showDescription = true,
  compact = false,
  className = '',
}: FaizTuruSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localFixedRate, setLocalFixedRate] = useState<number | undefined>(fixedRate);

  const selectedOption = FAIZ_TURU_SECENEKLERI.find(o => o.value === value);
  const needsFixedRate = selectedOption && !selectedOption.variable && selectedOption.value !== 'YOK';

  useEffect(() => {
    setLocalFixedRate(fixedRate);
  }, [fixedRate]);

  const handleSelect = (option: FaizTuruOption) => {
    onChange(option.value, option.defaultRate);
    if (option.defaultRate !== undefined) {
      setLocalFixedRate(option.defaultRate);
      onFixedRateChange?.(option.defaultRate);
    }
    setIsOpen(false);
  };

  const handleFixedRateChange = (rate: number) => {
    setLocalFixedRate(rate);
    onFixedRateChange?.(rate);
  };

  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <select
          value={value}
          onChange={(e) => {
            const option = FAIZ_TURU_SECENEKLERI.find(o => o.value === e.target.value);
            if (option) handleSelect(option);
          }}
          disabled={disabled}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
        >
          {FAIZ_TURU_SECENEKLERI.map(option => (
            <option key={option.value} value={option.value}>
              {option.shortLabel}
              {option.variable ? ' (Değişen)' : ''}
            </option>
          ))}
        </select>

        {needsFixedRate && (
          <div className="flex items-center gap-1">
            <span className="text-gray-500">%</span>
            <input
              type="number"
              value={localFixedRate ?? ''}
              onChange={(e) => handleFixedRateChange(parseFloat(e.target.value) || 0)}
              placeholder="Oran"
              disabled={disabled}
              className="w-16 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Seçim Dropdown */}
      <div className="relative">
        <button
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          className={`w-full flex items-center justify-between px-4 py-3 text-left border rounded-lg transition-colors ${
            disabled 
              ? 'bg-gray-100 cursor-not-allowed' 
              : 'bg-white hover:border-blue-400 focus:ring-2 focus:ring-blue-500'
          } ${isOpen ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-300'}`}
        >
          <div className="flex items-center gap-3">
            {selectedOption?.variable ? (
              <TrendingUp className="w-5 h-5 text-blue-600" />
            ) : (
              <Lock className="w-5 h-5 text-gray-500" />
            )}
            <div>
              <div className="font-medium text-gray-900">
                {selectedOption?.label || 'Faiz türü seçin'}
              </div>
              {showDescription && selectedOption && (
                <div className="text-xs text-gray-500 mt-0.5">
                  {selectedOption.variable ? 'Değişen oran (TCMB tablosu)' : 'Sabit oran'}
                </div>
              )}
            </div>
          </div>
          <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* Dropdown Menu */}
        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-y-auto">
            {FAIZ_TURU_SECENEKLERI.map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSelect(option)}
                className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors ${
                  option.value === value ? 'bg-blue-50' : ''
                }`}
              >
                {option.variable ? (
                  <TrendingUp className="w-5 h-5 text-blue-600 mt-0.5" />
                ) : (
                  <Lock className="w-5 h-5 text-gray-400 mt-0.5" />
                )}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{option.label}</span>
                    {option.variable && (
                      <Badge variant="default" className="text-xs">Değişen</Badge>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{option.description}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Sabit Oran Girişi */}
      {needsFixedRate && (
        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
          <Info className="w-5 h-5 text-gray-400" />
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Sabit Faiz Oranı (Yıllık)
            </label>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">%</span>
              <input
                type="number"
                step="0.01"
                value={localFixedRate ?? ''}
                onChange={(e) => handleFixedRateChange(parseFloat(e.target.value) || 0)}
                placeholder="Örn: 48.00"
                disabled={disabled}
                className="w-32 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              {localFixedRate !== undefined && localFixedRate > 0 && (
                <span className="text-sm text-gray-500">
                  ({formatRate(localFixedRate / 100)})
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Değişen Oran Bilgisi */}
      {selectedOption?.variable && showDescription && (
        <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg">
          <TrendingUp className="w-5 h-5 text-blue-600 mt-0.5" />
          <div className="text-sm text-blue-700">
            <p className="font-medium">Değişen Oran Hesaplaması</p>
            <p className="text-blue-600 mt-1">
              Faiz, TCMB tarafından belirlenen dönemsel oranlar kullanılarak hesaplanır. 
              Her oran değişikliği ayrı bir dönem olarak hesaba katılır.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default FaizTuruSelector;
