'use client';

import { useState } from 'react';
import { Button, Spinner } from '@hukuk/ui';
import { X, Mail, Send } from 'lucide-react';
import { api, CreateClientInfoRequestDTO } from '@/lib/api';

interface ClientInfoRequestModalProps {
  open: boolean;
  onClose: () => void;
  caseId: string;
  clientId?: string;
  clientEmail?: string;
  debtorId?: string;
  debtorName?: string;
  onSuccess?: () => void;
}

export function ClientInfoRequestModal({
  open,
  onClose,
  caseId,
  clientId,
  clientEmail = '',
  debtorId,
  debtorName,
  onSuccess,
}: ClientInfoRequestModalProps) {
  const [loading, setLoading] = useState(false);
  const [emailTo, setEmailTo] = useState(clientEmail);
  const [emailSubject, setEmailSubject] = useState(
    debtorName 
      ? `${debtorName} - Borçlu Adres Bilgisi Talebi`
      : 'Borçlu Adres Bilgisi Talebi'
  );
  const [emailBody, setEmailBody] = useState(
    `Sayın Müvekkilimiz,

Takip dosyanızdaki borçlu${debtorName ? ` (${debtorName})` : ''} için güncel adres bilgisine ihtiyaç duymaktayız.

Lütfen borçlunun bildiğiniz en güncel adres bilgisini bizimle paylaşır mısınız?

Saygılarımızla`
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!clientId) {
      alert('Müvekkil bilgisi bulunamadı');
      return;
    }
    
    if (!emailTo.trim()) {
      alert('Email adresi gerekli');
      return;
    }

    try {
      setLoading(true);
      const data: CreateClientInfoRequestDTO = {
        caseId,
        clientId,
        debtorId,
        emailTo: emailTo.trim(),
        emailSubject: emailSubject.trim(),
        emailBody: emailBody.trim(),
      };
      await api.createClientInfoRequest(data);
      onSuccess?.();
      onClose();
    } catch (error: any) {
      alert(error.message || 'Talep oluşturulamadı');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  // Show warning if clientId is missing
  if (!clientId) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />
        <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
          <div className="text-center">
            <Mail className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Müvekkil Bilgisi Eksik</h3>
            <p className="text-sm text-gray-500 mb-4">
              Bu dosya için müvekkil bilgisi bulunamadı. Lütfen önce dosyaya müvekkil atayın.
            </p>
            <Button onClick={onClose}>Kapat</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold">Müvekkil Bilgi Talebi</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Email To */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Alıcı Email *
            </label>
            <input
              type="email"
              value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="muvekkil@email.com"
              required
            />
          </div>

          {/* Subject */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Konu
            </label>
            <input
              type="text"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Body */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mesaj
            </label>
            <textarea
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              rows={6}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {debtorName && (
            <p className="text-xs text-gray-500">
              Bu talep <strong>{debtorName}</strong> borçlusu için gönderilecek.
            </p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              İptal
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? <Spinner size="sm" /> : <Send className="w-4 h-4 mr-1" />}
              Gönder
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
