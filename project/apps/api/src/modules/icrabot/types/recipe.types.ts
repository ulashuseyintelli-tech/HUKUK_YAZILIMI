/**
 * ICRABOT TYPE DEFINITIONS
 * 
 * Bot sistemi için tüm tip tanımları.
 * v3: Debtor-scoped, icra türü bazlı, DAG destekli.
 */

// ==================== ENUMS ====================

export type StageTag =
  | 'ACILIS'
  | 'TEBLIGAT'
  | 'KESINLESME'
  | 'VARLIK'
  | 'HACIZ'
  | 'TAHSILAT'
  | 'SATIS'
  | 'KAPANIS';

export type TriggerType = 'event' | 'schedule' | 'manual';

export type RiskLevel = 'read_only' | 'controlled_write' | 'high_impact_write';

export type TaskPriority = 'LOW' | 'MEDIUM' | 'NORMAL' | 'HIGH' | 'CRITICAL';

export type TaskStatus = 
  | 'PENDING' 
  | 'QUEUED' 
  | 'RUNNING' 
  | 'COMPLETED' 
  | 'FAILED' 
  | 'CANCELLED'
  | 'AWAITING_APPROVAL';

// v3: İcra türleri
export type IcraType = 
  | 'ILAMSIZ' 
  | 'ILAMLI' 
  | 'KAMBIYO' 
  | 'KIRA' 
  | 'MTS' 
  | 'DIGER';

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

// v3: Adres türleri
export type AddressType = 'MERNIS' | 'ISYERI' | 'SUBE' | 'SOZLESME' | 'BILINMIYOR';

// ==================== RECIPE TYPES ====================

export interface RecipeTrigger {
  type: TriggerType;
  when: string[];
}

export interface RecipeAction {
  type: 'query' | 'click' | 'select_row' | 'compute' | 'set_flag' | 'notify' | 
        'open_asset' | 'open_case_by_reference' | 'fill_form' | 'create_task';
  button?: string;
  table?: string;
  where?: Record<string, string>;
  input?: Record<string, string>;
  formula?: string;
  assetFingerprint?: string;
  referenceNo?: string;
  fields?: Record<string, string>;
  taskType?: string;
  payload?: Record<string, string>;
}

export interface RecipeDecision {
  if: string;
  then: {
    enqueue?: string[];
    set?: string;
    set_flag?: string;
    notify?: string;
    emit?: string;
  };
}

export interface RecipeProof {
  store: string[];
}

export interface RecipeAudit {
  level: RiskLevel;
  retainDays?: number;
  includeScreenshotOnError?: boolean;
}

export interface RecipeRetry {
  maxAttempts: number;
  backoffSeconds: number[];
}

/**
 * Recipe tanımı
 */
export interface Recipe {
  recipeId: string;
  version: number;
  name: string;
  description: string;
  
  // v3: Scope (case veya debtor)
  scope?: 'case' | 'debtor';
  
  stageTags: StageTag[];
  trigger: RecipeTrigger;
  
  preconditions: string[];
  uyapNavPath: string[];
  
  read?: {
    table?: string;
    fields: string[];
    filters?: Record<string, string>;
  };
  
  decisions?: RecipeDecision[];
  actions: RecipeAction[];
  postconditions: string[];
  
  proof: RecipeProof;
  audit: RecipeAudit;
  retry?: RecipeRetry;
  
  // Metadata
  priority: TaskPriority;
  requiresApproval: boolean;
  isActive: boolean;
  
  // v3: DAG bağımlılıkları
  dependsOn?: string[];
  emits?: string[];
  guard?: string;
}

// ==================== DIGITAL TWIN ====================

/**
 * Dosya dijital ikizi
 */
export interface CaseDigitalTwin {
  caseId: string;
  uyapDosyaNo: string | null;
  uyapTevziNo: string | null;
  
  // v3: İcra türü
  icraType: IcraType;
  
  stage: StageTag;
  substage: string | null;
  
  // Taraflar
  parties: PartyInfo[];
  
  // Olaylar
  events: CaseEventRecord[];
  
  // Kanıtlar
  evidence: EvidenceRecord[];
  
  // Senkronizasyon
  lastSyncAt: Date | null;
  nextActions: NextBestAction[];
  errors: ErrorRecord[];
  
  // v3: Borçlu bazlı tebligat durumları
  debtorStatuses: DebtorTebligatStatus[];
}

/**
 * v3: Borçlu tebligat durumu
 */
export interface DebtorTebligatStatus {
  debtorId: string;
  debtorName: string;
  channel: TebligatChannel;
  
  // E-tebligat
  eDeliveredDate: Date | null;
  eReadDate: Date | null;
  eMazbataExists: boolean;
  
  // Fiziki tebligat
  physicalSentDate: Date | null;
  physicalDeliveredDate: Date | null;
  physicalOutcome: TebligatOutcome | null;
  
  // Hesaplanan
  serviceEffectiveDate: Date | null;
  isServed: boolean;
  
