'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { GitCompare, X, Search, Loader2, ArrowRight, Check, AlertTriangle, ChevronDown, ChevronUp, Users, DollarSign, FileText } from 'lucide-react';

interface CaseCompareModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCaseId: string;
  currentCaseNumber: string;
}

interface Debtor {
  id: string;
  name: string;
  tckn?: string;
  type: string;
}

interface Collection {
  id: string;
  amount: number;
  date: string;
  type: string;
}

interface Receivable {
  id: string;
  type: string;
  amount: number;
}

interface CaseData {
  id: string;
  fileNumber: string;
  type: string;
  status: string;
  principalAmount?: number;
  interestRate?: number;
  caseDate?: string;
  clientName?: string;
  debtorCount: number;
  collectionTotal: number;
  debtors: Debtor[];
  collections: Collection[];
  receivables: Receivable[];
  riskName?: string;
  durumEtiketi?: string;
  sorumlu?: string;
}

export function CaseCompareModal({ isOpen, onClose, currentCaseId, currentCaseNumber }: CaseCompareModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedCase, setSelectedCase] = useState<CaseData | null>(null);
  const [currentCase, setCurrentCase] = useState<CaseData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['basic']));

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(section)) {
        newSet.delete(section);
      } else {
        newSet.add(section);
      }
      return newSet;
    });
  };

  useEffect(() => {
    if (isOpen && currentCaseId) {
      loadCurrentCase();
    }
  }, [isOpen, currentCaseId]);

  const loadCurrentCase = async () => {
    try {
      const res = await api.get(`/cases/${currentCaseId}`);
      const data = res.data;
      setCurrentCase(mapCaseData(data));
    } catch (e) {
      console.error(e);
    }
  };

  const mapCaseData = (data: any): CaseData => ({
    id: data.id,
    fileNumber: data.fileNumber,
    type: data.type,
    status: data.caseStatus || data.status,
    principalAmount: data.principalAmount,
    interestRate: data.interestRate,
    caseDate: data.caseDate,
    clientName: data.client?.displayName || data.client?.name,
    debtorCount: data.debtors?.length || 0,
    collectionTotal: data.collections?.reduce((sum: number, c: any) => sum + Number(c.amount || 0), 0) || 0,
    debtors: (data.debtors || []).map((d: any) => ({
      id: d.id,
      name: d.displayName || `${d.firstName || ''} ${d.lastName || ''}`.trim() || d.companyName,
      tckn: d.tckn || d.vkn,
      type: d.type,
    })),
    collections: (data.collections || []).map((c: any) => ({
      id: c.id,
      amount: Number(c.amount || 0),
      date: c.collectionDate || c.createdAt,
      type: c.collectionType || 'Tahsilat',
    })),
    receivables: (data.receivables || []).map((r: any) => ({
      id: r.id,
      type: r.receivableType?.name || r.type || 'Alacak',
      amount: Number(r.amount || 0),
    })),
    riskName: data.risk?.name,
    durumEtiketi: data.durumEtiketi?.name,
    sorumlu: data.sorumluPersonel ? `${data.sorumluPersonel.name} ${data.sorumluPersonel.surname}` : undefined,
  });

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await api.get(`/cases?search=${encodeURIComponent(searchQuery)}&limit=5`);
      const results = (res.data?.data || res.data || []).filter((c: any) => c.id !== currentCaseId);
      setSearchResults(results);
    } catch (e) {
      console.error(e);
    } finally {
      setSearching(false);
    }
  };

  const selectCase = async (caseId: string) => {
    setLoading(true);
    try {
      const res = await api.get(`/cases/${caseId}`);
      const data = res.data;
      setSelectedCase(mapCaseData(data));
      setSearchResults([]);
      setSearchQuery('');
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount?: number) => {
    if (!amount) return '-';
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(amount);
  };

  const formatDate = (date?: string) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('tr-TR');
  };

  const compareValue = (val1: any, val2: any) => {
    if (val1 === val2) return 'equal';
    if (typeof val1 === 'number' && typeof val2 === 'number') {
      return val1 > val2 ? 'higher' : 'lower';
    }
    return 'different';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-auto">
        <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-white">
          <h3 className="font-semibold flex items-center gap-2">
            <GitCompare className="h-5 w-5 text-blue-600" />
            Dosya Karşılaştır
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4">
          {/* Search */}
          {!selectedCase && (
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">Karşılaştırılacak dosyayı seçin</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="Dosya no veya müvekkil adı ile ara..."
                    className="w-full pl-10 pr-4 py-2 border rounded-lg"
                  />
                </div>
                <button
                  onClick={handleSearch}
                  disabled={searching}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Ara'}
                </button>
              </div>

              {searchResults.length > 0 && (
                <div className="mt-2 border rounded-lg divide-y">
                  {searchResults.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => selectCase(c.id)}
                      className="w-full p-3 text-left hover:bg-gray-50 flex items-center justify-between"
                    >
                      <div>
                        <p className="font-medium">{c.fileNumber}</p>
                        <p className="text-sm text-gray-500">{c.client?.displayName || c.client?.name}</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-gray-400" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Comparison Sections */}
          {currentCase && (
            <div className="space-y-4">
              {/* Temel Bilgiler */}
              <div className="border rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleSection('basic')}
                  className="w-full p-3 bg-gray-50 flex items-center justify-between hover:bg-gray-100"
                >
                  <span className="font-medium flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Temel Bilgiler
                  </span>
                  {expandedSections.has('basic') ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                {expandedSections.has('basic') && (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left p-3 font-medium w-1/4">Özellik</th>
                        <th className="text-left p-3 font-medium bg-blue-50">{currentCaseNumber}</th>
                        <th className="text-left p-3 font-medium bg-green-50">
                          {selectedCase ? selectedCase.fileNumber : 'Seçilmedi'}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {[
                        { label: 'Müvekkil', key: 'clientName' as const },
                        { label: 'Takip Türü', key: 'type' as const },
                        { label: 'Durum', key: 'status' as const },
                        { label: 'Risk', key: 'riskName' as const },
                        { label: 'Durum Etiketi', key: 'durumEtiketi' as const },
                        { label: 'Dosya Operasyon Sorumlusu', key: 'sorumlu' as const },
                        { label: 'Ana Para', key: 'principalAmount' as const, format: formatCurrency },
                        { label: 'Faiz Oranı', key: 'interestRate' as const, format: (v?: number) => v ? `%${v}` : '-' },
                        { label: 'Takip Tarihi', key: 'caseDate' as const, format: formatDate },
                        { label: 'Borçlu Sayısı', key: 'debtorCount' as const },
                        { label: 'Toplam Tahsilat', key: 'collectionTotal' as const, format: formatCurrency },
                      ].map((row) => {
                        const val1 = currentCase[row.key];
                        const val2 = selectedCase?.[row.key];
                        const comparison = selectedCase ? compareValue(val1, val2) : null;
                        const formatter = row.format || ((v: any) => v ?? '-');

                        return (
                          <tr key={row.key} className="hover:bg-gray-50">
                            <td className="p-3 font-medium text-gray-600">{row.label}</td>
                            <td className="p-3 bg-blue-50/50">{formatter(val1 as any)}</td>
                            <td className={`p-3 ${selectedCase ? 'bg-green-50/50' : 'text-gray-400'}`}>
                              {selectedCase ? (
                                <div className="flex items-center gap-2">
                                  {formatter(val2 as any)}
                                  {comparison === 'equal' && <Check className="h-4 w-4 text-green-500" />}
                                  {comparison === 'different' && <AlertTriangle className="h-4 w-4 text-yellow-500" />}
                                </div>
                              ) : '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Borçlular */}
              <div className="border rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleSection('debtors')}
                  className="w-full p-3 bg-gray-50 flex items-center justify-between hover:bg-gray-100"
                >
                  <span className="font-medium flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Borçlular ({currentCase.debtors.length} / {selectedCase?.debtors.length || 0})
                  </span>
                  {expandedSections.has('debtors') ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                {expandedSections.has('debtors') && (
                  <div className="grid grid-cols-2 divide-x">
                    <div className="p-3 bg-blue-50/30">
                      <p className="text-xs text-gray-500 mb-2">{currentCaseNumber}</p>
                      {currentCase.debtors.length === 0 ? (
                        <p className="text-sm text-gray-400">Borçlu yok</p>
                      ) : (
                        <div className="space-y-2">
                          {currentCase.debtors.map((d) => (
                            <div key={d.id} className="text-sm p-2 bg-white rounded border">
                              <p className="font-medium">{d.name}</p>
                              <p className="text-xs text-gray-500">{d.tckn || '-'} • {d.type === 'REAL' ? 'Gerçek' : 'Tüzel'}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="p-3 bg-green-50/30">
                      <p className="text-xs text-gray-500 mb-2">{selectedCase?.fileNumber || 'Seçilmedi'}</p>
                      {!selectedCase || selectedCase.debtors.length === 0 ? (
                        <p className="text-sm text-gray-400">{selectedCase ? 'Borçlu yok' : '-'}</p>
                      ) : (
                        <div className="space-y-2">
                          {selectedCase.debtors.map((d) => (
                            <div key={d.id} className="text-sm p-2 bg-white rounded border">
                              <p className="font-medium">{d.name}</p>
                              <p className="text-xs text-gray-500">{d.tckn || '-'} • {d.type === 'REAL' ? 'Gerçek' : 'Tüzel'}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Alacak Kalemleri */}
              <div className="border rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleSection('receivables')}
                  className="w-full p-3 bg-gray-50 flex items-center justify-between hover:bg-gray-100"
                >
                  <span className="font-medium flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Alacak Kalemleri ({currentCase.receivables.length} / {selectedCase?.receivables.length || 0})
                  </span>
                  {expandedSections.has('receivables') ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                {expandedSections.has('receivables') && (
                  <div className="grid grid-cols-2 divide-x">
                    <div className="p-3 bg-blue-50/30">
                      <p className="text-xs text-gray-500 mb-2">{currentCaseNumber}</p>
                      {currentCase.receivables.length === 0 ? (
                        <p className="text-sm text-gray-400">Alacak kalemi yok</p>
                      ) : (
                        <div className="space-y-1">
                          {currentCase.receivables.map((r) => (
                            <div key={r.id} className="flex justify-between text-sm p-2 bg-white rounded border">
                              <span>{r.type}</span>
                              <span className="font-medium">{formatCurrency(r.amount)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between text-sm p-2 bg-blue-100 rounded font-medium">
                            <span>Toplam</span>
                            <span>{formatCurrency(currentCase.receivables.reduce((s, r) => s + r.amount, 0))}</span>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="p-3 bg-green-50/30">
                      <p className="text-xs text-gray-500 mb-2">{selectedCase?.fileNumber || 'Seçilmedi'}</p>
                      {!selectedCase || selectedCase.receivables.length === 0 ? (
                        <p className="text-sm text-gray-400">{selectedCase ? 'Alacak kalemi yok' : '-'}</p>
                      ) : (
                        <div className="space-y-1">
                          {selectedCase.receivables.map((r) => (
                            <div key={r.id} className="flex justify-between text-sm p-2 bg-white rounded border">
                              <span>{r.type}</span>
                              <span className="font-medium">{formatCurrency(r.amount)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between text-sm p-2 bg-green-100 rounded font-medium">
                            <span>Toplam</span>
                            <span>{formatCurrency(selectedCase.receivables.reduce((s, r) => s + r.amount, 0))}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Tahsilatlar */}
              <div className="border rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleSection('collections')}
                  className="w-full p-3 bg-gray-50 flex items-center justify-between hover:bg-gray-100"
                >
                  <span className="font-medium flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Tahsilatlar ({currentCase.collections.length} / {selectedCase?.collections.length || 0})
                  </span>
                  {expandedSections.has('collections') ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                {expandedSections.has('collections') && (
                  <div className="grid grid-cols-2 divide-x">
                    <div className="p-3 bg-blue-50/30">
                      <p className="text-xs text-gray-500 mb-2">{currentCaseNumber}</p>
                      {currentCase.collections.length === 0 ? (
                        <p className="text-sm text-gray-400">Tahsilat yok</p>
                      ) : (
                        <div className="space-y-1">
                          {currentCase.collections.map((c) => (
                            <div key={c.id} className="flex justify-between text-sm p-2 bg-white rounded border">
                              <div>
                                <span>{c.type}</span>
                                <span className="text-xs text-gray-500 ml-2">{formatDate(c.date)}</span>
                              </div>
                              <span className="font-medium text-green-600">{formatCurrency(c.amount)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between text-sm p-2 bg-blue-100 rounded font-medium">
                            <span>Toplam</span>
                            <span className="text-green-600">{formatCurrency(currentCase.collectionTotal)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="p-3 bg-green-50/30">
                      <p className="text-xs text-gray-500 mb-2">{selectedCase?.fileNumber || 'Seçilmedi'}</p>
                      {!selectedCase || selectedCase.collections.length === 0 ? (
                        <p className="text-sm text-gray-400">{selectedCase ? 'Tahsilat yok' : '-'}</p>
                      ) : (
                        <div className="space-y-1">
                          {selectedCase.collections.map((c) => (
                            <div key={c.id} className="flex justify-between text-sm p-2 bg-white rounded border">
                              <div>
                                <span>{c.type}</span>
                                <span className="text-xs text-gray-500 ml-2">{formatDate(c.date)}</span>
                              </div>
                              <span className="font-medium text-green-600">{formatCurrency(c.amount)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between text-sm p-2 bg-green-100 rounded font-medium">
                            <span>Toplam</span>
                            <span className="text-green-600">{formatCurrency(selectedCase.collectionTotal)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          )}
        </div>

        <div className="p-4 border-t bg-gray-50 flex justify-between">
          {selectedCase && (
            <button
              onClick={() => setSelectedCase(null)}
              className="px-4 py-2 border rounded-lg hover:bg-gray-100"
            >
              Farklı Dosya Seç
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 ml-auto"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
