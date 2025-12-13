'use client';

import { useState, useEffect } from 'react';
import { Activity, TrendingUp, TrendingDown, Calendar, FileText, Users, DollarSign, Clock } from 'lucide-react';

interface ActivityData {
  date: string;
  casesCreated: number;
  casesUpdated: number;
  collections: number;
  collectionAmount: number;
  documents: number;
  logins: number;
}

export function ActivitySummary() {
  const [data, setData] = useState<ActivityData[]>([]);
  const [period, setPeriod] = useState<'day' | 'week'>('day');

  useEffect(() => { loadData(); }, [period]);

  const loadData = () => {
    const today = new Date();
    const days = period === 'day' ? 1 : 7;
    const result: ActivityData[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      result.push({
        date: d.toISOString().split('T')[0],
        casesCreated: Math.floor(Math.random() * 10) + 1,
        casesUpdated: Math.floor(Math.random() * 30) + 5,
        collections: Math.floor(Math.random() * 8) + 1,
        collectionAmount: Math.floor(Math.random() * 100000) + 10000,
        documents: Math.floor(Math.random() * 20) + 3,
        logins: Math.floor(Math.random() * 15) + 5,
      });
    }
    setData(result);
  };

  const totals = data.reduce((acc, d) => ({
    casesCreated: acc.casesCreated + d.casesCreated,
    casesUpdated: acc.casesUpdated + d.casesUpdated,
    collections: acc.collections + d.collections,
    collectionAmount: acc.collectionAmount + d.collectionAmount,
    documents: acc.documents + d.documents,
    logins: acc.logins + d.logins,
  }), { casesCreated: 0, casesUpdated: 0, collections: 0, collectionAmount: 0, documents: 0, logins: 0 });

  const formatCurrency = (n: number) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n);

  const stats = [
    { label: 'Yeni Dosya', value: totals.casesCreated, icon: <FileText className="h-5 w-5" />, color: 'blue', trend: 12 },
    { label: 'Güncelleme', value: totals.casesUpdated, icon: <Activity className="h-5 w-5" />, color: 'purple', trend: 8 },
    { label: 'Tahsilat', value: totals.collections, icon: <DollarSign className="h-5 w-5" />, color: 'green', trend: -5 },
    { label: 'Belge', value: totals.documents, icon: <FileText className="h-5 w-5" />, color: 'orange', trend: 15 },
  ];

  const colorClasses: Record<string, { bg: string; text: string }> = {
    blue: { bg: 'bg-blue-100', text: 'text-blue-600' },
    purple: { bg: 'bg-purple-100', text: 'text-purple-600' },
    green: { bg: 'bg-green-100', text: 'text-green-600' },
    orange: { bg: 'bg-orange-100', text: 'text-orange-600' },
  };

  const maxValue = Math.max(...data.map(d => d.casesUpdated));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium flex items-center gap-2"><Activity className="h-5 w-5" />Aktivite Özeti</h3>
        <div className="flex gap-1">
          {(['day', 'week'] as const).map((p) => (
            <button key={p} onClick={() => setPeriod(p)} className={`px-3 py-1 rounded text-sm ${period === p ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>
              {p === 'day' ? 'Bugün' : 'Hafta'}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white border rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className={`p-2 rounded-lg ${colorClasses[stat.color].bg} ${colorClasses[stat.color].text}`}>{stat.icon}</span>
              <span className={`text-xs flex items-center gap-0.5 ${stat.trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {stat.trend >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {Math.abs(stat.trend)}%
              </span>
            </div>
            <p className="text-2xl font-bold">{stat.value}</p>
            <p className="text-xs text-gray-500">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Collection Amount */}
      <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-xl p-4 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm opacity-80">{period === 'day' ? 'Bugünkü' : 'Haftalık'} Tahsilat</p>
            <p className="text-3xl font-bold">{formatCurrency(totals.collectionAmount)}</p>
          </div>
          <DollarSign className="h-12 w-12 opacity-30" />
        </div>
      </div>

      {/* Activity Chart */}
      {period === 'week' && (
        <div className="bg-white border rounded-xl p-4">
          <h4 className="font-medium text-sm mb-3">Günlük Aktivite</h4>
          <div className="flex items-end gap-2 h-32">
            {data.slice().reverse().map((d) => (
              <div key={d.date} className="flex-1 flex flex-col items-center">
                <div className="w-full bg-blue-500 rounded-t" style={{ height: `${(d.casesUpdated / maxValue) * 100}%` }} />
                <span className="text-xs text-gray-400 mt-1">{new Date(d.date).toLocaleDateString('tr-TR', { weekday: 'short' })}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="bg-white border rounded-xl p-4">
        <h4 className="font-medium text-sm mb-3">Son İşlemler</h4>
        <div className="space-y-2">
          {[
            { action: 'Dosya 2024/1045 güncellendi', time: '5 dk önce', user: 'Av. Mehmet' },
            { action: 'Yeni tahsilat kaydedildi', time: '15 dk önce', user: 'Av. Ayşe' },
            { action: 'Dosya 2024/1050 oluşturuldu', time: '30 dk önce', user: 'Av. Ali' },
            { action: 'Belge yüklendi', time: '1 saat önce', user: 'Av. Mehmet' },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-3 text-sm">
              <span className="w-2 h-2 bg-blue-500 rounded-full" />
              <span className="flex-1">{item.action}</span>
              <span className="text-gray-400">{item.time}</span>
              <span className="text-gray-500">{item.user}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Login Stats */}
      <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3 text-sm">
        <span className="flex items-center gap-2"><Users className="h-4 w-4 text-gray-400" />Aktif Kullanıcı</span>
        <span className="font-medium">{totals.logins}</span>
        <span className="flex items-center gap-2"><Clock className="h-4 w-4 text-gray-400" />Son Güncelleme</span>
        <span className="text-gray-500">{new Date().toLocaleTimeString('tr-TR')}</span>
      </div>
    </div>
  );
}
