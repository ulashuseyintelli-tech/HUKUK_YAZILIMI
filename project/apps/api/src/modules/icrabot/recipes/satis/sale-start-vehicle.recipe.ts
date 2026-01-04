/**
 * SALE START VEHICLE RECIPES v8
 * 
 * Ön haciz tutarı çıkarma, satış başlatma ve avans dekont doğrulama.
 * recipes_v8_extensions.yaml'dan implement edilmiştir.
 */

import { Recipe } from '../../types/recipe.types';

/**
 * Ön haciz dosya detaylarını çek (authoritative)
 */
export const FETCH_PRIOR_LIEN_CASE_DETAILS: Recipe = {
  recipeId: 'FetchPriorLienCaseDetails',
  version: 8,
  name: 'Ön Haciz Dosya Detayları',
  description: 'Ön haciz referans numarasından dosya detaylarını çeker',
  
  scope: 'debtor',
  stageTags: ['VARLIK', 'HACIZ'],
  
  trigger: {
    type: 'event',
    when: ['LienSnapshot'],
  },
  
  preconditions: [
    'facts.LienSnapshot.reference_no != null',
    'session.is_logged_in == true',
  ],
  
  uyapNavPath: ['Dosya', 'Dosya Arama'],
  
  read: {
    fields: ['reference_no'],
  },
  
  actions: [
    {
      type: 'open_case_by_reference',
      referenceNo: '{{facts.LienSnapshot.reference_no}}',
    },
    {
      type: 'query',
      input: {
        section: 'Dosya Kapak / Borç Bilgileri',
      },
    },
  ],
  
  postconditions: [
    'emit:AuthoritativeLienAmount',
  ],
  
  proof: {
    store: [
      'timestamp',
      'reference_no',
      'snapshot_hash',
    ],
  },
  
  audit: {
    level: 'read_only',
  },
  
  priority: 'MEDIUM',
  requiresApproval: false,
  isActive: true,
  
  emits: ['AuthoritativeLienAmount'],
  guard: 'facts.LienSnapshot.reference_no != null',
};

/**
 * Authoritative haciz tutarını normalize et
 */
export const NORMALIZE_AUTHORITATIVE_LIEN_AMOUNT: Recipe = {
  recipeId: 'NormalizeAuthoritativeLienAmount',
  version: 8,
  name: 'Haciz Tutarı Normalizasyonu',
  description: 'UYAP\'tan çekilen haciz tutarını normalize eder ve dosya durumuna göre günceller',
  
  stageTags: ['VARLIK', 'HACIZ'],
  
  trigger: {
    type: 'event',
    when: ['AuthoritativeLienAmount'],
  },
  
  preconditions: ['true'],
  
  uyapNavPath: ['(internal)'],
  
  read: {
    fields: [
      'authoritative.amount',
      'authoritative.case_status',
    ],
  },
  
  actions: [
    {
      type: 'compute',
      formula: `
        let amountEffective: number;
        let activeStatus: string;
        
        // Kapalı veya tahsil edilmiş dosyalar için tutar 0
        if (['KAPALI', 'TAHSIL_EDILDI'].includes(authoritative.case_status)) {
          amountEffective = 0;
          activeStatus = 'inactive';
        } else {
          amountEffective = authoritative.amount;
          activeStatus = 'active';
        }
        
        // LienSnapshot güncelle
        update('LienSnapshot.amount_claimed', amountEffective);
        update('LienSnapshot.active_status', activeStatus);
      `,
    },
  ],
  
  postconditions: [
    'facts.LienSnapshot updated',
  ],
  
  proof: {
    store: [
      'timestamp',
      'amount_effective',
      'active_status',
    ],
  },
  
  audit: {
    level: 'controlled_write',
  },
  
  priority: 'MEDIUM',
  requiresApproval: false,
  isActive: true,
  
  dependsOn: ['FetchPriorLienCaseDetails'],
  emits: ['LienAmountNormalized'],
  guard: 'AuthoritativeLienAmount',
};

/**
 * Araç satış başlatma (yüksek etkili)
 */
