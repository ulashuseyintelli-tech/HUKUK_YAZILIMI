/**
 * REQUEST YAKALAMA AVANSI RECIPE v5
 * 
 * Araç yakalama için müvekkilden avans talebi workflow'u.
 * recipes_v5_extensions.yaml'dan implement edilmiştir.
 */

import { Recipe } from '../../types/recipe.types';

export const REQUEST_YAKALAMA_AVANSI: Recipe = {
  recipeId: 'RequestYakalamaAvansi_Communication',
  version: 5,
  name: 'Yakalama Avansı Talep Et',
  description: 'Araç yakalama için müvekkilden avans talebi gönderir',
  
  scope: 'debtor',
  stageTags: ['HACIZ'],
  
  trigger: {
    type: 'event',
    when: ['HACIZ_RECOMMENDED'],
  },
  
  preconditions: [
    'locks.LOCK_COST_ACTIONS == false',
    'context.our_rank == 1',
    'asset.type == VEHICLE',
    'case.yakalamaAvansRequested != true',
  ],
  
  uyapNavPath: ['(communication)'],
  
  read: {
    fields: [
      'client.contact',
      'client.name',
      'client.email',
      'cost.amount_suggested',
      'cost.due_date',
      'asset.plate',
      'asset.make',
      'asset.model',
      'asset.year',
      'case.uyap_dosya_no',
    ],
  },
  
  decisions: [
    {
      if: 'client.email != null',
      then: {
        set: 'comm.channel=EMAIL',
      },
    },
    {
      if: 'client.email == null && client.phone != null',
      then: {
        set: 'comm.channel=SMS',
      },
    },
  ],
  
  actions: [
    {
      type: 'compute',
      formula: `
        // Avans tutarını hesapla
        cost_amount = params.cost_budgets.yakalama_avansi || 5000;
        
        // Son ödeme tarihi (7 gün sonra)
        due_date = addDays(now(), 7);
        
        // Araç açıklaması
        vehicle_desc = asset.plate + ' - ' + asset.make + ' ' + asset.model + ' (' + asset.year + ')';
      `,
    },
    {
      type: 'notify',
      formula: `
        // İletişim şablonu gönder
        sendCommunication({
          templateId: 'YAKALAMA_AVANSI_REQUEST_TR',
          channel: comm.channel || 'EMAIL',
          recipient: client.email || client.phone,
          variables: {
            dosyaNo: case.uyap_dosya_no,
            muvekkilAdi: client.name,
            plaka: asset.plate,
            markaModel: asset.make + ' ' + asset.model,
            yil: asset.year,
            tahminiDeger: asset.valuation?.value_mid,
            hacizSirasi: context.our_rank,
            onHacizVar: context.prior_liens_count > 0,
            onHacizSayisi: context.prior_liens_count,
            avanstutar: cost_amount,
            sonOdemeTarihi: formatDate(due_date),
          }
        });
      `,
    },
  ],
  
  postconditions: [
    'case.events += AVANS_REQUESTED(type=YAKALAMA, amount=cost_amount)',
    'case.yakalamaAvansRequested = true',
    'case.yakalamaAvansRequestedAt = now()',
  ],
  
  proof: {
    store: [
      'timestamp',
      'comm_id',
      'cost_amount',
      'due_date',
      'asset.plate',
      'client.email',
    ],
  },
  
  audit: {
    level: 'controlled_write',
    retainDays: 3650,
  },
  
  priority: 'HIGH',
  requiresApproval: false,
  isActive: true,
  
  dependsOn: ['CalculateLienRank', 'ProposeHacizPackage_Debtor'],
  emits: ['AVANS_REQUESTED'],
  guard: 'HACIZ_RECOMMENDED && our_rank == 1 && asset.type == VEHICLE',
};

export const WAIT_FOR_ADVANCE_PAYMENT: Recipe = {
  recipeId: 'WaitForAdvancePayment',
  version: 5,
  name: 'Avans Ödemesi Bekle',
  description: 'Avans ödemesi gelene kadar yakalama işlemlerini bloklar',
  
  stageTags: ['HACIZ'],
  
  trigger: {
    type: 'event',
    when: ['AVANS_REQUESTED'],
  },
  
  preconditions: [
    'case.yakalamaAvansRequested == true',
    'case.yakalamaAvansReceived != true',
  ],
  
  uyapNavPath: ['(internal)'],
  
  read: {
    fields: [
      'case.yakalamaAvansRequestedAt',
      'payment.confirmed',
    ],
  },
  
  decisions: [
    {
      if: 'payment.confirmed == true',
      then: {
        enqueue: ['UnblockAfterPayment'],
      },
    },
  ],
  
  actions: [
    {
      type: 'compute',
      formula: `
        // Yakalama task grubunu blokla
        blockTaskGroup('YAKALAMA', 'Avans bekleniyor');
        
        // Lock aç
        openLock('LOCK_COST_ACTIONS', 'Yakalama avansı bekleniyor');
      `,
    },
  ],
  
  postconditions: [
    'locks.LOCK_COST_ACTIONS = true',
    'case.waitingForYakalamaAvans = true',
  ],
  
  proof: {
    store: [
      'timestamp',
      'lock_id',
    ],
  },
  
  audit: {
    level: 'controlled_write',
  },
  
  priority: 'NORMAL',
  requiresApproval: false,
  isActive: true,
  
  dependsOn: ['RequestYakalamaAvansi_Communication'],
  emits: ['LOCK_OPENED'],
  guard: 'AVANS_REQUESTED',
};

