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
import {
  type DashboardReadState,
  fromSettled,
  freshData,
  isPending,
  isStale,
  staleData,
} from '@/lib/dashboard-read-state';

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

/**
 * Yanıt doğrulayıcıları — WSMR-A2.
 *
 * Her biri gövdeyi ya beklenen şekle indirger ya da `undefined` döner. `undefined`
 * BOZUK yanıt demektir ve gerçek sıfır/boş SAYILMAZ; çağıran onu ERROR'a çevirir.
 * Sayı alanları `Number.isFinite` ile denetlenir: eksik alan veya `null` geldiğinde
 * kart "0" göstermek yerine "veri alınamadı" durumuna düşer.
 */
const validateAutomationStats = (raw: unknown): AutomationStats | undefined => {
  const d = (raw as { data?: { data?: unknown } })?.data?.data as Record<string, unknown> | undefined;
  if (!d || typeof d !== 'object') return undefined;
  const keys = ['totalCases', 'autoCases', 'pendingActions', 'completedToday'] as const;
  if (!keys.every((k) => typeof d[k] === 'number' && Number.isFinite(d[k]))) return undefined;
  return {
    totalCases: d.totalCases as number,
    autoCases: d.autoCases as number,
    pendingActions: d.pendingActions as number,
    completedToday: d.completedToday as number,
  };
};

const validateAiConfigured = (raw: unknown): boolean | undefined => {
  const d = (raw as { data?: { data?: unknown } })?.data?.data as Record<string, unknown> | undefined;
  if (!d || typeof d !== 'object') return undefined;
  // Yapılandırılmamış olduğunu iddia etmek için GERÇEK bir `false` gerekir.
  return typeof d.isOpenAiConfigured === 'boolean' ? d.isOpenAiConfigured : undefined;
};

const validateRiskSummary = (raw: unknown): RiskSummaryData | undefined => {
  const d = (raw as { data?: { data?: unknown } })?.data?.data as Record<string, unknown> | undefined;
  if (!d || typeof d !== 'object') return undefined;
  if (typeof d.totalActive !== 'number' || !Number.isFinite(d.totalActive)) return undefined;
  if (!Array.isArray(d.distribution)) return undefined;
  const s = d.summary as Record<string, unknown> | undefined;
  if (!s || typeof s !== 'object') return undefined;
  if (!(['high', 'medium', 'low', 'unassigned'] as const).every((k) => typeof s[k] === 'number')) {
    return undefined;
  }
  return d as unknown as RiskSummaryData;
};

const validateExpiringPoas = (raw: unknown): ExpiringPoa[] | undefined => {
  const d = (raw as { data?: { data?: unknown } })?.data?.data;
  if (!Array.isArray(d)) return undefined;
  const now = Date.now();
  const out: ExpiringPoa[] = [];
  for (const poa of d as Array<Record<string, any>>) {
    if (!poa || typeof poa !== 'object' || typeof poa.id !== 'string') return undefined;
    const validUntil = new Date(poa.validUntil);
    if (Number.isNaN(validUntil.getTime())) return undefined;
    out.push({
      id: poa.id,
      clientName: poa.client?.displayName || 'Bilinmeyen Müvekkil',
      lawyerName: poa.lawyers?.[0]?.lawyer
        ? `${poa.lawyers[0].lawyer.name} ${poa.lawyers[0].lawyer.surname}`
        : 'Bilinmeyen Avukat',
      validUntil: poa.validUntil,
      daysRemaining: Math.ceil((validUntil.getTime() - now) / (1000 * 60 * 60 * 24)),
    });
  }
  return out;
};

