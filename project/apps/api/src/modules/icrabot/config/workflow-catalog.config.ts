/**
 * WORKFLOW CATALOG CONFIG v2
 * 
 * İcra iş akışı kataloğu - icra_workflow_catalog_v2.json'dan türetilmiştir.
 * Tüm yaşam döngüsü: Tebligat → Kesinleşme → Varlık → Haciz → Satış → Tahsilat (+ döngüler)
 */

// ==================== ENUMS ====================

export const WORKFLOW_STAGES = [
  'ACILIS',
  'TEBLIGAT', 
  'KESINLESME',
  'VARLIK',
  'HACIZ',
  'SATIS',
  'TAHSILAT',
  'KAPANIS',
] as const;

export type WorkflowStage = typeof WORKFLOW_STAGES[number];

export const TASK_STATUSES = [
  'BEKLIYOR',
  'YAPILACAK',
  'DEVAM_EDIYOR',
  'ONAY_BEKLIYOR',
  'BLOKELI',
  'TAMAMLANDI',
  'IPTAL',
] as const;

export type TaskStatus = typeof TASK_STATUSES[number];

export const TASK_PRIORITIES = {
  high: 10,
  tebligat: 20,
  kesinlesme: 30,
  haciz: 35,
  tahsilat: 40,
  satis: 50,
  varlik: 60,
  report: 80,
} as const;

export const DATA_SOURCES = ['UYAP', 'MANUAL', 'HYBRID'] as const;
export type DataSource = typeof DATA_SOURCES[number];


// ==================== FACT DEFINITIONS ====================

export interface FactDefinition {
  name: string;
  fields: string[];
  stage: WorkflowStage | 'ANY';
  description?: string;
}

export const WORKFLOW_FACTS: Record<string, FactDefinition> = {
  // Tebligat Facts
  TebligatGonderildi: {
    name: 'Tebligat Gönderildi',
    fields: ['debtor_id', 'method', 'sent_date', 'address_type'],
    stage: 'TEBLIGAT',
    description: 'Borçluya tebligat gönderildi',
  },
  TebligTarihi: {
    name: 'Tebliğ Tarihi',
    fields: ['debtor_id', 'service_date', 'service_method'],
    stage: 'TEBLIGAT',
    description: 'Tebligat hukuken geçerli sayıldı',
  },
  TebligatIade: {
    name: 'Tebligat İade',
    fields: ['debtor_id', 'return_date', 'return_reason'],
    stage: 'TEBLIGAT',
    description: 'Tebligat iade/bila geldi',
  },
  YenidenTebligatBasladi: {
    name: 'Yeniden Tebligat Başladı',
    fields: ['debtor_id', 'new_address', 'address_type', 'date'],
    stage: 'TEBLIGAT',
    description: 'Yeni adrese tebligat gönderildi',
  },

  // Kesinleşme Facts
  ItirazGeldi: {
    name: 'İtiraz Geldi',
    fields: ['debtor_id', 'objection_date', 'objection_type'],
    stage: 'KESINLESME',
    description: 'Borçlu itiraz etti',
  },
  Kesinlesti: {
    name: 'Kesinleşti',
    fields: ['debtor_id', 'finalized_date', 'basis'],
    stage: 'KESINLESME',
    description: 'Takip kesinleşti',
  },


  // Varlık Facts
  VarlikBulunduArac: {
    name: 'Araç Varlığı Bulundu',
    fields: ['debtor_id', 'plate', 'make', 'model', 'year', 'vin'],
    stage: 'VARLIK',
    description: 'Borçluya ait araç tespit edildi',
  },
  VarlikBulunduTapu: {
    name: 'Taşınmaz Varlığı Bulundu',
    fields: ['debtor_id', 'city', 'district', 'ada', 'parsel', 'nitelik'],
    stage: 'VARLIK',
    description: 'Borçluya ait taşınmaz tespit edildi',
  },
  VarlikBulunduSGK: {
    name: 'SGK Kaydı Bulundu',
    fields: ['debtor_id', 'employer', 'registry'],
    stage: 'VARLIK',
    description: 'Borçlunun SGK kaydı tespit edildi',
  },
  VarlikYok: {
    name: 'Varlık Bulunamadı',
    fields: ['debtor_id', 'asset_type', 'date'],
    stage: 'VARLIK',
    description: 'Belirtilen varlık türünde kayıt bulunamadı',
  },

  // Haciz Facts
  OnHacizVar: {
    name: 'Ön Haciz Var',
    fields: ['asset_ref', 'creditor_name', 'lien_date', 'rank_order', 'amount_claimed', 'active_status'],
    stage: 'HACIZ',
    description: 'Varlık üzerinde önceki haciz tespit edildi',
  },
  HacizKondu: {
    name: 'Haciz Konuldu',
    fields: ['debtor_id', 'asset_ref', 'date', 'our_rank'],
    stage: 'HACIZ',
    description: 'Varlık üzerine haciz konuldu',
  },

  // Satış Facts
  SatisTalepEdildi: {
    name: 'Satış Talep Edildi',
    fields: ['asset_ref', 'request_date'],
    stage: 'SATIS',
    description: 'Varlık için satış talep edildi',
  },
  IhaleSonucu: {
    name: 'İhale Sonucu',
    fields: ['asset_ref', 'auction_date', 'price', 'buyer'],
    stage: 'SATIS',
    description: 'İhale tamamlandı',
  },

  // Tahsilat Facts
  TahsilatEntry: {
    name: 'Tahsilat Kaydı',
    fields: ['date', 'amount', 'receipt_no', 'description'],
    stage: 'TAHSILAT',
    description: 'Dosyaya ödeme yapıldı',
  },
  ReddiyatEntry: {
    name: 'Reddiyat Kaydı',
    fields: ['date', 'amount', 'receipt_no', 'recipient', 'description'],
    stage: 'TAHSILAT',
    description: 'Alacaklıya ödeme yapıldı',
  },

  // Generic Facts
  Event: {
    name: 'Genel Olay',
    fields: ['key', 'payload'],
    stage: 'ANY',
    description: 'Genel amaçlı olay kaydı',
  },
  Flag: {
    name: 'Bayrak',
    fields: ['key', 'value'],
    stage: 'ANY',
    description: 'Durum bayrağı',
  },
};


