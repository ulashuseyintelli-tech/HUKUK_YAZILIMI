'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { toActionErrorMessage } from '@/lib/action-error';
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
  // WSMR-A3c: GET basarisizsa UYDURMA kayit uretilmez; gorunur hata + retry.
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    loadTimeline();
  }, [caseId]);

  const loadTimeline = async () => {
    setLoadError(null);
    try {
      const res = await api.get(`/cases/${caseId}/timeline`);
      // WSMR-A3c: bozuk govde gercek "bos cizelge" SAYILMAZ -> ERROR.
      const rows = (res as { data?: unknown })?.data;
      if (!Array.isArray(rows)) throw new Error('MALFORMED_LIST_RESPONSE');
      setEvents(rows as never);
    } catch (e) {
      // WSMR-A3c · UYDURMA KAYITLAR KALDIRILDI. Eskiden burada sabit sahte
      // veri GERCEK dosya bilgisi gibi gosteriliyordu.
      setEvents([]);
      setLoadError(toActionErrorMessage(e, 'Zaman çizelgesi alınamadı'));
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

  // WSMR-A3c: hata gorunur ve salt-okuma tekrar denenebilir.
  if (loadError) {
    return (
      <div className="bg-white rounded-xl border p-6 text-center" role="alert">
        <p className="text-sm font-medium text-red-600">{loadError}</p>
        <button
          type="button"
          onClick={loadTimeline}
          className="mt-2 text-xs text-blue-600 underline hover:text-blue-800"
        >
          Tekrar dene
        </button>
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
