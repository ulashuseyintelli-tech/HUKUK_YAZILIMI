'use client';

import { useState, useEffect } from 'react';
import { User, Mail, Phone, Building, Shield, Camera, Save, Loader2, Key, Bell, Clock, Globe } from 'lucide-react';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  department?: string;
  avatar?: string;
  createdAt: string;
  lastLogin?: string;
  preferences: {
    language: string;
    timezone: string;
    notifications: boolean;
    emailDigest: 'daily' | 'weekly' | 'never';
  };
}

export function UserProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'preferences'>('profile');
  const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });

  useEffect(() => { loadProfile(); }, []);

  const loadProfile = () => {
    // Demo data
    setProfile({
      id: '1', name: 'Ahmet Yılmaz', email: 'ahmet@hukuk.com', phone: '0532 123 45 67',
      role: 'Avukat', department: 'İcra Hukuku', createdAt: '2023-01-15T10:00:00Z',
      lastLogin: new Date().toISOString(),
      preferences: { language: 'tr', timezone: 'Europe/Istanbul', notifications: true, emailDigest: 'daily' }
    });
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 1000));
    setSaving(false);
    alert('Profil güncellendi');
  };

  const handlePasswordChange = async () => {
    if (passwords.new !== passwords.confirm) { alert('Şifreler eşleşmiyor'); return; }
    if (passwords.new.length < 8) { alert('Şifre en az 8 karakter olmalı'); return; }
    setSaving(true);
    await new Promise(r => setTimeout(r, 1000));
    setSaving(false);
    setPasswords({ current: '', new: '', confirm: '' });
    alert('Şifre değiştirildi');
  };

  if (loading || !profile) return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center gap-6">
          <div className="relative">
            <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center text-3xl font-bold text-blue-600">
              {profile.name.split(' ').map(n => n[0]).join('')}
            </div>
            <button className="absolute bottom-0 right-0 p-2 bg-white border rounded-full shadow hover:bg-gray-50">
              <Camera className="h-4 w-4 text-gray-500" />
            </button>
          </div>
          <div>
            <h1 className="text-2xl font-bold">{profile.name}</h1>
            <p className="text-gray-500">{profile.role} {profile.department && `• ${profile.department}`}</p>
            <p className="text-sm text-gray-400 mt-1">Üyelik: {new Date(profile.createdAt).toLocaleDateString('tr-TR')}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {[
          { id: 'profile', label: 'Profil', icon: <User className="h-4 w-4" /> },
          { id: 'security', label: 'Güvenlik', icon: <Shield className="h-4 w-4" /> },
          { id: 'preferences', label: 'Tercihler', icon: <Bell className="h-4 w-4" /> },
        ].map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 -mb-px ${activeTab === tab.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1"><User className="h-4 w-4 inline mr-1" />Ad Soyad</label>
              <input type="text" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1"><Mail className="h-4 w-4 inline mr-1" />E-posta</label>
              <input type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1"><Phone className="h-4 w-4 inline mr-1" />Telefon</label>
              <input type="tel" value={profile.phone || ''} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1"><Building className="h-4 w-4 inline mr-1" />Departman</label>
              <input type="text" value={profile.department || ''} onChange={(e) => setProfile({ ...profile, department: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
            </div>
          </div>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Kaydet
          </button>
        </div>
      )}

      {/* Security Tab */}
      {activeTab === 'security' && (
        <div className="bg-white rounded-xl border p-6 space-y-6">
          <div>
            <h3 className="font-medium mb-4 flex items-center gap-2"><Key className="h-5 w-5" />Şifre Değiştir</h3>
            <div className="space-y-3 max-w-md">
              <input type="password" placeholder="Mevcut şifre" value={passwords.current} onChange={(e) => setPasswords({ ...passwords, current: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
              <input type="password" placeholder="Yeni şifre (min 8 karakter)" value={passwords.new} onChange={(e) => setPasswords({ ...passwords, new: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
              <input type="password" placeholder="Yeni şifre (tekrar)" value={passwords.confirm} onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
              <button onClick={handlePasswordChange} disabled={saving || !passwords.current || !passwords.new} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Key className="h-4 w-4" />}Şifreyi Değiştir
              </button>
            </div>
          </div>
          <div className="pt-4 border-t">
            <h3 className="font-medium mb-2">Son Giriş</h3>
            <p className="text-sm text-gray-500">{profile.lastLogin ? new Date(profile.lastLogin).toLocaleString('tr-TR') : 'Bilinmiyor'}</p>
          </div>
        </div>
      )}

      {/* Preferences Tab */}
      {activeTab === 'preferences' && (
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1"><Globe className="h-4 w-4 inline mr-1" />Dil</label>
              <select value={profile.preferences.language} onChange={(e) => setProfile({ ...profile, preferences: { ...profile.preferences, language: e.target.value } })} className="w-full border rounded-lg px-3 py-2">
                <option value="tr">Türkçe</option>
                <option value="en">English</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1"><Clock className="h-4 w-4 inline mr-1" />Saat Dilimi</label>
              <select value={profile.preferences.timezone} onChange={(e) => setProfile({ ...profile, preferences: { ...profile.preferences, timezone: e.target.value } })} className="w-full border rounded-lg px-3 py-2">
                <option value="Europe/Istanbul">İstanbul (UTC+3)</option>
                <option value="Europe/London">Londra (UTC+0)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1"><Mail className="h-4 w-4 inline mr-1" />E-posta Özeti</label>
            <select value={profile.preferences.emailDigest} onChange={(e) => setProfile({ ...profile, preferences: { ...profile.preferences, emailDigest: e.target.value as UserProfile['preferences']['emailDigest'] } })} className="w-full border rounded-lg px-3 py-2 max-w-xs">
              <option value="daily">Günlük</option>
              <option value="weekly">Haftalık</option>
              <option value="never">Gönderme</option>
            </select>
          </div>
          <label className="flex items-center gap-3">
            <input type="checkbox" checked={profile.preferences.notifications} onChange={(e) => setProfile({ ...profile, preferences: { ...profile.preferences, notifications: e.target.checked } })} className="w-4 h-4 rounded" />
            <span>Anlık bildirimleri etkinleştir</span>
          </label>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Kaydet
          </button>
        </div>
      )}
    </div>
  );
}
