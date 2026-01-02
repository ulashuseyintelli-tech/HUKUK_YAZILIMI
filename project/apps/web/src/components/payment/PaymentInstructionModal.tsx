'use client';

import { useState, useEffect } from 'react';
import { X, Copy, Check, CreditCard, FileText, AlertTriangle, Building2 } from 'lucide-react';
import { api } from '@/lib/api';

// ============================================
// TİPLER
// ============================================

export enum PayerType {
  DEBTOR = 'DEBTOR',
  CREDITOR = 'CREDITOR',
  LAWYER = 'LAWYER',
}

export enum PaymentPurpose {
  DEBT_PAYMENT = 'DEBT_PAYMENT',
  APPLICATION_FEE = 'APPLICATION_FEE',
  ADVANCE_FEE = 'ADVANCE_FEE',
  COLLECTION_FEE = 'COLLECTION_FEE',
  NOTIFICATION_EXPENSE = 'NOTIFICATION_EXPENSE',
  SEIZURE_ADVANCE = 'SEIZURE_ADVANCE',
  SALE_ADVANCE = 'SALE_ADVANCE',
  EXPERT_ADVANCE = 'EXPERT_ADVANCE',
  OTHER_EXPENSE = 'OTHER_EXPENSE',
  PRISON_FEE = 'PRISON_FEE',
}

const PAYER_TYPE_LABELS: Record<PayerType, string> = {
  [PayerType.DEBTOR]: 'Borçlu',
  [PayerType.CREDITOR]: 'Alacaklı',
  [PayerType.LAWYER]: 'Vekil/Avukat',
};

const PAYMENT_PURPOSE_LABELS: Record<PaymentPurpose, string> = {
  [PaymentPurpose.DEBT_PAYMENT]: 'Borç Ödemesi',
  [PaymentPurpose.APPLICATION_FEE]: 'Başvurma Harcı',
  [PaymentPurpose.ADVANCE_FEE]: 'Peşin Harç',
  [PaymentPurpose.COLLECTION_FEE]: 'Tahsil Harcı',
  [PaymentPurpose.NOTIFICATION_EXPENSE]: 'Tebligat Gideri',
  [PaymentPurpose.SEIZURE_ADVANCE]: 'Haciz Avansı',
  [PaymentPurpose.SALE_ADVANCE]: 'Satış Avansı',
  [PaymentPurpose.EXPERT_ADVANCE]: 'Bilirkişi Avansı',
  [PaymentPurpose.OTHER_EXPENSE]: 'Diğer Masraf',
  [PaymentPurpose.PRISON_FEE]: 'Cezaevi Harcı',
};

// Borçlu için ödeme türleri
const DEBTOR_PURPOSES = [PaymentPurpose.DEBT_PAYMENT];

// Alacaklı/Vekil için ödeme türleri
const CREDITOR_PURPOSES = [
  PaymentPurpose.APPLICATION_FEE,
  PaymentPurpose.ADVANCE_FEE,
  PaymentPurpose.COLLECTION_FEE,
  PaymentPurpose.NOTIFICATION_EXPENSE,
  PaymentPurpose.SEIZURE_ADVANCE,
  PaymentPurpose.SALE_ADVANCE,
  PaymentPurpose.EXPERT_ADVANCE,
  PaymentPurpose.OTHER_EXPENSE,
  PaymentPurpose.PRISON_FEE,
];

interface PaymentInstructionResult {
  bankName: string;
  iban: string;
  ibanFormatted: string;
  description: string;
  executionOfficeName: string;
  executionFileNumber: string;
  amount: number;
  purpose: PaymentPurpose;
  purposeLabel: string;
  warnings?: string[];
}

interface PaymentInstructionModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  executionOfficeName?: string;
  executionFileNumber?: string;
  debtorName?: string;
}

// ============================================
// MODAL KOMPONENTİ
// ============================================