  // Timeline
  timeline: TebligatTimelineEntry[];
}

/**
 * v3: Tebligat timeline entry
 */
export interface TebligatTimelineEntry {
  ts: Date;
  channel: TebligatChannel;
  addressType: AddressType;
  addressLabel: string;
  uyapRef: string | null;
  outcome: TebligatOutcome;
  outcomeDetail: string | null;
  nextActionSuggested: string | null;
}

export interface PartyInfo {
  id: string;
  type: 'ALACAKLI' | 'BORCLU';
  name: string;
  identity: string | null;
  addresses: AddressInfo[];
}

export interface AddressInfo {
  id: string;
  type: AddressType;
  fullAddress: string;
  isActive: boolean;
}

export interface CaseEventRecord {
  id: string;
  type: string;
  date: Date;
  description: string;
  metadata?: Record<string, any>;
}

export interface EvidenceRecord {
  id: string;
  type: string;
  date: Date;
  hash: string;
  data: Record<string, any>;
}

export interface ErrorRecord {
  id: string;
  type: string;
  message: string;
  date: Date;
  resolved: boolean;
}

// ==================== NEXT BEST ACTION ====================

export interface NextBestAction {
  recipeId: string;
  recipeName: string;
  description: string;
  priority: TaskPriority;
  reason: string;
  canAutoExecute: boolean;
  requiresApproval: boolean;
  estimatedDuration: string;
  
  // v3: Debtor scope
  debtorId?: string;
  debtorName?: string;
}

// ==================== TASK ====================

export interface TaskInput {
  recipeId: string;
  caseId: string;
  tenantId: string;
  priority?: TaskPriority;
  inputData?: Record<string, any>;
  
  // v3: Debtor scope
  debtorId?: string;
}

export interface TaskResult {
  taskId: string;
  status: TaskStatus;
  output?: Record<string, any>;
  error?: string;
  evidence?: EvidenceRecord[];
  duration?: number;
}

// ==================== v3: STAGE FLOW ====================

/**
 * İcra türü bazlı stage akışı
 */
export interface StageFlow {
  icraType: IcraType;
  description: string;
  stages: StageTag[];
  stageRequirements: Record<StageTag, StageRequirement>;
  notes?: string[];
}

export interface StageRequirement {
  requiredEvents?: string[];
  optionalEvents?: string[];
  gatingRule?: string;
}

// ==================== v3: TASK DAG ====================

/**
 * Task DAG node
 */
export interface DagNode {
  id: string;
  type: 'recipe';
  emits: string[];
  guard: string;
}

/**
 * Task DAG edge
 */
export interface DagEdge {
  from: string;
  to: string;
}

/**
 * Task DAG
 */
export interface TaskDag {
  nodes: DagNode[];
  edges: DagEdge[];
}

// ==================== v3: PARAMS ====================

/**
 * Tebligat parametreleri
 */
export interface TebligatParams {
  eTebligatDeemedDays: number;
  poll: {
    afterSentFirst24hMinutes: number;
    after24hHours: number;
  };
}

/**
 * Kesinleşme parametreleri
 */
export interface KesinlesmeParams {
  defaultObjectionDeadlineDays: number;
  overrides: Record<IcraType, {
    objectionDeadlineDays: number;
  }>;
}

/**
 * Varlık parametreleri
 */
export interface VarlikParams {
  scoreThresholdHigh: number;
  scoreThresholdLow: number;
  requeryDays: number;
}

/**
 * Parallelism parametreleri
 */
export interface ParallelismParams {
  debtorConcurrency: number;
  perCaseConcurrency: number;
}

/**
 * Scheduler parametreleri
 */
export interface SchedulerParams {
  syncHeaderHours: number;
  syncSafahatHours: number;
  syncEvrakHours: number;
  tebligatStatusHours: number;
  assetQueryDays: number;
}

/**
 * Risk parametreleri
 */
export interface RiskParams {
  blockCostThreshold: number;
  blockExecutionThreshold: number;
}

/**
 * Recovery parametreleri
 */
export interface RecoveryParams {
  minNetForCostActions: number;
}

/**
 * Tüm parametreler
 */
export interface IcrabotParams {
  tebligat: TebligatParams;
  kesinlesme: KesinlesmeParams;
  varlik: VarlikParams;
  parallelism: ParallelismParams;
  scheduler: SchedulerParams;
  risk: RiskParams;
  recovery: RecoveryParams;
}

// ==================== v3: RUNTIME CONTEXT ====================

/**
 * Recipe çalışma zamanı context'i
 */
export interface RuntimeContext {
  caseId: string;
  tenantId: string;
  icraType: IcraType;
  
  // Debtor scope
  debtorScopeId?: string;
  
  // Session
  sessionOk: boolean;
  
  // Params
  params: IcrabotParams;
  
  // Events
  events: string[];
  
  // Flags
  flags: Record<string, any>;
}
