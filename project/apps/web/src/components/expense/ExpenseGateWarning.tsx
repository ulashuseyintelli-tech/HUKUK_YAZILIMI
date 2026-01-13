'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, Lock, CheckCircle, CreditCard } from 'lucide-react';
import { api } from '@/lib/api';

interface ExpenseGateWarningProps {
  caseId: string;
  actionType?: string;
  onGateCleared?: () => void;
  showDetails?: boolean;
}

interface GateStatus {
  isBlocked: boolean;
  blockingExpenses: Array<{
    id: string;
    stageCode: string;
    totalAmount: number;
    paidTotal: number;
  }>;
  totalPending: number;
  message?: string;
}

export function ExpenseGateWarning({ 
  caseId, 
  actionType = 'SUBMIT',
  onGateCleared,
  showDetails = true 
}: ExpenseGateWarningProps) {
  const [gateStatus, setGateStatus] = useState<GateStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadGateStatus();
  }, [caseId]);

  const loadGateStatus = async () => {
    try {
      setLoading(true);
      const status = await api.checkExpenseGate(caseId);
      setGateStatus(status);
      
      if (!status.isBlocked && onGateCleared) {
        onGateCleared();
      }
    } catch (err) {
      setError('Gate durumu kontrol edilemedi');
      console.error('Gate check error:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatTL = (amount: number) => {
    return amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) + ' TL';
  };

  const getStageLabel = (stageCode: string) => {
    const labels: Record<string, string> = {
      OPENING: 'Açılış Masrafları',
      RE_NOTIFICATION: 'Yeniden Tebligat',
      SEIZURE: 'Haciz Masrafları',
      SALE: 'Satış Masrafları',
    };
    return labels[stageCode] || stageCode;
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-gray-500 text-sm">
        <div className="animate-spin h-4 w-4 border-2 border-gray-300 border-t-blue-500 rounded-full" />
        <span>Masraf durumu kontrol ediliyor...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-red-500 text-sm">
        <AlertTriangle className="h-4 w-4" />
        <span>{error}</span>
      </div>
    );
  }

  if (!gateStatus) return null;

  // Gate açık - işlem yapılabilir
  if (!gateStatus.isBlocked) {
    return (
      <div className="flex items-center gap-2 text-green-600 text-sm bg-green-50 px-3 py-2 rounded-lg">
        <CheckCircle className="h-4 w-4" />
        <span>Tüm masraflar ödendi - UYAP işlemleri yapılabilir</span>
      </div>
    );
  }

  // Gate kapalı - uyarı göster
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <Lock className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <h4 className="font-medium text-amber-800">
            Masraf Ödenmeden İşlem Yapılamaz
          </h4>
          <p className="text-sm text-amber-700 mt-1">
            Bu dosyada ödenmemiş masraf talebi bulunmaktadır. 
            UYAP işlemleri için önce masrafların ödenmesi gerekmektedir.
          </p>
          
          {showDetails && gateStatus.blockingExpenses.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-medium text-amber-800">Bekleyen Masraflar:</p>
              {gateStatus.blockingExpenses.map((expense) => {
                const remaining = expense.totalAmount - expense.paidTotal;
                return (
                  <div 
                    key={expense.id}
                    className="flex items-center justify-between bg-white/50 px-3 py-2 rounded text-sm"
                  >
                    <span className="text-amber-800">{getStageLabel(expense.stageCode)}</span>
                    <span className="font-medium text-amber-900">{formatTL(remaining)}</span>
                  </div>
                );
              })}
              <div className="flex items-center justify-between pt-2 border-t border-amber-200">
                <span className="font-medium text-amber-800">Toplam Bekleyen:</span>
                <span className="font-bold text-amber-900">{formatTL(gateStatus.totalPending)}</span>
              </div>
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => {
                // Masraf ödeme modalını aç
                window.dispatchEvent(new CustomEvent('open-expense-payment', { 
                  detail: { caseId, expenses: gateStatus.blockingExpenses } 
                }));
              }}
              className="flex items-center gap-2 px-3 py-1.5 bg-amber-600 text-white text-sm rounded hover:bg-amber-700 transition-colors"
            >
              <CreditCard className="h-4 w-4" />
              Ödeme Kaydet
            </button>
            <button
              onClick={loadGateStatus}
              className="px-3 py-1.5 text-amber-700 text-sm border border-amber-300 rounded hover:bg-amber-100 transition-colors"
            >
              Yenile
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * UYAP butonları için wrapper - masraf kontrolü yapar
 */
interface UyapActionButtonProps {
  caseId: string;
  actionType: string;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}

export function UyapActionButton({
  caseId,
  actionType,
  children,
  onClick,
  disabled = false,
  className = '',
}: UyapActionButtonProps) {
  const [canPerform, setCanPerform] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    checkPermission();
  }, [caseId, actionType]);

  const checkPermission = async () => {
    try {
      setChecking(true);
      const result = await api.canPerformUyapAction(caseId, actionType);
      setCanPerform(result.canPerform);
    } catch (err) {
      console.error('Permission check error:', err);
      setCanPerform(false);
    } finally {
      setChecking(false);
    }
  };

  const handleClick = () => {
    if (canPerform) {
      onClick();
    } else {
      // Gate uyarısı göster
      window.dispatchEvent(new CustomEvent('show-gate-warning', { 
        detail: { caseId, actionType } 
      }));
    }
  };

  if (checking) {
    return (
      <button disabled className={`opacity-50 cursor-wait ${className}`}>
        {children}
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={disabled || !canPerform}
      className={`${className} ${!canPerform ? 'opacity-50 cursor-not-allowed' : ''}`}
      title={!canPerform ? 'Masraf ödenmeden bu işlem yapılamaz' : undefined}
    >
      {!canPerform && <Lock className="h-4 w-4 mr-1 inline" />}
      {children}
    </button>
  );
}

export default ExpenseGateWarning;
