'use client';

import { useState, useEffect } from 'react';
import { Palette, Sun, Moon, Monitor, Check, RotateCcw, Save, Loader2 } from 'lucide-react';

interface ThemeSettings {
  mode: 'light' | 'dark' | 'system';
  primaryColor: string;
  accentColor: string;
  fontSize: 'small' | 'medium' | 'large';
  compactMode: boolean;
  borderRadius: 'none' | 'small' | 'medium' | 'large';
  sidebarStyle: 'default' | 'compact' | 'icons-only';
}

interface ThemeCustomizerProps {
  onClose?: () => void;
}

const PRIMARY_COLORS = [
  { id: 'blue', value: '#3B82F6', label: 'Mavi' },
  { id: 'indigo', value: '#6366F1', label: 'İndigo' },
  { id: 'purple', value: '#8B5CF6', label: 'Mor' },
  { id: 'pink', value: '#EC4899', label: 'Pembe' },
  { id: 'red', value: '#EF4444', label: 'Kırmızı' },
  { id: 'orange', value: '#F97316', label: 'Turuncu' },
  { id: 'green', value: '#22C55E', label: 'Yeşil' },
  { id: 'teal', value: '#14B8A6', label: 'Turkuaz' },
];

const STORAGE_KEY = 'themeSettings';

const DEFAULT_SETTINGS: ThemeSettings = {
  mode: 'light',
  primaryColor: 'blue',
  accentColor: 'indigo',
  fontSize: 'medium',
  compactMode: false,
  borderRadius: 'medium',
  sidebarStyle: 'default',
};

export function ThemeCustomizer({ onClose }: ThemeCustomizerProps) {
  const [settings, setSettings] = useState<ThemeSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    applyTheme(settings);
  }, [settings]);

  const loadSettings = () => {
    setLoading(true);
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
      }
    } catch (e) {
      console.error('Failed to load theme settings');
    } finally {
      setLoading(false);
    }
  };

  const applyTheme = (theme: ThemeSettings) => {
    const root = document.documentElement;
    
    // Mode
    if (theme.mode === 'dark') {
      root.classList.add('dark');
    } else if (theme.mode === 'light') {
      root.classList.remove('dark');
    } else {
      // System preference
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    }

    // Font size
    const fontSizes = { small: '14px', medium: '16px', large: '18px' };
    root.style.fontSize = fontSizes[theme.fontSize];

    // Border radius
    const radiuses = { none: '0', small: '0.25rem', medium: '0.5rem', large: '1rem' };
    root.style.setProperty('--radius', radiuses[theme.borderRadius]);

    // Compact mode
    if (theme.compactMode) {
      root.classList.add('compact');
    } else {
      root.classList.remove('compact');
    }
  };

  const handleSave = () => {
    setSaving(true);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      alert('Kaydetme başarısız');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (confirm('Tema ayarlarını sıfırlamak istediğinize emin misiniz?')) {
      setSettings(DEFAULT_SETTINGS);
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  const updateSetting = <K extends keyof ThemeSettings>(key: K, value: ThemeSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <Palette className="h-5 w-5" />
          Tema Özelleştirme
        </h3>
        <div className="flex items-center gap-2">
          <button onClick={handleReset} className="p-2 hover:bg-gray-100 rounded-lg" title="Sıfırla">
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {saved ? 'Kaydedildi' : 'Kaydet'}
          </button>
        </div>
      </div>

      {/* Mode */}
      <div>
        <label className="block text-sm font-medium mb-2">Görünüm Modu</label>
        <div className="flex gap-2">
          {[
            { id: 'light', icon: Sun, label: 'Açık' },
            { id: 'dark', icon: Moon, label: 'Koyu' },
            { id: 'system', icon: Monitor, label: 'Sistem' },
          ].map((mode) => (
            <button
              key={mode.id}
              onClick={() => updateSetting('mode', mode.id as any)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border ${
                settings.mode === mode.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'hover:bg-gray-50'
              }`}
            >
              <mode.icon className="h-4 w-4" />
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {/* Primary Color */}
      <div>
        <label className="block text-sm font-medium mb-2">Ana Renk</label>
        <div className="flex gap-2">
          {PRIMARY_COLORS.map((color) => (
            <button
              key={color.id}
              onClick={() => updateSetting('primaryColor', color.id)}
              className={`w-8 h-8 rounded-full ${
                settings.primaryColor === color.id ? 'ring-2 ring-offset-2 ring-blue-500' : ''
              }`}
              style={{ backgroundColor: color.value }}
              title={color.label}
            />
          ))}
        </div>
      </div>

      {/* Font Size */}
      <div>
        <label className="block text-sm font-medium mb-2">Yazı Boyutu</label>
        <div className="flex gap-2">
          {[
            { id: 'small', label: 'Küçük' },
            { id: 'medium', label: 'Orta' },
            { id: 'large', label: 'Büyük' },
          ].map((size) => (
            <button
              key={size.id}
              onClick={() => updateSetting('fontSize', size.id as any)}
              className={`flex-1 px-4 py-2 rounded-lg border ${
                settings.fontSize === size.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'hover:bg-gray-50'
              }`}
            >
              {size.label}
            </button>
          ))}
        </div>
      </div>

      {/* Border Radius */}
      <div>
        <label className="block text-sm font-medium mb-2">Köşe Yuvarlaklığı</label>
        <div className="flex gap-2">
          {[
            { id: 'none', label: 'Yok' },
            { id: 'small', label: 'Az' },
            { id: 'medium', label: 'Orta' },
            { id: 'large', label: 'Çok' },
          ].map((radius) => (
            <button
              key={radius.id}
              onClick={() => updateSetting('borderRadius', radius.id as any)}
              className={`flex-1 px-4 py-2 rounded-lg border ${
                settings.borderRadius === radius.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'hover:bg-gray-50'
              }`}
            >
              {radius.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sidebar Style */}
      <div>
        <label className="block text-sm font-medium mb-2">Kenar Çubuğu</label>
        <select
          value={settings.sidebarStyle}
          onChange={(e) => updateSetting('sidebarStyle', e.target.value as any)}
          className="w-full border rounded-lg px-3 py-2"
        >
          <option value="default">Varsayılan</option>
          <option value="compact">Kompakt</option>
          <option value="icons-only">Sadece İkonlar</option>
        </select>
      </div>

      {/* Compact Mode */}
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={settings.compactMode}
          onChange={(e) => updateSetting('compactMode', e.target.checked)}
          className="rounded"
        />
        <span className="text-sm">Kompakt Mod (daha az boşluk)</span>
      </label>

      {/* Preview */}
      <div className="border rounded-lg p-4 bg-gray-50">
        <p className="text-sm font-medium mb-2">Önizleme</p>
        <div className="flex gap-2">
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">
            Birincil Buton
          </button>
          <button className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-100">
            İkincil Buton
          </button>
        </div>
      </div>
    </div>
  );
}
