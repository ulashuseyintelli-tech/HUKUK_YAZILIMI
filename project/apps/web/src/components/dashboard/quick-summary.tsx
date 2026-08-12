'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import {
  type DashboardReadState,
  fromSettled,
  fromError,
  freshData,
  staleData,
  isPending,
  isStale,
} from '@/lib/dashboard-read-state';
import { 
  TrendingUp, TrendingDown, DollarSign, 
  FileText, Users, Calendar, AlertTriangle 
} from 'lucide-react';

interface SummaryData {
  totalCases: number;
  activeCases: number;
  totalClients: number;
  totalCollections: number;
  pendingTasks: number;
  expiringPoas: number;
  upcomingHearings: number;
  monthlyGrowth: number;
}

/**
 * WSMR-A2: dört okuma da hatayı sessizce default'a çeviriyordu
 * (`.catch(() => ({ data: {} }))` + `|| 0`), sonra catch bloğu TÜM alanları 0'a
 * çekiyordu — API çökmüşken kullanıcı "0 dosya, 0 müvekkil, 0 tahsilat" görüyordu.
 * Ayrıca BAŞARI yolunda bile `monthlyGrowth: 12` sabiti uyduruluyordu.
 *
 * Artık: her yol `allSettled` ile bağımsız; sayaç YALNIZ doğrulanmış yanıttan
 * üretilir; `monthlyGrowth` için doğrulanmış bir kaynak olmadığından alan
 * KALDIRILDI (UNSUPPORTED_SYNTHETIC_UI_REMOVED).
 */
const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

const validateCaseStats = (raw: unknown): { total: number; active: number; totalCollections: number; pendingTasks: number } | undefined => {
  const d = (raw as { data?: unknown })?.data as Record<string, unknown> | undefined;
  if (!d || typeof d !== 'object') return undefined;
  const total = num(d.total);
  const active = num(d.active);
  if (total === undefined || active === undefined) return undefined;
  return {
    total,
    active,
    totalCollections: num(d.totalCollections) ?? 0,
    pendingTasks: num(d.pendingTasks) ?? 0,
  };
};

const validateCount = (raw: unknown): number | undefined => {
  const d = (raw as { data?: { data?: unknown } })?.data;
  const list = (d as { data?: unknown })?.data ?? d;
  return Array.isArray(list) ? list.length : undefined;
};

const validateHearings = (raw: unknown): number | undefined => {
  const list = (raw as { data?: unknown })?.data;
  if (!Array.isArray(list)) return undefined;
  return list.filter((e: any) => e?.type === 'DURUSMA').length;
};

