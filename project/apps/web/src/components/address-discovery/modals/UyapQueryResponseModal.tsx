'use client';

import { useState } from 'react';
import { Button, Spinner } from '@hukuk/ui';
import { 
  Database, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  XCircle,
  AlertTriangle,
  X
} from 'lucide-react';
import { api, UyapQueryDTO, AddressFromQueryDTO } from '@/lib/api';

interface UyapQueryResponseModalProps {
  open: boolean;
  onClose: () => void;
  query: UyapQueryDTO;
  onSuccess?: () => void;
}

type ResponseStatus = 'COMPLETED' | 'FAILED' | 'NO_RESULT';

export function UyapQueryResponseModal({
  open,
  onClose,
  query,
  onSuccess,
}: UyapQueryResponseModalProps) {
  const [status, setStatus] = useState<ResponseStatus>('COMPLETED');
  const [errorMessage, setErrorMessage] = useState('');
  const [addresses, setAddresses] = useState<AddressFromQueryDTO[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const addAddress = () => {
    setAddresses([
      ...addresses,
      { fullAddress: '', city: '', district: '' },
    ]);
  };

  const removeAddress = (index: number) => {
    setAddresses(addresses.filter((_, i) => i !== index));
  };

  const updateAddress = (index: number, field: keyof AddressFromQueryDTO, value: string) => {
    const updated = [...addresses];
    updated[index] = { ...updated[index], [field]: value };
    setAddresses(updated);
  };

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      const validAddresses = addresses.filter(a => a.fullAddress.trim());
      
      // Record the query response
      await api.recordUyapQueryResponse(query.id, {
        status,
        errorMessage: status === 'FAILED' ? errorMessage : undefined,
        addresses: status === 'COMPLETED' ? validAddresses : undefined,
      });
      
      // If completed with addresses, process them to add to DebtorAddress
      if (status === 'COMPLETED' && validAddresses.length > 0) {
        try {
          await api.processUyapQueryAddresses(query.id, validAddresses);
        } catch (processError) {
          console.error('Adresler işlenirken hata:', processError);
          // Don't fail the whole operation if address processing fails
        }
      }
      
      onSuccess?.();
      onClose();
    } catch (error: any) {
      alert(error.message || 'Sonuç kaydedilemedi');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
      
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Database className="w-5 h-5" />
              UYAP Sorgu Sonucu - {query.queryCode}
            </h2>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 overflow-y-auto max-h-[60vh] space-y-4">
            {/* Status Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Sonuç Durumu</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStatus('COMPLETED')}
                  className={`flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    status === 'COMPLETED'
                      ? 'bg-green-500 text-white border-green-500'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Tamamlandı
                </button>
                <button
                  type="button"
                  onClick={() => setStatus('NO_RESULT')}
                  className={`flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    status === 'NO_RESULT'
                      ? 'bg-amber-500 text-white border-amber-500'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <AlertTriangle className="w-4 h-4" />
                  Sonuç Yok
                </button>
                <button
                  type="button"
                  onClick={() => setStatus('FAILED')}
                  className={`flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    status === 'FAILED'
                      ? 'bg-red-500 text-white border-red-500'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <XCircle className="w-4 h-4" />
                  Başarısız
                </button>
              </div>
            </div>

            {/* Error Message */}
            {status === 'FAILED' && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Hata Mesajı</label>
                <textarea
                  value={errorMessage}
                  onChange={(e) => setErrorMessage(e.target.value)}
                  placeholder="Hata açıklaması..."
                  rows={2}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                />
              </div>
            )}

            {/* Addresses */}
            {status === 'COMPLETED' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Bulunan Adresler</label>
                  <Button type="button" variant="outline" size="sm" onClick={addAddress}>
                    <Plus className="w-4 h-4 mr-1" />
                    Adres Ekle
                  </Button>
                </div>

                {addresses.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4 bg-gray-50 rounded-lg">
                    Henüz adres eklenmedi. "Adres Ekle" butonuna tıklayın.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {addresses.map((addr, index) => (
                      <div key={index} className="p-3 border rounded-lg space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium px-2 py-1 bg-gray-100 rounded">
                            Adres {index + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeAddress(index)}
                            className="p-1 hover:bg-red-50 rounded text-red-500"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        
                        <div className="space-y-2">
                          <textarea
                            value={addr.fullAddress}
                            onChange={(e) => updateAddress(index, 'fullAddress', e.target.value)}
                            placeholder="Tam adres..."
                            rows={2}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="text"
                              value={addr.city || ''}
                              onChange={(e) => updateAddress(index, 'city', e.target.value)}
                              placeholder="İl"
                              className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                            <input
                              type="text"
                              value={addr.district || ''}
                              onChange={(e) => updateAddress(index, 'district', e.target.value)}
                              placeholder="İlçe"
                              className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 p-4 border-t bg-gray-50">
            <Button variant="outline" onClick={onClose} disabled={submitting}>
              İptal
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? <Spinner size="sm" /> : 'Sonucu Kaydet'}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
