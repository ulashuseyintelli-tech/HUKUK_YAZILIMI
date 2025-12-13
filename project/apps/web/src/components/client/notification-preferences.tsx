'use client';

import { useState, useEffect } from 'react';
import { Bell, Mail, MessageSquare, Phone, Clock, Save, Loader2 } from 'lucide-react';

interface NotificationPreference {
  channel: 'email' | 'sms' | 'push';
  enabled: boolean;
}

interface TopicPreference {
  topic: string;
  label: string;
  email: boolean;
  sms: boolean;
  push: boolean;
}

interface ClientNotificationPreferencesProps {
  clientId: string;
}

const STORAGE_KEY = 'clientNotificationPrefs';

export function ClientNotificationPreferences({ clientId }: ClientNotificationPreferencesProps) {
  const [channels, setChannels] = useState<NotificationPreference[]>([
    { channel: 'email', enabled: true },
    { channel: 'sms', enabled: true },
    { channel: 'push', enabled: false },
  ]);
  const [topics, setTopics] = useState<TopicPreference[]>([
    { topic: 'case_update', label: 'Dosya Güncellemeleri', email: true, sms: false, push: true },
    { topic: 'payment', label: 'Ödeme Bildirimleri', email: true, sms: true, push: true },
    { topic: 'hearing', label: 'Duruşma Hatırlatmaları', email: true, sms: true, push: true },
    { topic: 'document', label: 'Belge Bildirimleri', email: true, sms: false, push: false },
    { topic: 'deadline', label: 'Son Tarih Uyarıları', email: true, sms: true, push: true },
    { topic: 'report', label: 'Raporlar', email: true, sms: false, push: false },
  ]);
  const [frequency, setFrequency] = useState<'instant' | 'daily' | 'weekly'>('instant');
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadPreferences(); }, [clientId]);

  const loadPreferences = () => {
    try {
      const stored = localStorage.getItem(`${STORAGE_KEY}_${clientId}`);
      if (stored) {
        const data = JSON.parse(stored);
        if (data.channels) setChannels(data.channels);
        if (data.topics) setTopics(data.topics);
        if (data.frequency) setFrequency(data.frequency);
      }
    } catch (e) { console.error('Failed to load preferences'); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      localStorage.setItem(`${STORAGE_KEY}_${clientId}`, JSON.stringify({ channels, topics, frequency }));
      await new Promise(r => setTimeout(r, 500));
      alert('Tercihler kaydedildi');
    } catch (e) { alert('Kaydetme başarısız'); }
    finally { setSaving(false); }
  };

  const toggleChannel = (channel: NotificationPreference['channel']) => {
    setChannels(channels.map(c => c.channel === channel ? { ...c, enabled: !c.enabled } : c));
  };

  const toggleTopic = (topic: string, channel: 'email' | 'sms' | 'push') => {
    setTopics(topics.map(t => t.topic === topic ? { ...t, [channel]: !t[channel] } : t));
  };

  const channelIcons = { email: <Mail className="h-5 w-5" />, sms: <MessageSquare className="h-5 w-5" />, push: <Bell className="h-5 w-5" /> };
  const channelLabels = { email: 'E-posta', sms: 'SMS', push: 'Anlık Bildirim' };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-medium flex items-center gap-2"><Bell className="h-5 w-5" />Bildirim Tercihleri</h3>
        <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Kaydet
        </button>
      </div>

      {/* Channels */}
      <div className="bg-white border rounded-xl p-4">
        <h4 className="font-medium mb-3">Bildirim Kanalları</h4>
        <div className="grid grid-cols-3 gap-4">
          {channels.map((ch) => (
            <button key={ch.channel} onClick={() => toggleChannel(ch.channel)}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${ch.enabled ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
              <div className={ch.enabled ? 'text-blue-600' : 'text-gray-400'}>{channelIcons[ch.channel]}</div>
              <span className={`text-sm font-medium ${ch.enabled ? 'text-blue-700' : 'text-gray-500'}`}>{channelLabels[ch.channel]}</span>
              <span className={`text-xs ${ch.enabled ? 'text-green-600' : 'text-gray-400'}`}>{ch.enabled ? 'Aktif' : 'Kapalı'}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Frequency */}
      <div className="bg-white border rounded-xl p-4">
        <h4 className="font-medium mb-3 flex items-center gap-2"><Clock className="h-4 w-4" />Bildirim Sıklığı</h4>
        <div className="flex gap-2">
          {[
            { id: 'instant', label: 'Anında' },
            { id: 'daily', label: 'Günlük Özet' },
            { id: 'weekly', label: 'Haftalık Özet' },
          ].map((f) => (
            <button key={f.id} onClick={() => setFrequency(f.id as typeof frequency)}
              className={`px-4 py-2 rounded-lg text-sm ${frequency === f.id ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Topics */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <div className="p-4 border-b bg-gray-50"><h4 className="font-medium">Konu Bazlı Tercihler</h4></div>
        <table className="w-full">
          <thead className="bg-gray-50 text-sm">
            <tr>
              <th className="text-left px-4 py-2">Konu</th>
              <th className="text-center px-4 py-2 w-24">E-posta</th>
              <th className="text-center px-4 py-2 w-24">SMS</th>
              <th className="text-center px-4 py-2 w-24">Anlık</th>
            </tr>
          </thead>
          <tbody>
            {topics.map((t) => (
              <tr key={t.topic} className="border-t">
                <td className="px-4 py-3">{t.label}</td>
                {(['email', 'sms', 'push'] as const).map((ch) => (
                  <td key={ch} className="text-center px-4 py-3">
                    <input type="checkbox" checked={t[ch]} onChange={() => toggleTopic(t.topic, ch)}
                      disabled={!channels.find(c => c.channel === ch)?.enabled}
                      className="w-4 h-4 rounded text-blue-600 disabled:opacity-30" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
