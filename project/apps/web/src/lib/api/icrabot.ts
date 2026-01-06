import { apiClient } from './client';

/**
 * ICRABOT API
 * 
 * Otomasyon sistemi için API client.
 * v3: İcra türü bazlı akışlar, debtor-scoped işlemler.
 */

// v3: İcra türleri
export type IcraType = 'ILAMSIZ' | 'ILAMLI' | 'KAMBIYO' | 'KIRA' | 'MTS' | 'DIGER';

// v3: Tebligat kanalları
export type TebligatChannel = 'E_TEBLIGAT' | 'FIZIKI' | 'KARMA';

// v3: Tebligat sonuçları
export type TebligatOutcome = 
  | 'GONDERILDI' 
  | 'KUTUDA' 
  | 'OKUNDU' 
  | 'TEBLIG_SAYILDI' 
  | 'MAZBATA_OLUSTU' 
  | 'IADE' 
  | 'BILA' 
  | 'TEKRAR' 
  | 'IPTAL' 
  | 'HATA';

// Types
export interface Recipe {
  id: string;
  name: string;
  description?: string;
  stageTags: string[];
  priority?: string;
  requiresApproval?: boolean;
  isActive: boolean;
}

export interface NextBestAction {
  caseId: string;
  recipeId: string;
  recipeName: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
  requiresApproval: boolean;
  canAutoExecute: boolean;
}

export interface BotTask {
  id: string;
  recipeId: string;
  caseId: string;
  status: string;
  priority: string;
  scheduledAt: string;
  startedAt?: string;
  completedAt?: string;
  attemptCount: number;
  lastError?: string;
  requiresApproval: boolean;
  case?: { fileNumber: string };
}

export interface QueueStats {
  pending: number;
  queued: number;
  running: number;
  needsApproval: number;
  failed: number;
  completedToday: number;
}

export interface Dashboard {
  queueStats: QueueStats;
  recentTasks: BotTask[];
  activeCases: number;
  todayActions: number;
}

export interface DigitalTwin {
  caseId: string;
  tenantId: string;
  uyapDosyaNo?: string;
  icraType: IcraType; // v3
  stage: string;
  lastSyncAt?: string;
  nextActions: NextBestAction[];
  tebligatStatus?: {
    type: string;
    sentAt?: string;
    deliveredAt?: string;
    mazbataExists: boolean;
  };
  finalization?: {
    isCandidate: boolean;
    isFinalized: boolean;
  };
  assetProfile?: {
    hasAssets: boolean;
    assetTypes: string[];
  };
  // v3: Borçlu bazlı tebligat durumları
  debtorStatuses?: DebtorTebligatStatus[];
}

// v3: Borçlu tebligat durumu
export interface DebtorTebligatStatus {
  debtorId: string;
  debtorName: string;
  channel: TebligatChannel;
  eDeliveredDate?: string;
  eReadDate?: string;
  eMazbataExists: boolean;
  physicalSentDate?: string;
  physicalDeliveredDate?: string;
  physicalOutcome?: TebligatOutcome;
  serviceEffectiveDate?: string;
  isServed: boolean;
}

export interface EvidenceReport {
  caseId: string;
  generatedAt: string;
  totalEvidence: number;
  summary: {
    tebligat: number;
    assetQuery: number;
    finalization: number;
    other: number;
  };
  timeline: Array<{
    date: string;
    action: string;
    description: string;
    hash: string;
  }>;
}

