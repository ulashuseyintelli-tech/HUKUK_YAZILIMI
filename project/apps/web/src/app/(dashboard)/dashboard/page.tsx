'use client';

import { useState, useEffect } from 'react';
import { 
  FileText, Users, CheckSquare, TrendingUp, 
  Zap, Brain, AlertTriangle, Clock, 
  ToggleLeft, ToggleRight, Activity
} from 'lucide-react';
import { api } from '@/lib/api';

interface AutomationStats {
  totalCases: number;
  autoCases: number;
  pendingActions: number;
  completedToday: number;
}

interface RiskDistribution {
  id: string | null;
  code: string;
  name: string;
  color: string;
  count: number;
  totalAmount: number;
  percentage: number;
}

interface RiskSummaryData {
  totalActive: number;
  distribution: RiskDistribution[];
  summary: {
    high: number;
    medium: number;
    low: number;
    unassigned: number;
  };
}

interface UpcomingAction {
  id: string;
  caseId: string;
  fileNumber: string;
  action: string;
  scheduledAt: string;
  priority: string;
}

export default function DashboardPage() {
  const [automationStats, setAutomationStats] = useState<AutomationStats | null>(null);
  const [riskSummary, setRiskSummary] = useState<RiskSummaryData | null>(null);
  const [upcomingActions, setUpcomingActions] = useState<UpcomingAction[]>([]);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const [autoRes, aiRes, riskRes] = await Promise.all([
        api.get('/automation/stats').catch(() => ({ data: null })),
        api.get('/ai/stats').catch(() => ({ data: null })),
        api.get('/reports/risk-summary').catch(() => ({ data: null })),
      ]);
      
      if (autoRes.data?.data) {
        setAutomationStats(autoRes.data.data);
      }
      if (aiRes.data?.data) {
        setAiConfigured(aiRes.data.data.isOpenAiConfigured);
      }
      if (riskRes.data?.data) {
        setRiskSummary(riskRes.data.data);
      }
    } catch (error) {
      console.error('Dashboard data load error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 px-4 sm:px-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Tam Otomatik İcra Dashboard</h1>
          <p className="text-sm text-muted-foreground">Otomasyon durumu ve sistem özeti</p>
        </div>
        <div className="flex items-center gap-2">
          {aiConfigured ? (
            <span className="flex items-center gap-1 text-xs sm:text-sm bg-green-100 text-green-700 px-3 py-1 rounded-full">
              <Brain className="h-4 w-4" /> AI Aktif
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs sm:text-sm bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full">
              <Brain className="h-4 w-4" /> AI Yapılandırılmadı
            </span>
          )}
        </div>
      </div>


      {/* Otomasyon Stats */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Toplam Dosya"
          value={automationStats?.totalCases?.toString() || '0'}
          icon={<FileText className="h-5 w-5" />}
          color="blue"
        />
        <StatCard
          title="Otomatik Mod"
          value={automationStats?.autoCases?.toString() || '0'}
          subtitle="dosya"
          icon={<Zap className="h-5 w-5" />}
          color="green"
        />
        <StatCard
          title="Bekleyen İşlem"
          value={automationStats?.pendingActions?.toString() || '0'}
          icon={<Clock className="h-5 w-5" />}
          color="yellow"
        />
        <StatCard
          title="Bugün Tamamlanan"
          value={automationStats?.completedToday?.toString() || '0'}
          icon={<CheckSquare className="h-5 w-5" />}
          color="purple"
        />
      </div>

      {/* Risk Dağılımı ve Otomasyon Durumu */}
      <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {/* Risk Dağılımı */}
        <div className="bg-white rounded-xl border p-4 sm:p-6">
          <h2 className="font-semibold mb-3 sm:mb-4 flex items-center gap-2 text-sm sm:text-base">
            <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-orange-500" />
            Risk Dağılımı
          </h2>
          {riskSummary ? (
            <div className="space-y-3">
              {riskSummary.distribution.map((risk) => (
                <RiskBarDynamic 
                  key={risk.code} 
                  label={risk.name} 
                  count={risk.count} 
                  total={riskSummary.totalActive} 
                  color={risk.color || '#9ca3af'} 
                />
              ))}
              <div className="pt-3 mt-3 border-t">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Toplam Aktif Dosya</span>
                  <span className="font-semibold">{riskSummary.totalActive}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <RiskBar label="Düşük Risk" count={0} total={1} color="green" />
              <RiskBar label="Orta Risk" count={0} total={1} color="yellow" />
              <RiskBar label="Yüksek Risk" count={0} total={1} color="orange" />
              <RiskBar label="Belirsiz" count={0} total={1} color="red" />
            </div>
          )}
        </div>

        {/* Otomasyon Durumu */}
        <div className="bg-white rounded-xl border p-4 sm:p-6">
          <h2 className="font-semibold mb-3 sm:mb-4 flex items-center gap-2 text-sm sm:text-base">
            <Activity className="h-4 w-4 sm:h-5 sm:w-5 text-blue-500" />
            Otomasyon Durumu
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm">Kural Motoru</span>
              <span className="text-green-600 text-sm font-medium">Çalışıyor</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm">İş Akışı Motoru</span>
              <span className="text-green-600 text-sm font-medium">Çalışıyor</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm">Tebligat Sistemi</span>
              <span className="text-green-600 text-sm font-medium">Aktif</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm">AI Karar Modülü</span>
              <span className={`text-sm font-medium ${aiConfigured ? 'text-green-600' : 'text-yellow-600'}`}>
                {aiConfigured ? 'Aktif' : 'Yapılandır'}
              </span>
            </div>
          </div>
        </div>

        {/* Yaklaşan İşlemler */}
        <div className="bg-white rounded-xl border p-4 sm:p-6">
          <h2 className="font-semibold mb-3 sm:mb-4 flex items-center gap-2 text-sm sm:text-base">
            <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-purple-500" />
            Yaklaşan Otomatik İşlemler
          </h2>
          <div className="space-y-3">
            {[
              { file: '2024/1234', action: 'Haciz talebi', time: '2 saat' },
              { file: '2024/1235', action: 'Tebligat kontrolü', time: '4 saat' },
              { file: '2024/1236', action: 'Satış talebi', time: '1 gün' },
              { file: '2024/1237', action: 'Risk analizi', time: '2 gün' },
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded">
                <div>
                  <p className="text-sm font-medium">{item.file}</p>
                  <p className="text-xs text-muted-foreground">{item.action}</p>
                </div>
                <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
                  {item.time}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>


      {/* Son İşlemler ve AI Önerileri */}
      <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
        {/* Son Otomatik İşlemler */}
        <div className="bg-white rounded-xl border p-4 sm:p-6">
          <h2 className="font-semibold mb-3 sm:mb-4 flex items-center gap-2 text-sm sm:text-base">
            <Zap className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-500" />
            Son Otomatik İşlemler
          </h2>
          <div className="space-y-3">
            {[
              { file: '2024/1230', action: 'Ödeme emri gönderildi', time: '10 dk önce', status: 'success' },
              { file: '2024/1228', action: 'Banka haczi başlatıldı', time: '1 saat önce', status: 'success' },
              { file: '2024/1225', action: 'Risk skoru güncellendi', time: '2 saat önce', status: 'info' },
              { file: '2024/1220', action: 'Tebligat teslim edildi', time: '3 saat önce', status: 'success' },
              { file: '2024/1218', action: 'Satış talebi hazırlandı', time: '5 saat önce', status: 'pending' },
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    item.status === 'success' ? 'bg-green-500' : 
                    item.status === 'pending' ? 'bg-yellow-500' : 'bg-blue-500'
                  }`} />
                  <div>
                    <p className="text-sm font-medium">{item.action}</p>
                    <p className="text-xs text-muted-foreground">{item.file}</p>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">{item.time}</span>
              </div>
            ))}
          </div>
        </div>

        {/* AI Önerileri */}
        <div className="bg-white rounded-xl border p-4 sm:p-6">
          <h2 className="font-semibold mb-3 sm:mb-4 flex items-center gap-2 text-sm sm:text-base">
            <Brain className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-500" />
            AI Önerileri
          </h2>
          {aiConfigured ? (
            <div className="space-y-3">
              {[
                { file: '2024/1234', suggestion: 'Banka haczi önerilir', confidence: 85 },
                { file: '2024/1235', suggestion: 'Araç sorgulaması yapılmalı', confidence: 78 },
                { file: '2024/1236', suggestion: 'Taksitlendirme önerilebilir', confidence: 72 },
              ].map((item, i) => (
                <div key={i} className="p-3 bg-indigo-50 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{item.file}</span>
                    <span className="text-xs bg-indigo-200 text-indigo-800 px-2 py-0.5 rounded">
                      %{item.confidence} güven
                    </span>
                  </div>
                  <p className="text-sm text-indigo-700">{item.suggestion}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Brain className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">AI modülü yapılandırılmadı</p>
              <p className="text-xs mt-1">OpenAI API anahtarını .env dosyasına ekleyin</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  icon,
  color = 'blue',
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  color?: 'blue' | 'green' | 'yellow' | 'purple';
}) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    purple: 'bg-purple-50 text-purple-600',
  };

  return (
    <div className="bg-white rounded-xl border p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-xs sm:text-sm">{title}</span>
        <span className={`p-1.5 sm:p-2 rounded-lg ${colors[color]}`}>{icon}</span>
      </div>
      <div className="mt-2 sm:mt-3">
        <span className="text-2xl sm:text-3xl font-bold">{value}</span>
        {subtitle && <span className="ml-1 text-xs sm:text-sm text-muted-foreground">{subtitle}</span>}
      </div>
    </div>
  );
}

function RiskBar({ 
  label, 
  count, 
  total, 
  color 
}: { 
  label: string; 
  count: number; 
  total: number; 
  color: 'green' | 'yellow' | 'orange' | 'red';
}) {
  const percentage = total > 0 ? (count / total) * 100 : 0;
  const colors = {
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    orange: 'bg-orange-500',
    red: 'bg-red-500',
  };

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span>{label}</span>
        <span className="font-medium">{count}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div 
          className={`h-full ${colors[color]} rounded-full transition-all`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function RiskBarDynamic({ 
  label, 
  count, 
  total, 
  color 
}: { 
  label: string; 
  count: number; 
  total: number; 
  color: string;
}) {
  const percentage = total > 0 ? (count / total) * 100 : 0;

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
          {label}
        </span>
        <span className="font-medium">{count} <span className="text-muted-foreground text-xs">(%{Math.round(percentage)})</span></span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div 
          className="h-full rounded-full transition-all"
          style={{ width: `${percentage}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}
