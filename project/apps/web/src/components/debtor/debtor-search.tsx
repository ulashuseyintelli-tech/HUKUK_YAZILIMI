'use client';

import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { Search, User, Building, X, Loader2, Phone, Mail } from 'lucide-react';

interface DebtorResult {
  id: string;
  type: 'REAL' | 'LEGAL';
  displayName: string;
  tckn?: string;
  vkn?: string;
  phone?: string;
  email?: string;
  activeCases: number;
  totalDebt: number;
}

interface DebtorSearchProps {
  onSelect?: (debtor: DebtorResult) => void;
  placeholder?: string;
}

export function DebtorSearch({ onSelect, placeholder = 'Borçlu ara (ad, TCKN, VKN)...' }: DebtorSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DebtorResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(() => {
      searchDebtors();
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const searchDebtors = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/debtors/search?q=${encodeURIComponent(query)}`);
      setResults(res.data?.data || []);
    } catch (e) {
      // Demo data
      const demoResults: DebtorResult[] = [
        { id: '1', type: 'REAL' as const, displayName: 'Ahmet Yılmaz', tckn: '12345678901', phone: '0532 123 45 67', activeCases: 2, totalDebt: 150000 },
        { id: '2', type: 'LEGAL' as const, displayName: 'XYZ Ticaret Ltd. Şti.', vkn: '1234567890', phone: '0212 123 45 67', email: 'info@xyz.com', activeCases: 5, totalDebt: 850000 },
        { id: '3', type: 'REAL' as const, displayName: 'Mehmet Kaya', tckn: '98765432109', activeCases: 1, totalDebt: 45000 },
      ].filter(d => 
        d.displayName.toLowerCase().includes(query.toLowerCase()) ||
        d.tckn?.includes(query) ||
        d.vkn?.includes(query)
      );
      setResults(demoResults);
    } finally {
      setLoading(false);
      setShowResults(true);
    }
  };

  const handleSelect = (debtor: DebtorResult) => {
    onSelect?.(debtor);
    setQuery('');
    setShowResults(false);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(amount);
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.length >= 2 && setShowResults(true)}
          placeholder={placeholder}
          className="w-full pl-10 pr-10 py-2 border rounded-lg"
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setResults([]); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded"
          >
            <X className="h-4 w-4 text-gray-400" />
          </button>
        )}
      </div>

      {/* Results Dropdown */}
      {showResults && (query.length >= 2 || results.length > 0) && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-6 text-gray-500">
              <User className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Sonuç bulunamadı</p>
            </div>
          ) : (
            results.map((debtor) => (
              <div
                key={debtor.id}
                onClick={() => handleSelect(debtor)}
                className="p-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-full ${debtor.type === 'LEGAL' ? 'bg-purple-100' : 'bg-blue-100'}`}>
                    {debtor.type === 'LEGAL' ? (
                      <Building className="h-4 w-4 text-purple-600" />
                    ) : (
                      <User className="h-4 w-4 text-blue-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{debtor.displayName}</p>
                      <span className={`px-1.5 py-0.5 rounded text-xs ${
                        debtor.type === 'LEGAL' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {debtor.type === 'LEGAL' ? 'Tüzel' : 'Gerçek'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">
                      {debtor.type === 'LEGAL' ? `VKN: ${debtor.vkn}` : `TCKN: ${debtor.tckn}`}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                      {debtor.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {debtor.phone}
                        </span>
                      )}
                      {debtor.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {debtor.email}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-red-600">{formatCurrency(debtor.totalDebt)}</p>
                    <p className="text-xs text-gray-500">{debtor.activeCases} aktif dosya</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