// API Functions
export const icrabotApi = {
  /**
   * Dashboard verisi
   */
  getDashboard: () => 
    apiClient.get<Dashboard>('/icrabot/dashboard'),

  /**
   * Kuyruk istatistikleri
   */
  getQueueStats: () => 
    apiClient.get<QueueStats>('/icrabot/queue/stats'),

  /**
   * Tüm recipe'leri listele
   */
  getRecipes: () => 
    apiClient.get<Recipe[]>('/icrabot/recipes'),

  /**
   * Dosya için dijital ikiz
   */
  getDigitalTwin: (caseId: string) => 
    apiClient.get<DigitalTwin>(`/icrabot/cases/${caseId}/twin`),

  /**
   * Dosya için Next Best Actions
   */
  getNextBestActions: (caseId: string) => 
    apiClient.get<NextBestAction[]>(`/icrabot/cases/${caseId}/next-actions`),

  /**
   * Dosya için bekleyen görevler
   */
  getPendingTasks: (caseId: string) => 
    apiClient.get<BotTask[]>(`/icrabot/cases/${caseId}/tasks`),

  /**
   * Dosya için kanıt raporu
   */
  getEvidenceReport: (caseId: string) => 
    apiClient.get<EvidenceReport>(`/icrabot/cases/${caseId}/evidence`),

  /**
   * Otomasyonu başlat
   */
  startAutomation: (caseId: string) => 
    apiClient.post<{ tasksEnqueued: number; tasks: string[] }>(
      `/icrabot/cases/${caseId}/start`
    ),

  /**
   * Otomasyonu durdur
   */
  stopAutomation: (caseId: string) => 
    apiClient.post<{ success: boolean }>(`/icrabot/cases/${caseId}/stop`),

  /**
   * Recipe'yi manuel çalıştır
   */
  runRecipe: (caseId: string, recipeId: string) => 
    apiClient.post<{ taskId: string }>(
      `/icrabot/cases/${caseId}/run/${recipeId}`
    ),

  /**
   * Görevi onayla
   */
  approveTask: (taskId: string) => 
    apiClient.post<{ success: boolean }>(`/icrabot/tasks/${taskId}/approve`),

  /**
   * Görevi iptal et
   */
  cancelTask: (taskId: string, reason?: string) => 
    apiClient.post<{ success: boolean }>(
      `/icrabot/tasks/${taskId}/cancel`,
      { reason }
    ),

  // Kısa yol fonksiyonları
  checkEtebligat: (caseId: string) => 
    apiClient.post<{ taskId: string }>(`/icrabot/cases/${caseId}/check-etebligat`),

  checkFinalization: (caseId: string) => 
    apiClient.post<{ taskId: string }>(`/icrabot/cases/${caseId}/check-finalization`),

  runAssetQueries: (caseId: string) => 
    apiClient.post<{ taskId: string }>(`/icrabot/cases/${caseId}/run-asset-queries`),

  syncSafahat: (caseId: string) => 
    apiClient.post<{ taskId: string }>(`/icrabot/cases/${caseId}/sync-safahat`),

  // State Machine
  processEvent: (caseId: string, event: string, context?: Record<string, any>) =>
    apiClient.post<{
      success: boolean;
      previousStage?: string;
      newStage?: string;
      actionsTriggered?: string[];
      message: string;
    }>(`/icrabot/cases/${caseId}/transition`, { event, context }),

  getAvailableTransitions: (caseId: string) =>
    apiClient.get<{
      currentStage: string;
      transitions: Array<{
        event: string;
        targetStage: string;
        description: string;
      }>;
    }>(`/icrabot/cases/${caseId}/transitions`),

  getStageMetadata: () =>
    apiClient.get<Record<string, {
      name: string;
      description: string;
      color: string;
      icon: string;
      order: number;
    }>>('/icrabot/stages'),

  // ==================== v3: İCRA TÜRÜ BAZLI ====================

  /**
   * İcra türüne göre stage akışını getir
   */
  getStageFlow: (icraType: string) =>
    apiClient.get<{
      icraType: string;
      description: string;
      stages: string[];
      stageRequirements: Record<string, {
        requiredEvents?: string[];
        optionalEvents?: string[];
        gatingRule?: string;
      }>;
      notes?: string[];
    }>(`/icrabot/stage-flows/${icraType}`),

  /**
   * İcra türüne göre kesinleşme gerekli mi?
   */
  requiresFinalization: (icraType: string) =>
    apiClient.get<{
      icraType: string;
      requiresFinalization: boolean;
    }>(`/icrabot/requires-finalization/${icraType}`),

  /**
   * İcra türüne göre itiraz süresini getir
   */
  getObjectionDeadline: (icraType: string) =>
    apiClient.get<{
      icraType: string;
      objectionDeadlineDays: number;
    }>(`/icrabot/objection-deadline/${icraType}`),

  /**
   * Sistem parametrelerini getir
   */
  getParams: () =>
    apiClient.get<{
      tebligat: {
        eTebligatDeemedDays: number;
        poll: {
          afterSentFirst24hMinutes: number;
          after24hHours: number;
        };
      };
      kesinlesme: {
        defaultObjectionDeadlineDays: number;
        overrides: Record<string, { objectionDeadlineDays: number }>;
      };
      varlik: {
        scoreThresholdHigh: number;
        scoreThresholdLow: number;
        requeryDays: number;
      };
      parallelism: {
        debtorConcurrency: number;
        perCaseConcurrency: number;
      };
    }>('/icrabot/params'),

  /**
   * Borçlu için tebligat kanalını belirle
   */
  determineChannel: (data: {
    hasUetsAddress: boolean;
    hasPhysicalAddress: boolean;
    requiresPhysicalCopy?: boolean;
  }) =>
    apiClient.post<{
      channel: string;
      displayName: string;
    }>('/icrabot/determine-channel', data),

  // ==================== v2: UI MAP ====================

  /**
   * Tüm UYAP ekran ID'lerini getir
   */
  getUyapScreenIds: () =>
    apiClient.get<{ screens: string[] }>('/icrabot/ui-map/screens'),

  /**
   * UYAP ekran bilgisini getir
   */
  getUyapScreen: (screenId: string) =>
    apiClient.get<{
      id: string;
      name: string;
      navPath: string[];
      fields?: Record<string, {
        id: string;
        label: string;
        type: string;
        required?: boolean;
      }>;
      table?: {
        rowsSelector: string;
        columns: Record<string, {
          id: string;
          label: string;
          type: string;
        }>;
      };
      actions?: Record<string, {
        id: string;
        label: string;
        type: string;
        requiresSelection?: boolean;
      }>;
      outputs?: Record<string, string>;
    }>(`/icrabot/ui-map/screens/${screenId}`),
};

