'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@hukuk/ui';
import { Badge } from '@hukuk/ui';
import { Button } from '@hukuk/ui';
import { Spinner } from '@hukuk/ui';
import { 
  Search, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Play,
  XCircle
} from 'lucide-react';
import { api, AddressResearchDTO, AddressResearchStatus } from '@/lib/api';

interface ResearchStatusCardProps {
  caseDebtorId: string;
  initialData?: AddressResearchDTO;
  readOnly?: boolean;
  onStatusChange?: () => void;
}

const STATUS_CONFIG: Record<AddressResearchStatus, {
  label: string;
  color: string;
  icon: React.ReactNode;
}> = {
  NOT_STARTED: {
    label: 'Başlamadı',
    color: 'bg-gray-100 text-gray-700',
    icon: <Clock className="w-4 h-4" />,
  },
  IN_PROGRESS: {
    label: 'Devam Ediyor',
    color: 'bg-blue-100 text-blue-700',
    icon: <Search className="w-4 h-4" />,
  },
  COMPLETED: {
    label: 'Tamamlandı',
    color: 'bg-green-100 text-green-700',
    icon: <CheckCircle2 className="w-4 h-4" />,
  },
  EXHAUSTED: {
    label: 'Tükendi',
    color: 'bg-orange-100 text-orange-700',
    icon: <AlertTriangle className="w-4 h-4" />,
  },
};

export function ResearchStatusCard({ 
  caseDebtorId, 
  initialData,
  readOnly = false,
  onStatusChange 
}: ResearchStatusCardProps) {
  const [data, setData] = useState<AddressResearchDTO | null>(initialData || null);
  const [loading, setLoading] = useState(!initialData);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!initialData) {
      loadData();
    }
  }, [caseDebtorId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const result = await api.getResearchStatus(caseDebtorId);
      setData(result);
    } catch (error) {
      console.error('Araştırma durumu yüklenemedi:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStartResearch = async () => {
    if (readOnly) return;
    try {
      setActionLoading(true);
      const result = await api.startResearch(caseDebtorId);
      setData(result);
      onStatusChange?.();
    } catch (error) {
      console.error('Araştırma başlatılamadı:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const handleComplete = async () => {
    if (readOnly) return;
    try {
      setActionLoading(true);
      const result = await api.completeResearch(caseDebtorId);
      setData(result);
      onStatusChange?.();
    } catch (error) {
      console.error('Araştırma tamamlanamadı:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const handleMarkExhausted = async () => {
    if (readOnly) return;
    try {
      setActionLoading(true);
      const result = await api.markResearchAsExhausted(caseDebtorId);
      setData(result);
      onStatusChange?.();
    } catch (error) {
      console.error('İşlem başarısız:', error);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Spinner size="sm" />
        </CardContent>
      </Card>
    );
  }

  const status = data?.status || 'NOT_STARTED';
  const config = STATUS_CONFIG[status];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Search className="w-4 h-4 text-muted-foreground" />
            Adres Araştırma
          </CardTitle>
          <Badge className={config.color}>
            {config.icon}
            <span className="ml-1">{config.label}</span>
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress indicators */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2">
            {data?.clientInfoRequested ? (
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            ) : (
              <XCircle className="w-4 h-4 text-gray-300" />
            )}
            <span className={data?.clientInfoRequested ? 'text-foreground' : 'text-muted-foreground'}>
              Müvekkil Talebi
            </span>
          </div>
          <div className="flex items-center gap-2">
            {data?.uyapQueriesCompleted ? (
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            ) : (
              <XCircle className="w-4 h-4 text-gray-300" />
            )}
            <span className={data?.uyapQueriesCompleted ? 'text-foreground' : 'text-muted-foreground'}>
              UYAP Sorguları
            </span>
          </div>
          <div className="flex items-center gap-2">
            {data?.crossFileChecked ? (
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            ) : (
              <XCircle className="w-4 h-4 text-gray-300" />
            )}
            <span className={data?.crossFileChecked ? 'text-foreground' : 'text-muted-foreground'}>
              Cross-File
            </span>
          </div>
          <div className="flex items-center gap-2">
            {data?.institutionLettersSent ? (
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            ) : (
              <XCircle className="w-4 h-4 text-gray-300" />
            )}
            <span className={data?.institutionLettersSent ? 'text-foreground' : 'text-muted-foreground'}>
              Kurum Yazıları
            </span>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center justify-between text-sm border-t pt-3">
          <span className="text-muted-foreground">Bulunan Adres</span>
          <span className="font-medium">{data?.totalAddressesFound || 0}</span>
        </div>
        {(data?.failedNotifications || 0) > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Başarısız Tebligat</span>
            <span className="font-medium text-orange-600">{data?.failedNotifications}</span>
          </div>
        )}

        {/* Actions */}
        {readOnly && (
          <div className="p-2 rounded bg-gray-50 border border-gray-200 text-xs text-gray-600">
            Pasif kayit: arastirma aksiyonlari kapali.
          </div>
        )}
        <div className="flex gap-2 pt-2">
          {status === 'NOT_STARTED' && (
            <Button 
              size="sm" 
              onClick={handleStartResearch}
              disabled={actionLoading || readOnly}
              className="flex-1"
            >
              {actionLoading ? <Spinner size="sm" /> : <Play className="w-4 h-4 mr-1" />}
              Araştırmayı Başlat
            </Button>
          )}
          {status === 'IN_PROGRESS' && (
            <>
              <Button 
                size="sm" 
                variant="outline"
                onClick={handleComplete}
                disabled={actionLoading || readOnly}
              >
                Tamamla
              </Button>
              <Button 
                size="sm" 
                variant="outline"
                onClick={handleMarkExhausted}
                disabled={actionLoading || readOnly}
              >
                Tükendi
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