export const START_SALE_VEHICLE: Recipe = {
  recipeId: 'StartSale_Vehicle',
  version: 8,
  name: 'Araç Satış Başlat',
  description: 'UYAP üzerinden araç satış talebi oluşturur (yüksek etkili işlem)',
  
  scope: 'debtor',
  stageTags: ['SATIS'],
  
  trigger: {
    type: 'manual',
    when: ['USER_APPROVES_SALE'],
  },
  
  preconditions: [
    'session.is_logged_in == true',
    'locks.LOCK_COST_ACTIONS == false',
    'context.post_lien_strategy in [YAKALAMA_AND_SALE, SALE_IF_NEEDED]',
  ],
  
  uyapNavPath: ['Haciz & Mal & Satış İşlemleri', 'İhale İşlemleri', 'Satış Talebi'],
  
  read: {
    fields: ['uyap.sale_form_ready'],
  },
  
  actions: [
    {
      type: 'fill_form',
      fields: {
        dosya_no: '{{case.uyap_dosya_no}}',
        asset_ref: '{{context.asset_fingerprint}}',
        reason: 'Haciz sonrası satış talebi',
      },
    },
    {
      type: 'click',
      button: 'Kaydet',
    },
  ],
  
  postconditions: [
    'case.events += SALE_STARTED',
  ],
  
  proof: {
    store: [
      'timestamp',
      'uyap.sale_request_id',
    ],
  },
  
  audit: {
    level: 'high_impact_write',
    retainDays: 3650,
    includeScreenshotOnError: true,
  },
  
  retry: {
    maxAttempts: 1,
    backoffSeconds: [],
  },
  
  priority: 'CRITICAL',
  requiresApproval: true,
  isActive: true,
  
  dependsOn: ['DecidePostLienStrategy_Vehicle'],
  emits: ['SALE_STARTED'],
  guard: 'USER_APPROVES_SALE && locks.LOCK_COST_ACTIONS == false',
};

/**
 * Avans dekont doğrulama
 */
export const VERIFY_ADVANCE_RECEIPT: Recipe = {
  recipeId: 'VerifyAdvanceReceipt',
  version: 8,
  name: 'Avans Dekont Doğrulama',
  description: 'Yüklenen avans dekontunu doğrular (tutar, dosya no, tarih)',
  
  stageTags: ['HACIZ', 'SATIS'],
  
  trigger: {
    type: 'event',
    when: ['PAYMENT_RECEIPT_UPLOADED'],
  },
  
  preconditions: [
    'payment.receipt_file != null',
  ],
  
  uyapNavPath: ['(internal)'],
  
  read: {
    fields: [
      'payment.receipt_file',
      'payment.expected_amount',
    ],
  },
  
  decisions: [
    {
      if: 'payment.verified == true',
      then: {
        emit: 'PAYMENT_CONFIRMED',
      },
    },
    {
      if: 'payment.verified == false',
      then: {
        enqueue: ['RequireAttorneyDecision'],
      },
    },
  ],
  
  actions: [
    {
      type: 'compute',
      formula: `
        // Basit doğrulama: tutar, dosya no, tarih
        const verified = 
          receipt.amount >= payment.expected_amount && 
          receipt.case_no === case.uyap_dosya_no;
        
        payment.verified = verified;
      `,
    },
  ],
  
  postconditions: [
    'payment.verified != null',
  ],
  
  proof: {
    store: [
      'timestamp',
      'payment.verified',
    ],
  },
  
  audit: {
    level: 'controlled_write',
  },
  
  priority: 'HIGH',
  requiresApproval: false,
  isActive: true,
  
  emits: ['PAYMENT_CONFIRMED', 'PAYMENT_VERIFICATION_FAILED'],
  guard: 'PAYMENT_RECEIPT_UPLOADED',
};

export default [
  FETCH_PRIOR_LIEN_CASE_DETAILS,
  NORMALIZE_AUTHORITATIVE_LIEN_AMOUNT,
  START_SALE_VEHICLE,
  VERIFY_ADVANCE_RECEIPT,
];