// ==================== v28: DECISION TIMELINE ====================

// v28 Timeline Types
export type TimelineEntryType = 'UYAP_EVENT' | 'FACT_WRITE' | 'COMPUTE' | 'DECISION' | 'ACTION' | 'OUTCOME' | 'NOTE';
export type TimelineSeverity = 'info' | 'warn' | 'critical';
export type TimelineSource = 'uyap' | 'engine' | 'user' | 'system';

export interface TimelineEntry {
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

export interface TimelinePageResponse {
  next_cursor: string | null;
  items: TimelineEntry[];
}

export interface EngineRun {
  run_id: string;
  case_id: string;
  rule_id: string;
  trigger_event_id: string | null;
  snapshot_hash: string;
  status: 'started' | 'succeeded' | 'failed';
  started_at: string;
  finished_at: string | null;
  compute_summary: Record<string, any> | null;
  error: Record<string, any> | null;
}

export interface OutboxAction {
  action_id: string;
  run_id: string | null;
  case_id: string;
  action_type: string;
  idempotency_key: string;
  payload: Record<string, any>;
  status: 'pending' | 'sent' | 'done' | 'failed' | 'dead';
  attempt_count: number;
  last_error: Record<string, any> | null;
  next_retry_at: string | null;
  created_at: string;
  updated_at: string | null;
}

// v28 API Functions
export const v28Api = {
  // Timeline
  getTimeline: (caseId: string, params?: { cursor?: string; limit?: number; type?: TimelineEntryType; severity?: TimelineSeverity; source?: TimelineSource }) => {
    const searchParams = new URLSearchParams();
    if (params?.cursor) searchParams.set('cursor', params.cursor);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.type) searchParams.set('type', params.type);
    if (params?.severity) searchParams.set('severity', params.severity);
    if (params?.source) searchParams.set('source', params.source);
    return apiClient.get<TimelinePageResponse>(`/icrabot/v28/timeline/${caseId}?${searchParams}`);
  },

  getTimelineStats: (caseId: string) =>
    apiClient.get<Record<string, number>>(`/icrabot/v28/timeline/${caseId}/stats`),

  getTimelineSummary: (caseId: string, days = 7) =>
    apiClient.get<{
      totalEntries: number;
      byType: Record<string, number>;
      bySeverity: Record<string, number>;
      lastActivity: string | null;
    }>(`/icrabot/v28/timeline/${caseId}/summary?days=${days}`),

  // Engine Runs
  getEngineRun: (runId: string) =>
    apiClient.get<EngineRun>(`/icrabot/v28/runs/${runId}`),

