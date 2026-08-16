'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button, Spinner } from '@hukuk/ui';
import { Database, Info, X } from 'lucide-react';
import {
  api,
  UyapQueryType,
  UyapQueryTypeInfo,
  UyapQuerySuggestion
} from '@/lib/api';
import { toActionErrorMessage } from '@/lib/action-error';

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

  // WSMR-A4-AB-20: hata durumunda eskiden hiçbir state dokunulmuyordu (yalnız
  // console.error) — boş/açıklamasız bir sorgu-türü ızgarası "yalancı boşluk"
  // gibi görünüyordu (görünür hata YOKTU). Ayrıca bu modal örneği açık/kapalı
  // arası UNMOUNT OLMUYOR (yalnız `open` prop'u değişir) — kimlik değişim
  // koruması olmadan, ÖNCEKİ borçlunun sorgu türü/öneri/seçimi YENİ borçlunun
  // bağlamında sessizce kalabiliyordu (modal reopen/identity izolasyon açığı).
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  const fetchTokenRef = useRef(0);
  const fetchInFlightRef = useRef(false);
  const prevCaseDebtorIdRef = useRef<string | null>(null);

  const loadData = useCallback(async () => {
    if (fetchInFlightRef.current) return; // çift-tetik -> tek aktif istek
    fetchInFlightRef.current = true;
    const token = ++fetchTokenRef.current;
    setLoading(true);
    try {
      const [types, sugg] = await Promise.all([
        api.getUyapQueryTypes(),
        api.getSuggestedUyapQueries(caseDebtorId),
      ]);
      if (!isMountedRef.current || token !== fetchTokenRef.current) return; // bayat/unmount
      if (!Array.isArray(types) || !Array.isArray(sugg)) {
        throw new Error('MALFORMED_UYAP_QUERY_RESPONSE');
      }
      setQueryTypes(types);
      setSuggestions(sugg);
      setLoadError(null);
      if (sugg.length > 0) {
        setSelectedType(sugg[0].queryType);
      }
    } catch (err) {
      if (!isMountedRef.current || token !== fetchTokenRef.current) return;
      console.error('Veri yüklenemedi:', err);
      // queryTypes/suggestions BİLEREK dokunulmaz — önceki başarıyla yüklenmiş
      // liste (varsa) SİLİNMEZ; yalnız bayat olduğu bantta görünür olur. Bu ARTIK
      // açıklamasız boş bir ızgarayla ("yalancı boşluk") KARIŞTIRILMAZ.
      setLoadError(toActionErrorMessage(err, 'UYAP sorgu türleri/önerileri yüklenemedi.'));
    } finally {
      if (token === fetchTokenRef.current) {
        fetchInFlightRef.current = false;
        if (isMountedRef.current) setLoading(false);
      }
    }
  }, [caseDebtorId]);

  const retryLoad = useCallback(async () => {
    setRetrying(true);
    fetchInFlightRef.current = false; // manuel retry -> in-flight bayrağını sıfırla
    try {
      await loadData();
    } finally {
      if (isMountedRef.current) setRetrying(false);
    }
  }, [loadData]);

  useEffect(() => {
    if (open) {
      if (prevCaseDebtorIdRef.current !== caseDebtorId) {
        // Borçlu KİMLİĞİ değişti (bu modal örneği açık/kapalı arası UNMOUNT
        // OLMADIĞI için farklı bir borçlu için yeniden kullanılabilir) — ÖNCEKİ
        // borçlunun sorgu türü/öneri/seçimi/notu YENİ borçlunun bağlamında
        // YANLIŞLIKLA görünmez veya YANLIŞ borçluya gönderilmez.
        prevCaseDebtorIdRef.current = caseDebtorId;
        setQueryTypes([]);
        setSuggestions([]);
        setSelectedType(null);
        setNotes('');
        setLoadError(null);
      }
      // Modal (yeniden) açıldı — ÖNCEKİ, belki hâlâ in-flight bir denemenin
      // bayrağı YENİ denemeyi ENGELLEMEMELİ; jenerasyon token'ı ESKİ denemenin
      // GEÇ gelen yanıtını zaten atlar (A4-AB-8/12/14 ile aynı tasarım deseni).
      fetchInFlightRef.current = false;
      loadData();
    }
  }, [open, caseDebtorId, loadData]);

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
            {loadError && (
              // WSMR-A4-AB-20: okuma hatası açıklamasız boş bir sorgu-türü ızgarasıyla
              // ("yalancı boşluk") ASLA KARIŞTIRILMAZ. Önceki başarıyla yüklenmiş liste
              // (varsa) aşağıda GÖRÜNMEYE devam eder — yalnız bayat olabileceği belirtilir.
              <div role="alert" className="mb-3 flex items-start justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                <span>
                  {loadError}
                  {queryTypes.length > 0 || suggestions.length > 0 ? ' Gösterilen liste bayat olabilir.' : ''}
                </span>
                <button
                  type="button"
                  onClick={retryLoad}
                  disabled={retrying}
                  className="shrink-0 rounded bg-red-100 px-2 py-1 text-red-800 hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {retrying ? 'Deneniyor…' : 'Tekrar dene'}
                </button>
              </div>
            )}
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Spinner size="md" />
              </div>
            ) : loadError && queryTypes.length === 0 ? null : (
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