// ==================== TASK DEFINITIONS ====================

export interface TaskOutput {
  fact: string;
  map: Record<string, string>;
}

export interface TaskDefinition {
  name: string;
  stage: WorkflowStage;
  priority: number;
  requiredFields: string[];
  outputs: TaskOutput[];
  nextTasks: string[];
  description?: string;
}

export const WORKFLOW_TASKS: Record<string, TaskDefinition> = {
  // ========== TEBLIGAT TASKS ==========
  ENTER_SERVICE_DATE: {
    name: 'Tebliğ Tarihi Gir',
    stage: 'TEBLIGAT',
    priority: TASK_PRIORITIES.tebligat,
    requiredFields: ['debtor_id', 'service_date'],
    outputs: [{ fact: 'TebligTarihi', map: { debtor_id: 'debtor_id', service_date: 'service_date', service_method: 'service_method' } }],
    nextTasks: ['CALCULATE_OBJECTION_DEADLINE', 'ASK_OBJECTION_RECEIVED'],
    description: 'Tebligatın hukuken geçerli sayıldığı tarihi gir',
  },
  ENTER_RETURN: {
    name: 'İade Bilgisi Gir',
    stage: 'TEBLIGAT',
    priority: TASK_PRIORITIES.tebligat,
    requiredFields: ['debtor_id', 'return_date', 'return_reason'],
    outputs: [{ fact: 'TebligatIade', map: { debtor_id: 'debtor_id', return_date: 'return_date', return_reason: 'return_reason' } }],
    nextTasks: ['SELECT_NEW_ADDRESS', 'START_RETEBLIGAT'],
    description: 'Tebligat iade/bila bilgisini gir',
  },
  SELECT_NEW_ADDRESS: {
    name: 'Yeni Adres Seç',
    stage: 'TEBLIGAT',
    priority: TASK_PRIORITIES.tebligat,
    requiredFields: ['debtor_id', 'new_address', 'address_type'],
    outputs: [],
    nextTasks: ['START_RETEBLIGAT'],
    description: 'Yeniden tebligat için adres seç',
  },
  START_RETEBLIGAT: {
    name: 'Yeniden Tebligat Başlat',
    stage: 'TEBLIGAT',
    priority: TASK_PRIORITIES.tebligat,
    requiredFields: ['debtor_id', 'new_address', 'address_type', 'date'],
    outputs: [{ fact: 'YenidenTebligatBasladi', map: { debtor_id: 'debtor_id', new_address: 'new_address', address_type: 'address_type', date: 'date' } }],
    nextTasks: [],
    description: 'Yeni adrese tebligat gönder',
  },


  // ========== KESİNLEŞME TASKS ==========
  ASK_OBJECTION_RECEIVED: {
    name: 'İtiraz Var mı?',
    stage: 'KESINLESME',
    priority: TASK_PRIORITIES.kesinlesme,
    requiredFields: ['debtor_id', 'objection_received'],
    outputs: [],
    nextTasks: ['ENTER_OBJECTION', 'MARK_FINALIZED'],
    description: 'Borçludan itiraz gelip gelmediğini sor',
  },
  ENTER_OBJECTION: {
    name: 'İtiraz Bilgisi Gir',
    stage: 'KESINLESME',
    priority: TASK_PRIORITIES.kesinlesme,
    requiredFields: ['debtor_id', 'objection_date'],
    outputs: [{ fact: 'ItirazGeldi', map: { debtor_id: 'debtor_id', objection_date: 'objection_date', objection_type: 'objection_type' } }],
    nextTasks: [],
    description: 'İtiraz detaylarını kaydet',
  },
  MARK_FINALIZED: {
    name: 'Kesinleşti İşaretle',
    stage: 'KESINLESME',
    priority: TASK_PRIORITIES.kesinlesme,
    requiredFields: ['debtor_id', 'finalized_date'],
    outputs: [{ fact: 'Kesinlesti', map: { debtor_id: 'debtor_id', finalized_date: 'finalized_date', basis: 'basis' } }],
    nextTasks: ['RUN_ASSET_QUERIES'],
    description: 'Takibi kesinleşmiş olarak işaretle',
  },

  // ========== VARLIK TASKS ==========
  RUN_ASSET_QUERIES: {
    name: 'Varlık Sorguları Çalıştır',
    stage: 'VARLIK',
    priority: TASK_PRIORITIES.varlik,
    requiredFields: ['debtor_id'],
    outputs: [],
    nextTasks: ['ADD_VEHICLE_ASSET', 'ADD_TAPU_ASSET', 'ADD_SGK_ASSET', 'MARK_NO_ASSET', 'SCHEDULE_REQUERY'],
    description: 'UYAP üzerinden varlık sorgularını çalıştır',
  },
  ADD_VEHICLE_ASSET: {
    name: 'Araç Varlığı Ekle',
    stage: 'VARLIK',
    priority: TASK_PRIORITIES.varlik,
    requiredFields: ['debtor_id', 'plate'],
    outputs: [{ fact: 'VarlikBulunduArac', map: { debtor_id: 'debtor_id', plate: 'plate', make: 'make', model: 'model', year: 'year', vin: 'vin' } }],
    nextTasks: ['FETCH_PRIOR_LIENS', 'AI_VALUATION', 'COMPUTE_RISK_RECOVERY'],
    description: 'Tespit edilen aracı kaydet',
  },
  ADD_TAPU_ASSET: {
    name: 'Taşınmaz Varlığı Ekle',
    stage: 'VARLIK',
    priority: TASK_PRIORITIES.varlik,
    requiredFields: ['debtor_id', 'city', 'district', 'ada', 'parsel'],
    outputs: [{ fact: 'VarlikBulunduTapu', map: { debtor_id: 'debtor_id', city: 'city', district: 'district', ada: 'ada', parsel: 'parsel', nitelik: 'nitelik' } }],
    nextTasks: ['FETCH_PRIOR_LIENS', 'COMPUTE_RISK_RECOVERY'],
    description: 'Tespit edilen taşınmazı kaydet',
  },
  ADD_SGK_ASSET: {
    name: 'SGK Kaydı Ekle',
    stage: 'VARLIK',
    priority: TASK_PRIORITIES.varlik,
    requiredFields: ['debtor_id', 'employer'],
    outputs: [{ fact: 'VarlikBulunduSGK', map: { debtor_id: 'debtor_id', employer: 'employer', registry: 'registry' } }],
    nextTasks: ['MAAS_HACZI_FLOW'],
    description: 'Tespit edilen SGK kaydını kaydet',
  },
  MARK_NO_ASSET: {
    name: 'Varlık Yok İşaretle',
    stage: 'VARLIK',
    priority: TASK_PRIORITIES.varlik,
    requiredFields: ['debtor_id', 'asset_type', 'date'],
    outputs: [{ fact: 'VarlikYok', map: { debtor_id: 'debtor_id', asset_type: 'asset_type', date: 'date' } }],
    nextTasks: ['SCHEDULE_REQUERY'],
    description: 'Varlık bulunamadığını kaydet',
  },
  SCHEDULE_REQUERY: {
    name: 'Yeniden Sorgu Planla',
    stage: 'VARLIK',
    priority: TASK_PRIORITIES.report,
    requiredFields: ['debtor_id', 'requery_days'],
    outputs: [{ fact: 'Event', map: { key: 'REQUERY_SCHEDULED', payload: '*computed' } }],
    nextTasks: [],
    description: 'Belirli gün sonra yeniden sorgu planla',
  },


  // ========== HACİZ TASKS ==========
  FETCH_PRIOR_LIENS: {
    name: 'Ön Hacizleri Getir',
    stage: 'HACIZ',
    priority: TASK_PRIORITIES.haciz,
    requiredFields: ['asset_ref'],
    outputs: [],
    nextTasks: ['ADD_PRIOR_LIEN', 'COMPUTE_RANK', 'IK100_RISK', 'COMPUTE_RISK_RECOVERY'],
    description: 'Varlık üzerindeki mevcut hacizleri sorgula',
  },
  ADD_PRIOR_LIEN: {
    name: 'Ön Haciz Ekle',
    stage: 'HACIZ',
    priority: TASK_PRIORITIES.haciz,
    requiredFields: ['asset_ref', 'creditor_name', 'lien_date', 'active_status'],
    outputs: [{ fact: 'OnHacizVar', map: { asset_ref: 'asset_ref', creditor_name: 'creditor_name', lien_date: 'lien_date', rank_order: 'rank_order', amount_claimed: 'amount_claimed', active_status: 'active_status' } }],
    nextTasks: ['COMPUTE_RANK', 'IK100_RISK', 'COMPUTE_RISK_RECOVERY'],
    description: 'Tespit edilen ön hacizi kaydet',
  },
  COMPUTE_RANK: {
    name: 'Sıra Hesapla',
    stage: 'HACIZ',
    priority: TASK_PRIORITIES.haciz,
    requiredFields: ['asset_ref'],
    outputs: [{ fact: 'Event', map: { key: 'RANK_COMPUTED', payload: '*computed' } }],
    nextTasks: ['DECIDE_ADVANCE_FLOW', 'PROPOSE_LIEN'],
    description: 'Haciz sıramızı hesapla',
  },
  IK100_RISK: {
    name: 'İİK 100 Risk Analizi',
    stage: 'HACIZ',
    priority: TASK_PRIORITIES.haciz,
    requiredFields: ['asset_ref'],
    outputs: [{ fact: 'Event', map: { key: 'IK100_RISK_COMPUTED', payload: '*computed' } }],
    nextTasks: ['ATTORNEY_REVIEW_IF_HIGH'],
    description: 'İİK 100 iştirak riskini hesapla',
  },
  AI_VALUATION: {
    name: 'AI Değerleme',
    stage: 'HACIZ',
    priority: TASK_PRIORITIES.haciz,
    requiredFields: ['asset_ref', 'plate'],
    outputs: [{ fact: 'Event', map: { key: 'AI_VALUATION_DONE', payload: '*computed' } }],
    nextTasks: ['COMPUTE_RISK_RECOVERY'],
    description: 'Varlığın piyasa değerini AI ile tahmin et',
  },
  COMPUTE_RISK_RECOVERY: {
    name: 'Tahsilat Riski Hesapla',
    stage: 'HACIZ',
    priority: TASK_PRIORITIES.haciz,
    requiredFields: [],
    outputs: [{ fact: 'Event', map: { key: 'RISK_RECOVERY_COMPUTED', payload: '*computed' } }],
    nextTasks: ['LOCKS_IF_NEEDED', 'PROPOSE_LIEN'],
    description: 'Beklenen tahsilat ve risk skorunu hesapla',
  },
  ATTORNEY_REVIEW_IF_HIGH: {
    name: 'Avukat İncelemesi (Yüksek Risk)',
    stage: 'HACIZ',
    priority: TASK_PRIORITIES.high,
    requiredFields: ['reason'],
    outputs: [{ fact: 'Flag', map: { key: 'needs_attorney_review', value: 'true' } }],
    nextTasks: [],
    description: 'Risk yüksekse avukat onayı iste',
  },
  DECIDE_ADVANCE_FLOW: {
    name: 'Avans Akışı Kararı',
    stage: 'HACIZ',
    priority: TASK_PRIORITIES.high,
    requiredFields: ['our_rank'],
    outputs: [],
    nextTasks: ['REQUEST_ADVANCE', 'SKIP_ADVANCE_AND_MONITOR'],
    description: 'Avans gerekip gerekmediğine karar ver',
  },
  REQUEST_ADVANCE: {
    name: 'Avans Talep Et',
    stage: 'HACIZ',
    priority: TASK_PRIORITIES.high,
    requiredFields: ['amount', 'due_date', 'purpose', 'client_contact'],
    outputs: [{ fact: 'Flag', map: { key: 'awaiting_cost_advance', value: 'true' } }],
    nextTasks: ['WAIT_PAYMENT', 'REMIND_PAYMENT'],
    description: 'Müvekkilden avans talep et',
  },
  WAIT_PAYMENT: {
    name: 'Ödeme Bekle',
    stage: 'HACIZ',
    priority: TASK_PRIORITIES.high,
    requiredFields: [],
    outputs: [],
    nextTasks: ['CONFIRM_PAYMENT'],
    description: 'Müvekkil ödemesini bekle',
  },
  CONFIRM_PAYMENT: {
    name: 'Ödeme Onayla',
    stage: 'HACIZ',
    priority: TASK_PRIORITIES.high,
    requiredFields: ['amount', 'date'],
    outputs: [{ fact: 'Event', map: { key: 'PAYMENT_CONFIRMED', payload: '*manual' } }],
    nextTasks: ['PLACE_LIEN', 'REQUEST_SALE'],
    description: 'Avans ödemesini onayla',
  },
  PROPOSE_LIEN: {
    name: 'Haciz Öner',
    stage: 'HACIZ',
    priority: TASK_PRIORITIES.high,
    requiredFields: ['asset_ref'],
    outputs: [{ fact: 'Flag', map: { key: 'needs_attorney_review', value: 'true' } }],
    nextTasks: ['PLACE_LIEN'],
    description: 'Haciz konulmasını öner',
  },
  PLACE_LIEN: {
    name: 'Haciz Koy',
    stage: 'HACIZ',
    priority: TASK_PRIORITIES.high,
    requiredFields: ['debtor_id', 'asset_ref', 'date', 'our_rank'],
    outputs: [{ fact: 'HacizKondu', map: { debtor_id: 'debtor_id', asset_ref: 'asset_ref', date: 'date', our_rank: 'our_rank' } }],
    nextTasks: ['SALE_STRATEGY'],
    description: 'Varlık üzerine haciz koy',
  },
  MAAS_HACZI_FLOW: {
    name: 'Maaş Haczi Akışı',
    stage: 'HACIZ',
    priority: TASK_PRIORITIES.haciz,
    requiredFields: ['debtor_id', 'employer'],
    outputs: [{ fact: 'Event', map: { key: 'MAAS_HACZI_INIT', payload: '*manual' } }],
    nextTasks: ['COMPUTE_RISK_RECOVERY', 'REQUEST_ADVANCE'],
    description: 'Maaş haczi sürecini başlat',
  },


  // ========== SATIŞ TASKS ==========
  SALE_STRATEGY: {
    name: 'Satış Stratejisi Belirle',
    stage: 'SATIS',
    priority: TASK_PRIORITIES.satis,
    requiredFields: ['asset_ref', 'strategy'],
    outputs: [{ fact: 'Event', map: { key: 'SALE_STRATEGY_SET', payload: '*manual' } }],
    nextTasks: ['REQUEST_SALE', 'MONITOR_SALE'],
    description: 'Varlık için satış stratejisi belirle',
  },
  REQUEST_SALE: {
    name: 'Satış Talep Et',
    stage: 'SATIS',
    priority: TASK_PRIORITIES.satis,
    requiredFields: ['asset_ref', 'request_date'],
    outputs: [{ fact: 'SatisTalepEdildi', map: { asset_ref: 'asset_ref', request_date: 'request_date' } }],
    nextTasks: ['MONITOR_SALE'],
    description: 'İcra dairesinden satış talep et',
  },
  MONITOR_SALE: {
    name: 'Satış Takibi',
    stage: 'SATIS',
    priority: TASK_PRIORITIES.satis,
    requiredFields: ['asset_ref'],
    outputs: [{ fact: 'Event', map: { key: 'SALE_STATUS_CHECKED', payload: '*computed' } }],
    nextTasks: ['ENTER_AUCTION_RESULT'],
    description: 'Satış sürecini takip et',
  },
  ENTER_AUCTION_RESULT: {
    name: 'İhale Sonucu Gir',
    stage: 'SATIS',
    priority: TASK_PRIORITIES.satis,
    requiredFields: ['asset_ref', 'auction_date', 'price'],
    outputs: [{ fact: 'IhaleSonucu', map: { asset_ref: 'asset_ref', auction_date: 'auction_date', price: 'price', buyer: 'buyer' } }],
    nextTasks: ['ENTER_COLLECTION', 'ENTER_REDDIYAT', 'REAL_DISTRIBUTION_COMPUTE'],
    description: 'İhale sonucunu kaydet',
  },

  // ========== TAHSİLAT TASKS ==========
  ENTER_COLLECTION: {
    name: 'Tahsilat Gir',
    stage: 'TAHSILAT',
    priority: TASK_PRIORITIES.tahsilat,
    requiredFields: ['date', 'amount'],
    outputs: [{ fact: 'TahsilatEntry', map: { date: 'date', amount: 'amount', receipt_no: 'receipt_no', description: 'description' } }],
    nextTasks: ['REAL_DISTRIBUTION_COMPUTE'],
    description: 'Dosyaya gelen ödemeyi kaydet',
  },
  ENTER_REDDIYAT: {
    name: 'Reddiyat Gir',
    stage: 'TAHSILAT',
    priority: TASK_PRIORITIES.tahsilat,
    requiredFields: ['date', 'amount', 'recipient'],
    outputs: [{ fact: 'ReddiyatEntry', map: { date: 'date', amount: 'amount', receipt_no: 'receipt_no', recipient: 'recipient', description: 'description' } }],
    nextTasks: ['REAL_DISTRIBUTION_COMPUTE'],
    description: 'Alacaklıya yapılan ödemeyi kaydet',
  },
  REAL_DISTRIBUTION_COMPUTE: {
    name: 'Gerçek Dağıtım Hesapla',
    stage: 'TAHSILAT',
    priority: TASK_PRIORITIES.tahsilat,
    requiredFields: [],
    outputs: [{ fact: 'Event', map: { key: 'REAL_DISTRIBUTION_COMPUTED', payload: '*computed' } }],
    nextTasks: ['SETTLEMENT_PROPOSE', 'RETURN_TO_ENFORCEMENT_IF_BREACH'],
    description: 'Tahsilatın dağıtımını hesapla',
  },
  SETTLEMENT_PROPOSE: {
    name: 'Sulh Öner',
    stage: 'TAHSILAT',
    priority: TASK_PRIORITIES.tahsilat,
    requiredFields: ['remaining_claim', 'behavior_class'],
    outputs: [{ fact: 'Event', map: { key: 'SETTLEMENT_PROPOSED', payload: '*computed' } }],
    nextTasks: ['SEND_SETTLEMENT_OFFER', 'MONITOR_INSTALLMENTS'],
    description: 'Borçluya sulh/taksit öner',
  },
  SEND_SETTLEMENT_OFFER: {
    name: 'Sulh Teklifi Gönder',
    stage: 'TAHSILAT',
    priority: TASK_PRIORITIES.tahsilat,
    requiredFields: ['debtor_contact', 'plan'],
    outputs: [{ fact: 'Event', map: { key: 'SETTLEMENT_OFFER_SENT', payload: '*manual' } }],
    nextTasks: ['MONITOR_INSTALLMENTS'],
    description: 'Borçluya sulh teklifini ilet',
  },
  MONITOR_INSTALLMENTS: {
    name: 'Taksit Takibi',
    stage: 'TAHSILAT',
    priority: TASK_PRIORITIES.tahsilat,
    requiredFields: ['plan_id'],
    outputs: [{ fact: 'Event', map: { key: 'INSTALLMENT_STATUS_CHECKED', payload: '*computed' } }],
    nextTasks: ['RETURN_TO_ENFORCEMENT_IF_BREACH'],
    description: 'Taksit ödemelerini takip et',
  },
  RETURN_TO_ENFORCEMENT_IF_BREACH: {
    name: 'İhlalde Hacize Dön',
    stage: 'HACIZ',
    priority: TASK_PRIORITIES.high,
    requiredFields: ['breach_detected'],
    outputs: [{ fact: 'Event', map: { key: 'RETURN_TO_ENFORCEMENT', payload: '*computed' } }],
    nextTasks: ['RUN_ASSET_QUERIES', 'FETCH_PRIOR_LIENS'],
    description: 'Taksit ihlalinde haciz sürecine geri dön',
  },
};