  getEngineRunsByCaseId: (caseId: string, params?: { status?: string; ruleId?: string; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.ruleId) searchParams.set('ruleId', params.ruleId);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    return apiClient.get<EngineRun[]>(`/icrabot/v28/runs/case/${caseId}?${searchParams}`);
  },

  getEngineRunStats: (days = 7) =>
    apiClient.get<{
      total: number;
      succeeded: number;
      failed: number;
      avgDurationMs: number;
    }>(`/icrabot/v28/runs/stats?days=${days}`),

  // Actions
  getAction: (actionId: string) =>
    apiClient.get<OutboxAction>(`/icrabot/v28/actions/${actionId}`),

  // Outbox
  getOutboxStats: () =>
    apiClient.get<Record<string, number>>('/icrabot/v28/outbox/stats'),

  getPendingActions: (limit = 100) =>
    apiClient.get<OutboxAction[]>(`/icrabot/v28/outbox/pending?limit=${limit}`),

  getDeadLetterQueue: (limit = 100) =>
    apiClient.get<OutboxAction[]>(`/icrabot/v28/outbox/dead-letter?limit=${limit}`),

  getActionsByCaseId: (caseId: string, params?: { status?: string; actionType?: string; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.actionType) searchParams.set('actionType', params.actionType);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    return apiClient.get<OutboxAction[]>(`/icrabot/v28/outbox/case/${caseId}?${searchParams}`);
  },

  processOutbox: (limit = 10) =>
    apiClient.post<{ processed: number }>(`/icrabot/v28/outbox/process?limit=${limit}`),

  retryAction: (actionId: string) =>
    apiClient.post<{ success: boolean }>(`/icrabot/v28/outbox/${actionId}/retry`),

  // Facts
  getFactSnapshot: (caseId: string) =>
    apiClient.get<{ facts: Record<string, any>; flags: Record<string, boolean> }>(`/icrabot/v28/facts/${caseId}`),

  // Rules
  getActiveRules: (packName?: string) => {
    const params = packName ? `?pack=${encodeURIComponent(packName)}` : '';
    return apiClient.get<{ 
      pack?: string;
      count: number; 
      items?: Array<{ pack: string; rule_key: string; revision_id: string; version: number; sha256: string }>;
      rules?: Array<{ rule_id: string; version: number; when: string }>;
    }>(`/icrabot/v28/rules/active${params}`);
  },

  listRulePacks: () =>
    apiClient.get<{ packs: Array<{ id: string; name: string; ruleCount: number }> }>('/icrabot/v28/rules/packs'),

  reloadRules: (packName?: string) =>
    apiClient.post<{ reloaded: boolean; pack?: string; count: number }>('/icrabot/v28/rules/reload', packName ? { pack: packName } : {}),

  // Compute
  listComputeEngines: () =>
    apiClient.get<{ engines: string[] }>('/icrabot/v28/compute/engines'),

  runComputeEngine: (engineName: string, input: Record<string, any>) =>
    apiClient.post<{ engine: string; result: Record<string, any> }>(`/icrabot/v28/compute/${engineName}`, input),

  // Events
  ingestEvent: (event: { event_type: string; case_id: string; payload: Record<string, any>; ts?: string }) =>
    apiClient.post<{ event_id: string; facts_written: number; rules_triggered: number }>('/icrabot/v28/events', event),

  ingestEventBatch: (events: Array<{ event_type: string; case_id: string; payload: Record<string, any>; ts?: string }>) =>
    apiClient.post<{ processed: number; results: Array<{ event_id: string; facts_written: number; rules_triggered: number }> }>('/icrabot/v28/events/batch', events),

  // ==================== v28_factstore_actions EXTENSIONS ====================

  // FactStore Extended API
  batchWriteFacts: (caseId: string, data: { facts?: Record<string, any>; flags?: Record<string, boolean>; meta?: Record<string, any> }) =>
    apiClient.post<{ factsWritten: number; flagsWritten: number; auditsCreated: number }>(`/icrabot/v28/facts/${caseId}/batch`, data),

  setFact: (caseId: string, key: string, value: any, meta?: Record<string, any>) =>
    apiClient.post<{ ok: boolean; key: string; value: any }>(`/icrabot/v28/facts/${caseId}/fact/${key}`, { value, meta }),

  setFlag: (caseId: string, key: string, value: boolean, meta?: Record<string, any>) =>
    apiClient.post<{ ok: boolean; key: string; value: boolean }>(`/icrabot/v28/facts/${caseId}/flag/${key}`, { value, meta }),

