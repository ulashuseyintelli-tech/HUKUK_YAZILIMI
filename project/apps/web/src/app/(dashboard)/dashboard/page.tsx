'use client';

import { useState, useEffect } from 'react';
import { 
  FileText, CheckSquare, 
  Zap, Brain, AlertTriangle, Clock, 
  Activity, FileCheck,
  Settings2, X, Lock, Unlock, GripVertical
} from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useUserSettings } from '@/lib/user-settings';

import { ActivityFeed } from '@/components/dashboard/activity-feed';
import { UpcomingEvents } from '@/components/dashboard/upcoming-events';
import { RecentCases } from '@/components/dashboard/recent-cases';
import { FavoriteCases } from '@/components/dashboard/favorite-cases';
import { QuickSummary } from '@/components/dashboard/quick-summary';
import { ReminderWidget } from '@/components/reminders/reminder-widget';

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



interface ExpiringPoa {
  id: string;
  clientName: string;
  lawyerName: string;
  validUntil: string;
  daysRemaining: number;
}

export default function DashboardPage() {
  const [automationStats, setAutomationStats] = useState<AutomationStats | null>(null);
  const [riskSummary, setRiskSummary] = useState<RiskSummaryData | null>(null);

  const [aiConfigured, setAiConfigured] = useState(false);

  const [expiringPoas, setExpiringPoas] = useState<ExpiringPoa[]>([]);
  const [showWidgetSettings, setShowWidgetSettings] = useState(false);
  const { settings, updateSettings } = useUserSettings();
  const widgets = settings.dashboardWidgets;
  const widgetOrder = settings.dashboardWidgetOrder || [
    'quickSummary', 'recentFavorites', 'expiringPoas', 'stats', 'riskAutomation', 'activityEvents', 'aiSuggestions'
  ];
  
  // Drag & Drop state
  const [draggedWidget, setDraggedWidget] = useState<string | null>(null);
  const [dragOverWidget, setDragOverWidget] = useState<string | null>(null);

  const handleDragStart = (widgetId: string) => {
    if (settings.dashboardLocked) return;
    setDraggedWidget(widgetId);
  };

  const handleDragOver = (e: React.DragEvent, widgetId: string) => {
    e.preventDefault();
    if (settings.dashboardLocked || !draggedWidget || draggedWidget === widgetId) return;
    setDragOverWidget(widgetId);
  };

  const handleDrop = (targetId: string) => {
    if (settings.dashboardLocked || !draggedWidget || draggedWidget === targetId) return;
    
    const currentOrder = [...widgetOrder];
    const draggedIndex = currentOrder.indexOf(draggedWidget);
    const targetIndex = currentOrder.indexOf(targetId);
    
    if (draggedIndex !== -1 && targetIndex !== -1) {
      currentOrder.splice(draggedIndex, 1);
      currentOrder.splice(targetIndex, 0, draggedWidget);
      updateSettings({ dashboardWidgetOrder: currentOrder });
    }
    
    setDraggedWidget(null);
    setDragOverWidget(null);
  };

  const handleDragEnd = () => {
    setDraggedWidget(null);
    setDragOverWidget(null);
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const [autoRes, aiRes, riskRes, poaRes] = await Promise.all([
        api.get('/automation/stats').catch(() => ({ data: null })),
        api.get('/ai/stats').catch(() => ({ data: null })),
        api.get('/reports/risk-summary').catch(() => ({ data: null })),
        api.get('/poa/expiring/list?days=30').catch(() => ({ data: null })),
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
      if (poaRes.data?.data) {
        // Süresi dolmak üzere olan vekaletleri işle
        const poas = poaRes.data.data.map((poa: any) => {
          const validUntil = new Date(poa.validUntil);
          const now = new Date();
          const diffTime = validUntil.getTime() - now.getTime();
          const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          
          return {
            id: poa.id,
            clientName: poa.client?.displayName || 'Bilinmeyen Müvekkil',
            lawyerName: poa.lawyers?.[0]?.lawyer ? 
              `${poa.lawyers[0].lawyer.name} ${poa.lawyers[0].lawyer.surname}` : 
              'Bilinmeyen Avukat',
            validUntil: poa.validUntil,
            daysRemaining,
          };
        });
        setExpiringPoas(poas);
      }
    } catch (error) {
      console.error('Dashboard data load error:', error);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-lg font-bold">Dashboard</h1>
          <p className="text-xs text-muted-foreground">Otomasyon durumu</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => updateSettings({ dashboardLocked: !settings.dashboardLocked })}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg ${
              settings.dashboardLocked 
                ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' 
                : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
            }`}
            title={settings.dashboardLocked ? 'Düzenlemeyi Aç' : 'Düzenlemeyi Kilitle'}
          >
            {settings.dashboardLocked ? (
              <><Lock className="h-3 w-3" /> Kilitli</>
            ) : (
              <><Unlock className="h-3 w-3" /> Sürükle</>
            )}
          </button>
          <button
            onClick={() => setShowWidgetSettings(true)}
            className="flex items-center gap-1 text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-200"
          >
            <Settings2 className="h-3 w-3" /> Widget Ayarları
          </button>
          {aiConfigured ? (
            <span className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
              <Brain className="h-3 w-3" /> AI Aktif
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
              <Brain className="h-3 w-3" /> AI Yapılandırılmadı
            </span>
          )}
        </div>
      </div>
      
      <div className="flex-1 overflow-auto space-y-3">

      {/* Draggable Widget Wrapper */}
      {widgetOrder.map((widgetId) => {
        const isDragging = draggedWidget === widgetId;
        const isDragOver = dragOverWidget === widgetId;
        
        const wrapperProps = {
          draggable: !settings.dashboardLocked,
          onDragStart: () => handleDragStart(widgetId),
          onDragOver: (e: React.DragEvent) => handleDragOver(e, widgetId),
          onDragLeave: () => setDragOverWidget(null),
          onDrop: () => handleDrop(widgetId),
          onDragEnd: handleDragEnd,
          className: `relative transition-all duration-200 ${
            !settings.dashboardLocked ? 'cursor-move' : ''
          } ${isDragOver ? 'ring-2 ring-blue-400 ring-offset-2' : ''} ${
            isDragging ? 'opacity-50' : ''
          }`,
        };

        const dragHandle = !settings.dashboardLocked && (
          <div className="absolute -left-1 top-2 p-1 text-gray-300 hover:text-gray-500 z-10 cursor-grab">
            <GripVertical className="h-4 w-4" />
          </div>
        );

        // Render widget based on ID
        switch (widgetId) {
          case 'quickSummary':
            return (
              <div key={widgetId} {...wrapperProps}>
                {dragHandle}
                <QuickSummary />
              </div>
            );
          
          case 'recentFavorites':
            return (
              <div key={widgetId} {...wrapperProps}>
                {dragHandle}
                <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
                  <RecentCases />
                  <FavoriteCases />
                  <ReminderWidget />
                </div>
              </div>
            );
          
          case 'expiringPoas':
            if (!widgets?.expiringPoas || expiringPoas.length === 0) return null;
            return (
              <div key={widgetId} {...wrapperProps}>
                {dragHandle}
                <ExpiringPoasWidget expiringPoas={expiringPoas} />
              </div>
            );
          
          case 'stats':
            return (
              <div key={widgetId} {...wrapperProps}>
                {dragHandle}
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard title="Toplam Dosya" value={automationStats?.totalCases?.toString() || '0'} icon={<FileText className="h-5 w-5" />} color="blue" />
                  <StatCard title="Otomatik Mod" value={automationStats?.autoCases?.toString() || '0'} subtitle="dosya" icon={<Zap className="h-5 w-5" />} color="green" />
                  <StatCard title="Bekleyen İşlem" value={automationStats?.pendingActions?.toString() || '0'} icon={<Clock className="h-5 w-5" />} color="yellow" />
                  <StatCard title="Bugün Tamamlanan" value={automationStats?.completedToday?.toString() || '0'} icon={<CheckSquare className="h-5 w-5" />} color="purple" />
                </div>
              </div>
            );
          
          case 'riskAutomation':
            return (
              <div key={widgetId} {...wrapperProps}>
                {dragHandle}
                <RiskAutomationSection riskSummary={riskSummary} aiConfigured={aiConfigured} />
              </div>
            );
          
          case 'activityEvents':
            if (!widgets?.recentActions && !widgets?.upcomingActions) return null;
            return (
              <div key={widgetId} {...wrapperProps}>
                {dragHandle}
                <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
                  {widgets?.recentActions && <ActivityFeed />}
                  {widgets?.upcomingActions && <UpcomingEvents />}
                </div>
              </div>
            );
          
          case 'aiSuggestions':
            if (!widgets?.aiSuggestions) return null;
            return (
              <div key={widgetId} {...wrapperProps}>
                {dragHandle}
                <AiSuggestionsWidget aiConfigured={aiConfigured} />
              </div>
            );
          
          default:
            return null;
        }
      })}

      </div>

      {/* Widget Ayarları Modal */}
      {showWidgetSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl w-full max-w-md mx-4 max-h-[80vh] overflow-auto">
            <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-white">
              <h3 className="font-semibold flex items-center gap-2">
                <Settings2 className="h-5 w-5" /> Dashboard Widget Ayarları
              </h3>
              <button onClick={() => setShowWidgetSettings(false)} className="text-gray-500 hover:text-gray-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {[
                { key: 'quickSummary', label: 'Hızlı Özet', desc: 'Aktif dosya, müvekkil, duruşma sayıları' },
                { key: 'recentCases', label: 'Son Dosyalar', desc: 'Son görüntülenen dosyalar' },
                { key: 'favoriteCases', label: 'Favori Dosyalar', desc: 'Yıldızlı dosyalar' },
                { key: 'reminders', label: 'Hatırlatıcılar', desc: 'Aktif hatırlatıcılar listesi' },
                { key: 'stats', label: 'İstatistik Kartları', desc: 'Toplam dosya, otomatik mod, bekleyen işlem' },
                { key: 'expiringPoas', label: 'Süresi Dolan Vekaletler', desc: 'Vekalet uyarı bandı' },
                { key: 'riskDistribution', label: 'Risk Dağılımı', desc: 'Risk analizi grafiği' },
                { key: 'automationStatus', label: 'Otomasyon Durumu', desc: 'Sistem durumu kartı' },
                { key: 'upcomingActions', label: 'Yaklaşan İşlemler', desc: 'Planlanan otomatik işlemler' },
                { key: 'recentActions', label: 'Son İşlemler', desc: 'Tamamlanan işlemler listesi' },
                { key: 'aiSuggestions', label: 'AI Önerileri', desc: 'Yapay zeka tavsiyeleri' },
              ].map((widget) => (
                <label key={widget.key} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                  <div>
                    <p className="font-medium text-sm">{widget.label}</p>
                    <p className="text-xs text-gray-500">{widget.desc}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={widgets?.[widget.key as keyof typeof widgets] ?? true}
                    onChange={(e) => updateSettings({
                      dashboardWidgets: { ...widgets, [widget.key]: e.target.checked }
                    })}
                    className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </label>
              ))}
            </div>
            <div className="p-4 border-t bg-gray-50">
              <button
                onClick={() => setShowWidgetSettings(false)}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Tamam
              </button>
            </div>
          </div>
        </div>
      )}
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

// Expiring POAs Widget
function ExpiringPoasWidget({ expiringPoas }: { expiringPoas: ExpiringPoa[] }) {
  return (
    <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-amber-100 rounded-lg">
          <FileCheck className="h-5 w-5 text-amber-600" />
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-amber-800">⚠️ Süresi Dolmak Üzere Olan Vekaletler</h3>
            <span className="px-2 py-0.5 bg-amber-200 text-amber-800 text-xs rounded-full font-medium">
              {expiringPoas.length} vekalet
            </span>
          </div>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {expiringPoas.slice(0, 5).map((poa) => (
              <div key={poa.id} className="flex items-center justify-between text-sm">
                <div>
                  <span className="font-medium text-amber-900">{poa.clientName}</span>
                  <span className="text-amber-700"> → Av. {poa.lawyerName}</span>
                </div>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  poa.daysRemaining <= 7 ? 'bg-red-100 text-red-700' :
                  poa.daysRemaining <= 14 ? 'bg-orange-100 text-orange-700' :
                  'bg-amber-100 text-amber-700'
                }`}>
                  {poa.daysRemaining} gün kaldı
                </span>
              </div>
            ))}
          </div>
          {expiringPoas.length > 5 && (
            <p className="text-xs text-amber-600 mt-2">
              ve {expiringPoas.length - 5} vekalet daha...
            </p>
          )}
          <div className="mt-3">
            <Link
              href="/settings/clients"
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-600 text-white text-xs rounded hover:bg-amber-700"
            >
              <FileCheck className="h-3.5 w-3.5" />
              Vekaletleri Yönet
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// Risk & Automation Section
function RiskAutomationSection({ riskSummary, aiConfigured }: { riskSummary: RiskSummaryData | null; aiConfigured: boolean }) {
  return (
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
  );
}

// AI Suggestions Widget
function AiSuggestionsWidget({ aiConfigured }: { aiConfigured: boolean }) {
  return (
    <div className="bg-white rounded-xl border p-4 sm:p-6">
      <h2 className="font-semibold mb-3 sm:mb-4 flex items-center gap-2 text-sm sm:text-base">
        <Brain className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-500" />
        AI Önerileri
      </h2>
      {aiConfigured ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
  );
}
