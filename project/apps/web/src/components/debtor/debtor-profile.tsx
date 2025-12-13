'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { User, Phone, Mail, MapPin, Building, FileText, DollarSign, Calendar, AlertTriangle, Loader2, ExternalLink } from 'lucide-react';

interface DebtorCase {
  id: string;
  fileNumber: string;
  clientName: string;
  principalAmount: number;
  collectedAmount: number;
  status: string;
  caseDate: string;
}

interface DebtorContact {
  id: string;
  type: 'phone' | 'email' | 'address';
  value: string;
  label?: string;
  createdAt: string;
}

interface DebtorData {
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
  totalDebt: number;
  totalCollected: number;
  activeCases: number;
  closedCases: number;
  cases: DebtorCase[];
  contacts: DebtorContact[];
}

interface DebtorProfileProps {
  debtorId: string;
}

export function DebtorProfile({ debtorId }: DebtorProfileProps) {
  const [debtor, setDebtor] = useState<DebtorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'cases' | 'contacts' | 'history'>('cases');

  useEffect(() => {
    loadDebtor();
  }, [debtorId]);

  const loadDebtor = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/debtors/${debtorId}`);
      setDebtor(res.data?.data || res.data);
    } catch (e) {
      // Demo data
      setDebtor({
        id: debtorId,
        type: 'REAL',
        displayName: 'Ahmet Yılmaz',
        firstName: 'Ahmet',
        lastName: 'Yılmaz',
        tckn: '12345678901',
        phone: '0532 123 45 67',
        email: 'ahmet@example.com',
        address: 'Atatürk Cad. No:123',
        city: 'İstanbul',
        district: 'Kadıköy',
        totalDebt: 150000,
        totalCollected: 25000,
        activeCases: 2,
        closedCases: 1,
        cases: [
          {
            id: '1',
            fileNumber: '2024/1234',
            clientName: 'ABC Şirketi',
            principalAmount: 100000,
            collectedAmount: 20000,
            status: 'DERDEST',
            caseDate: '2024-01-15',
          },
          {
            id: '2',
            fileNumber: '2024/1235',
            clientName: 'XYZ Ltd.',
            principalAmount: 50000,
            collectedAmount: 5000,
            status: 'ISLEMDE',
            caseDate: '2024-03-20',
          },
        ],
        contacts: [
          { id: '1', type: 'phone', value: '0532 123 45 67', label: 'Cep', createdAt: '2024-01-15' },
          { id: '2', type: 'email', value: 'ahmet@example.com', createdAt: '2024-01-15' },
          { id: '3', type: 'address', value: 'Atatürk Cad. No:123, Kadıköy/İstanbul', label: 'Ev', createdAt: '2024-01-15' },
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
      DERKENAR: 'bg-gray-100 text-gray-700',
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

  if (!debtor) {
    return (
      <div className="text-center py-12 text-gray-500">
        <AlertTriangle className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p>Borçlu bulunamadı</p>
      </div>
    );
  }

  const collectionRate = debtor.totalDebt > 0 
    ? Math.round((debtor.totalCollected / debtor.totalDebt) * 100) 
    : 0;

  return (
    <div className="space-y-6">
      {/* Profile Header */}
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
            {debtor.type === 'LEGAL' ? (
              <Building className="h-8 w-8 text-gray-400" />
            ) : (
              <User className="h-8 w-8 text-gray-400" />
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold">{debtor.displayName}</h2>
              <span className={`px-2 py-0.5 rounded text-xs ${
                debtor.type === 'LEGAL' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
              }`}>
                {debtor.type === 'LEGAL' ? 'Tüzel Kişi' : 'Gerçek Kişi'}
              </span>
            </div>
            <p className="text-gray-500 text-sm mt-1">
              {debtor.type === 'LEGAL' ? `VKN: ${debtor.vkn}` : `TCKN: ${debtor.tckn}`}
            </p>
            <div className="flex items-center gap-4 mt-3 text-sm text-gray-600">
              {debtor.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-4 w-4" />
                  {debtor.phone}
                </span>
              )}
              {debtor.email && (
                <span className="flex items-center gap-1">
                  <Mail className="h-4 w-4" />
                  {debtor.email}
                </span>
              )}
            </div>
            {debtor.address && (
              <p className="text-sm text-gray-500 mt-2 flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {debtor.address}, {debtor.district}/{debtor.city}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">Toplam Borç</p>
          <p className="text-xl font-bold text-red-600">{formatCurrency(debtor.totalDebt)}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">Tahsil Edilen</p>
          <p className="text-xl font-bold text-green-600">{formatCurrency(debtor.totalCollected)}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">Tahsilat Oranı</p>
          <p className="text-xl font-bold text-blue-600">%{collectionRate}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">Aktif Dosya</p>
          <p className="text-xl font-bold">{debtor.activeCases}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="border-b flex">
          {[
            { id: 'cases', label: 'Dosyalar', icon: FileText },
            { id: 'contacts', label: 'İletişim', icon: Phone },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-4">
          {/* Cases Tab */}
          {activeTab === 'cases' && (
            <div className="space-y-3">
              {debtor.cases.length === 0 ? (
                <p className="text-center py-6 text-gray-500">Dosya bulunamadı</p>
              ) : (
                debtor.cases.map((c) => (
                  <div key={c.id} className="p-4 border rounded-lg hover:bg-gray-50">
                    <div className="flex items-start justify-between">
                      <div>
                        <a
                          href={`/cases/${c.id}`}
                          className="font-medium text-blue-600 hover:underline flex items-center gap-1"
                        >
                          {c.fileNumber}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                        <p className="text-sm text-gray-500">{c.clientName}</p>
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

          {/* Contacts Tab */}
          {activeTab === 'contacts' && (
            <div className="space-y-3">
              {debtor.contacts.length === 0 ? (
                <p className="text-center py-6 text-gray-500">İletişim bilgisi bulunamadı</p>
              ) : (
                debtor.contacts.map((contact) => (
                  <div key={contact.id} className="flex items-center gap-3 p-3 border rounded-lg">
                    <div className={`p-2 rounded-lg ${
                      contact.type === 'phone' ? 'bg-green-100 text-green-600' :
                      contact.type === 'email' ? 'bg-blue-100 text-blue-600' :
                      'bg-orange-100 text-orange-600'
                    }`}>
                      {contact.type === 'phone' ? <Phone className="h-4 w-4" /> :
                       contact.type === 'email' ? <Mail className="h-4 w-4" /> :
                       <MapPin className="h-4 w-4" />}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm">{contact.value}</p>
                      {contact.label && (
                        <p className="text-xs text-gray-500">{contact.label}</p>
                      )}
                    </div>
                    <span className="text-xs text-gray-400">{formatDate(contact.createdAt)}</span>
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