export function PaymentInstructionModal({
  isOpen,
  onClose,
  caseId,
  executionOfficeName,
  executionFileNumber,
  debtorName,
}: PaymentInstructionModalProps) {
  // Form state
  const [payerType, setPayerType] = useState<PayerType>(PayerType.CREDITOR);
  const [purpose, setPurpose] = useState<PaymentPurpose>(PaymentPurpose.NOTIFICATION_EXPENSE);
  const [amount, setAmount] = useState<string>('');
  const [payerName, setPayerName] = useState<string>(debtorName || '');
  
  // Result state
  const [result, setResult] = useState<PaymentInstructionResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Copy state
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Payer type değişince purpose'u sıfırla
  useEffect(() => {
    if (payerType === PayerType.DEBTOR) {
      setPurpose(PaymentPurpose.DEBT_PAYMENT);
    } else {
      setPurpose(PaymentPurpose.NOTIFICATION_EXPENSE);
    }
    setResult(null);
  }, [payerType]);

  // Modal kapanınca state'leri sıfırla
  useEffect(() => {
    if (!isOpen) {
      setPayerType(PayerType.CREDITOR);
      setPurpose(PaymentPurpose.NOTIFICATION_EXPENSE);
      setAmount('');
      setPayerName(debtorName || '');
      setResult(null);
      setError(null);
    }
  }, [isOpen, debtorName]);

  const handleSubmit = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      setError('Lütfen geçerli bir tutar girin');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data } = await api.post<PaymentInstructionResult>('/payment-instructions', {
        caseId,
        payerType,
        purpose,
        amount: parseFloat(amount),
        payerName: payerType === PayerType.DEBTOR ? payerName : undefined,
      });
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Ödeme talimatı oluşturulamadı');
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Kopyalama hatası:', err);
    }
  };

  const availablePurposes = payerType === PayerType.DEBTOR ? DEBTOR_PURPOSES : CREDITOR_PURPOSES;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <CreditCard className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Ödeme Talimatı Oluştur
                </h3>
                {executionFileNumber && (
                  <p className="text-sm text-gray-500">
                    {executionFileNumber} - {executionOfficeName}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 rounded"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-5">
          {!result ? (
            <>
              {/* Kim Ödüyor? */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Kim Ödüyor?
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPayerType(PayerType.DEBTOR)}
                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                      payerType === PayerType.DEBTOR
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-medium text-gray-900">Borçlu</div>
                    <div className="text-xs text-gray-500">Emanet hesabına</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayerType(PayerType.CREDITOR)}
                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                      payerType === PayerType.CREDITOR
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-medium text-gray-900">Alacaklı/Vekil</div>
                    <div className="text-xs text-gray-500">Harç hesabına</div>
                  </button>
                </div>
              </div>

              {/* Borçlu adı (sadece borçlu seçiliyse) */}
              {payerType === PayerType.DEBTOR && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Borçlu Adı
                  </label>
                  <input
                    type="text"
                    value={payerName}
                    onChange={(e) => setPayerName(e.target.value)}
                    placeholder="Borçlu adı/unvanı"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              )}

              {/* Ödeme Türü */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Ödeme Türü
                </label>
                <div className="space-y-2">
                  {availablePurposes.map((p) => (
                    <label
                      key={p}
                      className={`flex items-center p-3 rounded-lg border cursor-pointer transition-all ${
                        purpose === p
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="purpose"
                        value={p}
                        checked={purpose === p}
                        onChange={() => setPurpose(p)}
                        className="sr-only"
                      />
                      <div className={`w-4 h-4 rounded-full border-2 mr-3 flex items-center justify-center ${
                        purpose === p ? 'border-blue-500' : 'border-gray-300'
                      }`}>
                        {purpose === p && (
                          <div className="w-2 h-2 rounded-full bg-blue-500" />
                        )}
                      </div>
                      <span className="text-gray-900">{PAYMENT_PURPOSE_LABELS[p]}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Tutar */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tutar (TL)
                </label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Hata mesajı */}
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-sm">{error}</span>
                </div>
              )}
            </>
          ) : (
            /* Sonuç Görünümü */
            <div className="space-y-4">
              {/* Başarı mesajı */}
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2 text-green-700">
                  <Check className="w-5 h-5" />
                  <span className="font-medium">Ödeme talimatı hazır!</span>
                </div>
              </div>

              {/* Ödeme bilgileri */}
              <div className="p-4 bg-gray-50 rounded-lg space-y-4">
                {/* Banka */}
                <div>
                  <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                    <Building2 className="w-4 h-4" />
                    <span>Banka</span>
                  </div>
                  <p className="font-medium text-gray-900">{result.bankName}</p>
                </div>

                {/* IBAN */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-500">IBAN</span>
                    <button
                      onClick={() => copyToClipboard(result.iban, 'iban')}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                    >
                      {copiedField === 'iban' ? (
                        <>
                          <Check className="w-3 h-3" />
                          Kopyalandı
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          Kopyala
                        </>
                      )}
                    </button>
                  </div>
                  <p className="font-mono text-sm bg-white p-2 rounded border select-all">
                    {result.ibanFormatted}
                  </p>
                </div>

                {/* Açıklama */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-500">Açıklama</span>
                    <button
                      onClick={() => copyToClipboard(result.description, 'description')}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                    >
                      {copiedField === 'description' ? (
                        <>
                          <Check className="w-3 h-3" />
                          Kopyalandı
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          Kopyala
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-sm bg-white p-2 rounded border select-all">
                    {result.description}
                  </p>
                </div>

                {/* Tutar */}
                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-gray-500">Tutar</span>
                  <span className="text-lg font-semibold text-gray-900">
                    {result.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL
                  </span>
                </div>
              </div>

              {/* Uyarılar */}
              {result.warnings && result.warnings.length > 0 && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5" />
                    <div className="text-sm text-yellow-700">
                      {result.warnings.map((w, i) => (
                        <p key={i}>{w}</p>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t flex justify-end gap-3">
          {!result ? (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                İptal
              </button>
              <button
                onClick={handleSubmit}
                disabled={isLoading || !amount}
                className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Oluşturuluyor...
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4" />
                    Talimat Oluştur
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setResult(null)}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Yeni Talimat
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Kapat
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default PaymentInstructionModal;
