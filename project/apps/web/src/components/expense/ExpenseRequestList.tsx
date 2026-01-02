"use client";

import { useState, useEffect } from "react";
import {
  Receipt,
  Clock,
  CheckCircle,
  Send,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Mail,
  XCircle,
} from "lucide-react";
import { api } from "@/lib/api";

interface ExpenseItem {
  type: string;
  description: string;
  amount: number;
}

interface ExpenseRequest {
  id: string;
  status: 'PENDING' | 'SENT' | 'REMINDED' | 'RECEIVED' | 'LAWYER_PAID' | 'CANCELLED';
  items: ExpenseItem[];
  totalAmount: number;
  dueDate?: string;
  notes?: string;
  sentAt?: string;
  paidAt?: string;
  paidAmount?: number;
  createdAt: string;
  client?: {
    id: string;
    name: string;
    displayName?: string;
  };
}

interface ExpenseRequestListProps {
  caseId: string;
  onCreateNew?: () => void;
  onRefresh?: () => void;
  compact?: boolean;
}

const statusConfig = {
  PENDING: { label: 'Bekliyor', icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200' },
  SENT: { label: 'Gönderildi', icon: Send, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
  REMINDED: { label: 'Hatırlatıldı', icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
  RECEIVED: { label: 'Ödendi', icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200' },
  LAWYER_PAID: { label: 'Avukat Karşıladı', icon: CreditCard, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200' },
  CANCELLED: { label: 'İptal', icon: XCircle, color: 'text-gray-500', bg: 'bg-gray-50', border: 'border-gray-200' },
};

export function ExpenseRequestList({ caseId, onCreateNew, onRefresh, compact = false }: ExpenseRequestListProps) {
  const [requests, setRequests] = useState<ExpenseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const data = await api.getExpenseRequestsByCase(caseId);
      setRequests(data);
    } catch (error) {
      console.error('Masraf talepleri yüklenemedi:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [caseId]);

  const handleMarkAsPaid = async (requestId: string, totalAmount: number) => {
    const confirmed = window.confirm(`Bu masraf talebini "Ödendi" olarak işaretlemek istiyor musunuz?\n\nTutar: ${totalAmount.toLocaleString('tr-TR')} ₺`);
    if (!confirmed) return;

    try {
      setMarkingPaid(requestId);
      await api.markExpenseRequestAsReceived(requestId, totalAmount);
      await fetchRequests();
      onRefresh?.();
    } catch (error: any) {
      console.error('Ödeme işaretleme hatası:', error);
      alert(error.message || 'Ödeme işaretlenemedi');
    } finally {
      setMarkingPaid(null);
    }
  };

  const handleSendReminder = async (requestId: string) => {
    try {
      await api.remindExpenseRequest(requestId);
      await fetchRequests();
    } catch (error: any) {
      console.error('Hatırlatma hatası:', error);
      alert(error.message || 'Hatırlatma gönderilemedi');
    }
  };

  const formatDate = (date?: string) => {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('tr-TR');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="text-center py-4">
        <Receipt className="h-8 w-8 text-gray-300 mx-auto mb-2" />
        <p className="text-xs text-gray-500">Henüz masraf talebi yok</p>
        {onCreateNew && (
          <button
            onClick={onCreateNew}
            className="mt-2 text-xs text-blue-600 hover:underline"
          >
            + Yeni Talep Oluştur
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {requests.map((request) => {
        const config = statusConfig[request.status];
        const StatusIcon = config.icon;
        const isExpanded = expandedId === request.id;
        const isPending = request.status === 'PENDING' || request.status === 'SENT' || request.status === 'REMINDED';

        return (
          <div
            key={request.id}
            className={`border rounded-lg overflow-hidden ${config.border} ${config.bg}`}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between p-2 cursor-pointer hover:bg-white/50"
              onClick={() => setExpandedId(isExpanded ? null : request.id)}
            >
              <div className="flex items-center gap-2">
                <StatusIcon className={`h-4 w-4 ${config.color}`} />
                <div>
                  <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
                  <span className="text-[10px] text-gray-500 ml-2">
                    {formatDate(request.createdAt)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">
                  {request.totalAmount.toLocaleString('tr-TR')} ₺
                </span>
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 text-gray-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                )}
              </div>
            </div>

            {/* Expanded Content */}
            {isExpanded && (
              <div className="border-t bg-white p-3 space-y-3">
                {/* Müvekkil */}
                {request.client && (
                  <div className="text-xs">
                    <span className="text-gray-500">Müvekkil: </span>
                    <span className="font-medium">{request.client.displayName || request.client.name}</span>
                  </div>
                )}

                {/* Kalemler */}
                <div>
                  <p className="text-[10px] text-gray-500 uppercase mb-1">Kalemler</p>
                  <div className="space-y-1">
                    {request.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-xs">
                        <span className="text-gray-600">{item.description}</span>
                        <span className="font-medium">{item.amount.toLocaleString('tr-TR')} ₺</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Son Ödeme Tarihi */}
                {request.dueDate && (
                  <div className="text-xs">
                    <span className="text-gray-500">Son Ödeme: </span>
                    <span className={`font-medium ${new Date(request.dueDate) < new Date() ? 'text-red-600' : ''}`}>
                      {formatDate(request.dueDate)}
                    </span>
                  </div>
                )}

                {/* Ödeme Bilgisi */}
                {request.status === 'RECEIVED' && request.paidAt && (
                  <div className="text-xs bg-green-50 p-2 rounded">
                    <span className="text-green-700">✓ Ödendi: </span>
                    <span className="font-medium text-green-800">
                      {request.paidAmount?.toLocaleString('tr-TR')} ₺ - {formatDate(request.paidAt)}
                    </span>
                  </div>
                )}

                {/* Avukat Karşıladı Bilgisi */}
                {request.status === 'LAWYER_PAID' && (
                  <div className="text-xs bg-purple-50 p-2 rounded">
                    <span className="text-purple-700">💼 Avukat tarafından karşılandı</span>
                    <span className="block text-purple-600 mt-1">Müvekkilden tahsil edilecek: {request.totalAmount.toLocaleString('tr-TR')} ₺</span>
                  </div>
                )}

                {/* Aksiyonlar - Bekleyen talepler için */}
                {isPending && (
                  <div className="flex gap-2 pt-2 border-t">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMarkAsPaid(request.id, request.totalAmount);
                      }}
                      disabled={markingPaid === request.id}
                      className="flex-1 py-1.5 px-3 bg-green-600 text-white text-xs font-medium rounded hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-1"
                    >
                      {markingPaid === request.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <CreditCard className="h-3 w-3" />
                      )}
                      Ödendi İşaretle
                    </button>
                    {(request.status === 'SENT' || request.status === 'REMINDED') && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSendReminder(request.id);
                        }}
                        className="py-1.5 px-3 border border-orange-300 text-orange-600 text-xs font-medium rounded hover:bg-orange-50 flex items-center gap-1"
                      >
                        <Mail className="h-3 w-3" />
                        Hatırlat
                      </button>
                    )}
                  </div>
                )}

                {/* Aksiyonlar - Avukat karşıladı durumu için */}
                {request.status === 'LAWYER_PAID' && (
                  <div className="flex gap-2 pt-2 border-t">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMarkAsPaid(request.id, request.totalAmount);
                      }}
                      disabled={markingPaid === request.id}
                      className="flex-1 py-1.5 px-3 bg-purple-600 text-white text-xs font-medium rounded hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-1"
                    >
                      {markingPaid === request.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <CheckCircle className="h-3 w-3" />
                      )}
                      Müvekkilden Tahsil Edildi
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Yeni Talep Butonu */}
      {onCreateNew && (
        <button
          onClick={onCreateNew}
          className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
        >
          + Yeni Masraf Talebi
        </button>
      )}
    </div>
  );
}
