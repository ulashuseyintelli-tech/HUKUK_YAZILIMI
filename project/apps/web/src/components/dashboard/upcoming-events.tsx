'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Calendar, Clock, MapPin, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import {
  type DashboardReadState,
  fromResponse,
  fromError,
  freshData,
  staleData,
  isPending,
  isStale,
} from '@/lib/dashboard-read-state';

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  time?: string;
  type: string;
  location?: string;
}

const EVENT_COLORS: Record<string, string> = {
  DURUSMA: 'border-l-red-500 bg-red-50',
  HATIRLATICI: 'border-l-yellow-500 bg-yellow-50',
  GOREV: 'border-l-blue-500 bg-blue-50',
  DIGER: 'border-l-gray-500 bg-gray-50',
};

/**
 * WSMR-A2: GET başarısızsa ÜÇ SAHTE ETKİNLİK üretiliyordu — uydurma duruşma
 * ("Duruşma - 2024/1234", "İstanbul 5. İcra Mahkemesi") gerçek ajanda kaydı gibi
 * görünüyordu. Artık hata görünür ve tekrar denenebilir; gerçek boş ajanda yalnız
 * doğrulanmış yanıttan doğar.
 */
const validateEvents = (raw: unknown): CalendarEvent[] | undefined => {
  const list = (raw as { data?: unknown })?.data;
  if (!Array.isArray(list)) return undefined;
  for (const e of list) {
    if (!e || typeof e !== 'object') return undefined;
    const ev = e as Record<string, unknown>;
    if (typeof ev.id !== 'string' || typeof ev.date !== 'string') return undefined;
  }
  return list as CalendarEvent[];
};

export function UpcomingEvents() {
  const [state, setState] = useState<DashboardReadState<CalendarEvent[]>>({ status: 'IDLE' });
  const events = freshData(state) ?? staleData(state) ?? [];

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    setState((p) => (isPending(p) ? { status: 'LOADING' } : p));
    try {
      const res = await api.get('/calendar/upcoming?limit=5');
      setState(fromResponse(res, validateEvents, (v) => v.length === 0, Date.now()));
    } catch (e) {
      setState((prev) =>
        fromError(e, prev, { endpoint: '/calendar/upcoming', widget: 'Yaklaşan etkinlikler' }),
      );
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) return 'Bugün';
    if (date.toDateString() === tomorrow.toDateString()) return 'Yarın';
    
    return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  };

  const getDaysUntil = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    const diff = Math.ceil((date.getTime() - today.getTime()) / 86400000);
    return diff;
  };

  if (isPending(state)) {
    return (
      <div className="bg-white rounded-xl border p-4" role="status" aria-label="Yaklaşan etkinlikler yükleniyor">
        <div className="h-6 bg-gray-200 rounded w-40 mb-4 animate-pulse" />
        {[1, 2, 3].map(i => (
          <div key={i} className="h-16 bg-gray-100 rounded-lg mb-2 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Calendar className="h-5 w-5 text-purple-500" />
          Yaklaşan Etkinlikler
        </h3>
        <Link href="/calendar" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
          Tümü <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      {isStale(state) && (
        <p className="mb-2 text-xs text-yellow-700">Güncel olmayabilir</p>
      )}

      {state.status === 'ERROR' && !isStale(state) ? (
        <div className="text-center py-8">
          <p className="text-sm font-medium text-red-600">Etkinlikler alınamadı</p>
          <button
            type="button"
            onClick={loadEvents}
            className="mt-1 text-xs text-blue-600 underline hover:text-blue-800"
          >
            Tekrar dene
          </button>
        </div>
      ) : events.length === 0 ? (
        <p className="text-center text-gray-500 py-8 text-sm">Yaklaşan etkinlik yok</p>
      ) : (
        <div className="space-y-2">
          {events.map((event) => {
            const daysUntil = getDaysUntil(event.date);
            return (
              <div
                key={event.id}
                className={`border-l-4 rounded-lg p-3 ${EVENT_COLORS[event.type] || EVENT_COLORS.DIGER}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{event.title}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-600">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(event.date)}
                      </span>
                      {event.time && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {event.time}
                        </span>
                      )}
                    </div>
                    {event.location && (
                      <p className="text-xs text-gray-500 mt-1 flex items-center gap-1 truncate">
                        <MapPin className="h-3 w-3 flex-shrink-0" />
                        {event.location}
                      </p>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full flex-shrink-0 ${
                    daysUntil === 0 ? 'bg-red-200 text-red-700' :
                    daysUntil === 1 ? 'bg-orange-200 text-orange-700' :
                    daysUntil <= 3 ? 'bg-yellow-200 text-yellow-700' :
                    'bg-gray-200 text-gray-700'
                  }`}>
                    {daysUntil === 0 ? 'Bugün' : daysUntil === 1 ? 'Yarın' : `${daysUntil} gün`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
