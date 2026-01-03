'use client';

import { useState, useEffect } from 'react';
import { Button, Spinner } from '@hukuk/ui';
import { Database, Info, X } from 'lucide-react';
import { 
  api, 
  UyapQueryType, 
  UyapQueryTypeInfo,
  UyapQuerySuggestion 
} from '@/lib/api';

interface UyapQueryModalProps {
  open: boolean;
  onClose: () => void;
  caseDebtorId: string;
  debtorType: 'INDIVIDUAL' | 'COMPANY';
  onSuccess?: () => void;
}

export function UyapQueryModal({
  open,
  onClose,
  caseDebtorId,
  debtorType,
  onSuccess,
}: UyapQueryModalProps) {
  const [queryTypes, setQueryTypes] = useState<UyapQueryTypeInfo[]>([]);
  const [suggestions, setSuggestions] = useState<UyapQuerySuggestion[]>([]);
  const [selectedType, setSelectedType] = useState<UyapQueryType | null>(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open, caseDebtorId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [types, sugg] = await Promise.all([
        api.getUyapQueryTypes(),
        api.getSuggestedUyapQueries(caseDebtorId),
      ]);
      setQueryTypes(types);
      setSuggestions(sugg);
      
      if (sugg.length > 0) {
        setSelectedType(sugg[0].queryType);
      }
    } catch (error) {
      console.error('Veri yüklenemedi:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedType) return;

    try {
      setSubmitting(true);
      await api.createUyapQuery({
        caseDebtorId,
        queryType: selectedType,
        notes: notes || undefined,
      });
      onSuccess?.();
      onClose();
    } catch (error: any) {
      alert(error.message || 'Sorgu oluşturulamadı');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredTypes = queryTypes.filter(t => 
    debtorType === 'COMPANY' ? t.forCompany : t.forIndividual
  );

  const selectedInfo = queryTypes.find(t => t.type === selectedType);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
      
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Database className="w-5 h-5" />
              Yeni UYAP Sorgusu
            </h2>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 overflow-y-auto max-h-[60vh]">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Spinner size="md" />
              </div>
            ) : (
              <div className="space-y-4">
                {suggestions.length > 0 && (
                  <div className="bg-blue-50 rounded-lg p-3">
                    <p className="text-xs font-medium text-blue-700 mb-2">
                      <Info className="w-3 h-3 inline mr-1" />
                      Önerilen Sorgular
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {suggestions.map((s) => (
                        <button
                          key={s.queryCode}
                          onClick={() => setSelectedType(s.queryType)}
                          className={`px-2 py-1 text-xs rounded border ${
                            selectedType === s.queryType
                              ? 'bg-blue-500 text-white border-blue-500'
                              : 'bg-white text-blue-700 border-blue-300 hover:bg-blue-50'
                          }`}
                        >
                          {s.queryCode} - {s.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-medium">Sorgu Türü</label>
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                    {filteredTypes.map((type) => {
                      const isSelected = selectedType === type.type;
                      const isSugg = suggestions.some(s => s.queryType === type.type);
                      
                      return (
                        <button
                          key={type.type}
                          type="button"
                          className={`p-3 rounded-lg border text-left transition-colors ${
                            isSelected
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:border-blue-300'
                          }`}
                          onClick={() => setSelectedType(type.type)}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-blue-600">
                              {type.code}
                            </span>
                            {isSugg && (
                              <span className="text-[10px] px-1 py-0.5 bg-green-100 text-green-700 rounded">
                                Önerilen
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-medium mt-1">{type.name}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {selectedInfo && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-sm">
                      <span className="font-medium">{selectedInfo.code}</span> - {selectedInfo.name}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {selectedInfo.forIndividual && selectedInfo.forCompany
                        ? 'Gerçek ve tüzel kişiler için'
                        : selectedInfo.forCompany
                        ? 'Sadece tüzel kişiler için'
                        : 'Sadece gerçek kişiler için'}
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-medium">Notlar (Opsiyonel)</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Sorgu ile ilgili notlar..."
                    rows={2}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 p-4 border-t bg-gray-50">
            <Button variant="outline" onClick={onClose} disabled={submitting}>
              İptal
            </Button>
            <Button onClick={handleSubmit} disabled={!selectedType || submitting}>
              {submitting ? <Spinner size="sm" /> : 'Sorgu Oluştur'}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
