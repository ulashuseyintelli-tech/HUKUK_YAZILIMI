/**
 * DECISION RULES v4
 * 
 * Event-driven karar kuralları.
 * "Bu fact geldi → şu aksiyonları yap" mantığı.
 */

import { FactType, AdvanceType, AssetType } from './facts-schema.config';

// ==================== RULE TYPES ====================

export type RuleAction =
  | 'ENQUEUE_TASK'
  | 'BLOCK_TASK'
  | 'UNBLOCK_TASK'
  | 'SET_FLAG'
  | 'CLEAR_FLAG'
  | 'SEND_NOTIFICATION'
  | 'REQUEST_ADVANCE'
  | 'REQUEST_APPROVAL'
  | 'UPDATE_STAGE'
  | 'LOG_EVENT';

export interface RuleCondition {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains' | 'exists';
  value: any;
}

export interface RuleActionDef {
  action: RuleAction;
  params: Record<string, any>;
}

export interface DecisionRule {
  ruleId: string;
  name: string;
  description: string;
  
  // Tetikleyici
  trigger: {
    factType: FactType;
    conditions?: RuleCondition[];
  };
  
  // Ek koşullar (case/debtor/asset durumu)
  preconditions?: RuleCondition[];
  
  // Aksiyonlar
  actions: RuleActionDef[];
  
  // Öncelik (düşük = önce çalışır)
  priority: number;
  
  // Aktif mi
  isActive: boolean;
}

// ==================== DECISION RULES ====================

