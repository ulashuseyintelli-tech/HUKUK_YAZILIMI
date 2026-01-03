'use client';

import { useState } from 'react';
import { Button, Spinner } from '@hukuk/ui';
import { 
  Mail, 
  CheckCircle2, 
  XCircle, 
  RefreshCw,
  Send
} from 'lucide-react';
import { api, ClientInfoRequestDTO, ClientInfoRequestStatus } from '@/lib/api';

interface ClientInfoRequestCardProps {
  request: ClientInfoRequestDTO;
  onUpdate?: () => void;
}

const STATUS_CONFIG: Record<ClientInfoRequestStatus, {
  label: string;
  color: string;
  icon: typeof Mail;
}> = {
  SENT: {
    label: 'Gönderildi',
    color: 'bg-blue-100 text-blue-700',
    icon: Send,
  },
  RESPONDED: {
    label: 'Yanıtlandı',
    color: 'bg-green-100 text-green-700',
    icon: CheckCircle2,
  },
  NO_RESPONSE: {
    label: 'Yanıt Yok',
    color: 'bg-red-100 text-red-700',
    icon: XCircle,
  },
};

export function ClientInfoRequestCard({ request, onUpdate }: ClientInfoRequestCardProps) {
  const [loading, setLoading] = useState(false);
  const config = STATUS_CONFIG[request.status];
  const Icon = config.icon;

  const handleSendReminder = async () => {
    try {
      setLoading(true);
      await api.sendClientInfoRequestReminder(request.id);
      onUpdate?.();
    } catch (error: any) {
      alert(error.message || 'Hatırlatma gönderilemedi');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkResponded = async () => {
    try {
      setLoading(true);
      await api.markClientInfoRequestAsResponded(request.id, 'Müvekkil yanıt verdi');
      onUpdate?.();
    } catch (error: any) {
      alert(error.message || 'Durum güncellenemedi');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkNoResponse = async () => {
    try {
      setLoading(true);
      await api.markClientInfoRequestAsNoResponse(request.id);
      onUpdate?.();
    } catch (error: any) {
      alert(error.message || 'Durum güncellenemedi');
    } finally {
      setLoading(false);
    }
  };

  const canRemind = request.status === 'SENT';
  const canMarkResponse = request.status === 'SENT';

  return (
    <div className="border rounded-lg p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium">Müvekkil Bilgi Talebi</span>
        </div>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${config.color}`}>
          <Icon className="w-3 h-3" />
          {config.label}
        </span>
      </div>

      {/* Details */}
      <div className="text-xs text-gray-500 space-y-1">
        <div>Gönderim: {new Date(request.sentAt).toLocaleDateString('tr-TR')}</div>
        {request.reminderCount > 0 && (
          <div>Hatırlatma: {request.reminderCount} kez</div>
        )}
        {request.respondedAt && (
          <div>Yanıt: {new Date(request.respondedAt).toLocaleDateString('tr-TR')}</div>
        )}
      </div>

      {/* Actions */}
      {(canRemind || canMarkResponse) && (
        <div className="flex gap-2 pt-1">
          {canRemind && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleSendReminder}
              disabled={loading}
            >
              {loading ? <Spinner size="sm" /> : <RefreshCw className="w-3 h-3 mr-1" />}
              Hatırlat
            </Button>
          )}
          {canMarkResponse && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={handleMarkResponded}
                disabled={loading}
              >
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Yanıtlandı
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleMarkNoResponse}
                disabled={loading}
              >
                <XCircle className="w-3 h-3 mr-1" />
                Yanıt Yok
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
