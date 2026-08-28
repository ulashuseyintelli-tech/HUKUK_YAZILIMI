/**
 * RUNTIME-OPERABILITY-CERTIFICATION-R01 / W3-F07-CRON-OVERLAP-AND-JOB-IDENTITY-R01.
 *
 * Fresh (2026-08-02), bagimsiz repo-genelinde tarama ile turetilmis, her
 * runtime-bound `@Cron` job'un CANONICAL kimligini ve overlap policy'sini
 * kaydeden makine-okunur envanter. Bu, W3-F03'un `scheduler-timezone.ts` +
 * W3-F04'un `cron-failure-reporting.ts` + W3-F06'nin `dormant-subtree-registry.ts`
 * ile AYNI mimari idiomu (tek canonical `.ts` dosyasi + onu okuyan bir static
 * guard) 4. kez uygular.
 *
 * KAPSAM: Yalniz AppModule kapanisina BAGLI (runtime-bound) 33 job — 2 dormant
 * icrabot cron'u (bkz `dormant-subtree-registry.ts` → ICRABOT-LEGACY-CORE) bu
 * envanterin DISINDADIR (W3-F06 kapsami, degistirilmedi).
 *
 * KIMLIK KURALI: `jobId` iki kaynaktan biriyle turetilir:
 *  - 31 job icin: canonical `${ClassName}.${methodName}` (bu task ile YENI
 *    eklendi — onceden HICBIRI explicit `name` tasimiyordu, `@nestjs/schedule`
 *    varsayilan olarak `crypto.randomUUID()` uretiyordu).
 *  - 2 job icin (`ErrorLogRetentionService.handleCron`, `OfficeApprovalExecutorCronService.handleCron`):
 *    W3-F03 ONCESINDEN GELEN, zaten stabil/deterministik miras-birakilmis kisa
 *    ad (`errorLogRetention`, `officeApprovalExecutor`) KORUNDU — YENIDEN
 *    ADLANDIRILMADI, cunku mevcut bir W3-F03 runtime testi
 *    (`w3-f03-scheduler-timezone-runtime.db-gated.integration.spec.ts` →
 *    `NAMED_JOBS`) bu TAM STRING'LERI `SchedulerRegistry.getCronJob(name)` ile
 *    arar; gereksiz yere BASKA bir task'in test dosyasina dokunmamak icin bu 2
 *    istisna BILINCLI olarak canonical semadan FARKLIDIR ama ayni "stabil,
 *    UUID-olmayan" gereksinimini zaten TAM OLARAK karsiliyordu.
 *
 * OVERLAP POLICY KARARI: 33 job'un TAMAMI 'DENY_PARALLEL' olarak siniflandirildi.
 * Gerekce: hepsi periyodik bakim/is-sureci supurmeleridir (idempotent toplu
 * islem), hicbirinde "kacirilan bir tick'i SONRA mutlaka isle" (QUEUE_NEXT) veya
 * "eszamanli calismasi zararsiz/istenir" (ALLOW_PARALLEL) icin somut/gozlemlenmis
 * bir gereksinim YOK — atlanan bir tick, job'un KENDI bir sonraki dogal
 * calismasinda zaten islenir. Mevcut 13 ad-hoc guard'in TAMAMI da (isProcessing/
 * isRunning/isRunning_X) zaten "atlaninca WARN logla" semantigini kullaniyordu —
 * yeni canonical mekanizma bu ONCEDEN VAR OLAN semantigi FORMALIZE eder, davranis
 * DEGISTIRMEZ. `SchedulerOverlapPolicy` tipi yine de tum 4 degeri tasir (brief
 * sozlesmesi geregi) — `QUEUE_NEXT`/`ALLOW_PARALLEL` su an hicbir job tarafindan
 * KULLANILMIYOR, gelecekte somut bir gerekce dogarsa eklenebilir.
 */
import type { SchedulerOverlapPolicy } from './scheduler-overlap-guard';

export type SchedulerJobRecord = {
  /** Canonical, deterministik kimlik — `SchedulerRegistry`'nin gercek anahtari. */
  jobId: string;
  /** apps/api/src koküne göre relative dosya yolu. */
  file: string;
  cls: string;
  method: string;
  overlapPolicy: SchedulerOverlapPolicy;
  /** ALLOW_PARALLEL/QUEUE_NEXT icin zorunlu gerekce metni; DENY_PARALLEL/SKIP_IF_RUNNING icin null. */
  policyReason: string | null;
  /** true ise jobId W3-F03 oncesinden miras kalan sabit ad (canonical semaya UYMAZ, BILINCLI istisna). */
  legacyName: boolean;
};

