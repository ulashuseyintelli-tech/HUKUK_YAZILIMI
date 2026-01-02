"use client";

import { useState, useEffect } from "react";
import {
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Loader2,
  FileText,
  Send,
  AlertTriangle,
} from "lucide-react";
import { api } from "@/lib/api";

interface UyapStatusPanelProps {
  caseId: string;
}

interface UyapRequest {
  id: string;
  requestType: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'RETRY';
  evkNo?: string;
  createdAt: string;
  responseAt?: string;
  errorMessage?: string;
}

const requestTypeLabels: Record<string, string> = {
  sendPaymentOrder: 'Ödeme Emri',
  pushHacizRequest: 'Haciz Talebi',
  submitDocument: 'Evrak Gönderimi',
  submitCriminalComplaint: 'Ceza Davası',
  submitCivilLawsuit: 'Hukuk Davası',
  checkTebligatStatus: 'Tebligat Sorgusu',
  queryCaseStatus: 'Durum Sorgusu',
};

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  PENDING: { label: 'Bekliyor', color: 'text-amber-600 bg-amber-50', icon: Clock },
  SUCCESS: { label: 'Başarılı', color: 'text-green-600 bg-green-50', icon: CheckCircle },
  FAILED: { label: 'Başarısız', color: 'text-red-600 bg-red-50', icon: XCircle },
  RETRY: { label: 'Yeniden Deneniyor', color: 'text-blue-600 bg-blue-50', icon: RefreshCw },
};

export function UyapStatusPanel({ caseId }: UyapStatusPanelProps) {
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<UyapRequest[]>([]);
  const [stats, setStats] = useState<{ total: number; pending: number; success: number; failed: number } | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [historyRes, statsRes] = await Promise.all([
        api.get(`/uyap/history?caseId=${caseId}&limit=10`),
        api.get('/uyap/stats'),
      ]);
      setRequests(historyRes.data || []);
      setStats(statsRes.data || null);
    } catch (err) {
      console.error('UYAP durumu yüklenemedi:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [caseId]);

  const handleRetryFailed = async () => {
    try {
      await api.post('/uyap/retry-failed');
      fetchData();
    } catch (err) {
      console.error('Yeniden deneme başarısız:', err);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Activity className="h-4 w-4 text-purple-600" />
          UYAP İşlem Durumu
        </h3>
        <button
          onClick={fetchData}
          className="p-1 hover:bg-gray-100 rounded"
          title="Yenile"
        >
          <RefreshCw className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-2">
          <div className="text-center p-2 bg-gray-50 rounded">
            <p className="text-lg font-bold">{stats.total}</p>
            <p className="text-[10px] text-muted-foreground">Toplam</p>
          </div>
          <div className="text-center p-2 bg-amber-50 rounded">
            <p className="text-lg font-bold text-amber-600">{stats.pending}</p>
            <p className="text-[10px] text-amber-600">Bekleyen</p>
          </div>
          <div className="text-center p-2 bg-green-50 rounded">
            <p className="text-lg font-bold text-green-600">{stats.success}</p>
            <p className="text-[10px] text-green-600">Başarılı</p>
          </div>
          <div className="text-center p-2 bg-red-50 rounded">
            <p className="text-lg font-bold text-red-600">{stats.failed}</p>
            <p className="text-[10px] text-red-600">Başarısız</p>
          </div>
        </div>
      )}

      {/* Request List */}
      {requests.length === 0 ? (
        <div className="text-center py-4 text-sm text-muted-foreground">
          <Send className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p>Henüz UYAP işlemi yok</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {requests.map((req) => {
            const config = statusConfig[req.status] || statusConfig.PENDING;
            const StatusIcon = config.icon;
            
            return (
              <div
                key={req.id}
                className={`p-2 rounded border ${req.status === 'FAILED' ? 'border-red-200' : 'border-gray-100'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <StatusIcon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${config.color.split(' ')[0]}`} />
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">
                        {requestTypeLabels[req.requestType] || req.requestType}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(req.createdAt).toLocaleString('tr-TR')}
                      </p>
                      {req.evkNo && (
                        <p className="text-[10px] text-green-600 font-mono">
                          EVK: {req.evkNo}
                        </p>
                      )}
                      {req.errorMessage && (
                        <p className="text-[10px] text-red-600 truncate" title={req.errorMessage}>
                          {req.errorMessage}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${config.color}`}>
                    {config.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Retry Button */}
      {stats && stats.failed > 0 && (
        <button
          onClick={handleRetryFailed}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded hover:bg-amber-100"
        >
          <RefreshCw className="h-3 w-3" />
          Başarısız İşlemleri Yeniden Dene ({stats.failed})
        </button>
      )}
    </div>
  );
}