export const DECISION_RULES: DecisionRule[] = [
  
  // ==================== VARLIK KURALLARI ====================
  
  {
    ruleId: 'R001_ASSET_FOUND_FETCH_PRIOR_LIENS',
    name: 'Varlık Bulundu → Ön Hacizleri Çek',
    description: 'Varlık bulunduğunda önce mevcut hacizleri kontrol et',
    trigger: {
      factType: 'ASSET_FOUND',
    },
    preconditions: [
      { field: 'case.stage', operator: 'in', value: ['VARLIK', 'HACIZ'] },
    ],
    actions: [
      {
        action: 'ENQUEUE_TASK',
        params: { taskType: 'FetchPriorLiens', priority: 'HIGH' },
      },
      {
        action: 'ENQUEUE_TASK',
        params: { taskType: 'AIValuation', priority: 'MEDIUM' },
      },
    ],
    priority: 10,
    isActive: true,
  },
  
  {
    ruleId: 'R002_ASSET_VALUED_ASSESS_RISK',
    name: 'Varlık Değerlendi → Risk Değerlendir',
    description: 'AI değerleme sonrası risk skorlaması yap',
    trigger: {
      factType: 'ASSET_VALUED',
    },
    actions: [
      {
        action: 'ENQUEUE_TASK',
        params: { taskType: 'AssessRecoveryRisk', priority: 'HIGH' },
      },
    ],
    priority: 20,
    isActive: true,
  },
  
  // ==================== HACİZ SIRASI KURALLARI ====================
  
  {
    ruleId: 'R010_PRIOR_LIENS_CALCULATE_RANK',
    name: 'Ön Hacizler Tespit → Sıra Hesapla',
    description: 'Ön hacizler tespit edildiğinde bizim sıramızı hesapla',
    trigger: {
      factType: 'PRIOR_LIENS_DETECTED',
    },
    actions: [
      {
        action: 'ENQUEUE_TASK',
        params: { taskType: 'CalculateLienRank', priority: 'HIGH' },
      },
      {
        action: 'ENQUEUE_TASK',
        params: { taskType: 'AssessParticipationRisk', priority: 'HIGH' },
      },
    ],
    priority: 10,
    isActive: true,
  },
  
  {
    ruleId: 'R011_FIRST_RANK_YAKALAMA',
    name: '1. Sıra → Yakalama Avansı İste',
    description: 'Birinci sıradaysak yakalama avansı talep et',
    trigger: {
      factType: 'LIEN_RANK_DETERMINED',
      conditions: [
        { field: 'ourRank', operator: 'eq', value: 1 },
        { field: 'assetType', operator: 'eq', value: 'VEHICLE' },
      ],
    },
    preconditions: [
      { field: 'case.yakalamaAvansReceived', operator: 'neq', value: true },
    ],
    actions: [
      {
        action: 'REQUEST_ADVANCE',
        params: {
          advanceType: 'YAKALAMA_AVANSI',
          reason: 'Araç üzerinde 1. sıra haciz - yakalama için avans gerekli',
          blocksActions: ['SubmitYakalamaRequest'],
        },
      },
      {
        action: 'SEND_NOTIFICATION',
        params: {
          template: 'YAKALAMA_AVANSI_TALEBI',
          channel: 'EMAIL',
          recipient: 'CLIENT',
        },
      },
      {
        action: 'BLOCK_TASK',
        params: { taskType: 'SubmitYakalamaRequest', reason: 'Yakalama avansı bekleniyor' },
      },
    ],
    priority: 10,
    isActive: true,
  },
  
  {
    ruleId: 'R012_NOT_FIRST_RANK_ASSESS_RISK',
    name: '1. Sıra Değil → İştirak Riski Değerlendir',
    description: 'Birinci sırada değilsek iştirak riskini değerlendir',
    trigger: {
      factType: 'LIEN_RANK_DETERMINED',
      conditions: [
        { field: 'ourRank', operator: 'gt', value: 1 },
      ],
    },
    actions: [
      {
        action: 'ENQUEUE_TASK',
        params: { taskType: 'Analyze100Participation', priority: 'HIGH' },
      },
      {
        action: 'SET_FLAG',
        params: { flag: 'case.hasParticipationRisk', value: true },
      },
    ],
    priority: 10,
    isActive: true,
  },
  
  // ==================== İŞTİRAK RİSKİ KURALLARI ====================
  
  {
    ruleId: 'R020_HIGH_PARTICIPATION_RISK_BLOCK',
    name: 'Yüksek İştirak Riski → Masraflı İşlemleri Blokla',
    description: 'İştirak riski yüksekse masraflı işlemleri blokla',
    trigger: {
      factType: 'PARTICIPATION_RISK_HIGH',
    },
    actions: [
      {
        action: 'BLOCK_TASK',
        params: {
          taskTypes: ['SubmitYakalamaRequest', 'PayYakalamaAvansi', 'RequestSale'],
          reason: 'İştirak riski yüksek - avukat onayı gerekli',
        },
      },
      {
        action: 'REQUEST_APPROVAL',
        params: {
          approvalType: 'ATTORNEY_DECISION',
          reason: 'Ön hacizler nedeniyle tahsilat riski yüksek',
          options: ['PROCEED_ANYWAY', 'SKIP_COSTLY_ACTIONS', 'WAIT_FOR_PRIOR_RELEASE'],
        },
      },
      {
        action: 'SEND_NOTIFICATION',
        params: {
          template: 'ISTIRAK_RISKI_UYARISI',
          channel: 'EMAIL',
          recipient: 'ATTORNEY',
        },
      },
    ],
    priority: 5,
    isActive: true,
  },
  
  {
    ruleId: 'R021_COLLECT_100_INFO',
    name: 'İştirak Riski → 100. Madde Bilgisi Topla',
    description: 'Ön haciz sahiplerinden alacak bilgisi iste',
    trigger: {
      factType: 'PRIOR_LIENS_DETECTED',
      conditions: [
        { field: 'activePriorLiens', operator: 'gt', value: 0 },
      ],
    },
    actions: [
      {
        action: 'ENQUEUE_TASK',
        params: { taskType: 'Request100Info', priority: 'MEDIUM' },
      },
      {
        action: 'LOG_EVENT',
        params: { eventType: 'IIK_100_PROCESS_STARTED' },
      },
    ],
    priority: 15,
    isActive: true,
  },
  
  // ==================== AVANS KURALLARI ====================
  
  {
    ruleId: 'R030_ADVANCE_RECEIVED_UNBLOCK',
    name: 'Avans Alındı → İşlemleri Aç',
    description: 'Avans alındığında bloklu işlemleri aç',
    trigger: {
      factType: 'ADVANCE_RECEIVED',
    },
    actions: [
      {
        action: 'UNBLOCK_TASK',
        params: { relatedAdvanceFactId: '{{factId}}' },
      },
      {
        action: 'CLEAR_FLAG',
        params: { flag: 'case.waitingForAdvance' },
      },
      {
        action: 'LOG_EVENT',
        params: { eventType: 'ADVANCE_RECEIVED', amount: '{{amount}}' },
      },
    ],
    priority: 5,
    isActive: true,
  },
  
  {
    ruleId: 'R031_ADVANCE_OVERDUE_REMIND',
    name: 'Avans Gecikti → Hatırlat',
    description: 'Avans süresi geçtiyse hatırlatma gönder',
    trigger: {
      factType: 'ADVANCE_NEEDED',
      conditions: [
        { field: 'dueDate', operator: 'lt', value: '{{now}}' },
      ],
    },
    preconditions: [
      { field: 'advance.status', operator: 'neq', value: 'RECEIVED' },
    ],
    actions: [
      {
        action: 'SEND_NOTIFICATION',
        params: {
          template: 'AVANS_HATIRLATMA',
          channel: 'EMAIL',
          recipient: 'CLIENT',
        },
      },
    ],
    priority: 20,
    isActive: true,
  },
  
  // ==================== KESİNLEŞME KURALLARI ====================
  
  {
    ruleId: 'R040_FINALIZED_RUN_QUERIES',
    name: 'Kesinleşti → Varlık Sorgularını Başlat',
    description: 'Takip kesinleştiğinde varlık sorgularını otomatik başlat',
    trigger: {
      factType: 'FINALIZED',
    },
    actions: [
      {
        action: 'ENQUEUE_TASK',
        params: { taskType: 'RunAssetQueries', priority: 'HIGH' },
      },
      {
        action: 'UPDATE_STAGE',
        params: { newStage: 'VARLIK' },
      },
      {
        action: 'LOG_EVENT',
        params: { eventType: 'CASE_FINALIZED' },
      },
    ],
    priority: 5,
    isActive: true,
  },
  
  {
    ruleId: 'R041_OBJECTION_PAUSE',
    name: 'İtiraz Alındı → Kesinleşmeyi Durdur',
    description: 'İtiraz geldiğinde kesinleşme sürecini durdur',
    trigger: {
      factType: 'OBJECTION_RECEIVED',
    },
    actions: [
      {
        action: 'SET_FLAG',
        params: { flag: 'case.hasObjection', value: true },
      },
      {
        action: 'BLOCK_TASK',
        params: { taskType: 'MarkAsFinalized', reason: 'İtiraz mevcut' },
      },
      {
        action: 'SEND_NOTIFICATION',
        params: {
          template: 'ITIRAZ_BILDIRIMI',
          channel: 'EMAIL',
          recipient: 'ATTORNEY',
        },
      },
    ],
    priority: 5,
    isActive: true,
  },
  
  // ==================== TEBLİGAT KURALLARI ====================
  
  {
    ruleId: 'R050_SERVICE_EFFECTIVE_START_COUNTDOWN',
    name: 'Tebliğ Gerçekleşti → İtiraz Süresini Başlat',
    description: 'Tebliğ gerçekleştiğinde itiraz süresi sayacını başlat',
    trigger: {
      factType: 'SERVICE_EFFECTIVE',
    },
    actions: [
      {
        action: 'ENQUEUE_TASK',
        params: {
          taskType: 'DetectFinalization',
          scheduledAt: '{{serviceDate + objectionDeadlineDays}}',
          priority: 'MEDIUM',
        },
      },
      {
        action: 'LOG_EVENT',
        params: { eventType: 'SERVICE_EFFECTIVE', serviceDate: '{{serviceDate}}' },
      },
    ],
    priority: 10,
    isActive: true,
  },
  
  {
    ruleId: 'R051_SERVICE_FAILED_RETEBLIGAT',
    name: 'Tebligat Başarısız → Yeniden Tebligat Değerlendir',
    description: 'Tebligat iade/bila geldiğinde yeniden tebligat seçeneklerini değerlendir',
    trigger: {
      factType: 'SERVICE_FAILED',
    },
    actions: [
      {
        action: 'ENQUEUE_TASK',
        params: { taskType: 'EvaluateRetebligat', priority: 'HIGH' },
      },
      {
        action: 'SEND_NOTIFICATION',
        params: {
          template: 'TEBLIGAT_IADE',
          channel: 'EMAIL',
          recipient: 'ATTORNEY',
        },
      },
    ],
    priority: 10,
    isActive: true,
  },
  
  // ==================== TAHSİLAT KURALLARI ====================
  
  {
    ruleId: 'R060_PAYMENT_RECEIVED_UPDATE',
    name: 'Tahsilat Alındı → Bakiye Güncelle',
    description: 'Tahsilat geldiğinde bakiyeyi güncelle ve kapanış değerlendir',
    trigger: {
      factType: 'PAYMENT_RECEIVED',
    },
    actions: [
      {
        action: 'ENQUEUE_TASK',
        params: { taskType: 'UpdateCaseBalance', priority: 'HIGH' },
      },
      {
        action: 'ENQUEUE_TASK',
        params: { taskType: 'EvaluateCaseClosure', priority: 'MEDIUM' },
      },
      {
        action: 'SEND_NOTIFICATION',
        params: {
          template: 'TAHSILAT_BILDIRIMI',
          channel: 'EMAIL',
          recipient: 'CLIENT',
        },
      },
    ],
    priority: 5,
    isActive: true,
  },
  
  // ==================== RİSK KURALLARI ====================
  
  {
    ruleId: 'R070_HIGH_RISK_BLOCK',
    name: 'Yüksek Risk → Masraflı İşlemleri Blokla',
    description: 'Risk skoru yüksekse masraflı işlemleri blokla',
    trigger: {
      factType: 'RISK_ASSESSED',
      conditions: [
        { field: 'riskLevel', operator: 'in', value: ['HIGH', 'CRITICAL'] },
      ],
    },
    actions: [
      {
        action: 'BLOCK_TASK',
        params: {
          taskTypes: '{{blockedActions}}',
          reason: 'Risk skoru yüksek: {{riskScore}}',
        },
      },
      {
        action: 'REQUEST_APPROVAL',
        params: {
          approvalType: 'ATTORNEY_DECISION',
          reason: '{{reasoning}}',
        },
      },
    ],
    priority: 5,
    isActive: true,
  },
  
  {
    ruleId: 'R071_LOW_RISK_PROCEED',
    name: 'Düşük Risk → Devam Et',
    description: 'Risk skoru düşükse otomatik devam et',
    trigger: {
      factType: 'RISK_ASSESSED',
      conditions: [
        { field: 'riskLevel', operator: 'eq', value: 'LOW' },
        { field: 'recommendation', operator: 'eq', value: 'PROCEED' },
      ],
    },
    actions: [
      {
        action: 'ENQUEUE_TASK',
        params: { taskType: 'ProposeHacizPackage', priority: 'MEDIUM' },
      },
    ],
    priority: 15,
    isActive: true,
  },
];

