'use client';

/**
 * Decision Timeline Component
 * 
 * v28_decision_timeline UI implementation.
 * Displays case timeline with filtering, pagination, and detail drawer.
 */
import { useState, useEffect, useCallback } from 'react';
import { 
  Clock, 
  Filter, 
  ChevronRight, 
  AlertTriangle, 
  CheckCircle2, 
  Info,
  Cpu,
  Mail,
  FileText,
  Zap,
  MessageSquare,
  X,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { Button } from '@hukuk/ui';
import { cn } from '@hukuk/ui';

// Types matching OpenAPI spec
type TimelineEntryType = 'UYAP_EVENT' | 'FACT_WRITE' | 'COMPUTE' | 'DECISION' | 'ACTION' | 'OUTCOME' | 'NOTE';
type TimelineSeverity = 'info' | 'warn' | 'critical';
type TimelineSource = 'uyap' | 'engine' | 'user' | 'system';

interface TimelineEntry {
  entry_id: string;
  case_id: string;
  ts: string;
  type: TimelineEntryType;
  severity: TimelineSeverity;
  title: string;
  body: Record<string, any> | null;
  run_id: string | null;
  source: TimelineSource;
}

interface TimelinePageResponse {
  next_cursor: string | null;
  items: TimelineEntry[];
}

interface DecisionTimelineProps {
  caseId: string;
  className?: string;
}

const TYPE_CONFIG: Record<TimelineEntryType, { icon: typeof Clock; label: string; color: string }> = {
  UYAP_EVENT: { icon: FileText, label: 'UYAP', color: 'text-blue-600 bg-blue-50' },
  FACT_WRITE: { icon: Zap, label: 'Fact', color: 'text-purple-600 bg-purple-50' },
  COMPUTE: { icon: Cpu, label: 'Hesaplama', color: 'text-green-600 bg-green-50' },
  DECISION: { icon: CheckCircle2, label: 'Karar', color: 'text-amber-600 bg-amber-50' },
  ACTION: { icon: Mail, label: 'Aksiyon', color: 'text-indigo-600 bg-indigo-50' },
  OUTCOME: { icon: CheckCircle2, label: 'Sonuç', color: 'text-emerald-600 bg-emerald-50' },
  NOTE: { icon: MessageSquare, label: 'Not', color: 'text-gray-600 bg-gray-50' },
};

const SEVERITY_CONFIG: Record<TimelineSeverity, { icon: typeof Info; color: string }> = {
  info: { icon: Info, color: 'text-blue-500' },
  warn: { icon: AlertTriangle, color: 'text-amber-500' },
  critical: { icon: AlertTriangle, color: 'text-red-500' },
};

const SOURCE_LABELS: Record<TimelineSource, string> = {
  uyap: 'UYAP',
  engine: 'Motor',
  user: 'Kullanıcı',
  system: 'Sistem',
};

export function DecisionTimeline({ caseId, className }: DecisionTimelineProps) {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<TimelineEntry | null>(null);
  const [filter, setFilter] = useState<TimelineSource | 'all'>('all');

  const fetchTimeline = useCallback(async (cursor?: string) => {
    const isLoadMore = !!cursor;
    if (isLoadMore) setLoadingMore(true);
    else setLoading(true);

    try {
      const params = new URLSearchParams({ limit: '50' });
      if (cursor) params.set('cursor', cursor);
      if (filter !== 'all') params.set('source', filter);

      const res = await fetch(`/api/icrabot/v28/timeline/${caseId}?${params}`);
      if (!res.ok) throw new Error('Timeline fetch failed');
      
      const data: TimelinePageResponse = await res.json();
      
      if (isLoadMore) {
        setEntries(prev => [...prev, ...data.items]);
      } else {
        setEntries(data.items);
      }
      setNextCursor(data.next_cursor);
    } catch (err) {
      console.error('Timeline fetch error:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [caseId, filter]);

  useEffect(() => {
    fetchTimeline();
  }, [fetchTimeline]);

  const formatTime = (ts: string) => {
    const date = new Date(ts);
    return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (ts: string) => {
    const date = new Date(ts);
    return date.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="font-medium text-sm">Karar Zaman Çizelgesi</h3>
        <Button variant="ghost" size="sm" onClick={() => fetchTimeline()}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Filter Chips */}
      <div className="flex gap-2 px-4 py-2 border-b overflow-x-auto">
        {(['all', 'uyap', 'engine', 'user', 'system'] as const).map((src) => (
          <button
            key={src}
            onClick={() => setFilter(src)}
            className={cn(
              'px-3 py-1 text-xs rounded-full whitespace-nowrap transition-colors',
              filter === src
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            {src === 'all' ? 'Tümü' : SOURCE_LABELS[src]}
          </button>
        ))}
      </div>

      {/* Timeline List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">
            Henüz kayıt yok
          </div>
        ) : (
          <div className="divide-y">
            {entries.map((entry) => {
              const typeConfig = TYPE_CONFIG[entry.type];
              const severityConfig = SEVERITY_CONFIG[entry.severity];
              const TypeIcon = typeConfig.icon;
              const SeverityIcon = severityConfig.icon;

              return (
                <button
                  key={entry.entry_id}
                  onClick={() => setSelectedEntry(entry)}
                  className="w-full px-4 py-3 flex items-start gap-3 hover:bg-gray-50 text-left transition-colors"
                >
                  <div className={cn('p-1.5 rounded', typeConfig.color)}>
                    <TypeIcon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">
                        {formatTime(entry.ts)}
                      </span>
                      <span className={cn('text-xs font-medium', typeConfig.color.split(' ')[0])}>
                        {typeConfig.label}
                      </span>
                      {entry.severity !== 'info' && (
                        <SeverityIcon className={cn('w-3.5 h-3.5', severityConfig.color)} />
                      )}
                    </div>
                    <p className="text-sm text-gray-900 truncate mt-0.5">
                      {entry.title}
                    </p>
                    {entry.body && entry.type === 'COMPUTE' && entry.body.compute?.risk && (
                      <div className="flex gap-3 mt-1 text-xs text-gray-500">
                        <span>Risk: {entry.body.compute.risk.score}</span>
                        {entry.body.compute.recovery?.p50 && (
                          <span>Recovery: ₺{entry.body.compute.recovery.p50.toLocaleString('tr-TR')}</span>
                        )}
                      </div>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
                </button>
              );
            })}
          </div>
        )}

        {/* Load More */}
        {nextCursor && !loading && (
          <div className="p-4">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => fetchTimeline(nextCursor)}
              disabled={loadingMore}
            >
              {loadingMore ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Daha Fazla Yükle
            </Button>
          </div>
        )}
      </div>

      {/* Detail Drawer */}
      {selectedEntry && (
        <TimelineDetailDrawer
          entry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
        />
      )}
    </div>
  );
}


// Detail Drawer Component
interface TimelineDetailDrawerProps {
  entry: TimelineEntry;
  onClose: () => void;
}

function TimelineDetailDrawer({ entry, onClose }: TimelineDetailDrawerProps) {
  const typeConfig = TYPE_CONFIG[entry.type];
  const TypeIcon = typeConfig.icon;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/20" 
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className="relative w-full max-w-md bg-white shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <div className={cn('p-1.5 rounded', typeConfig.color)}>
              <TypeIcon className="w-4 h-4" />
            </div>
            <span className="font-medium text-sm">{typeConfig.label}</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Title */}
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wide">Başlık</label>
            <p className="text-sm font-medium mt-1">{entry.title}</p>
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide">Zaman</label>
              <p className="text-sm mt-1">
                {new Date(entry.ts).toLocaleString('tr-TR')}
              </p>
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide">Kaynak</label>
              <p className="text-sm mt-1">{SOURCE_LABELS[entry.source]}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide">Önem</label>
              <p className={cn('text-sm mt-1 capitalize', SEVERITY_CONFIG[entry.severity].color)}>
                {entry.severity}
              </p>
            </div>
            {entry.run_id && (
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wide">Run ID</label>
                <p className="text-sm mt-1 font-mono text-xs truncate">{entry.run_id}</p>
              </div>
            )}
          </div>

          {/* Body - Type specific rendering */}
          {entry.body && (
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide">Detay</label>
              <div className="mt-2">
                {entry.type === 'COMPUTE' && entry.body.compute ? (
                  <ComputeDetail compute={entry.body.compute} inputs={entry.body.inputs} />
                ) : entry.type === 'DECISION' && entry.body.if ? (
                  <DecisionDetail body={entry.body} />
                ) : (
                  <pre className="text-xs bg-gray-50 p-3 rounded overflow-x-auto">
                    {JSON.stringify(entry.body, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Compute Detail Component
function ComputeDetail({ compute, inputs }: { compute: any; inputs?: any }) {
  return (
    <div className="space-y-3">
      {/* Risk */}
      {compute.risk && (
        <div className="bg-gray-50 p-3 rounded">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Risk Skoru</span>
            <span className={cn(
              'text-lg font-bold',
              compute.risk.score >= 80 ? 'text-red-600' :
              compute.risk.score >= 50 ? 'text-amber-600' : 'text-green-600'
            )}>
              {compute.risk.score}
            </span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs text-gray-500">Band</span>
            <span className="text-sm font-medium">{compute.risk.band}</span>
          </div>
          {compute.risk.model && (
            <div className="text-xs text-gray-400 mt-1">Model: {compute.risk.model}</div>
          )}
        </div>
      )}

      {/* Recovery */}
      {compute.recovery && (
        <div className="bg-gray-50 p-3 rounded">
          <div className="text-xs text-gray-500 mb-2">Tahsilat Tahmini</div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {compute.recovery.expected && (
              <div>
                <span className="text-gray-500">Beklenen:</span>
                <span className="ml-1 font-medium">₺{compute.recovery.expected.toLocaleString('tr-TR')}</span>
              </div>
            )}
            {compute.recovery.p50 && (
              <div>
                <span className="text-gray-500">P50:</span>
                <span className="ml-1 font-medium">₺{compute.recovery.p50.toLocaleString('tr-TR')}</span>
              </div>
            )}
            {compute.recovery.p90 && (
              <div>
                <span className="text-gray-500">P90:</span>
                <span className="ml-1 font-medium">₺{compute.recovery.p90.toLocaleString('tr-TR')}</span>
              </div>
            )}
            {compute.recovery.eta_days && (
              <div>
                <span className="text-gray-500">Süre:</span>
                <span className="ml-1 font-medium">{compute.recovery.eta_days} gün</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Inputs */}
      {inputs && Object.keys(inputs).length > 0 && (
        <div className="bg-gray-50 p-3 rounded">
          <div className="text-xs text-gray-500 mb-2">Girdiler</div>
          <div className="space-y-1 text-sm">
            {Object.entries(inputs).map(([key, value]) => (
              <div key={key} className="flex justify-between">
                <span className="text-gray-500">{key}:</span>
                <span className="font-medium">{String(value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Decision Detail Component
function DecisionDetail({ body }: { body: any }) {
  return (
    <div className="space-y-3">
      {/* Condition */}
      <div className="bg-amber-50 p-3 rounded">
        <div className="text-xs text-amber-600 mb-1">Koşul</div>
        <code className="text-sm font-mono">{body.if}</code>
      </div>

      {/* Because */}
      {body.because && body.because.length > 0 && (
        <div className="bg-gray-50 p-3 rounded">
          <div className="text-xs text-gray-500 mb-2">Gerekçe</div>
          <ul className="space-y-1">
            {body.because.map((reason: string, i: number) => (
              <li key={i} className="text-sm flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                {reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      {body.actions && body.actions.length > 0 && (
        <div className="bg-indigo-50 p-3 rounded">
          <div className="text-xs text-indigo-600 mb-2">Aksiyonlar</div>
          <div className="space-y-2">
            {body.actions.map((action: any, i: number) => (
              <div key={i} className="text-sm flex items-center gap-2">
                <Mail className="w-4 h-4 text-indigo-500" />
                <span className="font-medium">{action.type}</span>
                {action.queue && (
                  <span className="text-gray-500">→ {action.queue}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default DecisionTimeline;
