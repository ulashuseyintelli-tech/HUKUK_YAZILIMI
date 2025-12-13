'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { Mail, X, Send, Loader2, Check, Plus, Trash2, FileText } from 'lucide-react';

interface EmailReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const REPORT_TYPES = [
  { id: 'case-summary', name: 'Dosya Özet Raporu', description: 'Tüm dosyaların özet bilgileri' },
  { id: 'collection', name: 'Tahsilat Raporu', description: 'Tahsilat detayları ve toplamları' },
  { id: 'client', name: 'Müvekkil Raporu', description: 'Müvekkil bazlı dosya ve tahsilat bilgileri' },
  { id: 'risk', name: 'Risk Analiz Raporu', description: 'Risk sınıflandırması ve dağılımı' },
  { id: 'performance', name: 'Performans Raporu', description: 'Personel ve dosya performansı' },
  { id: 'expiring-poa', name: 'Vekalet Uyarı Raporu', description: 'Süresi dolacak vekaletler' },
];

export function EmailReportModal({ isOpen, onClose }: EmailReportModalProps) {
  const [recipients, setRecipients] = useState<string[]>(['']);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [selectedReports, setSelectedReports] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const addRecipient = () => {
    setRecipients([...recipients, '']);
  };

  const removeRecipient = (index: number) => {
    if (recipients.length > 1) {
      setRecipients(recipients.filter((_, i) => i !== index));
    }
  };

  const updateRecipient = (index: number, value: string) => {
    const newRecipients = [...recipients];
    newRecipients[index] = value;
    setRecipients(newRecipients);
  };

  const toggleReport = (reportId: string) => {
    setSelectedReports(prev =>
      prev.includes(reportId)
        ? prev.filter(id => id !== reportId)
        : [...prev, reportId]
    );
  };

  const handleSend = async () => {
    const validRecipients = recipients.filter(r => r.trim() && r.includes('@'));
    if (validRecipients.length === 0 || selectedReports.length === 0) return;

    setSending(true);
    try {
      await api.post('/reports/email', {
        recipients: validRecipients,
        subject: subject || 'Rapor Paylaşımı',
        message,
        reportTypes: selectedReports,
      });
      setSent(true);
      setTimeout(() => {
        onClose();
        resetForm();
      }, 2000);
    } catch (e) {
      console.error(e);
      alert('Gönderim sırasında bir hata oluştu');
    } finally {
      setSending(false);
    }
  };

  const resetForm = () => {
    setRecipients(['']);
    setSubject('');
    setMessage('');
    setSelectedReports([]);
    setSent(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-auto">
        <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-white">
          <h3 className="font-semibold flex items-center gap-2">
            <Mail className="h-5 w-5 text-blue-600" />
            Rapor Paylaş
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        {sent ? (
          <div className="p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <h4 className="text-lg font-semibold text-green-700">Gönderildi!</h4>
            <p className="text-gray-500 mt-2">Raporlar başarıyla e-posta ile gönderildi.</p>
          </div>
        ) : (
          <>
            <div className="p-4 space-y-4">
              {/* Alıcılar */}
              <div>
                <label className="block text-sm font-medium mb-2">Alıcılar</label>
                {recipients.map((recipient, index) => (
                  <div key={index} className="flex gap-2 mb-2">
                    <input
                      type="email"
                      value={recipient}
                      onChange={(e) => updateRecipient(index, e.target.value)}
                      placeholder="email@example.com"
                      className="flex-1 border rounded-lg px-3 py-2 text-sm"
                    />
                    {recipients.length > 1 && (
                      <button
                        onClick={() => removeRecipient(index)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={addRecipient}
                  className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" />
                  Alıcı Ekle
                </button>
              </div>

              {/* Konu */}
              <div>
                <label className="block text-sm font-medium mb-2">Konu</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Rapor Paylaşımı"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>

              {/* Mesaj */}
              <div>
                <label className="block text-sm font-medium mb-2">Mesaj (Opsiyonel)</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="E-posta ile birlikte gönderilecek mesaj..."
                  rows={3}
                  className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
                />
              </div>

              {/* Rapor Seçimi */}
              <div>
                <label className="block text-sm font-medium mb-2">Gönderilecek Raporlar</label>
                <div className="space-y-2">
                  {REPORT_TYPES.map((report) => (
                    <label
                      key={report.id}
                      className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedReports.includes(report.id)
                          ? 'border-blue-500 bg-blue-50'
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedReports.includes(report.id)}
                        onChange={() => toggleReport(report.id)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-gray-400" />
                          <span className="font-medium text-sm">{report.name}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{report.description}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t bg-gray-50 flex justify-between items-center">
              <span className="text-sm text-gray-500">
                {selectedReports.length} rapor seçildi
              </span>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-100"
                >
                  İptal
                </button>
                <button
                  onClick={handleSend}
                  disabled={sending || selectedReports.length === 0 || !recipients.some(r => r.includes('@'))}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {sending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Gönderiliyor...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Gönder
                    </>
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