// ==================== FACT TO TASK MAPPINGS ====================

/**
 * Bir fact oluştuğunda hangi task'ların tetikleneceği
 */
export const FACT_TO_TASKS_MAP: Record<string, string[]> = {
  TebligTarihi: ['ASK_OBJECTION_RECEIVED'],
  TebligatIade: ['SELECT_NEW_ADDRESS', 'START_RETEBLIGAT'],
  Kesinlesti: ['RUN_ASSET_QUERIES'],
  VarlikBulunduArac: ['FETCH_PRIOR_LIENS', 'AI_VALUATION', 'COMPUTE_RISK_RECOVERY'],
  VarlikBulunduTapu: ['FETCH_PRIOR_LIENS', 'COMPUTE_RISK_RECOVERY'],
  VarlikBulunduSGK: ['MAAS_HACZI_FLOW'],
  OnHacizVar: ['COMPUTE_RANK', 'IK100_RISK', 'COMPUTE_RISK_RECOVERY'],
  HacizKondu: ['SALE_STRATEGY'],
  SatisTalepEdildi: ['MONITOR_SALE'],
  IhaleSonucu: ['ENTER_COLLECTION', 'ENTER_REDDIYAT', 'REAL_DISTRIBUTION_COMPUTE'],
  TahsilatEntry: ['REAL_DISTRIBUTION_COMPUTE'],
  ReddiyatEntry: ['REAL_DISTRIBUTION_COMPUTE'],
};

