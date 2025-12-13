'use client';

import { useState, useEffect } from 'react';
import { Database, CheckCircle, AlertTriangle, Clock, Settings, X, RefreshCw } from 'lucide-react';

interface BackupInfo {
  lastBackup: string | null;
  nextBackup: string | null;
  status: 'success' | 'failed' | 'pending' | 'none';
  autoBackup: boolean;
  frequency: 'daily' | 'weekly' | 'monthly';
  retentionDays: number;
}

const STORAGE_KEY = 'backupSettings';

export function BackupNotification() {
  const [info, setInfo] = useState<BackupInfo>({
    lastBackup: null, nextBackup: null, status: 'none', autoBackup: true, frequency: 'daily', retentionDays: 30
  });
  const [showSettings, setShowSettings] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setInfo(JSON.parse(stored));
      else {
        const demo: BackupInfo = {
          lastBackup: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          nextBackup: new Date(Date.now() + 22 * 60 * 60 * 1000).toISOString(),
          status: 'success', autoBackup: true, frequency: 'daily', retentionDays: 30
        };
        setInfo(demo);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(demo));
      }
    } catch (e) { console.error('Failed to load backup settings'); }
  };

  const saveSettings = (newInfo: BackupInfo) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newInfo));
    setInfo(newInfo);
  };

  const daysSinceBackup = info.lastBackup 
    ? Math.floor((Date.now() - new Date(info.lastBackup).getTime()) / (24 * 60 * 60 * 1000)) 
    : null;

  const needsAttention = daysSinceBackup !== null && daysSinceBackup > 7;
  const isOverdue = daysSinceBackup !== null && daysSinceBackup > 3;

  if (dismissed && !needsAttention) return null;

  return (
    <>
      <div className={`rounded-lg p-3 ${needsAttention ? 'bg-red-50 border border-red-200' : isOverdue ? 'bg-yellow-50 border border-yellow-200' : 'bg-green-50 border border-green-200'}`}>
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-full ${needsAttention ? 'bg-red-100' : isOverdue ? 'bg-yellow-100' : 'bg-green-100'}`}>
            {needsAttention ? <AlertTriangle className="h-5 w-5 text-red-600" /> : <Database className="h-5 w-5 text-green-600" />}
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">{needsAttention ? 'Yedekleme Gerekli!' : 'Otomatik Yedekleme'}</h4>
              <div className="flex items-center gap-1">
                <button onClick={() => setShowSettings(true)} className="p-1 hover:bg-white/50 rounded"><Settings className="h-4 w-4 text-gray-500" /></button>
                {!needsAttention && <button onClick={() => setDismissed(true)} className="p-1 hover:bg-white/50 rounded"><X className="h-4 w-4 text-gray-400" /></button>}
              </div>
            </div>
            <p className="text-sm text-gray-600 mt-1">
              {info.lastBackup ? `Son yedekleme: ${new Date(info.lastBackup).toLocaleDateString('tr-TR')} (${daysSinceBackup} gün önce)` : 'Henüz yedekleme yapılmadı'}
            </p>
            {info.nextBackup && info.autoBackup && (
              <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                <Clock className="h-3 w-3" />
                Sonraki: {new Date(info.nextBackup).toLocaleString('tr-TR')}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2"><Database className="h-5 w-5" />Yedekleme Ayarları</h3>
              <button onClick={() => setShowSettings(false)} className="p-1 hover:bg-gray-100 rounded"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-4">
              <label className="flex items-center gap-3">
                <input type="checkbox" checked={info.autoBackup} onChange={(e) => saveSettings({ ...info, autoBackup: e.target.checked })} className="w-4 h-4 rounded" />
                <span>Otomatik yedekleme aktif</span>
              </label>
              <div>
                <label className="block text-sm font-medium mb-1">Yedekleme Sıklığı</label>
                <select value={info.frequency} onChange={(e) => saveSettings({ ...info, frequency: e.target.value as BackupInfo['frequency'] })} className="w-full border rounded-lg px-3 py-2">
                  <option value="daily">Günlük</option>
                  <option value="weekly">Haftalık</option>
                  <option value="monthly">Aylık</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Saklama Süresi (gün)</label>
                <input type="number" value={info.retentionDays} onChange={(e) => saveSettings({ ...info, retentionDays: parseInt(e.target.value) || 30 })} className="w-full border rounded-lg px-3 py-2" min={7} max={365} />
              </div>
              <button className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                <RefreshCw className="h-4 w-4" />Şimdi Yedekle
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
