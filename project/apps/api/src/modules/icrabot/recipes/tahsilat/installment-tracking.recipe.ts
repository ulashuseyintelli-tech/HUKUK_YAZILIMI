/**
 * INSTALLMENT TRACKING RECIPES v11
 * 
 * Taksit izleme, hatırlatma ve ihlal yönetimi.
 * recipes_v11_extensions.yaml'dan implement edilmiştir.
 */

import { Recipe } from '../../types/recipe.types';

/**
 * Uzlaşma kabulü kaydı
 */
export const REGISTER_SETTLEMENT_ACCEPTANCE: Recipe = {
  recipeId: 'RegisterSettlementAcceptance',
  version: 11,
  name: 'Uzlaşma Kabulü Kaydı',
  description: 'Borçlunun uzlaşma teklifini kabul etmesini kaydeder ve taksit planı oluşturur',
  
  scope: 'debtor',
  stageTags: ['TAHSILAT', 'VARLIK', 'HACIZ'],
  
  trigger: {
    type: 'event',
    when: ['SETTLEMENT_ACCEPTED'],
  },
  
  preconditions: [
    'params.installment.enabled == true',
  ],
  
  uyapNavPath: ['(internal)'],
  
  read: {
    fields: [
      'settlement.plan',
      'debtor.id',
    ],
  },
  
  actions: [
    {
      type: 'compute',
      formula: `
        // installment_tracking_v11.yaml motorunu çağır
        emit('CREATE_INSTALLMENT_SCHEDULE');
      `,
    },
  ],
  
  postconditions: [
    'debtor.installment_plan_status = ACTIVE',
  ],
  
  proof: {
    store: [
      'timestamp',
      'debtor.id',
      'plan_id',
    ],
  },
  
  audit: {
    level: 'controlled_write',
  },
  
  priority: 'HIGH',
  requiresApproval: false,
  isActive: true,
  
  dependsOn: ['SendSettlementOffer'],
  emits: ['CREATE_INSTALLMENT_SCHEDULE', 'INSTALLMENT_PLAN_CREATED'],
  guard: 'SETTLEMENT_ACCEPTED',
};

/**
 * Taksit izleme
 */
export const MONITOR_INSTALLMENTS: Recipe = {
  recipeId: 'MonitorInstallments',
  version: 11,
  name: 'Taksit İzleme',
  description: 'Aktif taksit planlarını günlük olarak izler ve gerekli aksiyonları tetikler',
  
  scope: 'debtor',
  stageTags: ['TAHSILAT'],
  
  trigger: {
    type: 'schedule',
    when: ['EVERY_24_HOURS'],
  },
  
  preconditions: [
    'debtor.installment_plan_status == ACTIVE',
  ],
  
  uyapNavPath: ['(internal)'],
  
  read: {
    fields: [
      'installment.schedule',
      'payment.ledger',
    ],
  },
  
  decisions: [
    {
      if: 'installment.due_in_days == params.installment.reminder_days_before_due',
      then: {
        enqueue: ['SendInstallmentReminder'],
      },
    },
    {
      if: 'installment.missed == true',
      then: {
        emit: 'INSTALLMENT_MISSED',
        enqueue: ['SendInstallmentWarning'],
      },
    },
    {
      if: 'installment.plan_breached == true',
      then: {
        emit: 'PLAN_BREACHED',
        enqueue: ['ReturnToEnforcement'],
      },
    },
  ],
  
  actions: [
    {
      type: 'compute',
      formula: `
        emit('CHECK_INSTALLMENT_DUE_AND_STATUS');
      `,
    },
  ],
  
  postconditions: [
    'case.events += INSTALLMENT_STATUS_SNAPSHOT',
  ],
  
  proof: {
    store: [
      'timestamp',
      'debtor.id',
    ],
  },
  
  audit: {
    level: 'controlled_write',
  },
  
  priority: 'MEDIUM',
  requiresApproval: false,
  isActive: true,
  
  dependsOn: ['RegisterSettlementAcceptance'],
  emits: ['CHECK_INSTALLMENT_DUE_AND_STATUS', 'INSTALLMENT_MISSED', 'PLAN_BREACHED'],
  guard: 'debtor.installment_plan_status == ACTIVE',
};

/**
 * Taksit hatırlatma gönderme
 */
