'use client';

import { useState, useEffect } from 'react';
import { Settings, Save, RotateCcw, Loader2, Check, Building, FileText, Bell, Shield, Database } from 'lucide-react';

interface SystemSettings {
  // General
  officeName: string;
  officeAddress: string;
  officePhone: string;
  officeEmail: string;
  
  // Defaults
  defaultCaseType: string;
  defaultRiskLevel: string;
  defaultInterestRate: number;
  autoAssignLawyer: boolean;
  
  // Notifications
  emailNotifications: boolean;
  smsNotifications: boolean;
  reminderDaysBefore: number;
  dailySummaryTime: string;
  
  // Security
  sessionTimeout: number;
  requireStrongPassword: boolean;
  maxLoginAttempts: number;
  
  // Data
  autoBackup: boolean;
  backupFrequency: 'daily' | 'weekly' | 'monthly';
  retentionDays: number;
}

const DEFAULT_SETTINGS: SystemSettings = {
  officeName: '',
  officeAddress: '',
  officePhone: '',
  officeEmail: '',
  defaultCaseType: 'ILAMSIZ',
  defaultRiskLevel: 'MEDIUM',
  defaultInterestRate: 24,
  autoAssignLawyer: false,
  emailNotifications: true,
  smsNotifications: false,
  reminderDaysBefore: 3,
  dailySummaryTime: '09:00',
  sessionTimeout: 30,
  requireStrongPassword: true,
  maxLoginAttempts: 5,
  autoBackup: true,
  backupFrequency: 'daily',
  retentionDays: 90,
};

const STORAGE_KEY = 'systemSettings';

