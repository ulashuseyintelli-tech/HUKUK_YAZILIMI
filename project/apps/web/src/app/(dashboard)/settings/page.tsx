"use client";

import { useState, useEffect } from "react";
import { Settings, Wand2, Bell, Zap, Eye, RotateCcw, Check, Moon, Sun } from "lucide-react";
import { useUserSettings, UserSettings } from "@/lib/user-settings";

export default function SettingsPage() {
  const { settings, updateSettings, resetSettings, loaded } = useUserSettings();
  const [saved, setSaved] = useState(false);

  const handleToggle = (key: keyof UserSettings) => {
    updateSettings({ [key]: !settings[key] });
    showSaved();
  };

  const handleSelect = (key: keyof UserSettings, value: string) => {
    updateSettings({ [key]: value });
    showSaved();
  };

  const showSaved = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    if (confirm("Tüm ayarları varsayılana döndürmek istediğinize emin misiniz?")) {
      resetSettings();
      showSaved();
    }
  };

  if (!loaded) {
    return <div className="p-6">Yükleniyor...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Settings className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Ayarlar</h1>
        </div>
        {saved && (
          <span className="flex items-center gap-1 text-green-600 text-sm">
            <Check className="h-4 w-4" /> Kaydedildi
          </span>
        )}
      </div>

      <div className="space-y-6">
        {/* Takip Sihirbazı Ayarları */}
        <div className="bg-white rounded-xl border p-6">
          <div className="flex items-center gap-3 mb-4">
            <Wand2 className="h-5 w-5 text-purple-500" />
            <h2 className="text-lg font-semibold">Takip Sihirbazı</h2>
          </div>
          
          <div className="space-y-4">
            <SettingToggle
              label="Yeni takipte sihirbazı göster"
              description="Yeni takip oluştururken form seçim sihirbazını otomatik başlat"
              checked={settings.showWizardOnNewCase}
              onChange={() => handleToggle("showWizardOnNewCase")}
            />
          </div>
        </div>

        {/* Otomasyon Ayarları */}
        <div className="bg-white rounded-xl border p-6">
          <div className="flex items-center gap-3 mb-4">
            <Zap className="h-5 w-5 text-yellow-500" />
            <h2 className="text-lg font-semibold">Otomasyon</h2>
          </div>
          
          <div className="space-y-4">
            <SettingToggle
              label="Varsayılan otomatik mod"
              description="Yeni takiplerde otomatik modu varsayılan olarak aç"
              checked={settings.defaultAutoModeEnabled}
              onChange={() => handleToggle("defaultAutoModeEnabled")}
            />

            <div>
              <label className="block text-sm font-medium mb-1">Varsayılan Takip Yolu</label>
              <select
                value={settings.defaultExecutionPath}
                onChange={(e) => handleSelect("defaultExecutionPath", e.target.value)}
                className="w-full max-w-xs rounded-lg border px-3 py-2 text-sm"
              >
                <option value="HACIZ">Haciz Yolu</option>
                <option value="IFLAS">İflas Yolu</option>
                <option value="REHIN">Rehin Paraya Çevirme</option>
                <option value="IPOTEK">İpotek Paraya Çevirme</option>
                <option value="TAHLIYE">Tahliye</option>
              </select>
            </div>
          </div>
        </div>

        {/* Bildirim Ayarları */}
        <div className="bg-white rounded-xl border p-6">
          <div className="flex items-center gap-3 mb-4">
            <Bell className="h-5 w-5 text-blue-500" />
            <h2 className="text-lg font-semibold">Bildirimler</h2>
          </div>
          
          <div className="space-y-4">
            <SettingToggle
              label="Bildirimleri göster"
              description="Uygulama içi bildirimleri etkinleştir"
              checked={settings.showNotifications}
              onChange={() => handleToggle("showNotifications")}
            />
            <SettingToggle
              label="Ses efektleri"
              description="Bildirim geldiğinde ses çal"
              checked={settings.soundEnabled}
              onChange={() => handleToggle("soundEnabled")}
            />
          </div>
        </div>

        {/* Görünüm Ayarları */}
        <div className="bg-white rounded-xl border p-6">
          <div className="flex items-center gap-3 mb-4">
            <Eye className="h-5 w-5 text-green-500" />
            <h2 className="text-lg font-semibold">Görünüm</h2>
          </div>
          
          <div className="space-y-4">
            <SettingToggle
              label="Karanlık mod"
              description="Koyu tema kullan (yakında)"
              checked={settings.darkMode}
              onChange={() => handleToggle("darkMode")}
              icon={settings.darkMode ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              disabled
            />
            <SettingToggle
              label="Kenar çubuğunu daralt"
              description="Sol menüyü varsayılan olarak daralt"
              checked={settings.sidebarCollapsed}
              onChange={() => handleToggle("sidebarCollapsed")}
            />
          </div>
        </div>

        {/* Sıfırla */}
        <div className="bg-white rounded-xl border p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">Ayarları Sıfırla</h3>
              <p className="text-sm text-muted-foreground">Tüm ayarları varsayılan değerlere döndür</p>
            </div>
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-4 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
            >
              <RotateCcw className="h-4 w-4" />
              Sıfırla
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface SettingToggleProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
  icon?: React.ReactNode;
  disabled?: boolean;
}

function SettingToggle({ label, description, checked, onChange, icon, disabled }: SettingToggleProps) {
  return (
    <div 
      className={`flex items-center justify-between p-3 rounded-lg border ${disabled ? 'opacity-50' : 'hover:bg-gray-50 cursor-pointer'}`}
      onClick={disabled ? undefined : onChange}
    >
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <p className="font-medium text-sm">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div
        className={`w-11 h-6 rounded-full transition-colors ${
          checked ? "bg-primary" : "bg-gray-200"
        } ${disabled ? 'cursor-not-allowed' : ''}`}
      >
        <div
          className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform mt-0.5 ${
            checked ? "translate-x-5 ml-0.5" : "translate-x-0.5"
          }`}
        />
      </div>
    </div>
  );
}
