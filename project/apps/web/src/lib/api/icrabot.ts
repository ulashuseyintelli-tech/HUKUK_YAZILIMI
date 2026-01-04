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
