'use client';

import { useState, useEffect } from 'react';
import { Bell, Mail, MessageSquare, Clock, Save, Check } from 'lucide-react';
import { api } from '@/lib/api';

interface NotificationPreferences {
  emailEnabled: boolean;
  smsEnabled: boolean;
  
  // E-posta bildirimleri
  emailPoaExpiring: boolean;
  emailCaseUpdate: boolean;
  emailTaskReminder: boolean;
  emailDailyDigest: boolean;
  
  // SMS bildirimleri
  smsUrgentOnly: boolean;
  smsPoaExpiring: boolean;
  smsCaseUpdate: boolean;
  
  // Zamanlama
  digestTime: string; // "09:00"
  reminderDaysBefore: number;
}

const DEFAULT_PREFS: NotificationPreferences = {
  emailEnabled: true,
  smsEnabled: false,
  emailPoaExpiring: true,
  emailCaseUpdate: true,
  emailTaskReminder: true,
  emailDailyDigest: false,
  smsUrgentOnly: true,
  smsPoaExpiring: false,
  smsCaseUpdate: false,
  digestTime: '09:00',
  reminderDaysBefore: 7,
};

export default function NotificationSettingsPage() {
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      // localStorage'dan yükle (backend entegrasyonu sonra eklenebilir)
      const stored = localStorage.getItem('notification_prefs');
      if (stored) {
        setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(stored) });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const savePreferences = async () => {
    setSaving(true);
    try {
      localStorage.setItem('notification_prefs', JSON.stringify(prefs));
      // Backend'e de kaydet (opsiyonel)
      // await api.put('/user/notification-preferences', prefs);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const updatePref = (key: keyof NotificationPreferences, value: any) => {
    setPrefs(prev => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64">Yükleniyor...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Bell className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Bildirim Ayarları</h1>
            <p className="text-xs text-muted-foreground">E-posta ve SMS bildirim tercihlerinizi yönetin</p>
          </div>
        </div>
        <button
          onClick={savePreferences}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saved ? 'Kaydedildi' : saving ? 'Kaydediliyor...' : 'Kaydet'}
        </button>
      </div>

      {/* E-posta Bildirimleri */}
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Mail className="h-5 w-5 text-gray-600" />
            <h2 className="font-semibold">E-posta Bildirimleri</h2>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-sm text-gray-600">Aktif</span>
            <input
              type="checkbox"
              checked={prefs.emailEnabled}
              onChange={(e) => updatePref('emailEnabled', e.target.checked)}
              className="w-5 h-5 rounded"
            />
          </label>
        </div>
        
        <div className={`space-y-3 ${!prefs.emailEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
          <label className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-sm">Vekalet Süresi Uyarıları</p>
              <p className="text-xs text-gray-500">Süresi dolmak üzere olan vekaletler için bildirim</p>
            </div>
            <input type="checkbox" checked={prefs.emailPoaExpiring} onChange={(e) => updatePref('emailPoaExpiring', e.target.checked)} className="w-5 h-5 rounded" />
          </label>
          
          <label className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-sm">Dosya Güncellemeleri</p>
              <p className="text-xs text-gray-500">Takip dosyalarındaki önemli değişiklikler</p>
            </div>
            <input type="checkbox" checked={prefs.emailCaseUpdate} onChange={(e) => updatePref('emailCaseUpdate', e.target.checked)} className="w-5 h-5 rounded" />
          </label>
          
          <label className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-sm">Görev Hatırlatıcıları</p>
              <p className="text-xs text-gray-500">Yaklaşan görevler ve son tarihler</p>
            </div>
            <input type="checkbox" checked={prefs.emailTaskReminder} onChange={(e) => updatePref('emailTaskReminder', e.target.checked)} className="w-5 h-5 rounded" />
          </label>
          
          <label className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-sm">Günlük Özet</p>
              <p className="text-xs text-gray-500">Her gün belirlenen saatte özet e-posta</p>
            </div>
            <input type="checkbox" checked={prefs.emailDailyDigest} onChange={(e) => updatePref('emailDailyDigest', e.target.checked)} className="w-5 h-5 rounded" />
          </label>
        </div>
      </div>

      {/* SMS Bildirimleri */}
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <MessageSquare className="h-5 w-5 text-gray-600" />
            <h2 className="font-semibold">SMS Bildirimleri</h2>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-sm text-gray-600">Aktif</span>
            <input
              type="checkbox"
              checked={prefs.smsEnabled}
              onChange={(e) => updatePref('smsEnabled', e.target.checked)}
              className="w-5 h-5 rounded"
            />
          </label>
        </div>
        
        <div className={`space-y-3 ${!prefs.smsEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
          <label className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-sm">Sadece Acil Bildirimler</p>
              <p className="text-xs text-gray-500">Yalnızca kritik durumlar için SMS gönder</p>
            </div>
            <input type="checkbox" checked={prefs.smsUrgentOnly} onChange={(e) => updatePref('smsUrgentOnly', e.target.checked)} className="w-5 h-5 rounded" />
          </label>
          
          <label className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-sm">Vekalet Süresi (SMS)</p>
              <p className="text-xs text-gray-500">Vekalet süresi dolmadan SMS uyarısı</p>
            </div>
            <input type="checkbox" checked={prefs.smsPoaExpiring} onChange={(e) => updatePref('smsPoaExpiring', e.target.checked)} className="w-5 h-5 rounded" />
          </label>
        </div>
      </div>

      {/* Zamanlama */}
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center gap-3 mb-4">
          <Clock className="h-5 w-5 text-gray-600" />
          <h2 className="font-semibold">Zamanlama</h2>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Günlük Özet Saati</label>
            <input
              type="time"
              value={prefs.digestTime}
              onChange={(e) => updatePref('digestTime', e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Hatırlatma (Gün Önce)</label>
            <select
              value={prefs.reminderDaysBefore}
              onChange={(e) => updatePref('reminderDaysBefore', parseInt(e.target.value))}
              className="w-full border rounded-lg px-3 py-2"
            >
              <option value={3}>3 gün</option>
              <option value={7}>7 gün</option>
              <option value={14}>14 gün</option>
              <option value={30}>30 gün</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
