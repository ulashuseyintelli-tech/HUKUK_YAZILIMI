// Kullanıcı ayarları yönetimi

export interface UserSettings {
  // Takip Sihirbazı
  showWizardOnNewCase: boolean;
  
  // Görünüm
  sidebarCollapsed: boolean;
  darkMode: boolean;
  
  // Bildirimler
  showNotifications: boolean;
  soundEnabled: boolean;
  
  // Otomasyon
  defaultAutoModeEnabled: boolean;
  
  // Varsayılan Değerler
  defaultExecutionPath: string;
  defaultCity: string;
  
  // Dashboard Widget'ları
  dashboardWidgets: {
    stats: boolean;
    expiringPoas: boolean;
    riskDistribution: boolean;
    automationStatus: boolean;
    upcomingActions: boolean;
    recentActions: boolean;
    aiSuggestions: boolean;
    calendar: boolean;
  };
  
  // Dashboard Widget Sırası
  dashboardWidgetOrder: string[];
  
  // Dashboard Düzenleme Kilidi
  dashboardLocked: boolean;
}

const DEFAULT_SETTINGS: UserSettings = {
  showWizardOnNewCase: true,
  sidebarCollapsed: false,
  darkMode: false,
  showNotifications: true,
  soundEnabled: false,
  defaultAutoModeEnabled: true,
  defaultExecutionPath: 'HACIZ',
  defaultCity: '',
  dashboardWidgets: {
    stats: true,
    expiringPoas: true,
    riskDistribution: true,
    automationStatus: true,
    upcomingActions: true,
    recentActions: true,
    aiSuggestions: true,
    calendar: true,
  },
  dashboardWidgetOrder: [
    'quickSummary',
    'recentFavorites',
    'expiringPoas',
    'stats',
    'riskAutomation',
    'activityEvents',
    'aiSuggestions',
  ],
  dashboardLocked: true,
};

const STORAGE_KEY = 'hukuk_user_settings';

export function getUserSettings(): UserSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.error('Settings load error:', e);
  }
  return DEFAULT_SETTINGS;
}

export function saveUserSettings(settings: Partial<UserSettings>): UserSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  
  try {
    const current = getUserSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.error('Settings save error:', e);
    return getUserSettings();
  }
}

export function resetUserSettings(): UserSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  
  localStorage.removeItem(STORAGE_KEY);
  return DEFAULT_SETTINGS;
}

// Hook for React components
import { useState, useEffect } from 'react';

export function useUserSettings() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setSettings(getUserSettings());
    setLoaded(true);
  }, []);

  const updateSettings = (newSettings: Partial<UserSettings>) => {
    const updated = saveUserSettings(newSettings);
    setSettings(updated);
  };

  const resetSettings = () => {
    const reset = resetUserSettings();
    setSettings(reset);
  };

  return { settings, updateSettings, resetSettings, loaded };
}
