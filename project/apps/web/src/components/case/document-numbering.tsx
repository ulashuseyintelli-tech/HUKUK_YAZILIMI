'use client';

import { useState, useEffect } from 'react';
import { Hash, Settings, RefreshCw, Copy, Check } from 'lucide-react';

interface NumberingConfig {
  prefix: string;
  separator: string;
  includeYear: boolean;
  includeMonth: boolean;
  digitCount: number;
  resetPeriod: 'never' | 'yearly' | 'monthly';
  currentNumber: number;
}

interface DocumentNumberingProps {
  onGenerate?: (number: string) => void;
}

const STORAGE_KEY = 'documentNumberingConfig';

const DEFAULT_CONFIG: NumberingConfig = {
  prefix: 'BLG',
  separator: '-',
  includeYear: true,
  includeMonth: false,
  digitCount: 4,
  resetPeriod: 'yearly',
  currentNumber: 1,
};

export function DocumentNumbering({ onGenerate }: DocumentNumberingProps) {
  const [config, setConfig] = useState<NumberingConfig>(DEFAULT_CONFIG);
  const [showSettings, setShowSettings] = useState(false);
  const [copied, setCopied] = useState(false);
  const [preview, setPreview] = useState('');

  useEffect(() => {
    loadConfig();
  }, []);

  useEffect(() => {
    setPreview(generateNumber(false));
  }, [config]);

  const loadConfig = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Check if we need to reset based on period
        const lastReset = localStorage.getItem(`${STORAGE_KEY}_lastReset`);
        const now = new Date();
        let shouldReset = false;

        if (lastReset) {
          const lastDate = new Date(lastReset);
          if (parsed.resetPeriod === 'yearly' && lastDate.getFullYear() !== now.getFullYear()) {
            shouldReset = true;
          } else if (parsed.resetPeriod === 'monthly' && 
            (lastDate.getFullYear() !== now.getFullYear() || lastDate.getMonth() !== now.getMonth())) {
            shouldReset = true;
          }
        }

        if (shouldReset) {
          parsed.currentNumber = 1;
          localStorage.setItem(`${STORAGE_KEY}_lastReset`, now.toISOString());
        }

        setConfig({ ...DEFAULT_CONFIG, ...parsed });
      }
    } catch (e) {
      console.error('Failed to load numbering config');
    }
  };

  const saveConfig = (newConfig: NumberingConfig) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
    setConfig(newConfig);
  };

  const generateNumber = (increment: boolean = true): string => {
    const now = new Date();
    const parts: string[] = [];

    if (config.prefix) {
      parts.push(config.prefix);
    }

    if (config.includeYear) {
      parts.push(now.getFullYear().toString());
    }

    if (config.includeMonth) {
      parts.push((now.getMonth() + 1).toString().padStart(2, '0'));
    }

    const num = config.currentNumber.toString().padStart(config.digitCount, '0');
    parts.push(num);

    if (increment) {
      const newConfig = { ...config, currentNumber: config.currentNumber + 1 };
      saveConfig(newConfig);
    }

    return parts.join(config.separator);
  };

  const handleGenerate = () => {
    const number = generateNumber(true);
    onGenerate?.(number);
    setPreview(generateNumber(false));
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(preview);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    if (confirm('Sayacı sıfırlamak istediğinize emin misiniz?')) {
      const newConfig = { ...config, currentNumber: 1 };
      saveConfig(newConfig);
      localStorage.setItem(`${STORAGE_KEY}_lastReset`, new Date().toISOString());
    }
  };

  return (
    <div className="space-y-4">
      {/* Preview */}
      <div className="bg-gray-50 rounded-lg p-4">
        <p className="text-xs text-gray-500 mb-2">Sonraki Belge Numarası</p>
        <div className="flex items-center gap-2">
          <code className="text-2xl font-mono font-bold text-blue-600">{preview}</code>
          <button
            onClick={handleCopy}
            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
            title="Kopyala"
          >
            {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleGenerate}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Hash className="h-4 w-4" />
          Numara Oluştur
        </button>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className={`p-2 border rounded-lg ${showSettings ? 'bg-gray-100' : 'hover:bg-gray-50'}`}
        >
          <Settings className="h-5 w-5" />
        </button>
        <button
          onClick={handleReset}
          className="p-2 border rounded-lg hover:bg-gray-50 text-orange-600"
          title="Sayacı Sıfırla"
        >
          <RefreshCw className="h-5 w-5" />
        </button>
      </div>

      {/* Settings */}
      {showSettings && (
        <div className="border rounded-lg p-4 space-y-4">
          <h4 className="font-medium">Numaralandırma Ayarları</h4>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Önek</label>
              <input
                type="text"
                value={config.prefix}
                onChange={(e) => saveConfig({ ...config, prefix: e.target.value.toUpperCase() })}
                className="w-full border rounded-lg px-3 py-2"
                placeholder="BLG"
                maxLength={5}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Ayırıcı</label>
              <select
                value={config.separator}
                onChange={(e) => saveConfig({ ...config, separator: e.target.value })}
                className="w-full border rounded-lg px-3 py-2"
              >
                <option value="-">Tire (-)</option>
                <option value="/">Eğik Çizgi (/)</option>
                <option value=".">Nokta (.)</option>
                <option value="_">Alt Çizgi (_)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Basamak Sayısı</label>
              <select
                value={config.digitCount}
                onChange={(e) => saveConfig({ ...config, digitCount: parseInt(e.target.value) })}
                className="w-full border rounded-lg px-3 py-2"
              >
                <option value={3}>3 (001)</option>
                <option value={4}>4 (0001)</option>
                <option value={5}>5 (00001)</option>
                <option value={6}>6 (000001)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Sıfırlama Periyodu</label>
              <select
                value={config.resetPeriod}
                onChange={(e) => saveConfig({ ...config, resetPeriod: e.target.value as any })}
                className="w-full border rounded-lg px-3 py-2"
              >
                <option value="never">Hiçbir Zaman</option>
                <option value="yearly">Yıllık</option>
                <option value="monthly">Aylık</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.includeYear}
                onChange={(e) => saveConfig({ ...config, includeYear: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm">Yıl ekle</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.includeMonth}
                onChange={(e) => saveConfig({ ...config, includeMonth: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm">Ay ekle</span>
            </label>
          </div>

          <div className="text-xs text-gray-500">
            Mevcut sayaç: {config.currentNumber}
          </div>
        </div>
      )}
    </div>
  );
}