  getFactsByPattern: (caseId: string, pattern: string) =>
    apiClient.get<Record<string, any>>(`/icrabot/v28/facts/${caseId}/pattern/${encodeURIComponent(pattern)}`),

  getKeyAuditHistory: (caseId: string, key: string, limit = 50) =>
    apiClient.get<Array<{ id: string; key: string; oldValue: any; newValue: any; kind: string; meta: any; createdAt: string }>>(`/icrabot/v28/facts/${caseId}/audit/${key}?limit=${limit}`),

  incrementFact: (caseId: string, key: string, delta: number, meta?: Record<string, any>) =>
    apiClient.post<{ ok: boolean; key: string; value: number }>(`/icrabot/v28/facts/${caseId}/increment/${key}`, { delta, meta }),

  appendToFact: (caseId: string, key: string, item: any, meta?: Record<string, any>) =>
    apiClient.post<{ ok: boolean; key: string; value: any[] }>(`/icrabot/v28/facts/${caseId}/append/${key}`, { item, meta }),

  clearCaseFacts: (caseId: string, meta?: Record<string, any>) =>
    apiClient.post<{ ok: boolean; caseId: string }>(`/icrabot/v28/facts/${caseId}/clear`, { meta }),

  getCasesWithFlag: (key: string, value = true) =>
    apiClient.get<{ key: string; value: boolean; caseIds: string[]; count: number }>(`/icrabot/v28/facts/by-flag/${key}?value=${value}`),

  getBulkSnapshots: (caseIds: string[]) =>
    apiClient.post<Record<string, { facts: Record<string, any>; flags: Record<string, boolean> }>>('/icrabot/v28/facts/bulk-snapshot', { caseIds }),

  // Action Handler Extended API
  processRetryableActions: (limit = 10) =>
    apiClient.post<{
      processed: number;
      success: number;
      failed: number;
      results: Array<{ success: boolean; actionId: string; actionType: string; error?: string; retryScheduled?: boolean; deadLettered?: boolean }>;
    }>(`/icrabot/v28/outbox/process-retryable?limit=${limit}`),

  getRegisteredHandlers: () =>
    apiClient.get<{ handlers: string[] }>('/icrabot/v28/outbox/handlers'),

  getHandlerStats: () =>
    apiClient.get<Record<string, { total: number; success: number; failed: number }>>('/icrabot/v28/outbox/handler-stats'),

  getActiveLocks: () =>
    apiClient.get<{ locks: Array<{ key: string; expiresAt: number; owner?: string }> }>('/icrabot/v28/outbox/locks'),

  executeActionDirectly: (actionType: string, payload: Record<string, any>, caseId: string) =>
    apiClient.post<{ ok: boolean; actionType: string; caseId: string }>('/icrabot/v28/outbox/execute-direct', { actionType, payload, caseId }),

  dispatchActionBatch: (actionIds: string[]) =>
    apiClient.post<{
      processed: number;
      success: number;
      failed: number;
      results: Array<{ success: boolean; actionId: string; actionType: string; error?: string }>;
    }>('/icrabot/v28/outbox/dispatch-batch', { actionIds }),

  // ==================== v28_ops_bundle: POLICY GATE ====================

  // Policy Rules
  getPolicyRules: () =>
    apiClient.get<{ rules: PolicyRule[] }>('/icrabot/v28/policy/rules'),

  evaluatePolicy: (caseId: string, actionType: string, payload: Record<string, any>) =>
    apiClient.post<PolicyEvalResult>('/icrabot/v28/policy/evaluate', { caseId, actionType, payload }),

  addPolicyRule: (rule: {
    name: string;
    priority: number;
    actionType?: string;
    expr: string;
    decision: 'ALLOW' | 'DENY' | 'MANUAL';
    manualActionType?: string;
    manualPayload?: Record<string, any>;
    note?: string;
  }) =>
    apiClient.post<PolicyRule>('/icrabot/v28/policy/rules', rule),

  disablePolicyRule: (id: string) =>
    apiClient.post<{ ok: boolean; id: string; disabled: boolean }>(`/icrabot/v28/policy/rules/${id}/disable`),

