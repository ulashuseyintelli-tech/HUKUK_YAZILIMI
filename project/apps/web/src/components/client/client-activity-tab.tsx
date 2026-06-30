'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Bell, CheckCircle2, Clock, Mail, MessageSquare, XCircle } from 'lucide-react';
import { api } from '@/lib/api';

interface ClientActivityTabProps {
  clientId: string;
}

interface ClientNotificationActivity {
  id: string;
  type: string;
  channel: string;
  subject?: string | null;
  status: string;
  sentAt?: string | null;
  deliveredAt?: string | null;
  createdAt: string;
  errorMessage?: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  MASRAF_ISTEK: 'Masraf isteği',
  GENEL_BILGILENDIRME: 'Bilgilendirme',
  RAPOR: 'Rapor',
  HATIRLATMA: 'Hatırlatma',
  TEBRIK: 'Tebrik',
  TEST: 'Test',
  DIGER: 'Diğer',
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
};

function unwrapNotifications(body: unknown): ClientNotificationActivity[] {
  if (Array.isArray(body)) return body as ClientNotificationActivity[];
  const maybeData = (body as { data?: unknown } | null)?.data;
  return Array.isArray(maybeData) ? (maybeData as ClientNotificationActivity[]) : [];
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
  if (up === 'DELIVERED' || up === 'SENT') return 'bg-green-100 text-green-700';
  if (up === 'FAILED') return 'bg-red-100 text-red-700';
  if (up === 'PENDING') return 'bg-yellow-100 text-yellow-700';
  return 'bg-gray-100 text-gray-700';
}

function ActivityIcon({ channel, status }: { channel: string; status: string }) {
  if (status.toUpperCase() === 'FAILED') return <XCircle className="h-4 w-4 text-red-600" />;
  if (status.toUpperCase() === 'DELIVERED') return <CheckCircle2 className="h-4 w-4 text-green-600" />;
  if (channel.toUpperCase() === 'EMAIL') return <Mail className="h-4 w-4 text-blue-600" />;
  if (channel.toUpperCase() === 'SMS') return <MessageSquare className="h-4 w-4 text-indigo-600" />;
  return <Bell className="h-4 w-4 text-gray-600" />;
}

export function ClientActivityTab({ clientId }: ClientActivityTabProps) {
  const [items, setItems] = useState<ClientNotificationActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);

    api
      .get<ClientNotificationActivity[] | { data?: ClientNotificationActivity[] }>(
        `/client-notifications/client/${clientId}`,
      )
      .then((res) => {
        if (active) setItems(unwrapNotifications(res.data));
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
        const title = item.subject || TYPE_LABELS[item.type] || item.type;
        const eventDate = item.deliveredAt || item.sentAt || item.createdAt;

        return (
          <div key={item.id} className="rounded-lg border p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-50">
                <ActivityIcon channel={item.channel} status={item.status} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-gray-900">{title}</p>
                  <span className={`rounded px-2 py-0.5 text-xs ${statusClass(item.status)}`}>
                    {STATUS_LABELS[status] || item.status}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                  <span>{TYPE_LABELS[item.type] || item.type}</span>
                  <span>{CHANNEL_LABELS[item.channel] || item.channel}</span>
                  <span>{formatDateTime(eventDate)}</span>
                </div>
                {status === 'FAILED' && item.errorMessage && (
                  <p className="mt-2 max-w-2xl truncate text-xs text-red-600" title={item.errorMessage}>
                    {item.errorMessage}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}