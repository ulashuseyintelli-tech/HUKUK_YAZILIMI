"use client";

import { useState, useEffect } from "react";
import { 
  api, 
  AssetQueryDTO, 
  AssetSummaryDTO, 
  AssetQueryType,
  AssetQueryTypeLabels,
  AssetQueryJobStatusLabels,
  AssetQueryStatusLabels,
} from "@/lib/api";
import { Button, Spinner } from "@hukuk/ui";
import { AssetFlags } from "./AssetFlags";
import { 
  Car, Home, Landmark, Briefcase, Phone, FileText, Building2, Users,
  Play, RefreshCw, Clock, CheckCircle2, XCircle, AlertCircle, Loader2
} from "lucide-react";

interface AssetQueryPanelProps {
  caseDebtorId: string;
  readOnly?: boolean;
  onRefresh?: () => void;
}

const queryTypeIcons: Record<AssetQueryType, typeof Car> = {
  VEHICLE: Car,
  REAL_ESTATE: Home,
  BANK: Landmark,
  SGK_WAGE: Briefcase,
  SGK_EMPLOYER: Building2,
  TAX: FileText,
  TRADE_REGISTRY: Users,
  GSM: Phone,
};

// Main 4 query types for quick access
const mainQueryTypes: AssetQueryType[] = ["VEHICLE", "REAL_ESTATE", "BANK", "SGK_WAGE"];
// Additional query types
const additionalQueryTypes: AssetQueryType[] = ["SGK_EMPLOYER", "TAX", "TRADE_REGISTRY", "GSM"];

