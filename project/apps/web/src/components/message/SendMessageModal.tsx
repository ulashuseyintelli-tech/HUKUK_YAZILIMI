"use client";

import { useState, useEffect, useMemo } from "react";
import { X, Send, Loader2, Mail, MessageSquare, Eye, RefreshCw } from "lucide-react";
import { api, MessageTemplate, MessageTemplateCategory, MessageTemplateChannel } from "@/lib/api";

interface SendMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Alıcı bilgileri
  recipientType: 'CLIENT' | 'DEBTOR';
  recipientId: string;
  recipientName: string;
  recipientEmail?: string;
  recipientPhone?: string;
  // Dosya bilgileri (token'lar için)
  caseId: string;
  caseFileNumber: string;
  executionFileNumber?: string;
  executionOfficeName?: string;
  // Opsiyonel: Önceden seçili kategori
  defaultCategory?: MessageTemplateCategory;
  // Opsiyonel: Masraf talebi için ek veriler
  expenseData?: {
    items: Array<{ type: string; description: string; amount: number }>;
    totalAmount: number;
    dueDate?: string;
  };
  onSuccess?: () => void;
}

const CATEGORY_LABELS: Record<MessageTemplateCategory, string> = {
  CLIENT_INFO: 'Bilgilendirme',
  EXPENSE_REQUEST: 'Masraf Talebi',
  EXPENSE_REMINDER: 'Masraf Hatırlatma',
  COLLECTION_INFO: 'Tahsilat Bildirimi',
  DEBTOR_NOTICE: 'Borçlu Bildirimi',
  GREETING: 'Tebrik',
  OTHER: 'Diğer',
};

const CHANNEL_ICONS: Record<MessageTemplateChannel, React.ReactNode> = {
  EMAIL: <Mail className="h-4 w-4" />,
  SMS: <MessageSquare className="h-4 w-4" />,
  WHATSAPP: <MessageSquare className="h-4 w-4 text-green-600" />,
};

