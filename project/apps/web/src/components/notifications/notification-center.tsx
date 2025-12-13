'use client';

import { useState, useEffect } from 'react';
import { Bell, Check, CheckCheck, Trash2, Filter, Loader2, X, ExternalLink, AlertTriangle, Info, CheckCircle } from 'lucide-react';

interface Notification {
  id: string;
  type: 'info' | 'warning' | 'success' | 'error' | 'reminder';
  title: string;
  message: string;
  link?: string;
  isRead: boolean;
  createdAt: string;
}

interface NotificationCenterProps {
  onClose?: () => void;
}

const TYPE_CONFIG = {
  info: { icon: Info, color: 'text-blue-600 bg-blue-100' },
  warning: { icon: AlertTriangle, color: 'text-orange-600 bg-orange-100' },
  success: { icon: CheckCircle, color: 'text-green-600 bg-green-100' },
  error: { icon: X, color: 'text-red-600 bg-red-100' },
  reminder: { icon: Bell, color: 'text-purple-600 bg-purple-100' },
};

const STORAGE_KEY = 'notificationCenter';

export function NotificationCenter({ onClose }: NotificationCenterProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('');

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = () => {
    setLoading(true);
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setNotifications(JSON.parse(stored));
      } else {
        // Demo data
        const demo: Notification[] = [
          { id: '1', type: 'warning', title: 'Vekalet Süresi Dolmak Üzere', message: 'ABC Holding vekaleti 5 gün içinde dolacak', link: '/settings/clients', isRead: false, createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString() },
          { id: '2', type: 'success', title: 'Tahsilat Yapıldı', message: '2024/1234 dosyasına 25.000 TL tahsilat kaydedildi', link: '/cases/1', isRead: false, createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
          { id: '3', type: 'reminder', title: 'Duruşma Hatırlatması', message: 'Yarın saat 10:00 - İstanbul 5. İcra Mahkemesi', isRead: false, createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString() },
          { id: '4', type: 'info', title: 'Yeni Dosya Atandı', message: '2024/1250 dosyası size atandı', link: '/cases/2', isRead: true, createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() },
          { id: '5', type: 'error', title: 'UYAP Bağlantı Hatası', message: 'UYAP sistemine bağlanılamadı, lütfen tekrar deneyin', isRead: true, createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() },
        ];
        setNotifications(demo);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(demo));
      }
    } catch (e) {
      console.error('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  const saveNotifications = (list: Notification[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    setNotifications(list);
  };

  const handleMarkAsRead = (id: string) => {
    saveNotifications(notifications.map(n => n.id === id ? { ...n, isRead: true } : n));
  };

  const handleMarkAllAsRead = () => {
    saveNotifications(notifications.map(n => ({ ...n, isRead: true })));
  };

  const handleDelete = (id: string) => {
    saveNotifications(notifications.filter(n => n.id !== id));
  };

  const handleClearAll = () => {
    if (confirm('Tüm bildirimleri silmek istediğinize emin misiniz?')) {
      saveNotifications([]);
    }
  };

  const formatTime = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Az önce';
    if (minutes < 60) return `${minutes} dk önce`;
    if (hours < 24) return `${hours} saat önce`;
    if (days < 7) return `${days} gün önce`;
    return new Date(date).toLocaleDateString('tr-TR');
  };

  const filteredNotifications = notifications.filter(n => {
    if (filter === 'unread' && n.isRead) return false;
    if (typeFilter && n.type !== typeFilter) return false;
    return true;
  });

  const unreadCount = notifications.filter(n => !n.isRead).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-md bg-white rounded-xl shadow-xl border overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b bg-gray-50">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Bildirimler
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">
                {unreadCount}
              </span>
            )}
          </h3>
          {onClose && (
            <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded">
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="border rounded px-2 py-1 text-sm flex-1"
          >
            <option value="all">Tümü</option>
            <option value="unread">Okunmamış</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="border rounded px-2 py-1 text-sm flex-1"
          >
            <option value="">Tüm Türler</option>
            <option value="info">Bilgi</option>
            <option value="warning">Uyarı</option>
            <option value="success">Başarı</option>
            <option value="error">Hata</option>
            <option value="reminder">Hatırlatma</option>
          </select>
        </div>
      </div>

      {/* Actions */}
      {notifications.length > 0 && (
        <div className="px-4 py-2 border-b flex items-center justify-between text-sm">
          <button
            onClick={handleMarkAllAsRead}
            className="text-blue-600 hover:underline flex items-center gap-1"
          >
            <CheckCheck className="h-4 w-4" />
            Tümünü Okundu İşaretle
          </button>
          <button
            onClick={handleClearAll}
            className="text-red-600 hover:underline flex items-center gap-1"
          >
            <Trash2 className="h-4 w-4" />
            Temizle
          </button>
        </div>
      )}

      {/* Notifications List */}
      <div className="max-h-96 overflow-y-auto">
        {filteredNotifications.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Bell className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Bildirim yok</p>
          </div>
        ) : (
          filteredNotifications.map((notification) => {
            const config = TYPE_CONFIG[notification.type];
            const Icon = config.icon;

            return (
              <div
                key={notification.id}
                className={`p-4 border-b hover:bg-gray-50 ${!notification.isRead ? 'bg-blue-50/50' : ''}`}
              >
                <div className="flex gap-3">
                  <div className={`p-2 rounded-full ${config.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`font-medium text-sm ${!notification.isRead ? 'text-gray-900' : 'text-gray-600'}`}>
                        {notification.title}
                      </p>
                      <span className="text-xs text-gray-400 whitespace-nowrap">
                        {formatTime(notification.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">{notification.message}</p>
                    <div className="flex items-center gap-2 mt-2">
                      {notification.link && (
                        <a
                          href={notification.link}
                          className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                        >
                          Görüntüle <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {!notification.isRead && (
                        <button
                          onClick={() => handleMarkAsRead(notification.id)}
                          className="text-xs text-gray-500 hover:text-blue-600 flex items-center gap-1"
                        >
                          <Check className="h-3 w-3" /> Okundu
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(notification.id)}
                        className="text-xs text-gray-400 hover:text-red-600 flex items-center gap-1 ml-auto"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// Helper to add notification
export function addNotification(notification: Omit<Notification, 'id' | 'isRead' | 'createdAt'>) {
  const stored = localStorage.getItem(STORAGE_KEY);
  const list: Notification[] = stored ? JSON.parse(stored) : [];
  
  const newNotification: Notification = {
    ...notification,
    id: Date.now().toString(),
    isRead: false,
    createdAt: new Date().toISOString(),
  };
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify([newNotification, ...list]));
  return newNotification;
}

// Helper to get unread count
export function getUnreadCount(): number {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return 0;
  const list: Notification[] = JSON.parse(stored);
  return list.filter(n => !n.isRead).length;
}