// ==================== HELPER FUNCTIONS ====================

/**
 * Fact tipine göre kuralları getir
 */
export function getRulesForFact(factType: FactType): DecisionRule[] {
  return DECISION_RULES
    .filter(r => r.isActive && r.trigger.factType === factType)
    .sort((a, b) => a.priority - b.priority);
}

/**
 * Koşulu değerlendir
 */
export function evaluateCondition(
  condition: RuleCondition,
  context: Record<string, any>
): boolean {
  const fieldValue = getNestedValue(context, condition.field);
  
  switch (condition.operator) {
    case 'eq':
      return fieldValue === condition.value;
    case 'neq':
      return fieldValue !== condition.value;
    case 'gt':
      return fieldValue > condition.value;
    case 'gte':
      return fieldValue >= condition.value;
    case 'lt':
      return fieldValue < condition.value;
    case 'lte':
      return fieldValue <= condition.value;
    case 'in':
      return Array.isArray(condition.value) && condition.value.includes(fieldValue);
    case 'contains':
      return Array.isArray(fieldValue) && fieldValue.includes(condition.value);
    case 'exists':
      return fieldValue !== undefined && fieldValue !== null;
    default:
      return false;
  }
}

/**
 * Nested değer getir (örn: "case.stage" → context.case.stage)
 */
function getNestedValue(obj: Record<string, any>, path: string): any {
  return path.split('.').reduce((acc, part) => acc?.[part], obj);
}

/**
 * Tüm koşulları değerlendir
 */
export function evaluateAllConditions(
  conditions: RuleCondition[],
  context: Record<string, any>
): boolean {
  return conditions.every(c => evaluateCondition(c, context));
}

/**
 * Kural çalıştırılabilir mi kontrol et
 */
export function canExecuteRule(
  rule: DecisionRule,
  fact: Record<string, any>,
  context: Record<string, any>
): boolean {
  // Trigger koşullarını kontrol et
  if (rule.trigger.conditions) {
    if (!evaluateAllConditions(rule.trigger.conditions, fact)) {
      return false;
    }
  }
  
  // Precondition'ları kontrol et
  if (rule.preconditions) {
    if (!evaluateAllConditions(rule.preconditions, context)) {
      return false;
    }
  }
  
  return true;
}
