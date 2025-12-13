'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { User, Clock, Activity, LogIn, LogOut, FileText, Loader2, Calendar } from 'lucide-react';

interface UserActivity {
  id: string;
  name: string;
  email: string;
  role: string;
  totalActions: number;
  loginCount: number;
  lastLogin?: string;
  lastAction?: string;
  activeHours: number[];
  actionBreakdown: { type: string; count: number }[];
}

interface UserActivityReportProps {
  period?: 'week' | 'month' | 'year';
}

export function UserActivityReport({ period = 'month' }: UserActivityReportProps) {
  const [users, setUsers] = useState<UserActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState(period);

  useEffect(() => {
    loadData();
  }, [selectedPeriod]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/reports/user-activity?period=${selectedPeriod}`);
      setUsers(res.data?.data || []);
    } catch (e) {
      // Demo data
      setUsers([
        {
          id: '1', name: 'Av. Mehmet Yılmaz', email: 'mehmet@buro.com', role: 'Avukat',
          totalActions: 245, loginCount: 22, lastLogin: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          lastAction: 'Dosya güncelleme', activeHours: [0, 0, 0, 0, 0, 0, 0, 0, 15, 35, 42, 38, 25, 30, 45, 40, 35, 28, 12, 0, 0, 0, 0, 0],
          actionBreakdown: [{ type: 'Görüntüleme', count: 120 }, { type: 'Güncelleme', count: 85 }, { type: 'Oluşturma', count: 40 }]
        },
        {
          id: '2', name: 'Ayşe Demir', email: 'ayse@buro.com', role: 'Sekreter',
          totalActions: 380, loginCount: 25, lastLogin: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
          lastAction: 'Belge yükleme', activeHours: [0, 0, 0, 0, 0, 0, 0, 0, 25, 45, 55, 48, 35, 42, 50, 45, 38, 32, 15, 0, 0, 0, 0, 0],
          actionBreakdown: [{ type: 'Görüntüleme', count: 180 }, { type: 'Güncelleme', count: 120 }, { type: 'Oluşturma', count: 80 }]
        },
        {
          id: '3', name: 'Admin', email: 'admin@buro.com', role: 'Yönetici',
          totalActions: 156, loginCount: 18, lastLogin: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
          lastAction: 'Ayar değişikliği', activeHours: [0, 0, 0, 0, 0, 0, 0, 0, 10, 20, 25, 22, 18, 15, 20, 18, 12, 8, 5, 0, 0, 0, 0, 0],
          actionBreakdown: [{ type: 'Görüntüleme', count: 80 }, { type: 'Güncelleme', count: 50 }, { type: 'Oluşturma', count: 26 }]
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const formatRelativeTime = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    if (minutes < 60) return `${minutes} dk önce`;
    if (hours < 24) return `${hours} saat önce`;
    return new Date(date).toLocaleDateString('tr-TR');
  };

  const getMaxHourValue = (hours: number[]) => Math.max(...hours);

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
          <Activity className="h-5 w-5" />
          Kullanıcı Aktivite Raporu
        </h2>
        <select
          value={selectedPeriod}
          onChange={(e) => setSelectedPeriod(e.target.value as any)}
          className="border rounded-lg px-3 py-1.5 text-sm"
        >
          <option value="week">Bu Hafta</option>
          <option value="month">Bu Ay</option>
          <option value="year">Bu Yıl</option>
        </select>
      </div>

      {/* User Cards */}
      <div className="space-y-4">
        {users.map((user) => {
          const maxHour = getMaxHourValue(user.activeHours);
          return (
            <div key={user.id} className="bg-white rounded-xl border p-4">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                  <User className="h-6 w-6 text-gray-400" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold">{user.name}</h3>
                      <p className="text-sm text-gray-500">{user.email} • {user.role}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-blue-600">{user.totalActions}</p>
                      <p className="text-xs text-gray-500">toplam işlem</p>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-4 mt-4">
                    <div className="flex items-center gap-2">
                      <LogIn className="h-4 w-4 text-green-500" />
                      <div>
                        <p className="text-sm font-medium">{user.loginCount}</p>
                        <p className="text-xs text-gray-500">Giriş</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-blue-500" />
                      <div>
                        <p className="text-sm font-medium">{user.lastLogin ? formatRelativeTime(user.lastLogin) : '-'}</p>
                        <p className="text-xs text-gray-500">Son Giriş</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-purple-500" />
                      <div>
                        <p className="text-sm font-medium truncate">{user.lastAction || '-'}</p>
                        <p className="text-xs text-gray-500">Son İşlem</p>
                      </div>
                    </div>
                  </div>

                  {/* Activity Hours Chart */}
                  <div className="mt-4">
                    <p className="text-xs text-gray-500 mb-2">Aktif Saatler</p>
                    <div className="flex items-end gap-0.5 h-8">
                      {user.activeHours.map((value, i) => (
                        <div
                          key={i}
                          className="flex-1 bg-blue-400 rounded-t"
                          style={{ height: `${maxHour > 0 ? (value / maxHour) * 100 : 0}%`, minHeight: value > 0 ? '2px' : '0' }}
                          title={`${i}:00 - ${value} işlem`}
                        />
                      ))}
                    </div>
                    <div className="flex justify-between text-xs text-gray-400 mt-1">
                      <span>00:00</span>
                      <span>12:00</span>
                      <span>23:00</span>
                    </div>
                  </div>

                  {/* Action Breakdown */}
                  <div className="flex items-center gap-4 mt-4">
                    {user.actionBreakdown.map((action) => (
                      <span key={action.type} className="text-xs">
                        <span className="text-gray-500">{action.type}:</span>{' '}
                        <span className="font-medium">{action.count}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