export function AssetQueryPanel({ caseDebtorId, readOnly = false, onRefresh }: AssetQueryPanelProps) {
  const [summary, setSummary] = useState<AssetSummaryDTO | null>(null);
  const [queries, setQueries] = useState<AssetQueryDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<AssetQueryType[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [caseDebtorId]);

  // Poll for pending queries
  useEffect(() => {
    if (summary?.pendingQueries && summary.pendingQueries > 0) {
      const interval = setInterval(loadData, 5000);
      return () => clearInterval(interval);
    }
  }, [summary?.pendingQueries]);

  const loadData = async () => {
    try {
      const [summaryData, queriesData] = await Promise.all([
        api.getAssetSummary(caseDebtorId),
        api.getAssetQueriesForDebtor(caseDebtorId),
      ]);
      setSummary(summaryData);
      setQueries(queriesData);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRunQueries = async () => {
    if (readOnly || selectedTypes.length === 0) return;
    
    setRunning(true);
    try {
      await api.runAssetQueries(caseDebtorId, {
        types: selectedTypes,
        reason: "Manuel sorgu",
      });
      setSelectedTypes([]);
      await loadData();
      onRefresh?.();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  };

  const handleRunAllMain = async () => {
    if (readOnly) return;
    setRunning(true);
    try {
      await api.runAssetQueries(caseDebtorId, {
        types: mainQueryTypes,
        reason: "Toplu sorgu",
      });
      await loadData();
      onRefresh?.();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  };

  const toggleType = (type: AssetQueryType) => {
    if (readOnly) return;
    setSelectedTypes(prev => 
      prev.includes(type) 
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner size="md" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      {summary && (
        <div className="p-3 bg-slate-50 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-600">Malvarlığı Durumu</span>
            {summary.lastQueryAt && (
              <span className="text-[10px] text-slate-400">
                Son sorgu: {new Date(summary.lastQueryAt).toLocaleDateString("tr-TR")}
              </span>
            )}
          </div>
          <AssetFlags
            vehicle={summary.vehicle}
            realEstate={summary.realEstate}
            bank={summary.bank}
            sgkWage={summary.sgkWage}
            size="md"
          />
          {summary.pendingQueries > 0 && (
            <div className="mt-2 flex items-center gap-1 text-xs text-blue-600">
              <Loader2 className="w-3 h-3 animate-spin" />
              {summary.pendingQueries} sorgu devam ediyor...
            </div>
          )}
        </div>
      )}

      {readOnly && (
        <div className="p-2 rounded bg-gray-50 border border-gray-200 text-xs text-gray-600">
          Pasif kayit: yeni malvarligi sorgusu kapali.
        </div>
      )}

      {/* Quick Actions */}
      {!readOnly && (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-600">Hızlı Sorgu</span>
          <Button
            size="sm"
            variant="outline"
            onClick={handleRunAllMain}
            disabled={running || (summary?.pendingQueries ?? 0) > 0}
          >
            {running ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Play className="w-3 h-3 mr-1" />}
            Tümünü Sorgula
          </Button>
        </div>

        {/* Main Query Types */}
        <div className="grid grid-cols-4 gap-2">
          {mainQueryTypes.map(type => {
            const Icon = queryTypeIcons[type];
            const isSelected = selectedTypes.includes(type);
            const status = summary?.[type.toLowerCase().replace("_", "") as keyof AssetSummaryDTO];
            
            return (
              <button
                key={type}
                onClick={() => toggleType(type)}
                disabled={running}
                className={`p-2 rounded-lg border text-center transition-colors ${
                  isSelected 
                    ? "border-blue-500 bg-blue-50" 
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <Icon className={`w-4 h-4 mx-auto mb-1 ${isSelected ? "text-blue-600" : "text-slate-500"}`} />
                <div className="text-[10px] font-medium text-slate-700">
                  {AssetQueryTypeLabels[type].split(" ")[0]}
                </div>
              </button>
            );
          })}
        </div>

        {/* Additional Types Toggle */}
        <button
          onClick={() => setShowAll(!showAll)}
          className="text-xs text-blue-600 hover:underline"
        >
          {showAll ? "Daha az göster" : "Diğer sorgular..."}
        </button>

        {showAll && (
          <div className="grid grid-cols-4 gap-2">
            {additionalQueryTypes.map(type => {
              const Icon = queryTypeIcons[type];
              const isSelected = selectedTypes.includes(type);
              
              return (
                <button
                  key={type}
                  onClick={() => toggleType(type)}
                  disabled={running}
                  className={`p-2 rounded-lg border text-center transition-colors ${
                    isSelected 
                      ? "border-blue-500 bg-blue-50" 
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <Icon className={`w-4 h-4 mx-auto mb-1 ${isSelected ? "text-blue-600" : "text-slate-500"}`} />
                  <div className="text-[10px] font-medium text-slate-700">
                    {AssetQueryTypeLabels[type].split(" ")[0]}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Run Selected */}
        {selectedTypes.length > 0 && (
          <Button
            size="sm"
            onClick={handleRunQueries}
            disabled={running}
            className="w-full"
          >
            {running ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Play className="w-3 h-3 mr-1" />}
            Seçilenleri Sorgula ({selectedTypes.length})
          </Button>
        )}
      </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-2 bg-red-50 text-red-600 text-xs rounded-lg">
          {error}
        </div>
      )}

      {/* Query History */}
      {queries.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-600">Sorgu Geçmişi</span>
            <button onClick={loadData} className="text-slate-400 hover:text-slate-600">
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {queries.slice(0, 10).map(query => (
              <QueryHistoryItem key={query.id} query={query} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function QueryHistoryItem({ query }: { query: AssetQueryDTO }) {
  const Icon = queryTypeIcons[query.queryType];
  
  const statusIcon = {
    QUEUED: <Clock className="w-3 h-3 text-slate-400" />,
    PROCESSING: <Loader2 className="w-3 h-3 text-blue-500 animate-spin" />,
    COMPLETED: query.result === "YES" 
      ? <CheckCircle2 className="w-3 h-3 text-emerald-500" />
      : query.result === "NO"
      ? <XCircle className="w-3 h-3 text-red-500" />
      : <AlertCircle className="w-3 h-3 text-amber-500" />,
    FAILED: <XCircle className="w-3 h-3 text-red-500" />,
    CANCELLED: <XCircle className="w-3 h-3 text-slate-400" />,
  }[query.status];

  return (
    <div className="flex items-center gap-2 p-2 bg-white rounded border border-slate-100">
      <Icon className="w-3.5 h-3.5 text-slate-500" />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-slate-700 truncate">
          {AssetQueryTypeLabels[query.queryType]}
        </div>
        <div className="text-[10px] text-slate-400">
          {new Date(query.requestedAt).toLocaleString("tr-TR")}
        </div>
      </div>
      <div className="flex items-center gap-1">
        {statusIcon}
        {query.result && (
          <span className={`text-[10px] font-medium ${
            query.result === "YES" ? "text-emerald-600" :
            query.result === "NO" ? "text-red-500" :
            "text-slate-500"
          }`}>
            {AssetQueryStatusLabels[query.result]}
          </span>
        )}
      </div>
    </div>
  );
}
