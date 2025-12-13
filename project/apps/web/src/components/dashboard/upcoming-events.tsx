'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Calendar, Clock, MapPin, ChevronRight } from 'lucide-react';
import Link from 'next/link';

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

export function UpcomingEvents() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    try {
      const res = await api.get('/calendar/upcoming?limit=5');
      setEvents(res.data || []);
    } catch (e) {
      // Demo data
      const today = new Date();
      setEvents([
        { id: '1', title: 'Duruşma - 2024/1234', date: new Date(today.getTime() + 86400000).toISOString().split('T')[0], time: '10:00', type: 'DURUSMA', location: 'İstanbul 5. İcra Mahkemesi' },
        { id: '2', title: 'Vekalet yenileme', date: new Date(today.getTime() + 172800000).toISOString().split('T')[0], type: 'HATIRLATICI' },
        { id: '3', title: 'Müvekkil toplantısı', date: new Date(today.getTime() + 259200000).toISOString().split('T')[0], time: '14:30', type: 'GOREV' },
      ]);
    } finally {
      setLoading(false);
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

  if (loading) {
    return (
      <div className="bg-white rounded-xl border p-4">
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

      {events.length === 0 ? (
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
