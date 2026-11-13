'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Spinner } from '@hukuk/ui';
import { 
  Mail, 
  CheckCircle2, 
  XCircle, 
  RefreshCw,
  Send
} from 'lucide-react';
import { api, ClientInfoRequestDTO, ClientInfoRequestStatus } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

interface ClientInfoRequestCardProps {
  request: ClientInfoRequestDTO;
  onUpdate?: () => void | Promise<void>;
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

type InfoAction = 'REMIND' | 'RESPONDED' | 'NO_RESPONSE';

export function ClientInfoRequestActions({ request, onUpdate }: ClientInfoRequestCardProps) {
  const { user } = useAuth();
  const context = `${user?.tenantId}:${user?.id}:${user?.role}:${request.clientId}:${request.caseId}:${request.id}`;
  const current = useRef(context); current.current = context;
  const mounted = useRef(true), inFlight = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ context: string; action: InfoAction } | null>(null);
  const [message, setMessage] = useState<{ context: string; text: string } | null>(null);
  const active = (key: string) => mounted.current && current.current === key;
  const allowed = (action: InfoAction) => Boolean(user?.id && user?.tenantId && (user.role === 'USER' || user.role === 'ADMIN') && request.status === 'SENT' &&
    (action === 'REMIND' ? request.actions?.canSendReminder === true : action === 'RESPONDED' ? request.actions?.canMarkResponded === true : request.actions?.canMarkNoResponse === true));
  if (!allowed('REMIND') && !allowed('RESPONDED') && !allowed('NO_RESPONSE')) return null;
  const run = async (action: InfoAction) => {
    if (!allowed(action) || inFlight.current) return;
    const key = context, scope = { clientId: request.clientId, caseId: request.caseId };
    inFlight.current = true; setBusy(key); setMessage(null);
    try {
      const result = action === 'REMIND' ? await api.sendClientInfoRequestReminder(request.id, scope)
        : action === 'RESPONDED' ? await api.markClientInfoRequestAsResponded(request.id, 'Personel kaydı: müvekkil yanıt verdi', scope)
          : await api.markClientInfoRequestAsNoResponse(request.id, scope);
      const expectedStatus = action === 'REMIND' ? 'SENT' : action;
      if (result?.id !== request.id || result.status !== expectedStatus ||
          (action === 'REMIND' && (result.emailSent !== true || result.reminderCount <= request.reminderCount))) throw new Error('Unverified action response');
      if (!active(key)) return;
      setConfirmation(null);
      try { await onUpdate?.(); }
      catch { if (active(key)) setMessage({ context: key, text: 'İşlem tamamlandı; liste yenilenemedi. Tekrar işlem yapmadan güncel kaydı kontrol edin.' }); }
    } catch (error: unknown) {
      if (!active(key)) return;
      const body = typeof error === 'object' && error !== null && 'body' in error ? (error as { body?: { reasonCode?: string } }).body : undefined;
      setMessage({ context: key, text: action !== 'REMIND' ? 'Durum güncellenemedi. Güncel yetki ve talep durumunu kontrol edin.'
        : body?.reasonCode === 'CLIENT_INFO_REQUEST_EMAIL_FAILED' ? 'Hatırlatma gönderilemedi; hatırlatma kaydedilmedi.'
          : 'Gönderim sonucu doğrulanamadı. Yeniden göndermeden önce mevcut sonucu kontrol edin.' });
    } finally { inFlight.current = false; if (active(key)) setBusy(null); }
  };
  const loading = busy === context;
  return <div className="space-y-2">
    <div className="flex flex-wrap gap-2">
      {allowed('REMIND') && <Button size="sm" variant="outline" disabled={loading} onClick={() => setConfirmation({ context, action: 'REMIND' })}><RefreshCw className="w-3 h-3 mr-1" />Hatırlat</Button>}
      {allowed('RESPONDED') && <Button size="sm" variant="outline" disabled={loading} onClick={() => setConfirmation({ context, action: 'RESPONDED' })}><CheckCircle2 className="w-3 h-3 mr-1" />Yanıtlandı</Button>}
      {allowed('NO_RESPONSE') && <Button size="sm" variant="outline" disabled={loading} onClick={() => setConfirmation({ context, action: 'NO_RESPONSE' })}><XCircle className="w-3 h-3 mr-1" />Yanıt Yok</Button>}
    </div>
    {confirmation?.context === context && allowed(confirmation.action) && <div className="text-xs space-y-2">
      <p>{confirmation.action === 'REMIND' ? 'Mevcut alıcıya bir hatırlatma e-postası gönderilecek.' : 'Bu işlem personelin yanıt durumu kaydıdır; doğrulanmış müvekkil onayı değildir.'}</p>
      <Button size="sm" disabled={loading} onClick={() => void run(confirmation.action)}>{loading ? <Spinner size="sm" /> : confirmation.action === 'REMIND' ? 'Hatırlatmayı gönder' : 'Durumu kaydet'}</Button>
      <Button size="sm" variant="outline" disabled={loading} onClick={() => setConfirmation(null)}>Vazgeç</Button>
    </div>}
    {message?.context === context && <p role="alert" className="text-xs text-red-700">{message.text}</p>}
  </div>;
}

export function ClientInfoRequestCard({ request, onUpdate }: ClientInfoRequestCardProps) {
  const config = STATUS_CONFIG[request.status];
  const Icon = config.icon;

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
      {request.actions && <ClientInfoRequestActions request={request} onUpdate={onUpdate} />}
    </div>
  );
}
