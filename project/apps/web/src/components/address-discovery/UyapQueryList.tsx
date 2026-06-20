'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@hukuk/ui';
import { Badge } from '@hukuk/ui';
import { Button } from '@hukuk/ui';
import { Spinner } from '@hukuk/ui';
import { 
  Database, 
  Plus, 
  CheckCircle2, 
  Clock, 
  XCircle,
  AlertTriangle,
  ChevronRight
} from 'lucide-react';
import { 
  api, 
  UyapQueryDTO, 
  UyapQueryStatus,
  UyapQuerySuggestion 
} from '@/lib/api';

interface UyapQueryListProps {
  caseDebtorId: string;
  readOnly?: boolean;
  onCreateQuery?: () => void;
  onQueryClick?: (query: UyapQueryDTO) => void;
}

const STATUS_CONFIG: Record<UyapQueryStatus, {
  label: string;
  color: string;
  icon: React.ReactNode;
}> = {
  PENDING: {
    label: 'Bekliyor',
    color: 'bg-yellow-100 text-yellow-700',
    icon: <Clock className="w-3 h-3" />,
  },
  COMPLETED: {
    label: 'Tamamlandı',
    color: 'bg-green-100 text-green-700',
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  FAILED: {
    label: 'Başarısız',
    color: 'bg-red-100 text-red-700',
    icon: <XCircle className="w-3 h-3" />,
  },
  NO_RESULT: {
    label: 'Sonuç Yok',
    color: 'bg-gray-100 text-gray-700',
    icon: <AlertTriangle className="w-3 h-3" />,
  },
};

const QUERY_TYPE_NAMES: Record<string, string> = {
  NUFUS_ADRES: 'MERNİS Adres',
  SGK: 'SGK İşyeri',
  TICARET_ODASI: 'Ticaret Odası',
  VERGI_DAIRESI: 'Vergi Dairesi',
  GSM: 'GSM Operatörleri',
  GUMRUK: 'Gümrük',
  ORTAKLAR: 'Şirket Ortakları',
  AILE: 'Aile Üyeleri',
  ORTAK_DETAY: 'Ortak Detayları',
};

export function UyapQueryList({ 
  caseDebtorId, 
  readOnly = false,
  onCreateQuery,
  onQueryClick 
}: UyapQueryListProps) {
  const [queries, setQueries] = useState<UyapQueryDTO[]>([]);
  const [suggestions, setSuggestions] = useState<UyapQuerySuggestion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [caseDebtorId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [queriesData, suggestionsData] = await Promise.all([
        api.getUyapQueriesForDebtor(caseDebtorId),
        readOnly ? Promise.resolve([]) : api.getSuggestedUyapQueries(caseDebtorId),
      ]);
      setQueries(queriesData);
      setSuggestions(suggestionsData);
    } catch (error) {
      console.error('UYAP sorguları yüklenemedi:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
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

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Database className="w-4 h-4 text-muted-foreground" />
            UYAP Sorguları
          </CardTitle>
          {!readOnly && (
            <Button size="sm" variant="outline" onClick={onCreateQuery}>
              <Plus className="w-4 h-4 mr-1" />
              Yeni Sorgu
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {readOnly && (
          <div className="p-2 rounded bg-gray-50 border border-gray-200 text-xs text-gray-600">
            Pasif kayit: yeni UYAP sorgusu kapali.
          </div>
        )}
        {/* Suggestions */}
        {!readOnly && suggestions.length > 0 && (
          <div className="bg-blue-50 rounded-lg p-3 space-y-2">
            <p className="text-xs font-medium text-blue-700">Önerilen Sorgular</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.slice(0, 3).map((s) => (
                <Badge 
                  key={s.queryCode} 
                  variant="outline" 
                  className="cursor-pointer hover:bg-blue-100"
                  onClick={onCreateQuery}
                >
                  {s.queryCode} - {s.name}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Query List */}
        {queries.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Henüz UYAP sorgusu yapılmamış
          </p>
        ) : (
          <div className="space-y-2">
            {queries.map((query) => {
              const statusConfig = STATUS_CONFIG[query.status];
              return (
                <div
                  key={query.id}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted cursor-pointer"
                  onClick={() => onQueryClick?.(query)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-xs font-bold text-primary">
                        {query.queryCode}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {QUERY_TYPE_NAMES[query.queryType] || query.queryType}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(query.requestedAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {query.addressesFound > 0 && (
                      <span className="text-xs text-green-600 font-medium">
                        {query.addressesFound} adres
                      </span>
                    )}
                    <Badge className={statusConfig.color}>
                      {statusConfig.icon}
                      <span className="ml-1">{statusConfig.label}</span>
                    </Badge>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
