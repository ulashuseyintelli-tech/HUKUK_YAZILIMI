'use client';

import { useEffect, useRef, useState } from 'react';
import { Mail, Send, X, Users, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { unwrapEnvelope } from '@/lib/api-envelope';

interface BulkEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  recipients: { id: string; name: string; email?: string }[];
  type: 'clients' | 'debtors';
}

const EMAIL_TEMPLATES = [
  { id: 'payment_reminder', name: 'Ödeme Hatırlatması', subject: 'Ödeme Hatırlatması' },
  { id: 'case_update', name: 'Dosya Güncellemesi', subject: 'Dosya Durumu Hakkında' },
  { id: 'meeting_invite', name: 'Toplantı Daveti', subject: 'Toplantı Daveti' },
  { id: 'custom', name: 'Özel Mesaj', subject: '' },
];

export function BulkEmailModal({ isOpen, onClose, recipients, type }: BulkEmailModalProps) {
  const [template, setTemplate] = useState('custom');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<{ complete: boolean; message: string } | null>(null);
  const inFlight = useRef(false);
  const session = useRef(0);
  const recipientKey = JSON.stringify(recipients.map(r => [r.id, r.email ?? null]));

  useEffect(() => {
    session.current++;
    inFlight.current = false;
    setSending(false); setOutcome(null); setSubject(''); setMessage(''); setTemplate('custom');
    return () => { session.current++; };
  }, [isOpen, recipientKey, type]);

  const validRecipients = recipients.filter(r => r.email);

  const handleTemplateChange = (templateId: string) => {
    setTemplate(templateId);
    const selected = EMAIL_TEMPLATES.find(t => t.id === templateId);
    if (selected && selected.id !== 'custom') {
      setSubject(selected.subject);
      // Template içerikleri
      if (templateId === 'payment_reminder') {
        setMessage('Sayın İlgili,\n\nÖdeme planınız hakkında hatırlatma yapmak istiyoruz. Lütfen en kısa sürede bizimle iletişime geçiniz.\n\nSaygılarımızla');
      } else if (templateId === 'case_update') {
        setMessage('Sayın İlgili,\n\nDosyanız ile ilgili güncel bilgileri paylaşmak istiyoruz.\n\nSaygılarımızla');
      } else if (templateId === 'meeting_invite') {
        setMessage('Sayın İlgili,\n\nSizinle bir toplantı ayarlamak istiyoruz. Uygun olduğunuz zamanları bizimle paylaşır mısınız?\n\nSaygılarımızla');
      }
    }
  };

  const handleSend = async () => {
    if (!isOpen || inFlight.current || outcome || !subject || !message || validRecipients.length === 0) return;
    
    inFlight.current = true;
    const currentSession = session.current;
    const recipientIds = validRecipients.map(r => r.id);
    setSending(true);
    try {
      const response = await api.post('/client-notifications/bulk-email', {
        recipients: recipientIds,
        subject,
        message,
        type,
      });
      if (session.current !== currentSession) return;
      const body = unwrapEnvelope<{ success?: unknown; details?: { sent?: unknown; failed?: unknown; errors?: unknown } }>(response);
      const sent = body?.details?.sent, failed = body?.details?.failed;
      const errors = body?.details?.errors;
      if (body?.success !== true || typeof sent !== 'number' || typeof failed !== 'number' ||
          !Number.isSafeInteger(sent) || !Number.isSafeInteger(failed) || sent < 0 || failed < 0 || sent + failed !== recipientIds.length ||
          !Array.isArray(errors) || errors.length !== failed) {
        setOutcome({ complete: false, message: 'Toplu gönderim sonucu doğrulanamadı. Otomatik tekrar yapılmadı.' });
      } else {
        setOutcome({ complete: failed === 0, message: `Sunucu kabulü: ${sent}. Başarısız/belirsiz sonuç: ${failed}. Alıcıya teslim teyidi değildir. Otomatik tekrar yapılmadı.` });
      }
    } catch (e: unknown) {
      if (session.current !== currentSession) return;
      const status = (e as { status?: number })?.status;
      setOutcome({ complete: false, message: status === 403 ? 'Toplu e-posta gönderme yetkiniz yok.' : 'Toplu e-posta sonucu alınamadı. Otomatik tekrar yapılmadı.' });
    } finally {
      if (session.current === currentSession) { inFlight.current = false; setSending(false); }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl w-full max-w-lg mx-4 shadow-xl max-h-[90vh] overflow-auto">
        <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-white">
          <h3 className="font-semibold flex items-center gap-2">
            <Mail className="h-5 w-5 text-blue-600" />
            Toplu E-posta Gönder
          </h3>
          <button onClick={onClose} aria-label="Kapat" className="text-gray-500 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Recipients Info */}
          <div className="p-3 bg-blue-50 rounded-lg flex items-center gap-3">
            <Users className="h-5 w-5 text-blue-600" />
            <div>
              <p className="text-sm font-medium">{recipients.length} alıcı seçildi</p>
              <p className="text-xs text-blue-600">{validRecipients.length} geçerli e-posta adresi</p>
            </div>
          </div>

          {validRecipients.length === 0 && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-600" />
              <p className="text-sm text-yellow-700">Seçilen alıcıların e-posta adresi bulunmuyor.</p>
            </div>
          )}

          {outcome && <div role={outcome.complete ? 'status' : 'alert'} className={`p-3 rounded-lg text-sm ${outcome.complete ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-900'}`}>{outcome.message}</div>}

          {/* Template Selection */}
          <div>
            <label className="block text-sm font-medium mb-2">Şablon</label>
            <select
              value={template}
              disabled={sending || outcome !== null}
              onChange={(e) => handleTemplateChange(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
            >
              {EMAIL_TEMPLATES.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-sm font-medium mb-2">Konu</label>
            <input
              type="text"
              value={subject}
              disabled={sending || outcome !== null}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="E-posta konusu"
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>

          {/* Message */}
          <div>
            <label className="block text-sm font-medium mb-2">Mesaj</label>
            <textarea
              value={message}
              disabled={sending || outcome !== null}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="E-posta içeriği..."
              className="w-full border rounded-lg px-3 py-2 resize-none"
              rows={6}
            />
          </div>
        </div>

        <div className="p-4 border-t bg-gray-50 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded-lg hover:bg-gray-100"
          >
            {outcome ? 'Kapat' : 'İptal'}
          </button>
          <button
            onClick={handleSend}
            disabled={sending || outcome !== null || !subject || !message || validRecipients.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {outcome ? (
              <>{outcome.complete ? 'Sunucu kabul etti' : 'Sonuç alındı'}</>
            ) : sending ? (
              <>Gönderiliyor...</>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Gönder ({validRecipients.length})
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