export function SystemSettingsPanel() {
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeSection, setActiveSection] = useState('general');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = () => {
    setLoading(true);
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
      }
    } catch (e) {
      console.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
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
    if (confirm('Tüm ayarları varsayılana döndürmek istediğinize emin misiniz?')) {
      setSettings(DEFAULT_SETTINGS);
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  const updateSetting = <K extends keyof SystemSettings>(key: K, value: SystemSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const sections = [
    { id: 'general', label: 'Genel', icon: Building },
    { id: 'defaults', label: 'Varsayılanlar', icon: FileText },
    { id: 'notifications', label: 'Bildirimler', icon: Bell },
    { id: 'security', label: 'Güvenlik', icon: Shield },
    { id: 'data', label: 'Veri', icon: Database },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Sistem Ayarları
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className="px-3 py-1.5 border rounded-lg hover:bg-gray-50 text-sm flex items-center gap-1"
          >
            <RotateCcw className="h-4 w-4" />
            Sıfırla
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm flex items-center gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {saved ? 'Kaydedildi' : 'Kaydet'}
          </button>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-48 space-y-1">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left ${
                activeSection === section.id
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'hover:bg-gray-50 text-gray-600'
              }`}
            >
              <section.icon className="h-4 w-4" />
              {section.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 bg-white rounded-xl border p-6">
          {/* General */}
          {activeSection === 'general' && (
            <div className="space-y-4">
              <h3 className="font-medium mb-4">Büro Bilgileri</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Büro Adı</label>
                  <input type="text" value={settings.officeName} onChange={(e) => updateSetting('officeName', e.target.value)} className="w-full border rounded-lg px-3 py-2" placeholder="Hukuk Bürosu" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">E-posta</label>
                  <input type="email" value={settings.officeEmail} onChange={(e) => updateSetting('officeEmail', e.target.value)} className="w-full border rounded-lg px-3 py-2" placeholder="info@buro.com" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Telefon</label>
                  <input type="tel" value={settings.officePhone} onChange={(e) => updateSetting('officePhone', e.target.value)} className="w-full border rounded-lg px-3 py-2" placeholder="0212 123 45 67" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1">Adres</label>
                  <textarea value={settings.officeAddress} onChange={(e) => updateSetting('officeAddress', e.target.value)} className="w-full border rounded-lg px-3 py-2 resize-none" rows={2} placeholder="Büro adresi" />
                </div>
              </div>
            </div>
          )}

          {/* Defaults */}
          {activeSection === 'defaults' && (
            <div className="space-y-4">
              <h3 className="font-medium mb-4">Varsayılan Değerler</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Varsayılan Takip Türü</label>
                  <select value={settings.defaultCaseType} onChange={(e) => updateSetting('defaultCaseType', e.target.value)} className="w-full border rounded-lg px-3 py-2">
                    <option value="ILAMSIZ">İlamsız</option>
                    <option value="ILAMLI">İlamlı</option>
                    <option value="KAMBIYO">Kambiyo</option>
                    <option value="REHIN">Rehin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Varsayılan Risk Seviyesi</label>
                  <select value={settings.defaultRiskLevel} onChange={(e) => updateSetting('defaultRiskLevel', e.target.value)} className="w-full border rounded-lg px-3 py-2">
                    <option value="LOW">Düşük</option>
                    <option value="MEDIUM">Orta</option>
                    <option value="HIGH">Yüksek</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Varsayılan Faiz Oranı (%)</label>
                  <input type="number" value={settings.defaultInterestRate} onChange={(e) => updateSetting('defaultInterestRate', parseFloat(e.target.value) || 0)} className="w-full border rounded-lg px-3 py-2" min={0} max={100} />
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="autoAssign" checked={settings.autoAssignLawyer} onChange={(e) => updateSetting('autoAssignLawyer', e.target.checked)} className="rounded" />
                  <label htmlFor="autoAssign" className="text-sm">Avukat otomatik ata</label>
                </div>
              </div>
            </div>
          )}

          {/* Notifications */}
          {activeSection === 'notifications' && (
            <div className="space-y-4">
              <h3 className="font-medium mb-4">Bildirim Ayarları</h3>
              <div className="space-y-3">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={settings.emailNotifications} onChange={(e) => updateSetting('emailNotifications', e.target.checked)} className="rounded" />
                  <span className="text-sm">E-posta bildirimleri</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={settings.smsNotifications} onChange={(e) => updateSetting('smsNotifications', e.target.checked)} className="rounded" />
                  <span className="text-sm">SMS bildirimleri</span>
                </label>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Hatırlatma (gün önce)</label>
                    <input type="number" value={settings.reminderDaysBefore} onChange={(e) => updateSetting('reminderDaysBefore', parseInt(e.target.value) || 0)} className="w-full border rounded-lg px-3 py-2" min={1} max={30} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Günlük Özet Saati</label>
                    <input type="time" value={settings.dailySummaryTime} onChange={(e) => updateSetting('dailySummaryTime', e.target.value)} className="w-full border rounded-lg px-3 py-2" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Security */}
          {activeSection === 'security' && (
            <div className="space-y-4">
              <h3 className="font-medium mb-4">Güvenlik Ayarları</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Oturum Zaman Aşımı (dk)</label>
                  <input type="number" value={settings.sessionTimeout} onChange={(e) => updateSetting('sessionTimeout', parseInt(e.target.value) || 30)} className="w-full border rounded-lg px-3 py-2" min={5} max={120} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Maks. Giriş Denemesi</label>
                  <input type="number" value={settings.maxLoginAttempts} onChange={(e) => updateSetting('maxLoginAttempts', parseInt(e.target.value) || 5)} className="w-full border rounded-lg px-3 py-2" min={3} max={10} />
                </div>
              </div>
              <label className="flex items-center gap-2 mt-2">
                <input type="checkbox" checked={settings.requireStrongPassword} onChange={(e) => updateSetting('requireStrongPassword', e.target.checked)} className="rounded" />
                <span className="text-sm">Güçlü şifre zorunlu</span>
              </label>
            </div>
          )}

          {/* Data */}
          {activeSection === 'data' && (
            <div className="space-y-4">
              <h3 className="font-medium mb-4">Veri Yönetimi</h3>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={settings.autoBackup} onChange={(e) => updateSetting('autoBackup', e.target.checked)} className="rounded" />
                <span className="text-sm">Otomatik yedekleme</span>
              </label>
              {settings.autoBackup && (
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Yedekleme Sıklığı</label>
                    <select value={settings.backupFrequency} onChange={(e) => updateSetting('backupFrequency', e.target.value as any)} className="w-full border rounded-lg px-3 py-2">
                      <option value="daily">Günlük</option>
                      <option value="weekly">Haftalık</option>
                      <option value="monthly">Aylık</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Saklama Süresi (gün)</label>
                    <input type="number" value={settings.retentionDays} onChange={(e) => updateSetting('retentionDays', parseInt(e.target.value) || 90)} className="w-full border rounded-lg px-3 py-2" min={30} max={365} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
