'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { 
  Clock, FileText, Send, CheckCircle, AlertCircle, 
  CreditCard, Gavel, FileCheck, User
} from 'lucide-react';

interface TimelineEvent {
  id: string;
  type: string;
  title: string;
  description?: string;
  date: string;
  user?: string;
  metadata?: Record<string, any>;
}

const EVENT_ICONS: Record<string, { icon: any; color: string }> = {
  CREATED: { icon: FileText, color: 'bg-blue-500' },
  TEBLIGAT: { icon: Send, color: 'bg-indigo-500' },
  HACIZ: { icon: Gavel, color: 'bg-red-500' },
  TAHSILAT: { icon: CreditCard, color: 'bg-green-500' },
  DURUSMA: { icon: Gavel, color: 'bg-purple-500' },
  STATUS_CHANGE: { icon: AlertCircle, color: 'bg-yellow-500' },
  DOCUMENT: { icon: FileCheck, color: 'bg-gray-500' },
  NOTE: { icon: FileText, color: 'bg-orange-500' },
  COMPLETED: { icon: CheckCircle, color: 'bg-green-600' },
};

interface CaseTimelineProps {
  caseId: string;
}

export function CaseTimeline({ caseId }: CaseTimelineProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTimeline();
  }, [caseId]);

  const loadTimeline = async () => {
    try {
      const res = await api.get(`/cases/${caseId}/timeline`);
      setEvents(res.data || []);
    } catch (e) {
      // Demo data
      const now = new Date();
      setEvents([
        { id: '1', type: 'CREATED', title: 'Dosya oluşturuldu', date: new Date(now.getTime() - 30 * 86400000).toISOString(), user: 'Admin' },
        { id: '2', type: 'TEBLIGAT', title: 'Ödeme emri gönderildi', description: 'PTT ile tebligat', date: new Date(now.getTime() - 25 * 86400000).toISOString() },
        { id: '3', type: 'TEBLIGAT', title: 'Tebligat teslim edildi', date: new Date(now.getTime() - 20 * 86400000).toISOString() },
        { id: '4', type: 'HACIZ', title: 'Banka haczi talebi', description: 'Tüm bankalara haciz yazısı', date: new Date(now.getTime() - 15 * 86400000).toISOString() },
        { id: '5', type: 'TAHSILAT', title: 'Kısmi tahsilat', description: '5.000 TL tahsil edildi', date: new Date(now.getTime() - 10 * 86400000).toISOString() },
        { id: '6', type: 'NOTE', title: 'Not eklendi', description: 'Borçlu ile görüşme yapıldı', date: new Date(now.getTime() - 5 * 86400000).toISOString(), user: 'Av. Mehmet' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date: string) => {
    const d = new Date(date);
    return d.toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString('tr-TR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border p-4">
        <div className="h-6 bg-gray-200 rounded w-32 mb-4 animate-pulse" />
        {[1, 2, 3].map(i => (
          <div key={i} className="flex gap-4 mb-4 animate-pulse">
            <div className="w-10 h-10 bg-gray-200 rounded-full" />
            <div className="flex-1">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
              <div className="h-3 bg-gray-200 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border p-4">
      <h3 className="font-semibold flex items-center gap-2 mb-4">
        <Clock className="h-5 w-5 text-blue-500" />
        Zaman Çizelgesi
        <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">{events.length} işlem</span>
      </h3>

      {events.length === 0 ? (
        <div className="text-center py-8 text-gray-500 text-sm">Henüz işlem kaydı yok</div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gray-200" />

          <div className="space-y-4">
            {events.map((event) => {
              const { icon: Icon, color } = EVENT_ICONS[event.type] || EVENT_ICONS.NOTE;
              return (
                <div key={event.id} className="relative flex gap-4">
                  {/* Icon */}
                  <div className={`relative z-10 w-10 h-10 rounded-full ${color} flex items-center justify-center text-white flex-shrink-0`}>
                    <Icon className="h-5 w-5" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 pb-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-sm">{event.title}</p>
                        {event.description && (
                          <p className="text-xs text-gray-600 mt-0.5">{event.description}</p>
                        )}
                      </div>
                      <div className="text-right text-xs text-gray-500 flex-shrink-0 ml-2">
                        <p>{formatDate(event.date)}</p>
                        <p>{formatTime(event.date)}</p>
                      </div>
                    </div>
                    {event.user && (
                      <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                        <User className="h-3 w-3" /> {event.user}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
