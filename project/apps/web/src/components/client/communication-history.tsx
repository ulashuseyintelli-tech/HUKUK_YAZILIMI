'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { MessageSquare, Mail, Phone, Send, Search, Filter, Loader2, Calendar, User, ExternalLink } from 'lucide-react';

interface Communication {
  id: string;
  type: 'email' | 'sms' | 'phone' | 'message';
  direction: 'incoming' | 'outgoing';
  subject?: string;
  content: string;
  contactName?: string;
  contactInfo?: string;
  caseId?: string;
  caseNumber?: string;
  createdAt: string;
  createdBy: string;
}

interface CommunicationHistoryProps {
  clientId: string;
}

const TYPE_CONFIG = {
  email: { icon: Mail, label: 'E-posta', color: 'text-blue-600 bg-blue-100' },
  sms: { icon: Send, label: 'SMS', color: 'text-green-600 bg-green-100' },
  phone: { icon: Phone, label: 'Telefon', color: 'text-purple-600 bg-purple-100' },
  message: { icon: MessageSquare, label: 'Mesaj', color: 'text-orange-600 bg-orange-100' },
};

export function CommunicationHistory({ clientId }: CommunicationHistoryProps) {
  const [communications, setCommunications] = useState<Communication[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<string>('');

  useEffect(() => {
    loadCommunications();
  }, [clientId]);

  const loadCommunications = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/clients/${clientId}/communications`);
      setCommunications(res.data?.data || []);
    } catch (e) {
      // Demo data
      setCommunications([
        { id: '1', type: 'email', direction: 'outgoing', subject: 'Dosya Durumu Hakkında', content: 'Sayın Müvekkilimiz, dosyanızla ilgili güncel bilgileri paylaşmak istiyoruz...', contactName: 'Finans Müdürü', contactInfo: 'finans@abc.com', caseId: 'c1', caseNumber: '2024/1234', createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), createdBy: 'Av. Mehmet' },
        { id: '2', type: 'phone', direction: 'incoming', content: 'Tahsilat durumu soruldu, bilgi verildi.', contactName: 'Ayşe Hanım', contactInfo: '0532 123 45 67', createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), createdBy: 'Sekreter' },
        { id: '3', type: 'sms', direction: 'outgoing', content: 'Duruşma tarihi: 15.01.2025 saat 10:00', contactInfo: '0532 123 45 67', caseId: 'c2', caseNumber: '2024/1235', createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), createdBy: 'Sistem' },
        { id: '4', type: 'email', direction: 'incoming', subject: 'Re: Ödeme Planı', content: 'Önerilen ödeme planını kabul ediyoruz...', contactName: 'Hukuk Danışmanı', contactInfo: 'hukuk@abc.com', createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), createdBy: '-' },
        { id: '5', type: 'message', direction: 'outgoing', content: 'Portal üzerinden belge talep edildi.', createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), createdBy: 'Portal' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (hours < 24) return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    if (days < 7) return `${days} gün önce`;
    return d.toLocaleDateString('tr-TR');
  };

  const filteredCommunications = communications.filter(c => {
    if (typeFilter && c.type !== typeFilter) return false;
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      if (c.content.toLowerCase().includes(search)) return true;
      if (c.subject?.toLowerCase().includes(search)) return true;
      if (c.contactName?.toLowerCase().includes(search)) return true;
      return false;
    }
    return true;
  });

  const stats = {
    total: communications.length,
    email: communications.filter(c => c.type === 'email').length,
    sms: communications.filter(c => c.type === 'sms').length,
    phone: communications.filter(c => c.type === 'phone').length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold">{stats.total}</p>
          <p className="text-xs text-gray-500">Toplam</p>
        </div>
        <div className="bg-blue-50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-blue-600">{stats.email}</p>
          <p className="text-xs text-blue-600">E-posta</p>
        </div>
        <div className="bg-green-50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-green-600">{stats.sms}</p>
          <p className="text-xs text-green-600">SMS</p>
        </div>
        <div className="bg-purple-50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-purple-600">{stats.phone}</p>
          <p className="text-xs text-purple-600">Telefon</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Ara..."
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Tüm Türler</option>
          <option value="email">E-posta</option>
          <option value="sms">SMS</option>
          <option value="phone">Telefon</option>
          <option value="message">Mesaj</option>
        </select>
      </div>

      {/* Communications List */}
      {filteredCommunications.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">İletişim kaydı bulunamadı</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredCommunications.map((comm) => {
            const config = TYPE_CONFIG[comm.type];
            const Icon = config.icon;

            return (
              <div key={comm.id} className="p-4 border rounded-lg hover:bg-gray-50">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-full ${config.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${config.color}`}>
                        {config.label}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        comm.direction === 'incoming' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {comm.direction === 'incoming' ? 'Gelen' : 'Giden'}
                      </span>
                      {comm.caseNumber && (
                        <a href={`/cases/${comm.caseId}`} className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
                          {comm.caseNumber} <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    {comm.subject && <p className="font-medium mt-1">{comm.subject}</p>}
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">{comm.content}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                      {comm.contactName && (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {comm.contactName}
                        </span>
                      )}
                      {comm.contactInfo && <span>{comm.contactInfo}</span>}
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(comm.createdAt)}
                      </span>
                      <span>by {comm.createdBy}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
