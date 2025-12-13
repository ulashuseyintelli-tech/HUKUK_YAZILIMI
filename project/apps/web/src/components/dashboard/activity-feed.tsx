'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { FileText, User, Calendar, Bell, CheckCircle, AlertCircle, Clock } from 'lucide-react';

interface Activity {
  id: string;
  type: 'case_created' | 'case_updated' | 'task_completed' | 'notification' | 'collection';
  title: string;
  description?: string;
  timestamp: string;
  user?: string;
}

const ACTIVITY_ICONS: Record<string, { icon: any; color: string }> = {
  case_created: { icon: FileText, color: 'bg-blue-100 text-blue-600' },
  case_updated: { icon: FileText, color: 'bg-indigo-100 text-indigo-600' },
  task_completed: { icon: CheckCircle, color: 'bg-green-100 text-green-600' },
  notification: { icon: Bell, color: 'bg-yellow-100 text-yellow-600' },
  collection: { icon: AlertCircle, color: 'bg-purple-100 text-purple-600' },
};

export function ActivityFeed() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadActivities();
  }, []);

  const loadActivities = async () => {
    try {
      // Audit log'dan son aktiviteleri çek
      const res = await api.get('/audit/logs?limit=10');
      if (res.data?.logs) {
        const mapped = res.data.logs.map((log: any) => ({
          id: log.id,
          type: log.action === 'CREATE' ? 'case_created' : 
                log.action === 'UPDATE' ? 'case_updated' : 
                'notification',
          title: log.description || `${log.action} - ${log.entityType}`,
          timestamp: log.createdAt,
          user: log.userName,
        }));
        setActivities(mapped);
      }
    } catch (e) {
      // Demo data
      setActivities([
        { id: '1', type: 'case_created', title: 'Yeni takip oluşturuldu', description: '2024/1234', timestamp: new Date().toISOString(), user: 'Admin' },
        { id: '2', type: 'task_completed', title: 'Görev tamamlandı', description: 'Haciz talebi hazırlandı', timestamp: new Date(Date.now() - 3600000).toISOString() },
        { id: '3', type: 'collection', title: 'Tahsilat kaydedildi', description: '5.000 TL', timestamp: new Date(Date.now() - 7200000).toISOString() },
        { id: '4', type: 'notification', title: 'Vekalet süresi uyarısı', description: '3 vekalet 30 gün içinde dolacak', timestamp: new Date(Date.now() - 10800000).toISOString() },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Az önce';
    if (minutes < 60) return `${minutes} dk önce`;
    if (hours < 24) return `${hours} saat önce`;
    if (days < 7) return `${days} gün önce`;
    return date.toLocaleDateString('tr-TR');
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border p-4">
        <div className="h-6 bg-gray-200 rounded w-32 mb-4 animate-pulse" />
        {[1, 2, 3].map(i => (
          <div key={i} className="flex gap-3 py-3 animate-pulse">
            <div className="w-10 h-10 bg-gray-200 rounded-lg" />
            <div className="flex-1">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
              <div className="h-3 bg-gray-200 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Clock className="h-5 w-5 text-gray-500" />
          Son Aktiviteler
        </h3>
        <span className="text-xs text-gray-500">{activities.length} kayıt</span>
      </div>

      <div className="space-y-1">
        {activities.length === 0 ? (
          <p className="text-center text-gray-500 py-8 text-sm">Henüz aktivite yok</p>
        ) : (
          activities.map((activity) => {
            const { icon: Icon, color } = ACTIVITY_ICONS[activity.type] || ACTIVITY_ICONS.notification;
            return (
              <div key={activity.id} className="flex gap-3 py-3 border-b last:border-0 hover:bg-gray-50 rounded-lg px-2 -mx-2">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{activity.title}</p>
                  {activity.description && (
                    <p className="text-xs text-gray-500 truncate">{activity.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-400">{formatTime(activity.timestamp)}</span>
                    {activity.user && (
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <User className="h-3 w-3" /> {activity.user}
                      </span>
                    )}
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