export function SendMessageModal({
  isOpen,
  onClose,
  recipientType,
  recipientId,
  recipientName,
  recipientEmail,
  recipientPhone,
  caseId,
  caseFileNumber,
  executionFileNumber,
  executionOfficeName,
  defaultCategory,
  expenseData,
  onSuccess,
}: SendMessageModalProps) {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [selectedChannel, setSelectedChannel] = useState<MessageTemplateChannel>('EMAIL');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [renderedContent, setRenderedContent] = useState<{ subject?: string; body: string } | null>(null);
  
  // Özel mesaj modu
  const [customMode, setCustomMode] = useState(false);
  const [customSubject, setCustomSubject] = useState('');
  const [customBody, setCustomBody] = useState('');

  // Şablonları yükle
  useEffect(() => {
    if (isOpen) {
      loadTemplates();
    }
  }, [isOpen, defaultCategory]);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const data = await api.getMessageTemplates({
        category: defaultCategory,
        isActive: true,
      });
      setTemplates(data);
      
      // Varsayılan şablon seç
      if (data.length > 0) {
        const defaultTemplate = data.find(t => t.category === defaultCategory) || data[0];
        setSelectedTemplateId(defaultTemplate.id);
        setSelectedChannel(defaultTemplate.channel);
      }
    } catch (error) {
      console.error('Şablonlar yüklenemedi:', error);
    } finally {
      setLoading(false);
    }
  };

  // Seçili şablon
  const selectedTemplate = useMemo(() => {
    return templates.find(t => t.id === selectedTemplateId);
  }, [templates, selectedTemplateId]);

  // Token değerleri
  const tokenValues = useMemo(() => {
    const tokens: Record<string, string> = {
      clientName: recipientName,
      caseFileNumber: caseFileNumber,
      executionFileNumber: executionFileNumber || '',
      executionOfficeName: executionOfficeName || '',
      recipientName: recipientName,
    };

    // Masraf talebi verileri
    if (expenseData) {
      tokens.totalAmount = expenseData.totalAmount.toLocaleString('tr-TR');
      tokens.dueDate = expenseData.dueDate 
        ? new Date(expenseData.dueDate).toLocaleDateString('tr-TR')
        : '';
      tokens.items = expenseData.items
        .map(item => `• ${item.description}: ${item.amount.toLocaleString('tr-TR')} ₺`)
        .join('\n');
    }

    return tokens;
  }, [recipientName, caseFileNumber, executionFileNumber, executionOfficeName, expenseData]);

  // Önizleme oluştur
  const handlePreview = async () => {
    if (!selectedTemplate && !customMode) return;

    if (customMode) {
      setRenderedContent({
        subject: customSubject,
        body: customBody,
      });
      setPreviewMode(true);
      return;
    }

    try {
      const rendered = await api.renderMessageTemplate(selectedTemplateId, tokenValues);
      setRenderedContent(rendered);
      setPreviewMode(true);
    } catch (error) {
      console.error('Önizleme hatası:', error);
    }
  };

  // Mesaj gönder
  const handleSend = async () => {
    if (!recipientEmail && selectedChannel === 'EMAIL') {
      alert('Alıcının e-posta adresi bulunamadı');
      return;
    }
    if (!recipientPhone && (selectedChannel === 'SMS' || selectedChannel === 'WHATSAPP')) {
      alert('Alıcının telefon numarası bulunamadı');
      return;
    }

    setSending(true);
    try {
      // TODO: Gerçek gönderim API'si
      // await api.sendMessage({
      //   recipientType,
      //   recipientId,
      //   channel: selectedChannel,
      //   templateId: customMode ? undefined : selectedTemplateId,
      //   subject: customMode ? customSubject : renderedContent?.subject,
      //   body: customMode ? customBody : renderedContent?.body,
      //   caseId,
      // });

      // Şimdilik simüle et
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      alert('Mesaj gönderildi! (Simülasyon)');
      onSuccess?.();
      onClose();
    } catch (error: any) {
      alert(error.message || 'Mesaj gönderilemedi');
    } finally {
      setSending(false);
    }
  };

  // Kanal değiştiğinde uygun şablonları filtrele
  const filteredTemplates = useMemo(() => {
    return templates.filter(t => t.channel === selectedChannel);
  }, [templates, selectedChannel]);

  // Kanal değiştiğinde şablon seçimini güncelle
  useEffect(() => {
    if (filteredTemplates.length > 0 && !filteredTemplates.find(t => t.id === selectedTemplateId)) {
      setSelectedTemplateId(filteredTemplates[0].id);
    }
  }, [filteredTemplates, selectedTemplateId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Mesaj Gönder</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {recipientName} • {recipientEmail || recipientPhone || 'İletişim bilgisi yok'}
              </p>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : previewMode ? (
            /* Önizleme Modu */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-gray-900">Mesaj Önizleme</h3>
                <button
                  onClick={() => setPreviewMode(false)}
                  className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  <RefreshCw className="h-4 w-4" />
                  Düzenle
                </button>
              </div>
              
              {renderedContent?.subject && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Konu</label>
                  <div className="p-3 bg-gray-50 rounded-lg border text-sm">
                    {renderedContent.subject}
                  </div>
                </div>
              )}
              
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Mesaj İçeriği</label>
                <div className="p-4 bg-gray-50 rounded-lg border text-sm whitespace-pre-wrap min-h-[200px]">
                  {renderedContent?.body}
                </div>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs text-blue-700">
                  <strong>Gönderim Kanalı:</strong> {selectedChannel === 'EMAIL' ? 'E-posta' : selectedChannel === 'SMS' ? 'SMS' : 'WhatsApp'}
                  <br />
                  <strong>Alıcı:</strong> {selectedChannel === 'EMAIL' ? recipientEmail : recipientPhone}
                </p>
              </div>
            </div>
          ) : (
            /* Düzenleme Modu */
            <>
              {/* Kanal Seçimi */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Gönderim Kanalı</label>
                <div className="flex gap-2">
                  {(['EMAIL', 'SMS', 'WHATSAPP'] as MessageTemplateChannel[]).map((channel) => (
                    <button
                      key={channel}
                      onClick={() => setSelectedChannel(channel)}
                      disabled={
                        (channel === 'EMAIL' && !recipientEmail) ||
                        ((channel === 'SMS' || channel === 'WHATSAPP') && !recipientPhone)
                      }
                      className={`flex-1 py-2.5 px-4 rounded-lg border text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                        selectedChannel === channel
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed'
                      }`}
                    >
                      {CHANNEL_ICONS[channel]}
                      {channel === 'EMAIL' ? 'E-posta' : channel === 'SMS' ? 'SMS' : 'WhatsApp'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Şablon veya Özel Mesaj */}
              <div className="flex items-center gap-4 py-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={!customMode}
                    onChange={() => setCustomMode(false)}
                    className="text-blue-600"
                  />
                  <span className="text-sm">Şablon Kullan</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={customMode}
                    onChange={() => setCustomMode(true)}
                    className="text-blue-600"
                  />
                  <span className="text-sm">Özel Mesaj Yaz</span>
                </label>
              </div>

              {customMode ? (
                /* Özel Mesaj */
                <div className="space-y-3">
                  {selectedChannel === 'EMAIL' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Konu</label>
                      <input
                        type="text"
                        value={customSubject}
                        onChange={(e) => setCustomSubject(e.target.value)}
                        placeholder="E-posta konusu..."
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Mesaj</label>
                    <textarea
                      value={customBody}
                      onChange={(e) => setCustomBody(e.target.value)}
                      placeholder="Mesajınızı yazın..."
                      rows={6}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 resize-none"
                    />
                  </div>
                </div>
              ) : (
                /* Şablon Seçimi */
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Şablon Seçin</label>
                    <select
                      value={selectedTemplateId}
                      onChange={(e) => setSelectedTemplateId(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                    >
                      {filteredTemplates.length === 0 ? (
                        <option value="">Bu kanal için şablon bulunamadı</option>
                      ) : (
                        filteredTemplates.map((template) => (
                          <option key={template.id} value={template.id}>
                            {template.name} ({CATEGORY_LABELS[template.category]})
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  {selectedTemplate && (
                    <div className="p-3 bg-gray-50 rounded-lg border">
                      <p className="text-xs text-gray-500 mb-1">Şablon Önizleme:</p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap line-clamp-4">
                        {selectedTemplate.body.substring(0, 200)}...
                      </p>
                    </div>
                  )}

                  {/* Kullanılabilir Token'lar */}
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-xs font-medium text-amber-700 mb-1">Otomatik Doldurulacak Bilgiler:</p>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(tokenValues).filter(([_, v]) => v).map(([key, value]) => (
                        <span key={key} className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                          {key}: {value.substring(0, 20)}{value.length > 20 ? '...' : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t bg-gray-50 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            İptal
          </button>
          <div className="flex gap-2">
            {!previewMode && (
              <button
                onClick={handlePreview}
                disabled={!selectedTemplate && !customMode}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
              >
                <Eye className="h-4 w-4" />
                Önizle
              </button>
            )}
            <button
              onClick={previewMode ? handleSend : handlePreview}
              disabled={sending || (!selectedTemplate && !customMode) || (customMode && !customBody)}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {previewMode ? 'Gönder' : 'Önizle ve Gönder'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