// ==================== HELPER FUNCTIONS ====================

/**
 * Fact'in tetiklediği task'ları getir
 */
export function getTasksTriggeredByFact(factName: string): string[] {
  return FACT_TO_TASKS_MAP[factName] || [];
}

/**
 * Task'ın sonraki task'larını getir
 */
export function getNextTasks(taskId: string): string[] {
  return WORKFLOW_TASKS[taskId]?.nextTasks || [];
}

/**
 * Task'ın stage'ini getir
 */
export function getTaskStage(taskId: string): WorkflowStage | null {
  return WORKFLOW_TASKS[taskId]?.stage || null;
}

/**
 * Stage'e ait task'ları getir
 */
export function getTasksByStage(stage: WorkflowStage): string[] {
  return Object.entries(WORKFLOW_TASKS)
    .filter(([_, task]) => task.stage === stage)
    .map(([id]) => id);
}

/**
 * Task'ın output fact'lerini getir
 */
export function getTaskOutputFacts(taskId: string): string[] {
  return WORKFLOW_TASKS[taskId]?.outputs.map(o => o.fact) || [];
}

/**
 * Fact'in hangi stage'e ait olduğunu getir
 */
export function getFactStage(factName: string): WorkflowStage | 'ANY' | null {
  return WORKFLOW_FACTS[factName]?.stage || null;
}

/**
 * Tüm fact isimlerini getir
 */
export function getAllFactNames(): string[] {
  return Object.keys(WORKFLOW_FACTS);
}

/**
 * Tüm task isimlerini getir
 */
export function getAllTaskNames(): string[] {
  return Object.keys(WORKFLOW_TASKS);
}

/**
 * Task'ın zorunlu alanlarını getir
 */
export function getTaskRequiredFields(taskId: string): string[] {
  return WORKFLOW_TASKS[taskId]?.requiredFields || [];
}

/**
 * Task'ın önceliğini getir
 */
export function getTaskPriority(taskId: string): number {
  return WORKFLOW_TASKS[taskId]?.priority || TASK_PRIORITIES.report;
}

/**
 * Önceliğe göre sıralı task listesi
 */
export function getTasksSortedByPriority(taskIds: string[]): string[] {
  return [...taskIds].sort((a, b) => getTaskPriority(a) - getTaskPriority(b));
}
