'use client';

import { useState, useEffect } from 'react';
import { Bell, Check, Trash2, CheckCheck, Filter, AlertTriangle, Info, CheckCircle, XCircle, Settings } from 'lucide-react';

interface SystemNotification {
  id: string;
  type: 'info' | 'warning' | 'success' | 'error';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  category: string;
}

const STORAGE_KEY = 'systemNotifications';

export function SystemNotificationCenter() {
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [showRead, setShowRead] = useState(true);

  useEffect(() => { loadNotifications(); }, []);

  const loadNotifications = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setNotifications(JSON.parse(stored));
      else {
        const demo: SystemNotification[] = [
          { id: '1', type: 'warning', title: 'Vekalet Uyarısı', message: 'XYZ Ltd. vekaleti 7 gün içinde dolacak', timestamp: new Date().toISOString(), read: false, category: 'vekalet' },
          { id: '2', type: 'success', title: 'Tahsilat Kaydedildi', message: 'Dosya 2024/1001 için 50.000 TL tahsilat kaydedildi', timestamp: new Date(Date.now() - 3600000).toISOString(), read: false, category: 'tahsilat' },
          { id: '3', type: 'info', title: 'Yeni Dosya', message: 'Dosya 2024/1050 oluşturuldu', timestamp: new Date(Date.now() - 7200000).toISOString(), read: true, category: 'dosya' },
          { id: '4', type: 'error', title: 'E-posta Hatası', message: 'Müvekkil bildirimi gönderilemedi', timestamp: new Date(Date.now() - 86400000).toISOString(), read: true, category: 'sistem' },
          { id: '5', type: 'info', title: 'Yedekleme Tamamlandı', message: 'Günlük yedekleme başarıyla tamamlandı', timestamp: new Date(Date.now() - 172800000).toISOString(), read: true, category: 'sistem' },
        ];
        setNotifications(demo);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(demo));
      }
    } catch (e) { console.error('Failed to load notifications'); }
  };

  const saveNotifications = (list: SystemNotification[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    setNotifications(list);
  };

  const markAsRead = (id: string) => saveNotifications(notifications.map(n => n.id === id ? { ...n, read: true } : n));
  const markAllAsRead = () => saveNotifications(notifications.map(n => ({ ...n, read: true })));
  const deleteNotification = (id: string) => saveNotifications(notifications.filter(n => n.id !== id));
  const clearAll = () => saveNotifications([]);

  const getTypeIcon = (type: SystemNotification['type']) => {
    if (type === 'warning') return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
    if (type === 'success') return <CheckCircle className="h-5 w-5 text-green-500" />;
    if (type === 'error') return <XCircle className="h-5 w-5 text-red-500" />;
    return <Info className="h-5 w-5 text-blue-500" />;
  };

  const getTypeBg = (type: SystemNotification['type']) => {
    if (type === 'warning') return 'bg-yellow-50 border-yellow-200';
    if (type === 'success') return 'bg-green-50 border-green-200';
    if (type === 'error') return 'bg-red-50 border-red-200';
    return 'bg-blue-50 border-blue-200';
  };

  const formatTime = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60000) return 'Az önce';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} dk önce`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} saat önce`;
    return new Date(ts).toLocaleDateString('tr-TR');
  };

  const categories = ['all', ...new Set(notifications.map(n => n.category))];
  const filtered = notifications
    .filter(n => filter === 'all' || n.category === filter)
    .filter(n => showRead || !n.read);

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium flex items-center gap-2">
          <Bell className="h-5 w-5" />Sistem Bildirimleri
          {unreadCount > 0 && <span className="px-2 py-0.5 bg-red-500 text-white rounded-full text-xs">{unreadCount}</span>}
        </h3>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button onClick={markAllAsRead} className="flex items-center gap-1 text-sm text-blue-600 hover:underline"><CheckCheck className="h-4 w-4" />Tümünü Okundu</button>
          )}
          <button onClick={clearAll} className="text-sm text-red-500 hover:underline">Temizle</button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="flex gap-1">
          {categories.map((cat) => (
            <button key={cat} onClick={() => setFilter(cat)} className={`px-3 py-1 rounded text-sm capitalize ${filter === cat ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>
              {cat === 'all' ? 'Tümü' : cat}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-500">
          <input type="checkbox" checked={showRead} onChange={(e) => setShowRead(e.target.checked)} className="rounded" />
          Okunanları göster
        </label>
      </div>

      {/* Notifications List */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Bell className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Bildirim yok</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((n) => (
            <div key={n.id} className={`flex items-start gap-3 p-4 border rounded-lg ${!n.read ? getTypeBg(n.type) : 'bg-white'}`}>
              {getTypeIcon(n.type)}
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className={`font-medium ${!n.read ? '' : 'text-gray-600'}`}>{n.title}</span>
                  {!n.read && <span className="w-2 h-2 bg-blue-500 rounded-full" />}
                </div>
                <p className="text-sm text-gray-600">{n.message}</p>
                <p className="text-xs text-gray-400 mt-1">{formatTime(n.timestamp)}</p>
              </div>
              <div className="flex items-center gap-1">
                {!n.read && (
                  <button onClick={() => markAsRead(n.id)} className="p-1.5 hover:bg-gray-100 rounded" title="Okundu işaretle">
                    <Check className="h-4 w-4 text-gray-400" />
                  </button>
                )}
                <button onClick={() => deleteNotification(n.id)} className="p-1.5 hover:bg-red-50 rounded" title="Sil">
                  <Trash2 className="h-4 w-4 text-gray-400 hover:text-red-500" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 text-center text-sm">
        <div className="bg-blue-50 rounded-lg p-2"><p className="font-bold text-blue-600">{notifications.filter(n => n.type === 'info').length}</p><p className="text-xs text-gray-500">Bilgi</p></div>
        <div className="bg-yellow-50 rounded-lg p-2"><p className="font-bold text-yellow-600">{notifications.filter(n => n.type === 'warning').length}</p><p className="text-xs text-gray-500">Uyarı</p></div>
        <div className="bg-green-50 rounded-lg p-2"><p className="font-bold text-green-600">{notifications.filter(n => n.type === 'success').length}</p><p className="text-xs text-gray-500">Başarı</p></div>
        <div className="bg-red-50 rounded-lg p-2"><p className="font-bold text-red-600">{notifications.filter(n => n.type === 'error').length}</p><p className="text-xs text-gray-500">Hata</p></div>
      </div>
    </div>
  );
}