export default function DashboardPage() {
  const [automation, setAutomation] = useState<DashboardReadState<AutomationStats>>({ status: 'IDLE' });
  const [risk, setRisk] = useState<DashboardReadState<RiskSummaryData>>({ status: 'IDLE' });
  const [ai, setAi] = useState<DashboardReadState<boolean>>({ status: 'IDLE' });
  const [poas, setPoas] = useState<DashboardReadState<ExpiringPoa[]>>({ status: 'IDLE' });

  const automationStats = freshData(automation) ?? staleData(automation);
  const riskSummary = freshData(risk) ?? staleData(risk);
  const expiringPoas = freshData(poas) ?? staleData(poas) ?? [];
  /**
   * ÜÇ DURUMLU: `true` | `false` | `undefined` (bilinmiyor).
   * `false` YALNIZ doğrulanmış yanıttan doğar; hata/yükleniyor halinde `undefined`
   * kalır ve arayüz "AI Yapılandırılmadı" İDDİA ETMEZ.
   */
  const aiConfigured = freshData(ai) ?? staleData(ai);
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

  /**
   * Dört okuma yolu BİRBİRİNDEN BAĞIMSIZ yürür (`allSettled`): birinin hatası
   * diğerlerinin doğrulanmış verisini düşürmez. Hiçbir yol hatayı varsayılan
   * değere çevirmez; her yol kendi durumunu taşır.
   */
  const loadDashboardData = async () => {
    setAutomation((p) => (isPending(p) ? { status: 'LOADING' } : p));
    setRisk((p) => (isPending(p) ? { status: 'LOADING' } : p));
    setAi((p) => (isPending(p) ? { status: 'LOADING' } : p));
    setPoas((p) => (isPending(p) ? { status: 'LOADING' } : p));

    const [autoRes, aiRes, riskRes, poaRes] = await Promise.allSettled([
      api.get('/automation/stats'),
      api.get('/ai/stats'),
      api.get('/reports/risk-summary'),
      api.get('/poa/expiring/list?days=30'),
    ]);
    const now = Date.now();

    setAutomation((prev) =>
      fromSettled(autoRes, validateAutomationStats, () => false, prev, {
        endpoint: '/automation/stats',
        widget: 'Otomasyon istatistikleri',
      }, now),
    );
    setAi((prev) =>
      fromSettled(aiRes, validateAiConfigured, () => false, prev, {
        endpoint: '/ai/stats',
        widget: 'AI durumu',
      }, now),
    );
    setRisk((prev) =>
      fromSettled(riskRes, validateRiskSummary, (v) => v.totalActive === 0, prev, {
        endpoint: '/reports/risk-summary',
        widget: 'Risk özeti',
      }, now),
    );
    setPoas((prev) =>
      fromSettled(poaRes, validateExpiringPoas, (v) => v.length === 0, prev, {
        endpoint: '/poa/expiring/list',
        widget: 'Süresi dolan vekaletler',
      }, now),
    );
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
          {aiConfigured === true && (
            <span className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
              <Brain className="h-3 w-3" /> AI Aktif
            </span>
          )}
          {aiConfigured === false && (
            <span className="flex items-center gap-1 text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
              <Brain className="h-3 w-3" /> AI Yapılandırılmadı
            </span>
          )}
          {aiConfigured === undefined && (
            <span className="flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
              <Brain className="h-3 w-3" />
              {isPending(ai) ? 'AI durumu yükleniyor…' : 'AI durumu alınamadı'}
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
                  <StatCard title="Toplam Dosya" state={automation} select={(s) => s.totalCases} onRetry={loadDashboardData} icon={<FileText className="h-5 w-5" />} color="blue" />
                  <StatCard title="Otomatik Mod" state={automation} select={(s) => s.autoCases} onRetry={loadDashboardData} subtitle="dosya" icon={<Zap className="h-5 w-5" />} color="green" />
                  <StatCard title="Bekleyen İşlem" state={automation} select={(s) => s.pendingActions} onRetry={loadDashboardData} icon={<Clock className="h-5 w-5" />} color="yellow" />
                  <StatCard title="Bugün Tamamlanan" state={automation} select={(s) => s.completedToday} onRetry={loadDashboardData} icon={<CheckSquare className="h-5 w-5" />} color="purple" />
                </div>
              </div>
            );
          
          case 'riskAutomation':
            return (
              <div key={widgetId} {...wrapperProps}>
                {dragHandle}
                <RiskAutomationSection riskSummary={riskSummary} riskState={risk} aiConfigured={aiConfigured} onRetry={loadDashboardData} />
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

/**
 * WSMR-A2: kart değeri artık hazır bir string DEĞİL, okuma durumundan türetilir.
 * `state` + `select` alır; böylece "gerçek 0" ile "veri alınamadı" aynı görünemez.
 */
function StatCard({
  title,
  state,
  select,
  subtitle,
  icon,
  color = 'blue',
  onRetry,
}: {
  title: string;
  state: DashboardReadState<AutomationStats>;
  select: (value: AutomationStats) => number;
  subtitle?: string;
  icon: React.ReactNode;
  color?: 'blue' | 'green' | 'yellow' | 'purple';
  onRetry: () => void;
}) {
  const fresh = freshData(state);
  const stale = staleData(state);
  const value = fresh ?? stale;

  let body: React.ReactNode;
  if (isPending(state)) {
    body = (
      <span className="text-sm text-muted-foreground" role="status">
        Yükleniyor…
      </span>
    );
  } else if (state.status === 'ERROR' && value === undefined) {
    // Hata + gösterilecek doğrulanmış veri yok → RAKAM BASILMAZ.
    body = (
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-red-600">Veri alınamadı</span>
        <button
          type="button"
          onClick={onRetry}
          className="self-start text-xs text-blue-600 underline hover:text-blue-800"
        >
          Tekrar dene
        </button>
      </span>
    );
  } else {
    body = (
      <span className="flex flex-col gap-0.5">
        <span>{value === undefined ? '—' : String(select(value as AutomationStats))}</span>
        {isStale(state) && (
          <span className="text-[10px] font-normal text-yellow-700">Güncel olmayabilir</span>
        )}
      </span>
    );
  }
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
        <span className="text-2xl sm:text-3xl font-bold">{body}</span>
        {subtitle && freshData(state) !== undefined && (
          <span className="ml-1 text-xs sm:text-sm text-muted-foreground">{subtitle}</span>
        )}
      </div>
    </div>
  );
}

// NOT: sabit renkli `RiskBar` KALDIRILDI — tek çağrısı, veri yokken dört sıfır risk
// çubuğu çizen sahte fallback'ti (WSMR-A2). Gerçek veri `RiskBarDynamic` ile çizilir.

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
function RiskAutomationSection({
  riskSummary,
  riskState,
  aiConfigured,
  onRetry,
}: {
  riskSummary: RiskSummaryData | undefined;
  riskState: DashboardReadState<RiskSummaryData>;
  /** ÜÇ DURUMLU: `undefined` = bilinmiyor (hata/yükleniyor). */
  aiConfigured: boolean | undefined;
  onRetry: () => void;
}) {
  return (
    <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
      {/* Risk Dağılımı */}
      <div className="bg-white rounded-xl border p-4 sm:p-6">
        <h2 className="font-semibold mb-3 sm:mb-4 flex items-center gap-2 text-sm sm:text-base">
          <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-orange-500" />
          Risk Dağılımı
        </h2>
        {/*
          WSMR-A2: eski davranış, veri yokken DÖRT SIFIR RİSK ÇUBUĞU çiziyordu —
          API çökmüşken kullanıcı "hiç riskli dosya yok" diye okuyordu. Artık
          yükleniyor / gerçek boş / hata durumları ayrı.
        */}
        {isPending(riskState) && (
          <p className="text-sm text-muted-foreground" role="status">
            Risk dağılımı yükleniyor…
          </p>
        )}
        {!isPending(riskState) && riskSummary === undefined && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-red-600">Risk dağılımı alınamadı</p>
            <button
              type="button"
              onClick={onRetry}
              className="text-xs text-blue-600 underline hover:text-blue-800"
            >
              Tekrar dene
            </button>
          </div>
        )}
        {riskSummary !== undefined && (
          <div className="space-y-3">
            {isStale(riskState) && (
              <p className="text-xs text-yellow-700">Güncel olmayabilir</p>
            )}
            {riskSummary.totalActive === 0 ? (
              <p className="text-sm text-muted-foreground">Aktif riskli dosya yok.</p>
            ) : (
              <>
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
              </>
            )}
          </div>
        )}
      </div>

      {/* Otomasyon Durumu */}
      <div className="bg-white rounded-xl border p-4 sm:p-6">
        <h2 className="font-semibold mb-3 sm:mb-4 flex items-center gap-2 text-sm sm:text-base">
          <Activity className="h-4 w-4 sm:h-5 sm:w-5 text-blue-500" />
          Otomasyon Durumu
        </h2>
        {/*
          WSMR-A2 — BLOCKED_CONTRACT_EVIDENCE: "Kural Motoru / İş Akışı / Tebligat
          Çalışıyor" satırları HİÇBİR veri kaynağına dayanmıyordu; motor çökse bile
          yeşil "Çalışıyor" yazıyordu. Sağlık durumu veren bir endpoint sözleşmesi
          repository'de YOK, uydurulmaz da — bu yüzden yanlış iddia kaldırıldı ve
          yerine dürüst bir yokluk bildirimi kondu. Gerçek health endpoint'i
          tanımlandığında bu blok ona bağlanır.
        */}
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Motor sağlık durumu için doğrulanmış bir veri kaynağı bulunmuyor.
          </p>
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <span className="text-sm">AI Karar Modülü</span>
            {aiConfigured === undefined ? (
              <span className="text-gray-600 text-sm font-medium">Durum alınamadı</span>
            ) : (
              <span
                className={`text-sm font-medium ${aiConfigured ? 'text-green-600' : 'text-yellow-600'}`}
              >
                {aiConfigured ? 'Aktif' : 'Yapılandır'}
              </span>
            )}
          </div>
        </div>
      </div>
      {/*
        WSMR-A2: "Yaklaşan Otomatik İşlemler" bloğu KALDIRILDI. Sabit dört sahte
        dosya (2024/1234 "Haciz talebi 2 saat" …) gerçek planlanmış icra işlemiymiş
        gibi gösteriliyordu. Zamanlanmış işlemleri veren bir endpoint sözleşmesi YOK
        → BLOCKED_CONTRACT_EVIDENCE. Uydurma hukuki işlem gösterilmez.
      */}
    </div>
  );
}

// AI Suggestions Widget
//
// WSMR-A2 — BLOCKED_CONTRACT_EVIDENCE: AI yapılandırılmış olduğunda burada ÜÇ SABİT
// uydurma öneri ("2024/1234 · Banka haczi önerilir · %85 güven") gerçek model çıktısı
// gibi gösteriliyordu. Avukata sahte hukuki tavsiye ve sahte güven skoru sunmak kabul
// edilemez; öneri döndüren bir endpoint sözleşmesi de repository'de YOK. Uydurma
// içerik kaldırıldı, yerine dürüst durum bildirimi kondu.
function AiSuggestionsWidget({ aiConfigured }: { aiConfigured: boolean | undefined }) {
  return (
    <div className="bg-white rounded-xl border p-4 sm:p-6">
      <h2 className="font-semibold mb-3 sm:mb-4 flex items-center gap-2 text-sm sm:text-base">
        <Brain className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-500" />
        AI Önerileri
      </h2>
      <div className="text-center py-8 text-muted-foreground">
        <Brain className="h-12 w-12 mx-auto mb-3 opacity-30" />
        {aiConfigured === undefined && <p className="text-sm">AI durumu alınamadı</p>}
        {aiConfigured === false && (
          <>
            <p className="text-sm">AI modülü yapılandırılmadı</p>
            <p className="text-xs mt-1">OpenAI API anahtarını .env dosyasına ekleyin</p>
          </>
        )}
        {aiConfigured === true && (
          <p className="text-sm">Bu dosya için öneri kaynağı henüz bağlı değil.</p>
        )}
      </div>
    </div>
  );
}
