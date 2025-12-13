'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Activity, Filter, Search, User, Clock, FileText, Edit, Trash2, Plus, Eye, Download, Upload, Send } from 'lucide-react';

interface ActivityItem {
  id: string;
  action: string;
  actionType: 'CREATE' | 'UPDATE' | 'DELETE' | 'VIEW' | 'DOWNLOAD' | 'UPLOAD' | 'SEND' | 'OTHER';
  description: string;
  user: string;
  timestamp: string;
  details?: Record<string, any>;
}

interface CaseActivityLogProps {
  caseId: string;
}

const ACTION_ICONS: Record<string, React.ReactNode> = {
  CREATE: <Plus className="h-4 w-4" />,
  UPDATE: <Edit className="h-4 w-4" />,
  DELETE: <Trash2 className="h-4 w-4" />,
  VIEW: <Eye className="h-4 w-4" />,
  DOWNLOAD: <Download className="h-4 w-4" />,
  UPLOAD: <Upload className="h-4 w-4" />,
  SEND: <Send className="h-4 w-4" />,
  OTHER: <Activity className="h-4 w-4" />,
};

const ACTION_COLORS: Record<string, string> = {
  CREATE: 'bg-green-100 text-green-600',
  UPDATE: 'bg-blue-100 text-blue-600',
  DELETE: 'bg-red-100 text-red-600',
  VIEW: 'bg-gray-100 text-gray-600',
  DOWNLOAD: 'bg-purple-100 text-purple-600',
  UPLOAD: 'bg-amber-100 text-amber-600',
  SEND: 'bg-cyan-100 text-cyan-600',
  OTHER: 'bg-gray-100 text-gray-600',
};

export function CaseActivityLog({ caseId }: CaseActivityLogProps) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('');

  useEffect(() => {
    loadActivities();
  }, [caseId]);

  const loadActivities = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/cases/${caseId}/activities`);
      setActivities(res.data?.data || []);
    } catch (e) {
      // Demo data
      setActivities([
        {
          id: '1',
          action: 'Dosya oluşturuldu',
          actionType: 'CREATE',
          description: 'Yeni icra takibi dosyası açıldı',
          user: 'Admin',
          timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: '2',
          action: 'Borçlu eklendi',
          actionType: 'CREATE',
          description: 'Ahmet Yılmaz borçlu olarak eklendi',
          user: 'Admin',
          timestamp: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: '3',
          action: 'Belge yüklendi',
          actionType: 'UPLOAD',
          description: 'Vekaletname.pdf yüklendi',
          user: 'Av. Mehmet',
          timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: '4',
          action: 'Durum güncellendi',
          actionType: 'UPDATE',
          description: 'Dosya durumu "İşlemde" olarak değiştirildi',
          user: 'Admin',
          timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: '5',
          action: 'Tahsilat kaydedildi',
          actionType: 'CREATE',
          description: '5.000 ₺ tahsilat kaydı eklendi',
          user: 'Muhasebe',
          timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: '6',
          action: 'Dosya görüntülendi',
          actionType: 'VIEW',
          description: 'Dosya detayları görüntülendi',
          user: 'Av. Mehmet',
          timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: '7',
          action: 'E-posta gönderildi',
          actionType: 'SEND',
          description: 'Müvekkile bilgilendirme e-postası gönderildi',
          user: 'Admin',
          timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Az önce';
    if (diffMins < 60) return `${diffMins} dk önce`;
    if (diffHours < 24) return `${diffHours} saat önce`;
    if (diffDays < 7) return `${diffDays} gün önce`;
    
    return date.toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const filteredActivities = activities.filter(activity => {
    const matchesSearch = !searchQuery || 
      activity.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      activity.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      activity.user.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesFilter = !filterType || activity.actionType === filterType;
    
    return matchesSearch && matchesFilter;
  });

  const groupByDate = (items: ActivityItem[]) => {
    const groups: Record<string, ActivityItem[]> = {};
    
    items.forEach(item => {
      const date = new Date(item.timestamp);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      let key: string;
      if (date.toDateString() === today.toDateString()) {
        key = 'Bugün';
      } else if (date.toDateString() === yesterday.toDateString()) {
        key = 'Dün';
      } else {
        key = date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
      }
      
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    
    return groups;
  };

  const groupedActivities = groupByDate(filteredActivities);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Aktivite ara..."
            className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm"
          />
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Tüm İşlemler</option>
          <option value="CREATE">Oluşturma</option>
          <option value="UPDATE">Güncelleme</option>
          <option value="DELETE">Silme</option>
          <option value="VIEW">Görüntüleme</option>
          <option value="UPLOAD">Yükleme</option>
          <option value="DOWNLOAD">İndirme</option>
          <option value="SEND">Gönderim</option>
        </select>
      </div>

      {/* Activity List */}
      {filteredActivities.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Activity className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Aktivite bulunamadı</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedActivities).map(([date, items]) => (
            <div key={date}>
              <h4 className="text-sm font-medium text-gray-500 mb-3">{date}</h4>
              <div className="space-y-2">
                {items.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3 p-3 bg-white border rounded-lg hover:bg-gray-50">
                    <div className={`p-2 rounded-lg ${ACTION_COLORS[activity.actionType]}`}>
                      {ACTION_ICONS[activity.actionType]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{activity.action}</p>
                      <p className="text-sm text-gray-500 truncate">{activity.description}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {activity.user}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatTimestamp(activity.timestamp)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
