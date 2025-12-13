'use client';

import { useState, useEffect } from 'react';
import { Bell, Mail, FileText, Calendar, AlertTriangle, CheckCircle, Clock, ChevronRight } from 'lucide-react';

interface NotificationGroup {
  category: string;
  icon: React.ReactNode;
  count: number;
  unread: number;
  color: string;
  items: { id: string; title: string; time: string; read: boolean }[];
}

export function NotificationSummary() {
  const [groups, setGroups] = useState<NotificationGroup[]>([]);
  const [period, setPeriod] = useState<'today' | 'week'>('today');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => { loadNotifications(); }, [period]);

  const loadNotifications = () => {
    setGroups([
      { category: 'Dosya Güncellemeleri', icon: <FileText className="h-5 w-5" />, count: 12, unread: 5, color: 'blue',
        items: [
          { id: '1', title: 'Dosya 2024/1001 durumu güncellendi', time: '10 dk önce', read: false },
          { id: '2', title: 'Dosya 2024/1002 için yeni belge eklendi', time: '1 saat önce', read: false },
          { id: '3', title: 'Dosya 2024/1003 tahsilatı kaydedildi', time: '2 saat önce', read: true },
        ]},
      { category: 'Vekalet Uyarıları', icon: <AlertTriangle className="h-5 w-5" />, count: 3, unread: 3, color: 'yellow',
        items: [
          { id: '4', title: 'XYZ Ltd. vekaleti 7 gün içinde dolacak', time: '30 dk önce', read: false },
          { id: '5', title: 'ABC A.Ş. vekaleti 14 gün içinde dolacak', time: '1 saat önce', read: false },
        ]},
      { category: 'Takvim Hatırlatıcıları', icon: <Calendar className="h-5 w-5" />, count: 5, unread: 2, color: 'purple',
        items: [
          { id: '6', title: 'Yarın duruşma: Dosya 2024/1010', time: '3 saat önce', read: false },
          { id: '7', title: 'Görev son tarihi yaklaşıyor', time: '5 saat önce', read: true },
        ]},
      { category: 'Sistem Bildirimleri', icon: <Bell className="h-5 w-5" />, count: 2, unread: 0, color: 'gray',
        items: [
          { id: '8', title: 'Yedekleme başarıyla tamamlandı', time: 'Dün', read: true },
        ]},
    ]);
  };

  const totalUnread = groups.reduce((s, g) => s + g.unread, 0);
  const colorClasses: Record<string, { bg: string; text: string }> = {
    blue: { bg: 'bg-blue-100', text: 'text-blue-600' },
    yellow: { bg: 'bg-yellow-100', text: 'text-yellow-600' },
    purple: { bg: 'bg-purple-100', text: 'text-purple-600' },
    gray: { bg: 'bg-gray-100', text: 'text-gray-600' },
  };

  const markAllRead = () => {
    setGroups(groups.map(g => ({ ...g, unread: 0, items: g.items.map(i => ({ ...i, read: true })) })));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium flex items-center gap-2">
          <Bell className="h-5 w-5" />Bildirim Özeti
          {totalUnread > 0 && <span className="px-2 py-0.5 bg-red-500 text-white rounded-full text-xs">{totalUnread}</span>}
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {(['today', 'week'] as const).map((p) => (
              <button key={p} onClick={() => setPeriod(p)} className={`px-3 py-1 rounded text-sm ${period === p ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>
                {p === 'today' ? 'Bugün' : 'Hafta'}
              </button>
            ))}
          </div>
          {totalUnread > 0 && (
            <button onClick={markAllRead} className="text-sm text-blue-600 hover:underline">Tümünü okundu işaretle</button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {groups.map((g) => (
          <div key={g.category} className={`${colorClasses[g.color].bg} rounded-xl p-4 cursor-pointer hover:opacity-80`} onClick={() => setExpanded(expanded === g.category ? null : g.category)}>
            <div className="flex items-center justify-between mb-2">
              <span className={colorClasses[g.color].text}>{g.icon}</span>
              {g.unread > 0 && <span className="px-1.5 py-0.5 bg-red-500 text-white rounded-full text-xs">{g.unread}</span>}
            </div>
            <p className="text-2xl font-bold">{g.count}</p>
            <p className="text-xs text-gray-600 truncate">{g.category}</p>
          </div>
        ))}
      </div>

      {/* Expanded List */}
      {expanded && (
        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="p-3 border-b bg-gray-50 flex items-center justify-between">
            <span className="font-medium">{expanded}</span>
            <button onClick={() => setExpanded(null)} className="text-sm text-gray-500 hover:text-gray-700">Kapat</button>
          </div>
          <div className="divide-y max-h-64 overflow-y-auto">
            {groups.find(g => g.category === expanded)?.items.map((item) => (
              <div key={item.id} className={`flex items-center gap-3 p-3 hover:bg-gray-50 ${!item.read ? 'bg-blue-50' : ''}`}>
                {!item.read && <span className="w-2 h-2 bg-blue-500 rounded-full" />}
                <div className="flex-1">
                  <p className={`text-sm ${!item.read ? 'font-medium' : ''}`}>{item.title}</p>
                  <p className="text-xs text-gray-400">{item.time}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-400" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Stats */}
      <div className="flex items-center justify-between text-sm text-gray-500 bg-gray-50 rounded-lg p-3">
        <span>Toplam: {groups.reduce((s, g) => s + g.count, 0)} bildirim</span>
        <span>Okunmamış: {totalUnread}</span>
        <span>Son güncelleme: {new Date().toLocaleTimeString('tr-TR')}</span>
      </div>
    </div>
  );
}
