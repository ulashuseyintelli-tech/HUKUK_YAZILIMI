'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Bell, CheckCircle2, Clock, FileText, Mail, MessageSquare, XCircle } from 'lucide-react';
import { api } from '@/lib/api';

interface ClientActivityTabProps {
  clientId: string;
}

type ClientTimelineSource = 'client_notification' | 'intake_submission';

interface ClientTimelineItem {
  id: string;
  source: ClientTimelineSource;
  eventType: string;
  occurredAt: string;
  title: string;
  summary: string;
  status: string;
  caseId?: string | null;
  metadataSafe?: Record<string, string | null>;
}

interface ClientTimelineResponse {
  data: ClientTimelineItem[];
  pageInfo: {
    nextCursor: string | null;
    hasNextPage: boolean;
    limit: number;
  };
}

const SOURCE_LABELS: Record<ClientTimelineSource, string> = {
  client_notification: 'Bildirim',
  intake_submission: 'Intake',
};

const TYPE_LABELS: Record<string, string> = {
  MASRAF_ISTEK: 'Masraf isteği',
  GENEL_BILGILENDIRME: 'Bilgilendirme',
  RAPOR: 'Rapor',
  HATIRLATMA: 'Hatırlatma',
  TEBRIK: 'Tebrik',
  TEST: 'Test',
  DIGER: 'Diğer',
  INTAKE_LINK: 'Intake linki',
  CLIENT_INFO: 'Müvekkil bilgisi',
};

const CHANNEL_LABELS: Record<string, string> = {
  EMAIL: 'E-posta',
  SMS: 'SMS',
  WHATSAPP: 'WhatsApp',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Bekliyor',
  SENT: 'Gönderildi',
  DELIVERED: 'Teslim edildi',
  FAILED: 'Başarısız',
  CLIENT_SUBMITTED: 'Yeni gönderim',
  IN_REVIEW: 'İncelemede',
  PARTIALLY_PROMOTED: 'Kısmen işlendi',
  COMPLETED: 'Tamamlandı',
  REJECTED: 'Reddedildi',
};

const TIMELINE_ENDPOINT = (clientId: string) =>
  `/clients/${clientId}/timeline?limit=25&sources=client_notification,intake_submission`;

function unwrapTimeline(body: ClientTimelineResponse | undefined): ClientTimelineItem[] {
  return Array.isArray(body?.data) ? body.data : [];
}

function formatDateTime(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusClass(status: string): string {
  const up = status.toUpperCase();
  if (up === 'DELIVERED' || up === 'SENT' || up === 'COMPLETED') return 'bg-green-100 text-green-700';
  if (up === 'FAILED' || up === 'REJECTED') return 'bg-red-100 text-red-700';
  if (up === 'PENDING' || up === 'IN_REVIEW') return 'bg-yellow-100 text-yellow-700';
  return 'bg-gray-100 text-gray-700';
}

function ActivityIcon({ item }: { item: ClientTimelineItem }) {
  const status = item.status.toUpperCase();
  const channel = item.metadataSafe?.channel?.toUpperCase() ?? '';

  if (status === 'FAILED') return <XCircle className="h-4 w-4 text-red-600" />;
  if (status === 'DELIVERED' || status === 'COMPLETED') return <CheckCircle2 className="h-4 w-4 text-green-600" />;
  if (item.source === 'intake_submission') return <FileText className="h-4 w-4 text-purple-600" />;
  if (channel === 'EMAIL') return <Mail className="h-4 w-4 text-blue-600" />;
  if (channel === 'SMS') return <MessageSquare className="h-4 w-4 text-indigo-600" />;
  return <Bell className="h-4 w-4 text-gray-600" />;
}

function timelineMeta(item: ClientTimelineItem): string[] {
  const notificationType = item.metadataSafe?.notificationType ?? null;
  const channel = item.metadataSafe?.channel ?? null;

  return [
    SOURCE_LABELS[item.source] ?? item.source,
    notificationType ? TYPE_LABELS[notificationType] ?? notificationType : null,
    channel ? CHANNEL_LABELS[channel] ?? channel : null,
    formatDateTime(item.occurredAt),
  ].filter(Boolean) as string[];
}

export function ClientActivityTab({ clientId }: ClientActivityTabProps) {
  const [items, setItems] = useState<ClientTimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);

    api
      .get<ClientTimelineResponse>(TIMELINE_ENDPOINT(clientId))
      .then((res) => {
        if (active) setItems(unwrapTimeline(res.data));
      })
      .catch(() => {
        if (active) {
          setItems([]);
          setError(true);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [clientId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-gray-500">
        <Clock className="mr-2 h-4 w-4 animate-spin" />
        Aktivite yükleniyor...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        <AlertCircle className="h-4 w-4 shrink-0" />
        Bildirim aktivitesi yüklenemedi.
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-gray-500">
        Bu müvekkil için kayıtlı bildirim aktivitesi yok.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const status = item.status.toUpperCase();
        const meta = timelineMeta(item);

        return (
          <div key={item.id} className="rounded-lg border p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-50">
                <ActivityIcon item={item} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-gray-900">{item.title}</p>
                  <span className={`rounded px-2 py-0.5 text-xs ${statusClass(item.status)}`}>
                    {STATUS_LABELS[status] || item.status}
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-600">{item.summary}</p>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                  {meta.map((part) => (
                    <span key={part}>{part}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