export const UNBLOCK_AFTER_PAYMENT: Recipe = {
  recipeId: 'UnblockAfterPayment',
  version: 5,
  name: 'Ödeme Sonrası Blokları Kaldır',
  description: 'Avans ödemesi alındıktan sonra yakalama işlemlerini açar',
  
  stageTags: ['HACIZ'],
  
  trigger: {
    type: 'event',
    when: ['PAYMENT_CONFIRMED'],
  },
  
  preconditions: [
    'locks.LOCK_COST_ACTIONS == true',
    'payment.type == YAKALAMA_AVANSI',
  ],
  
  uyapNavPath: ['(internal)'],
  
  read: {
    fields: [
      'payment.receipt_ref',
      'payment.amount',
      'payment.confirmed_at',
    ],
  },
  
  actions: [
    {
      type: 'compute',
      formula: `
        // Lock'u kapat
        releaseLock('LOCK_COST_ACTIONS', 'Avans alındı: ' + payment.receipt_ref);
        
        // Task grubunu aç
        unblockTaskGroup('YAKALAMA');
      `,
    },
  ],
  
  postconditions: [
    'locks.LOCK_COST_ACTIONS = false',
    'case.yakalamaAvansReceived = true',
    'case.yakalamaAvansReceivedAt = now()',
    'case.events += AVANS_CONFIRMED(type=YAKALAMA, amount=payment.amount)',
  ],
  
  proof: {
    store: [
      'timestamp',
      'payment.receipt_ref',
      'payment.amount',
    ],
  },
  
  audit: {
    level: 'controlled_write',
  },
  
  priority: 'HIGH',
  requiresApproval: false,
  isActive: true,
  
  dependsOn: ['WaitForAdvancePayment'],
  emits: ['AVANS_CONFIRMED', 'LOCK_RELEASED'],
  guard: 'PAYMENT_CONFIRMED && payment.type == YAKALAMA_AVANSI',
};

export const REQUIRE_ATTORNEY_DECISION: Recipe = {
  recipeId: 'RequireAttorneyDecision',
  version: 5,
  name: 'Avukat Kararı Gerekli',
  description: 'Yüksek risk veya düşük getiri durumunda avukat onayı ister',
  
  stageTags: ['VARLIK', 'HACIZ', 'TEBLIGAT', 'KESINLESME'],
  
  trigger: {
    type: 'event',
    when: ['LOCK_OPENED', 'HIGH_RISK', 'LOW_NET_RECOVERY'],
  },
  
  preconditions: [],
  
  uyapNavPath: ['(internal)'],
  
  read: {
    fields: [
      'risk.score',
      'risk.level',
      'expected_recovery.expected_net_mid',
      'context.reason',
      'asset.id',
      'asset.type',
    ],
  },
  
  actions: [
    {
      type: 'compute',
      formula: `
        // Avukat inceleme görevi oluştur
        createTask({
          type: 'ATTORNEY_REVIEW',
          priority: 'HIGH',
          payload: {
            riskScore: risk.score,
            riskLevel: risk.level,
            expectedNetMid: expected_recovery.expected_net_mid,
            reason: context.reason,
            assetId: asset.id,
            assetType: asset.type,
          }
        });
      `,
    },
    {
      type: 'notify',
      formula: `
        // Avukata bildirim gönder
        sendNotification({
          templateId: 'ISTIRAK_RISKI_UYARISI',
          channel: 'IN_APP',
          recipient: 'ATTORNEY',
          variables: {
            dosyaNo: case.uyap_dosya_no,
            riskSkoru: risk.score,
            riskSeviyesi: risk.level,
            tahminiPay: expected_recovery.expected_net_mid,
            oneri: context.reason,
          }
        });
      `,
    },
  ],
  
  postconditions: [
    'case.next_actions += ATTORNEY_REVIEW',
    'case.awaitingAttorneyDecision = true',
  ],
  
  proof: {
    store: [
      'timestamp',
      'task_id',
      'risk.score',
      'expected_recovery.expected_net_mid',
    ],
  },
  
  audit: {
    level: 'controlled_write',
  },
  
  priority: 'HIGH',
  requiresApproval: false,
  isActive: true,
  
  emits: ['ATTORNEY_REVIEW_REQUESTED'],
  guard: 'LOCK_OPENED || risk.level in [HIGH, CRITICAL]',
};

export default [
  REQUEST_YAKALAMA_AVANSI,
  WAIT_FOR_ADVANCE_PAYMENT,
  UNBLOCK_AFTER_PAYMENT,
  REQUIRE_ATTORNEY_DECISION,
];
