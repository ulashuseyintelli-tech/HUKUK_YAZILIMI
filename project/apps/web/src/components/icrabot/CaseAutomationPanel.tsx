'use client';

import { useState, useEffect } from 'react';
import { ActionError } from '@/components/ui/action-error';
import { toActionErrorMessage } from '@/lib/action-error';
import { runMutation, runRefreshOnly } from '@/lib/mutation-outcome';
import { useKeyedSubmitLock } from '@/lib/use-submit-lock';
import { 
  Bot, 
  Play, 
  Square, 
  CheckCircle, 
  Clock, 
  AlertTriangle,
  Zap,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  FileCheck,
  Search,
  Lock,
  DollarSign,
  Mail,
} from 'lucide-react';
import { Card, Badge, Button, Spinner } from '@hukuk/ui';
import { 
  icrabotApi, 
  DigitalTwin, 
  NextBestAction, 
  BotTask,
  EvidenceReport,
} from '@/lib/api/icrabot';
import { cn } from '@/lib/utils';

interface CaseAutomationPanelProps {
  caseId: string;
  className?: string;
}

export function CaseAutomationPanel({ caseId, className }: CaseAutomationPanelProps) {
  const [twin, setTwin] = useState<DigitalTwin | null>(null);
  const [tasks, setTasks] = useState<BotTask[]>([]);
  const [evidence, setEvidence] = useState<EvidenceReport | null>(null);
  const [loading, setLoading] = useState(true);
  // PR-2A1: onay hatasi GORUNUR; icrabot gorev onayi sessizce kaybolamaz.
  const [actionError, setActionError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [staleNotice, setStaleNotice] = useState<string | null>(null);
  const [refreshingStale, setRefreshingStale] = useState(false);
  const rowLock = useKeyedSubmitLock();
  const handleStaleRefresh = async () => {
    setRefreshingStale(true);
    const ok = await runRefreshOnly(() => loadData({ propagateError: true }));
    setRefreshingStale(false);
    if (ok) setStaleNotice(null);
  };
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    loadData();
  }, [caseId]);

  // PR-2A1 DEPENDENCY_FIXED: okuma hatasi YUTULMAZ; panel sessizce bos kalamaz.
  const loadData = async (opts?: { propagateError?: boolean }): Promise<void> => {
    setLoading(true);
    setLoadError(null);
    try {
      const [twinRes, tasksRes] = await Promise.all([
        icrabotApi.getDigitalTwin(caseId),
        icrabotApi.getPendingTasks(caseId),
      ]);
      setTwin(twinRes.data);
      setTasks(tasksRes.data);
    } catch (err) {
      setLoadError(toActionErrorMessage(err, 'Otomasyon verisi yüklenemedi.'));
      if (opts?.propagateError) throw err;
    } finally {
      setLoading(false);
    }
  };

  const loadEvidence = async () => {
    try {
      const { data } = await icrabotApi.getEvidenceReport(caseId);
      setEvidence(data);
    } catch (err) {
      console.error('Kanıt raporu yüklenemedi:', err);
    }
  };

  const handleStartAutomation = async () => {
    setActionLoading('start');
    try {
      await icrabotApi.startAutomation(caseId);
      await loadData();
    } catch (err) {
      console.error('Otomasyon başlatılamadı:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleStopAutomation = async () => {
    setActionLoading('stop');
    try {
      await icrabotApi.stopAutomation(caseId);
      await loadData();
    } catch (err) {
      console.error('Otomasyon durdurulamadı:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRunRecipe = async (recipeId: string) => {
    setActionLoading(recipeId);
    try {
      await icrabotApi.runRecipe(caseId, recipeId);
      await loadData();
    } catch (err) {
      console.error('Tarif çalıştırılamadı:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleApproveTask = async (taskId: string) => {
    setActionError(null);
    setStaleNotice(null);
    // PR-2A1: gorev bazli kilit — ayni goreve ayni-tick ikinci onay HIC baslamaz;
    // farkli gorevler bloklanmaz. Onay yalniz dogrulanmis sonucla yansitilir.
    await rowLock.run(`icrabot:approve:${taskId}`, async () => {
      setActionLoading(taskId);
      try {
        const outcome = await runMutation({
          mutate: () => icrabotApi.approveTask(taskId),
          refresh: () => loadData({ propagateError: true }),
          failureMessage: 'Görev onaylanamadı. Görev BEKLEMEDE kaldı, lütfen tekrar deneyin.',
          staleMessage: 'Görev ONAYLANDI, ancak panel yenilenemedi.',
        });
        if (!rowLock.isMounted()) return;
        if (outcome.status === 'FAILED') {
          setActionError(outcome.error.message);
          return; // gorev satiri KORUNUR
        }
        if (outcome.status === 'SUCCESS_STALE') setStaleNotice(outcome.stale);
      } finally {
        if (rowLock.isMounted()) setActionLoading(null);
      }
    });
  };

  if (loading) {
    return (
      <Card className={cn('p-4', className)}>
        <div className="flex items-center justify-center h-32">
          <Spinner />
        </div>
      </Card>
    );
  }

  return (
    <Card className={cn('overflow-hidden', className)}>
      {/* PR-2A1: okuma ve onay hatalari GORUNUR. */}
      <ActionError message={loadError} />
      <ActionError message={actionError} />
      {staleNotice ? (
        <div role="status" data-testid="stale-notice" className="mb-2 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <span className="flex-1">{staleNotice}</span>
          <button type="button" onClick={handleStaleRefresh} disabled={refreshingStale} data-testid="stale-refresh" className="shrink-0 rounded border border-amber-300 px-1.5 py-0.5 font-medium hover:bg-amber-100 disabled:opacity-50">
            Paneli yenile
          </button>
        </div>
      ) : null}
      {/* Header */}
      <div 
        className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-purple-50 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white rounded-lg shadow-sm">
            <Bot className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-medium">İcrabot Otomasyon</h3>
            <p className="text-xs text-gray-500">
              Aşama: <StageLabel stage={twin?.stage || 'ACILIS'} />
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {twin?.nextActions && twin.nextActions.length > 0 && (
            <Badge className="bg-blue-100 text-blue-700">
              {twin.nextActions.length} öneri
            </Badge>
          )}
          {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </div>
      </div>

      {expanded && (
        <div className="p-4 space-y-4">
          {/* Quick Actions */}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleStartAutomation}
              disabled={actionLoading !== null}
            >
              {actionLoading === 'start' ? <Spinner size="sm" /> : <Play className="w-4 h-4 mr-1" />}
              Başlat
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleStopAutomation}
              disabled={actionLoading !== null}
            >
              {actionLoading === 'stop' ? <Spinner size="sm" /> : <Square className="w-4 h-4 mr-1" />}
              Durdur
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void loadData()}
              disabled={actionLoading !== null}
            >
              <RefreshCw className="w-4 h-4 mr-1" />
              Yenile
            </Button>
          </div>

          {/* Status Cards */}
          <div className="grid grid-cols-2 gap-3">
            <StatusCard
              icon={Mail}
              label="Tebligat"
              status={twin?.tebligatStatus?.type || 'Bekliyor'}
              detail={twin?.tebligatStatus?.deliveredAt ? 'Teslim edildi' : 'Devam ediyor'}
              color="blue"
            />
            <StatusCard
              icon={FileCheck}
              label="Kesinleşme"
              status={twin?.finalization?.isFinalized ? 'Kesinleşti' : 'Bekliyor'}
              detail={twin?.finalization?.isCandidate ? 'Aday' : ''}
              color={twin?.finalization?.isFinalized ? 'green' : 'yellow'}
            />
            <StatusCard
              icon={Search}
              label="Varlık"
              status={twin?.assetProfile?.hasAssets ? 'Bulundu' : 'Sorgulanmadı'}
              detail={twin?.assetProfile?.assetTypes?.join(', ') || ''}
              color={twin?.assetProfile?.hasAssets ? 'green' : 'gray'}
            />
            <StatusCard
              icon={Lock}
              label="Haciz"
              status="Bekliyor"
              detail=""
              color="gray"
            />
          </div>

          {/* Next Best Actions */}
          {twin?.nextActions && twin.nextActions.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Önerilen İşlemler</h4>
              <div className="space-y-2">
                {twin.nextActions.slice(0, 3).map((action) => (
                  <ActionCard
                    key={action.recipeId}
                    action={action}
                    onRun={() => handleRunRecipe(action.recipeId)}
                    loading={actionLoading === action.recipeId}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Pending Tasks */}
          {tasks.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Bekleyen Görevler</h4>
              <div className="space-y-2">
                {tasks.slice(0, 3).map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onApprove={() => handleApproveTask(task.id)}
                    loading={actionLoading === task.id}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Evidence Summary */}
          {evidence && (
            <div className="p-3 bg-gray-50 rounded-lg">
              <h4 className="text-sm font-medium mb-2">Kanıt Özeti</h4>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <p className="text-lg font-bold">{evidence.summary.tebligat}</p>
                  <p className="text-xs text-gray-500">Tebligat</p>
                </div>
                <div>
                  <p className="text-lg font-bold">{evidence.summary.assetQuery}</p>
                  <p className="text-xs text-gray-500">Varlık</p>
                </div>
                <div>
                  <p className="text-lg font-bold">{evidence.summary.finalization}</p>
                  <p className="text-xs text-gray-500">Kesinleşme</p>
                </div>
                <div>
                  <p className="text-lg font-bold">{evidence.totalEvidence}</p>
                  <p className="text-xs text-gray-500">Toplam</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// Stage Label Component
function StageLabel({ stage }: { stage: string }) {
  const stageLabels: Record<string, { label: string; color: string }> = {
    ACILIS: { label: 'Açılış', color: 'text-gray-600' },
    TEBLIGAT: { label: 'Tebligat', color: 'text-blue-600' },
    KESINLESME: { label: 'Kesinleşme', color: 'text-purple-600' },
    VARLIK: { label: 'Varlık', color: 'text-orange-600' },
    HACIZ: { label: 'Haciz', color: 'text-red-600' },
    TAHSILAT: { label: 'Tahsilat', color: 'text-green-600' },
    SATIS: { label: 'Satış', color: 'text-yellow-600' },
    KAPANIS: { label: 'Kapanış', color: 'text-gray-600' },
  };

  const { label, color } = stageLabels[stage] || { label: stage, color: 'text-gray-600' };
  return <span className={cn('font-medium', color)}>{label}</span>;
}

// Status Card Component
function StatusCard({ 
  icon: Icon, 
  label, 
  status, 
  detail, 
  color 
}: { 
  icon: any; 
  label: string; 
  status: string; 
  detail: string; 
  color: 'blue' | 'green' | 'yellow' | 'gray';
}) {
  const colorClasses = {
    blue: 'bg-blue-50 border-blue-200',
    green: 'bg-green-50 border-green-200',
    yellow: 'bg-yellow-50 border-yellow-200',
    gray: 'bg-gray-50 border-gray-200',
  };

  return (
    <div className={cn('p-3 rounded-lg border', colorClasses[color])}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-gray-600" />
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <p className="text-sm font-medium">{status}</p>
      {detail && <p className="text-xs text-gray-500 truncate">{detail}</p>}
    </div>
  );
}

// Action Card Component
function ActionCard({ 
  action, 
  onRun, 
  loading 
}: { 
  action: NextBestAction; 
  onRun: () => void; 
  loading: boolean;
}) {
  const priorityColors: Record<string, string> = {
    CRITICAL: 'border-red-300 bg-red-50',
    HIGH: 'border-orange-300 bg-orange-50',
    MEDIUM: 'border-blue-300 bg-blue-50',
    LOW: 'border-gray-300 bg-gray-50',
  };

  return (
    <div className={cn('p-3 rounded-lg border', priorityColors[action.priority])}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{action.recipeName}</p>
          <p className="text-xs text-gray-500">{action.reason}</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={onRun}
          disabled={loading}
        >
          {loading ? <Spinner size="sm" /> : <Zap className="w-4 h-4" />}
        </Button>
      </div>
      {action.requiresApproval && (
        <Badge className="mt-2 text-xs bg-orange-100 text-orange-700">
          Onay Gerekli
        </Badge>
      )}
    </div>
  );
}

// Task Card Component
function TaskCard({ 
  task, 
  onApprove, 
  loading 
}: { 
  task: BotTask; 
  onApprove: () => void; 
  loading: boolean;
}) {
  const needsApproval = task.status === 'NEEDS_APPROVAL';

  return (
    <div className="p-3 rounded-lg border bg-gray-50">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{task.recipeId}</p>
          <p className="text-xs text-gray-500">
            {task.status === 'NEEDS_APPROVAL' ? 'Onay bekliyor' : task.status}
          </p>
        </div>
        {needsApproval && (
          <Button
            size="sm"
            onClick={onApprove}
            disabled={loading}
          >
            {loading ? <Spinner size="sm" /> : <CheckCircle className="w-4 h-4 mr-1" />}
            Onayla
          </Button>
        )}
      </div>
    </div>
  );
}

export default CaseAutomationPanel;