export function QuickSummary() {
  const [caseStats, setCaseStats] = useState<DashboardReadState<{ total: number; active: number; totalCollections: number; pendingTasks: number }>>({ status: 'IDLE' });
  const [clients, setClients] = useState<DashboardReadState<number>>({ status: 'IDLE' });
  const [poas, setPoas] = useState<DashboardReadState<number>>({ status: 'IDLE' });
  const [hearings, setHearings] = useState<DashboardReadState<number>>({ status: 'IDLE' });

  const anyPending =
    isPending(caseStats) || isPending(clients) || isPending(poas) || isPending(hearings);
  const anyStale = isStale(caseStats) || isStale(clients) || isStale(poas) || isStale(hearings);

  useEffect(() => {
    loadSummary();
  }, []);

  const loadSummary = async () => {
    for (const set of [setCaseStats, setClients, setPoas, setHearings] as const) {
      (set as (u: (p: any) => any) => void)((p: any) => (isPending(p) ? { status: 'LOADING' } : p));
    }

    const [casesRes, clientsRes, poaRes, calendarRes] = await Promise.allSettled([
      api.get('/cases/stats'),
      api.get('/clients'),
      api.get('/poa/expiring/list?days=30'),
      api.get('/calendar/upcoming?limit=10'),
    ]);
    const now = Date.now();

    setCaseStats((prev) =>
      fromSettled(casesRes, validateCaseStats, () => false, prev, { endpoint: '/cases/stats', widget: 'Dosya özeti' }, now),
    );
    setClients((prev) =>
      fromSettled(clientsRes, validateCount, () => false, prev, { endpoint: '/clients', widget: 'Müvekkil sayısı' }, now),
    );
    setPoas((prev) =>
      fromSettled(poaRes, validateCount, () => false, prev, { endpoint: '/poa/expiring/list', widget: 'Süresi dolan vekaletler' }, now),
    );
    setHearings((prev) =>
      fromSettled(calendarRes, validateHearings, () => false, prev, { endpoint: '/calendar/upcoming', widget: 'Yaklaşan duruşmalar' }, now),
    );
  };

  const cs = freshData(caseStats) ?? staleData(caseStats);
  const data = {
    totalCases: cs?.total,
    activeCases: cs?.active,
    totalCollections: cs?.totalCollections,
    pendingTasks: cs?.pendingTasks,
    totalClients: freshData(clients) ?? staleData(clients),
    expiringPoas: freshData(poas) ?? staleData(poas),
    upcomingHearings: freshData(hearings) ?? staleData(hearings),
  };

  if (anyPending) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-white rounded-xl border p-4 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-16 mb-2" />
            <div className="h-8 bg-gray-200 rounded w-12" />
          </div>
        ))}
      </div>
    );
  }

  // Değer `undefined` ise o kart "alınamadı" gösterir — `|| 0` YALANCI SIFIR üretiyordu.
  const cards = [
    {
      label: 'Aktif Dosya',
      value: data.activeCases,
      total: data.totalCases,
      icon: FileText,
      color: 'text-blue-600 bg-blue-100',
    },
    {
      label: 'Müvekkil',
      value: data.totalClients,
      icon: Users,
      color: 'text-green-600 bg-green-100',
    },
    {
      label: 'Yaklaşan Duruşma',
      value: data.upcomingHearings,
      icon: Calendar,
      color: 'text-purple-600 bg-purple-100',
    },
    {
      label: 'Vekalet Uyarısı',
      value: data.expiringPoas,
      icon: AlertTriangle,
      color: data.expiringPoas ? 'text-red-600 bg-red-100' : 'text-gray-600 bg-gray-100',
      alert: (data.expiringPoas ?? 0) > 0,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {anyStale && (
        <p className="col-span-2 md:col-span-4 text-xs text-yellow-700">Güncel olmayabilir</p>
      )}
      {cards.map((card, i) => (
        <div 
          key={i} 
          className={`bg-white rounded-xl border p-4 ${card.alert ? 'border-red-200' : ''}`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500">{card.label}</span>
            <div className={`p-1.5 rounded-lg ${card.color}`}>
              <card.icon className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-end justify-between">
            <div>
              {card.value === undefined ? (
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-red-600">Veri alınamadı</span>
                  <button
                    type="button"
                    onClick={loadSummary}
                    className="self-start text-xs text-blue-600 underline hover:text-blue-800"
                  >
                    Tekrar dene
                  </button>
                </span>
              ) : (
                <>
                  <span className="text-2xl font-bold">{card.value}</span>
                  {card.total !== undefined && card.total > 0 && (
                    <span className="text-xs text-gray-400 ml-1">/ {card.total}</span>
                  )}
                </>
              )}
            </div>
            {/*
              WSMR-A2: trend rozeti KALDIRILDI. Kaynağı `monthlyGrowth: 12, // Demo`
              sabitiydi — başarı yolunda bile uydurma bir büyüme yüzdesi gösteriyordu.
              Doğrulanmış bir trend sözleşmesi yok (UNSUPPORTED_SYNTHETIC_UI_REMOVED).
            */}
          </div>
        </div>
      ))}
    </div>
  );
}
