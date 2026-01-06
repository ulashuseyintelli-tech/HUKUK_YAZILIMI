import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Calculator, 
  RefreshCw, 
  AlertTriangle, 
  Info, 
  ChevronDown, 
  ChevronUp,
  FileText,
  Clock,
  Percent,
  Calendar,
  Printer,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@hukuk/ui';
import { Card } from '@hukuk/ui';
import { Badge } from '@hukuk/ui';
import { Spinner } from '@hukuk/ui';
import {
  interestEngineApi,
  PolicyWarning,
  formatRate,
  formatCurrency,
  getWarningSeverityColor,
} from '@/lib/api/interest-engine';
import { FaizSegmentTable } from './FaizSegmentTable';

interface FaizDokumuPanelProps {
  caseId: string;
  asOfDate?: string;
  onRecalculate?: () => void;
  className?: string;
  showHeader?: boolean;
  defaultExpanded?: boolean;
}

export function FaizDokumuPanel({
  caseId,
  asOfDate,
  onRecalculate,
  className = '',
  showHeader = true,
  defaultExpanded = true,
}: FaizDokumuPanelProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const queryClient = useQueryClient();

  const effectiveAsOfDate = asOfDate || new Date().toISOString().split('T')[0];

  // Fetch calculation
  const { data: result, isLoading, error, refetch } = useQuery({
    queryKey: ['interest-calculation', caseId, effectiveAsOfDate],
    queryFn: () => interestEngineApi.calculateForCase(caseId, effectiveAsOfDate),
    enabled: !!caseId,
    staleTime: 5 * 60 * 1000, // 5 dakika cache
  });

  // Recalculate mutation
  const recalculateMutation = useMutation({
    mutationFn: () => interestEngineApi.calculateForCase(caseId, effectiveAsOfDate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['interest-calculation', caseId] });
      onRecalculate?.();
    },
  });

  if (isLoading) {
    return (
      <Card className={`p-4 ${className}`}>
        <div className="flex items-center justify-center py-8">
          <Spinner className="w-6 h-6 mr-2" />
          <span className="text-sm text-gray-500">Faiz hesaplanıyor...</span>
        </div>
      </Card>
    );
  }

  if (error) {
    // API hatasından mesajı çıkart
    const errorMessage = (error as any)?.response?.data?.message || 
                         (error as any)?.message || 
                         'Faiz hesaplanamadı';
    const errorCode = (error as any)?.response?.data?.code;
    
    return (
      <Card className={`p-4 ${className}`}>
        <div className="flex flex-col items-center text-center py-4">
          <AlertTriangle className="w-8 h-8 text-amber-500 mb-2" />
          <span className="text-sm font-medium text-gray-700">Faiz hesaplanamadı</span>
          <span className="text-xs text-gray-500 mt-1">{errorMessage}</span>
          {errorCode === 'NO_PRINCIPAL_ITEMS' && (
            <p className="text-xs text-blue-600 mt-2">
              Alacak kalemlerini ekledikten sonra faiz otomatik hesaplanacaktır.
            </p>
          )}
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => refetch()}
          >
            <RefreshCw className="w-3 h-3 mr-1" />
            Tekrar Dene
          </Button>
        </div>
      </Card>
    );
  }

  if (!result) {
    return (
      <Card className={`p-4 ${className}`}>
        <div className="text-center py-4 text-gray-500 text-sm">
          Faiz hesaplaması bulunamadı
        </div>
      </Card>
    );
  }

  // Oran değişimi var mı?
  const uniqueRates = [...new Set(result.segments.map(s => s.rate))];
  const hasRateChanges = uniqueRates.length > 1;
  const totalDays = result.segments.reduce((sum, s) => sum + s.days, 0);

  return (
    <Card className={`overflow-hidden ${className}`}>
      {/* Header */}
      {showHeader && (
        <div 
          className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-green-50 cursor-pointer border-b"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white rounded-lg shadow-sm">
              <Calculator className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Faiz Dökümü</h3>
              <div className="flex items-center gap-2 mt-0.5">
                {hasRateChanges && (
                  <Badge variant="default" className="text-xs">
                    <TrendingUp className="w-3 h-3 mr-1" />
                    Değişen Oran
                  </Badge>
                )}
                <span className="text-xs text-gray-500">
                  {result.segments.length} dönem • {totalDays} gün
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-xs text-gray-500">Toplam Faiz</div>
              <div className="text-lg font-bold text-green-600">
                {formatCurrency(result.totalInterest)}
              </div>
            </div>
            {isExpanded ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </div>
        </div>
      )}

      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Özet Kartları */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard
              icon={<Calendar className="w-4 h-4" />}
              label="Hesaplama Tarihi"
              value={new Date(result.asOfDate).toLocaleDateString('tr-TR')}
            />
            <SummaryCard
              icon={<Clock className="w-4 h-4" />}
              label="Toplam Gün"
              value={`${totalDays} gün`}
            />
            <SummaryCard
              icon={<Percent className="w-4 h-4" />}
              label="Oran"
              value={hasRateChanges ? 'Değişken' : formatRate(result.segments[0]?.rate || 0)}
              highlight={hasRateChanges}
            />
            <SummaryCard
              icon={<Calculator className="w-4 h-4" />}
              label="Toplam Borç"
              value={formatCurrency(result.totalDue)}
              highlight
            />
          </div>

          {/* Takip Öncesi / Sonrası Faiz Ayrımı */}
          {result.enforcementDate && (result.preEnforcementInterest !== undefined || result.postEnforcementInterest !== undefined) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                  <span className="text-xs font-medium text-amber-700">Takip Öncesi Faiz</span>
                </div>
                <div className="text-lg font-bold text-amber-800">
                  {formatCurrency(result.preEnforcementInterest || 0)}
                </div>
                <div className="text-[10px] text-amber-600 mt-0.5">
                  Vade/İbraz → {new Date(result.enforcementDate).toLocaleDateString('tr-TR')}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-green-50 border border-green-200">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  <span className="text-xs font-medium text-green-700">Takip Sonrası Faiz</span>
                </div>
                <div className="text-lg font-bold text-green-800">
                  {formatCurrency(result.postEnforcementInterest || 0)}
                </div>
                <div className="text-[10px] text-green-600 mt-0.5">
                  {new Date(result.enforcementDate).toLocaleDateString('tr-TR')} → {new Date(result.asOfDate).toLocaleDateString('tr-TR')}
                </div>
              </div>
            </div>
          )}

          {/* Policy Warnings */}
          {result.policyWarnings.length > 0 && (
            <div className="space-y-2">
              {result.policyWarnings.map((warning, idx) => (
                <PolicyWarningItem key={idx} warning={warning} />
              ))}
            </div>
          )}

          {/* Segment Tablosu */}
          <div className="border rounded-lg overflow-hidden">
            <div className="px-4 py-2 bg-gray-50 border-b">
              <h4 className="font-medium text-gray-700 text-sm">Dönemsel Faiz Hesabı</h4>
            </div>
            <div className="p-4">
              <FaizSegmentTable 
                segments={result.segments} 
                maxVisible={5}
              />
            </div>
          </div>

          {/* Legal Text */}
          {result.legalText && (
            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-start gap-2">
                <FileText className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-gray-600 italic">{result.legalText}</p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t">
            <div className="text-xs text-gray-500">
              Hesaplama ID: {result.auditLogId?.slice(0, 8)}...
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.print()}
              >
                <Printer className="w-4 h-4 mr-1" />
                Yazdır
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => recalculateMutation.mutate()}
                disabled={recalculateMutation.isPending}
              >
                <RefreshCw className={`w-4 h-4 mr-1 ${recalculateMutation.isPending ? 'animate-spin' : ''}`} />
                Yeniden Hesapla
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

// Özet Kart Bileşeni
function SummaryCard({ 
  icon, 
  label, 
  value, 
  highlight = false 
}: { 
  icon: React.ReactNode; 
  label: string; 
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className={`p-3 rounded-lg ${highlight ? 'bg-blue-50 border border-blue-100' : 'bg-gray-50'}`}>
      <div className="flex items-center gap-1.5 text-gray-500 mb-1">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <div className={`font-semibold text-sm ${highlight ? 'text-blue-700' : 'text-gray-900'}`}>
        {value}
      </div>
    </div>
  );
}

// Policy Warning Item Component
function PolicyWarningItem({ warning }: { warning: PolicyWarning }) {
  const colorClass = getWarningSeverityColor(warning.severity);
  const Icon = warning.severity === 'ERROR' ? AlertTriangle : Info;

  return (
    <div className={`flex items-start gap-2 p-3 rounded-lg ${
      warning.severity === 'ERROR' ? 'bg-red-50 border border-red-100' : 
      warning.severity === 'WARNING' ? 'bg-yellow-50 border border-yellow-100' : 'bg-blue-50 border border-blue-100'
    }`}>
      <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${colorClass}`} />
      <div className="flex-1">
        <p className={`text-sm font-medium ${colorClass}`}>{warning.message}</p>
        {warning.suggestion && (
          <p className="text-xs text-gray-500 mt-1">{warning.suggestion}</p>
        )}
      </div>
    </div>
  );
}

export default FaizDokumuPanel;
