'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { User, Phone, Mail, MapPin, Building, FileText, Briefcase, Calendar, CreditCard, Loader2, ExternalLink, FileCheck, Users, TrendingUp } from 'lucide-react';

interface ClientCase {
  id: string;
  fileNumber: string;
  debtorName: string;
  principalAmount: number;
  collectedAmount: number;
  status: string;
  caseDate: string;
}

interface ClientPoa {
  id: string;
  notaryName: string;
  notaryCity: string;
  journalNo: string;
  issueDate: string;
  isLimited: boolean;
  validUntil?: string;
  status: string;
}

interface ClientContact {
  id: string;
  name: string;
  title?: string;
  phone?: string;
  email?: string;
}

interface ClientBankAccount {
  id: string;
  bankName: string;
  iban: string;
  accountHolder: string;
}

interface ClientData {
  id: string;
  type: 'REAL' | 'LEGAL';
  displayName: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  tckn?: string;
  vkn?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  district?: string;
  totalClaims: number;
  totalCollected: number;
  activeCases: number;
  closedCases: number;
  cases: ClientCase[];
  poas: ClientPoa[];
  contacts: ClientContact[];
  bankAccounts: ClientBankAccount[];
}

interface ClientProfileProps {
  clientId: string;
}

export function ClientProfile({ clientId }: ClientProfileProps) {
  const [client, setClient] = useState<ClientData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'cases' | 'poas' | 'contacts' | 'banks'>('cases');

  useEffect(() => {
    loadClient();
  }, [clientId]);

  const loadClient = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/clients/${clientId}`);
      setClient(res.data?.data || res.data);
    } catch (e) {
      // Demo data
      setClient({
        id: clientId,
        type: 'LEGAL',
        displayName: 'ABC Holding A.Ş.',
        companyName: 'ABC Holding A.Ş.',
        vkn: '1234567890',
        phone: '0212 123 45 67',
        email: 'info@abcholding.com',
        address: 'Levent Mah. Büyükdere Cad. No:123',
        city: 'İstanbul',
        district: 'Beşiktaş',
        totalClaims: 2500000,
        totalCollected: 750000,
        activeCases: 15,
        closedCases: 8,
        cases: [
          { id: '1', fileNumber: '2024/1001', debtorName: 'Mehmet Yılmaz', principalAmount: 150000, collectedAmount: 50000, status: 'DERDEST', caseDate: '2024-01-10' },
          { id: '2', fileNumber: '2024/1002', debtorName: 'XYZ Ltd. Şti.', principalAmount: 250000, collectedAmount: 0, status: 'ISLEMDE', caseDate: '2024-02-15' },
          { id: '3', fileNumber: '2024/1003', debtorName: 'Ali Kaya', principalAmount: 75000, collectedAmount: 75000, status: 'HITAM', caseDate: '2024-03-20' },
        ],
        poas: [
          { id: '1', notaryName: '15. Noter', notaryCity: 'İstanbul', journalNo: '12345', issueDate: '2024-01-05', isLimited: false, status: 'ACTIVE' },
          { id: '2', notaryName: '3. Noter', notaryCity: 'Ankara', journalNo: '67890', issueDate: '2023-06-15', isLimited: true, validUntil: '2025-06-15', status: 'ACTIVE' },
        ],
        contacts: [
          { id: '1', name: 'Ayşe Demir', title: 'Finans Müdürü', phone: '0532 111 22 33', email: 'ayse@abcholding.com' },
          { id: '2', name: 'Can Öztürk', title: 'Hukuk Danışmanı', phone: '0533 444 55 66', email: 'can@abcholding.com' },
        ],
        bankAccounts: [
          { id: '1', bankName: 'Garanti BBVA', iban: 'TR12 0006 2000 0000 0012 3456 78', accountHolder: 'ABC Holding A.Ş.' },
          { id: '2', bankName: 'İş Bankası', iban: 'TR98 0006 4000 0011 2233 4455 66', accountHolder: 'ABC Holding A.Ş.' },
        ],
      });
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(amount);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('tr-TR');
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      DERDEST: 'bg-blue-100 text-blue-700',
      ISLEMDE: 'bg-yellow-100 text-yellow-700',
      HITAM: 'bg-green-100 text-green-700',
      ACTIVE: 'bg-green-100 text-green-700',
      EXPIRED: 'bg-red-100 text-red-700',
      REVOKED: 'bg-gray-100 text-gray-700',
    };
    return colors[status] || 'bg-gray-100 text-gray-700';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="text-center py-12 text-gray-500">
        <Building className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p>Müvekkil bulunamadı</p>
      </div>
    );
  }

  const collectionRate = client.totalClaims > 0 
    ? Math.round((client.totalCollected / client.totalClaims) * 100) 
    : 0;

  return (
    <div className="space-y-6">
      {/* Profile Header */}
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
            {client.type === 'LEGAL' ? (
              <Building className="h-8 w-8 text-blue-600" />
            ) : (
              <User className="h-8 w-8 text-blue-600" />
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold">{client.displayName}</h2>
              <span className={`px-2 py-0.5 rounded text-xs ${
                client.type === 'LEGAL' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
              }`}>
                {client.type === 'LEGAL' ? 'Tüzel Kişi' : 'Gerçek Kişi'}
              </span>
            </div>
            <p className="text-gray-500 text-sm mt-1">
              {client.type === 'LEGAL' ? `VKN: ${client.vkn}` : `TCKN: ${client.tckn}`}
            </p>
            <div className="flex items-center gap-4 mt-3 text-sm text-gray-600">
              {client.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-4 w-4" />
                  {client.phone}
                </span>
              )}
              {client.email && (
                <span className="flex items-center gap-1">
                  <Mail className="h-4 w-4" />
                  {client.email}
                </span>
              )}
            </div>
            {client.address && (
              <p className="text-sm text-gray-500 mt-2 flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {client.address}, {client.district}/{client.city}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <Briefcase className="h-3.5 w-3.5" />
            Toplam Alacak
          </div>
          <p className="text-xl font-bold text-blue-600">{formatCurrency(client.totalClaims)}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <TrendingUp className="h-3.5 w-3.5" />
            Tahsil Edilen
          </div>
          <p className="text-xl font-bold text-green-600">{formatCurrency(client.totalCollected)}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <FileText className="h-3.5 w-3.5" />
            Tahsilat Oranı
          </div>
          <p className="text-xl font-bold">%{collectionRate}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <Calendar className="h-3.5 w-3.5" />
            Aktif Dosya
          </div>
          <p className="text-xl font-bold">{client.activeCases}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="border-b flex overflow-x-auto">
          {[
            { id: 'cases', label: 'Dosyalar', icon: FileText, count: client.cases.length },
            { id: 'poas', label: 'Vekaletler', icon: FileCheck, count: client.poas.length },
            { id: 'contacts', label: 'Yetkililer', icon: Users, count: client.contacts.length },
            { id: 'banks', label: 'Banka Hesapları', icon: CreditCard, count: client.bankAccounts.length },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
              <span className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">{tab.count}</span>
            </button>
          ))}
        </div>

        <div className="p-4">
          {/* Cases Tab */}
          {activeTab === 'cases' && (
            <div className="space-y-3">
              {client.cases.length === 0 ? (
                <p className="text-center py-6 text-gray-500">Dosya bulunamadı</p>
              ) : (
                client.cases.map((c) => (
                  <div key={c.id} className="p-4 border rounded-lg hover:bg-gray-50">
                    <div className="flex items-start justify-between">
                      <div>
                        <a href={`/cases/${c.id}`} className="font-medium text-blue-600 hover:underline flex items-center gap-1">
                          {c.fileNumber}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                        <p className="text-sm text-gray-500">{c.debtorName}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-xs ${getStatusColor(c.status)}`}>
                        {c.status}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500">Ana Para</p>
                        <p className="font-medium">{formatCurrency(c.principalAmount)}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Tahsilat</p>
                        <p className="font-medium text-green-600">{formatCurrency(c.collectedAmount)}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Tarih</p>
                        <p className="font-medium">{formatDate(c.caseDate)}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* POAs Tab */}
          {activeTab === 'poas' && (
            <div className="space-y-3">
              {client.poas.length === 0 ? (
                <p className="text-center py-6 text-gray-500">Vekalet bulunamadı</p>
              ) : (
                client.poas.map((poa) => (
                  <div key={poa.id} className="p-4 border rounded-lg hover:bg-gray-50">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium">{poa.notaryName} - {poa.notaryCity}</p>
                        <p className="text-sm text-gray-500">Yevmiye No: {poa.journalNo}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {poa.isLimited && (
                          <span className="px-2 py-0.5 rounded text-xs bg-orange-100 text-orange-700">
                            Süreli
                          </span>
                        )}
                        <span className={`px-2 py-0.5 rounded text-xs ${getStatusColor(poa.status)}`}>
                          {poa.status === 'ACTIVE' ? 'Geçerli' : poa.status === 'EXPIRED' ? 'Süresi Dolmuş' : 'İptal'}
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-4 text-sm text-gray-500">
                      <span>Düzenleme: {formatDate(poa.issueDate)}</span>
                      {poa.isLimited && poa.validUntil && (
                        <span>Bitiş: {formatDate(poa.validUntil)}</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Contacts Tab */}
          {activeTab === 'contacts' && (
            <div className="space-y-3">
              {client.contacts.length === 0 ? (
                <p className="text-center py-6 text-gray-500">Yetkili bulunamadı</p>
              ) : (
                client.contacts.map((contact) => (
                  <div key={contact.id} className="flex items-center gap-4 p-4 border rounded-lg">
                    <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                      <User className="h-5 w-5 text-gray-400" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{contact.name}</p>
                      {contact.title && <p className="text-sm text-gray-500">{contact.title}</p>}
                    </div>
                    <div className="text-sm text-right">
                      {contact.phone && <p className="flex items-center gap-1 text-gray-600"><Phone className="h-3.5 w-3.5" />{contact.phone}</p>}
                      {contact.email && <p className="flex items-center gap-1 text-gray-500"><Mail className="h-3.5 w-3.5" />{contact.email}</p>}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Bank Accounts Tab */}
          {activeTab === 'banks' && (
            <div className="space-y-3">
              {client.bankAccounts.length === 0 ? (
                <p className="text-center py-6 text-gray-500">Banka hesabı bulunamadı</p>
              ) : (
                client.bankAccounts.map((account) => (
                  <div key={account.id} className="flex items-center gap-4 p-4 border rounded-lg">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                      <CreditCard className="h-5 w-5 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{account.bankName}</p>
                      <p className="text-sm text-gray-500 font-mono">{account.iban}</p>
                    </div>
                    <p className="text-sm text-gray-500">{account.accountHolder}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