export const SEND_INSTALLMENT_REMINDER: Recipe = {
  recipeId: 'SendInstallmentReminder',
  version: 11,
  name: 'Taksit Hatırlatma',
  description: 'Yaklaşan taksit için SMS hatırlatması gönderir',
  
  scope: 'debtor',
  stageTags: ['TAHSILAT'],
  
  trigger: {
    type: 'event',
    when: ['INSTALLMENT_DUE_SOON'],
  },
  
  preconditions: [
    'client.contact.sms != null',
  ],
  
  uyapNavPath: ['(communication)'],
  
  read: {
    fields: [
      'installment.next_due',
      'installment.amount',
    ],
  },
  
  actions: [
    {
      type: 'notify',
      formula: `
        sendComm({
          templateId: 'SETTLEMENT_REMINDER_TR',
          channel: 'sms',
          variables: {
            case_no: case.uyap_dosya_no,
            installment_amount: installment.amount,
            due_date: installment.next_due,
          }
        });
      `,
    },
  ],
  
  postconditions: [
    'case.events += INSTALLMENT_REMINDER_SENT',
  ],
  
  proof: {
    store: [
      'timestamp',
      'comm_id',
    ],
  },
  
  audit: {
    level: 'controlled_write',
  },
  
  priority: 'MEDIUM',
  requiresApproval: false,
  isActive: true,
  
  emits: ['INSTALLMENT_REMINDER_SENT'],
  guard: 'INSTALLMENT_DUE_SOON',
};

/**
 * Taksit uyarısı gönderme
 */
export const SEND_INSTALLMENT_WARNING: Recipe = {
  recipeId: 'SendInstallmentWarning',
  version: 11,
  name: 'Taksit Uyarısı',
  description: 'Kaçırılan taksit için e-posta uyarısı gönderir',
  
  scope: 'debtor',
  stageTags: ['TAHSILAT'],
  
  trigger: {
    type: 'event',
    when: ['INSTALLMENT_MISSED'],
  },
  
  preconditions: [
    'client.contact.email != null',
  ],
  
  uyapNavPath: ['(communication)'],
  
  read: {
    fields: [
      'installment.next_due',
      'installment.amount',
      'installment.days_past_due',
    ],
  },
  
  actions: [
    {
      type: 'notify',
      formula: `
        sendComm({
          templateId: 'HIGH_RISK_WARNING_TR',
          channel: 'email',
          variables: {
            case_no: case.uyap_dosya_no,
            asset_vehicle_desc: 'Taksit planı',
            risk_score: 70,
          }
        });
      `,
    },
  ],
  
  postconditions: [
    'case.events += INSTALLMENT_WARNING_SENT',
  ],
  
  proof: {
    store: [
      'timestamp',
      'comm_id',
    ],
  },
  
  audit: {
    level: 'controlled_write',
  },
  
  priority: 'HIGH',
  requiresApproval: false,
  isActive: true,
  
  emits: ['INSTALLMENT_WARNING_SENT'],
  guard: 'INSTALLMENT_MISSED',
};

/**
 * İcraya geri dönüş
 */
export const RETURN_TO_ENFORCEMENT: Recipe = {
  recipeId: 'ReturnToEnforcement',
  version: 11,
  name: 'İcraya Geri Dönüş',
  description: 'Taksit planı ihlal edildiğinde icra sürecine geri döner',
  
  scope: 'debtor',
  stageTags: ['TAHSILAT', 'HACIZ'],
  
  trigger: {
    type: 'event',
    when: ['PLAN_BREACHED'],
  },
  
  preconditions: ['true'],
  
  uyapNavPath: ['(internal)'],
  
  read: {
    fields: [
      'debtor.id',
      'settlement.plan',
    ],
  },
  
  actions: [
    {
      type: 'set_flag',
      formula: `
        // Masraf kilidini aç
        locks.LOCK_COST_ACTIONS = false;
      `,
    },
    {
      type: 'create_task',
      taskType: 'RETURN_TO_ENFORCEMENT',
      payload: {
        debtor_id: '{{runtime.debtor_scope_id}}',
        reason: 'Taksit planı ihlali',
      },
    },
  ],
  
  postconditions: [
    'debtor.installment_plan_status = BREACHED',
  ],
  
  proof: {
    store: [
      'timestamp',
      'task_id',
    ],
  },
  
  audit: {
    level: 'controlled_write',
  },
  
  priority: 'HIGH',
  requiresApproval: false,
  isActive: true,
  
  emits: ['RETURN_TO_ENFORCEMENT'],
  guard: 'PLAN_BREACHED',
};

export default [
  REGISTER_SETTLEMENT_ACCEPTANCE,
  MONITOR_INSTALLMENTS,
  SEND_INSTALLMENT_REMINDER,
  SEND_INSTALLMENT_WARNING,
  RETURN_TO_ENFORCEMENT,
];