  enablePolicyRule: (id: string) =>
    apiClient.post<{ ok: boolean; id: string; enabled: boolean }>(`/icrabot/v28/policy/rules/${id}/enable`),

  deletePolicyRule: (id: string) =>
    apiClient.delete<{ ok: boolean; id: string; deleted: boolean }>(`/icrabot/v28/policy/rules/${id}`),

  reloadPolicyRules: () =>
    apiClient.post<{ ok: boolean; count: number }>('/icrabot/v28/policy/reload'),

  seedDefaultPolicyRules: () =>
    apiClient.post<{ created: number; updated: number }>('/icrabot/v28/policy/seed'),

  getRiskBand: (score: number) =>
    apiClient.get<{ score: number; band: 'LOW' | 'MED' | 'HIGH' }>(`/icrabot/v28/policy/risk-band/${score}`),

  isQuietHours: () =>
    apiClient.get<{ isQuietHours: boolean }>('/icrabot/v28/policy/quiet-hours'),

  // ==================== v28_ops_bundle: SCENARIO HARNESS ====================

  // Scenarios
  listScenarios: () =>
    apiClient.get<{ scenarios: Array<{ key: string; name: string; description: string; eventCount: number }> }>('/icrabot/v28/scenarios'),

  runBuiltInScenario: (scenarioKey: string) =>
    apiClient.post<ScenarioResult>(`/icrabot/v28/scenarios/run/${scenarioKey}`),

  runAllScenarios: () =>
    apiClient.post<ScenarioSummary>('/icrabot/v28/scenarios/run-all'),

  runCustomScenario: (scenario: {
    name: string;
    events: Array<{ event_id: string; type: string; [key: string]: any }>;
    expectedTimeline?: any[];
    expectedActions?: any[];
    caseId?: string;
  }) =>
    apiClient.post<ScenarioResult>('/icrabot/v28/scenarios/run-custom', scenario),

  // ==================== v28_policy_feedback: ACTION FEEDBACK ====================

  // Callback endpoint for external systems
  processCallback: (payload: { case_id: string; kind: string; data?: Record<string, any> }) =>
    apiClient.post<{ ok: boolean; caseId: string; facts: Record<string, any> }>('/icrabot/v28/feedback/callback', payload),

  // Get last feedback for specific action type
  getLastFeedback: (caseId: string, actionType: string) =>
    apiClient.get<ActionFeedback>(`/icrabot/v28/feedback/${caseId}/${actionType}`),

  // Get all feedbacks for a case
  getAllFeedbacks: (caseId: string) =>
    apiClient.get<Record<string, ActionFeedback>>(`/icrabot/v28/feedback/${caseId}`),

  // Get callback history for a case
  getCallbackHistory: (caseId: string) =>
    apiClient.get<Record<string, { data: any; receivedAt: string | null }>>(`/icrabot/v28/feedback/${caseId}/callbacks`),

  // Get last global action status
  getLastGlobalStatus: (caseId: string) =>
    apiClient.get<{ status: string | null; successAt: string | null; failAt: string | null }>(`/icrabot/v28/feedback/${caseId}/last`),
};

// ==================== v28_policy_feedback TYPES ====================

export interface ActionFeedback {
  status: string | null;
  actionId: string | null;
  result: any;
  successAt: string | null;
  failAt: string | null;
}

// ==================== v28_ops_bundle TYPES ====================

export type PolicyDecision = 'ALLOW' | 'DENY' | 'MANUAL';

export interface PolicyRule {
  id: string;
  name: string;
  priority: number;
  actionType: string | null;
  expr: string;
  decision: PolicyDecision;
  manualActionType?: string;
  manualPayload?: Record<string, any>;
  note?: string;
  isActive: boolean;
}

export interface PolicyEvalResult {
  decision: PolicyDecision;
  matchedRule: PolicyRule | null;
  reason: string;
  manualAction?: {
    actionType: string;
    payload: Record<string, any>;
  };
}

export interface ScenarioResult {
  scenarioName: string;
  passed: boolean;
  eventsProcessed: number;
  timelineMatch: boolean;
  actionsMatch: boolean;
  actualTimeline: any[];
  actualActions: any[];
  expectedTimeline: any[];
  expectedActions: any[];
  errors: string[];
  duration: number;
}

export interface ScenarioSummary {
  total: number;
  passed: number;
  failed: number;
  scenarios: ScenarioResult[];
}