export const SCHEDULER_JOB_REGISTRY: readonly SchedulerJobRecord[] = [
  // ── AutomationService (8) ──
  { jobId: 'AutomationService.processPendingCases', file: 'modules/automation/automation.service.ts', cls: 'AutomationService', method: 'processPendingCases', overlapPolicy: 'DENY_PARALLEL', policyReason: null, legacyName: false },
  { jobId: 'AutomationService.updateDaysLeft', file: 'modules/automation/automation.service.ts', cls: 'AutomationService', method: 'updateDaysLeft', overlapPolicy: 'DENY_PARALLEL', policyReason: null, legacyName: false },
  { jobId: 'AutomationService.checkNotificationExpiries', file: 'modules/automation/automation.service.ts', cls: 'AutomationService', method: 'checkNotificationExpiries', overlapPolicy: 'DENY_PARALLEL', policyReason: null, legacyName: false },
  { jobId: 'AutomationService.expireCrossCaseNotifications', file: 'modules/automation/automation.service.ts', cls: 'AutomationService', method: 'expireCrossCaseNotifications', overlapPolicy: 'DENY_PARALLEL', policyReason: null, legacyName: false },
  { jobId: 'AutomationService.expireInactiveRecipientCrossCaseNotifications', file: 'modules/automation/automation.service.ts', cls: 'AutomationService', method: 'expireInactiveRecipientCrossCaseNotifications', overlapPolicy: 'DENY_PARALLEL', policyReason: null, legacyName: false },
  { jobId: 'AutomationService.updateExpiredPoas', file: 'modules/automation/automation.service.ts', cls: 'AutomationService', method: 'updateExpiredPoas', overlapPolicy: 'DENY_PARALLEL', policyReason: null, legacyName: false },
  { jobId: 'AutomationService.sendExpiringPoaNotifications', file: 'modules/automation/automation.service.ts', cls: 'AutomationService', method: 'sendExpiringPoaNotifications', overlapPolicy: 'DENY_PARALLEL', policyReason: null, legacyName: false },
  { jobId: 'AutomationService.updateRiskScores', file: 'modules/automation/automation.service.ts', cls: 'AutomationService', method: 'updateRiskScores', overlapPolicy: 'DENY_PARALLEL', policyReason: null, legacyName: false },

  // ── AddressTaskSchedulerService (3) ──
  { jobId: 'AddressTaskSchedulerService.checkOverdueTasks', file: 'modules/address-task/address-task-scheduler.service.ts', cls: 'AddressTaskSchedulerService', method: 'checkOverdueTasks', overlapPolicy: 'DENY_PARALLEL', policyReason: null, legacyName: false },
  { jobId: 'AddressTaskSchedulerService.checkAnnualRefreshTasks', file: 'modules/address-task/address-task-scheduler.service.ts', cls: 'AddressTaskSchedulerService', method: 'checkAnnualRefreshTasks', overlapPolicy: 'DENY_PARALLEL', policyReason: null, legacyName: false },
  { jobId: 'AddressTaskSchedulerService.publishOutboxEvents', file: 'modules/address-task/address-task-scheduler.service.ts', cls: 'AddressTaskSchedulerService', method: 'publishOutboxEvents', overlapPolicy: 'DENY_PARALLEL', policyReason: null, legacyName: false },

  // ── ExchangeRateService (1) ──
  { jobId: 'ExchangeRateService.scheduledRateUpdate', file: 'modules/exchange-rate/exchange-rate.service.ts', cls: 'ExchangeRateService', method: 'scheduledRateUpdate', overlapPolicy: 'DENY_PARALLEL', policyReason: null, legacyName: false },

  // ── ErrorLogRetentionService (1) — miras adi korunur ──
  { jobId: 'errorLogRetention', file: 'modules/error-log/retention/error-log-retention.service.ts', cls: 'ErrorLogRetentionService', method: 'handleCron', overlapPolicy: 'DENY_PARALLEL', policyReason: null, legacyName: true },

  // ── OperationalEscalationService (1) ──
  { jobId: 'OperationalEscalationService.scheduledRun', file: 'modules/escalation/operational-escalation.service.ts', cls: 'OperationalEscalationService', method: 'scheduledRun', overlapPolicy: 'DENY_PARALLEL', policyReason: null, legacyName: false },

  // ── CaseTaskEscalationService (1) ──
  { jobId: 'CaseTaskEscalationService.scheduledRun', file: 'modules/escalation/case-task-escalation.service.ts', cls: 'CaseTaskEscalationService', method: 'scheduledRun', overlapPolicy: 'DENY_PARALLEL', policyReason: null, legacyName: false },

  // ── GreetingService (1) ──
  { jobId: 'GreetingService.greetingSchedulerTick', file: 'modules/greeting/greeting.service.ts', cls: 'GreetingService', method: 'greetingSchedulerTick', overlapPolicy: 'DENY_PARALLEL', policyReason: null, legacyName: false },

  // ── RateSyncService (2) ──
  { jobId: 'RateSyncService.syncTcmbRates', file: 'modules/interest-engine/rate-sync.service.ts', cls: 'RateSyncService', method: 'syncTcmbRates', overlapPolicy: 'DENY_PARALLEL', policyReason: null, legacyName: false },
  { jobId: 'RateSyncService.syncMonthlyMevduatRates', file: 'modules/interest-engine/rate-sync.service.ts', cls: 'RateSyncService', method: 'syncMonthlyMevduatRates', overlapPolicy: 'DENY_PARALLEL', policyReason: null, legacyName: false },

  // ── SchedulerService (8) ──
  { jobId: 'SchedulerService.checkPaymentOrderDeadlines', file: 'modules/scheduler/scheduler.service.ts', cls: 'SchedulerService', method: 'checkPaymentOrderDeadlines', overlapPolicy: 'DENY_PARALLEL', policyReason: null, legacyName: false },
  { jobId: 'SchedulerService.processNafakaPeriods', file: 'modules/scheduler/scheduler.service.ts', cls: 'SchedulerService', method: 'processNafakaPeriods', overlapPolicy: 'DENY_PARALLEL', policyReason: null, legacyName: false },
  { jobId: 'SchedulerService.checkMtsReturns', file: 'modules/scheduler/scheduler.service.ts', cls: 'SchedulerService', method: 'checkMtsReturns', overlapPolicy: 'DENY_PARALLEL', policyReason: null, legacyName: false },
  { jobId: 'SchedulerService.calculateDailyStats', file: 'modules/scheduler/scheduler.service.ts', cls: 'SchedulerService', method: 'calculateDailyStats', overlapPolicy: 'DENY_PARALLEL', policyReason: null, legacyName: false },
  { jobId: 'SchedulerService.checkUpcomingTasks', file: 'modules/scheduler/scheduler.service.ts', cls: 'SchedulerService', method: 'checkUpcomingTasks', overlapPolicy: 'DENY_PARALLEL', policyReason: null, legacyName: false },
  { jobId: 'SchedulerService.checkIhbarnameDeadlines', file: 'modules/scheduler/scheduler.service.ts', cls: 'SchedulerService', method: 'checkIhbarnameDeadlines', overlapPolicy: 'DENY_PARALLEL', policyReason: null, legacyName: false },
  { jobId: 'SchedulerService.checkExternalCaseFollowups', file: 'modules/scheduler/scheduler.service.ts', cls: 'SchedulerService', method: 'checkExternalCaseFollowups', overlapPolicy: 'DENY_PARALLEL', policyReason: null, legacyName: false },
  { jobId: 'SchedulerService.checkTebligatStatus', file: 'modules/scheduler/scheduler.service.ts', cls: 'SchedulerService', method: 'checkTebligatStatus', overlapPolicy: 'DENY_PARALLEL', policyReason: null, legacyName: false },

  // ── GazetteWatcherService (1) ──
  { jobId: 'GazetteWatcherService.checkGazette', file: 'modules/tariff/gazette-watcher.service.ts', cls: 'GazetteWatcherService', method: 'checkGazette', overlapPolicy: 'DENY_PARALLEL', policyReason: null, legacyName: false },

  // ── DeprecatedUsageTrackerService (3) ──
  { jobId: 'DeprecatedUsageTrackerService.generateDailyReport', file: 'modules/policy-engine/deprecated-usage-tracker.service.ts', cls: 'DeprecatedUsageTrackerService', method: 'generateDailyReport', overlapPolicy: 'DENY_PARALLEL', policyReason: null, legacyName: false },
  { jobId: 'DeprecatedUsageTrackerService.flushBuffer', file: 'modules/policy-engine/deprecated-usage-tracker.service.ts', cls: 'DeprecatedUsageTrackerService', method: 'flushBuffer', overlapPolicy: 'DENY_PARALLEL', policyReason: null, legacyName: false },
  { jobId: 'DeprecatedUsageTrackerService.cleanupOldRecords', file: 'modules/policy-engine/deprecated-usage-tracker.service.ts', cls: 'DeprecatedUsageTrackerService', method: 'cleanupOldRecords', overlapPolicy: 'DENY_PARALLEL', policyReason: null, legacyName: false },

  // ── DecisionLogRetentionService (1) ──
  { jobId: 'DecisionLogRetentionService.archiveOldRecords', file: 'modules/policy-engine/decision-logger/decision-log-retention.service.ts', cls: 'DecisionLogRetentionService', method: 'archiveOldRecords', overlapPolicy: 'DENY_PARALLEL', policyReason: null, legacyName: false },

  // ── OfficeApprovalExecutorCronService (1) — miras adi korunur ──
  { jobId: 'officeApprovalExecutor', file: 'modules/office-approval/office-approval-executor-cron.service.ts', cls: 'OfficeApprovalExecutorCronService', method: 'handleCron', overlapPolicy: 'DENY_PARALLEL', policyReason: null, legacyName: true },

  // ── OutboxCronService (1) ──
  { jobId: 'OutboxCronService.processOutboxActions', file: 'modules/icrabot/v28-engine/outbox-cron.service.ts', cls: 'OutboxCronService', method: 'processOutboxActions', overlapPolicy: 'DENY_PARALLEL', policyReason: null, legacyName: false },
] as const;

export const SCHEDULER_JOB_REGISTRY_COUNT = 33;
