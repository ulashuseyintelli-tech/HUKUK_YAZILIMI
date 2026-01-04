/**
 * JOB MONITOR CONFIG (v12)
 * 
 * Job/Task izleme için veri modeli ve konfigürasyonlar.
 */

// Job durumları
export type JobStatus = 
  | 'queued'
  | 'running'
  | 'waiting'
  | 'blocked'
  | 'done'
  | 'failed'
  | 'quarantined';

// Risk seviyeleri
export type RiskLevel = 
  | 'read_only'
  | 'controlled_write'
  | 'high_impact_write';

// Step durumları
export type StepStatus = 'ok' | 'warn' | 'error';

// Job Run interface
export interface JobRun {
  jobId: string;
  caseId: string;
  debtorId?: string;
  recipeId: string;
  recipeVersion: number;
  status: JobStatus;
  riskLevel: RiskLevel;
  startedAt: Date;
  finishedAt?: Date;
  durationMs?: number;
  attempt: number;
  maxAttempts: number;
  lockBlockedBy?: string;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  tenantId: string;
}

// Job Step interface
export interface JobStep {
  stepId: string;
  jobId: string;
  stepNo: number;
  actionType: string;
  uyapNavPath: string;
  status: StepStatus;
  snapshotHash?: string;
  proofRef?: string;
  createdAt: Date;
}

// Job filter interface
export interface JobFilter {
  caseId?: string;
  debtorId?: string;
  stage?: string;
  recipeId?: string;
  status?: JobStatus | JobStatus[];
  riskLevel?: RiskLevel;
  startedAfter?: Date;
  startedBefore?: Date;
  tenantId: string;
}

// Job retry config
export const JOB_RETRY_CONFIG = {
  maxAttempts: 4,
  backoffSeconds: [30, 120, 600, 1800], // 30s, 2m, 10m, 30m
  quarantineAfterAttempts: 4,
};

// Job status transitions
export const JOB_STATUS_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  queued: ['running', 'quarantined'],
  running: ['done', 'failed', 'waiting', 'blocked'],
  waiting: ['running', 'quarantined'],
  blocked: ['running', 'quarantined'],
  done: [], // terminal
  failed: ['queued', 'quarantined'], // retry -> queued
  quarantined: ['queued'], // manual unquarantine
};

// Job monitor dashboard config
export const JOB_MONITOR_DASHBOARD = {
  defaultPageSize: 50,
  maxPageSize: 200,
  refreshIntervalMs: 30000, // 30 seconds
  retentionDays: 90,
  columns: [
    { key: 'jobId', label: 'Job ID', sortable: true },
    { key: 'caseId', label: 'Dosya', sortable: true },
    { key: 'recipeId', label: 'Recipe', sortable: true },
    { key: 'status', label: 'Durum', sortable: true },
    { key: 'startedAt', label: 'Başlangıç', sortable: true },
    { key: 'durationMs', label: 'Süre', sortable: true },
    { key: 'attempt', label: 'Deneme', sortable: false },
    { key: 'lastErrorCode', label: 'Hata', sortable: false },
  ],
  statusColors: {
    queued: 'gray',
    running: 'blue',
    waiting: 'yellow',
    blocked: 'orange',
    done: 'green',
    failed: 'red',
    quarantined: 'purple',
  } as Record<JobStatus, string>,
};

// Job actions
export type JobAction = 
  | 'retry'
  | 'quarantine'
  | 'unquarantine'
  | 'disable_recipe_for_case'
  | 'download_evidence';

export interface JobActionRequest {
  jobId: string;
  action: JobAction;
  reason?: string;
  performedBy: string;
}

// Job metrics
export interface JobMetrics {
  totalJobs: number;
  byStatus: Record<JobStatus, number>;
  byRecipe: Record<string, number>;
  avgDurationMs: number;
  failureRate: number;
  quarantinedCount: number;
}

// Job alert thresholds
export const JOB_ALERT_THRESHOLDS = {
  failureRateWarning: 0.1, // 10%
  failureRateCritical: 0.25, // 25%
  quarantinedCountWarning: 5,
  quarantinedCountCritical: 20,
  avgDurationWarningMs: 60000, // 1 minute
  avgDurationCriticalMs: 300000, // 5 minutes
};
