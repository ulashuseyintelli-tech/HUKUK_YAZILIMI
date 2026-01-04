/**
 * OPS RUNBOOK CONFIG (v12)
 * 
 * Operasyonel prosedürler ve hata senaryoları.
 */

// Runbook entry
export interface RunbookEntry {
  id: string;
  title: string;
  category: RunbookCategory;
  severity: 'info' | 'warning' | 'critical';
  symptoms: string[];
  diagnosis: string[];
  resolution: string[];
  escalation?: string;
  relatedRecipes?: string[];
}

export type RunbookCategory = 
  | 'daily_check'
  | 'ui_error'
  | 'tebligat_error'
  | 'tahsilat_error'
  | 'degraded_mode'
  | 'rollback';

// Daily check procedures
export const DAILY_CHECK_PROCEDURES: RunbookEntry[] = [
  {
    id: 'DC001',
    title: 'Job Monitor Kontrolü',
    category: 'daily_check',
    severity: 'info',
    symptoms: ['Günlük rutin'],
    diagnosis: [
      'Job Monitor ekranını aç',
      'failed/quarantined işleri filtrele',
      'Son 24 saat içindeki hataları incele',
    ],
    resolution: [
      'Her failed job için hata kodunu kontrol et',
      'Geçici hatalar için retry yap',
      'Kalıcı hatalar için quarantine et ve avukata bildir',
    ],
    relatedRecipes: ['*'],
  },
  {
    id: 'DC002',
    title: 'Locks Dashboard Kontrolü',
    category: 'daily_check',
    severity: 'info',
    symptoms: ['Günlük rutin'],
    diagnosis: [
      'Locks Dashboard ekranını aç',
      'Açık kilitleri listele',
      'Her kilidin nedenini kontrol et',
    ],
    resolution: [
      'LOCK_COST_ACTIONS: Avans ödemesi teyidi al',
      'LOCK_EXECUTION_ACTIONS: Avukat onayı iste',
      'LOCK_SETTLEMENT: Uzlaşma kararı bekle',
    ],
    relatedRecipes: ['WaitForAdvancePayment', 'RequireAttorneyDecision'],
  },
  {
    id: 'DC003',
    title: 'UI Map Health Check',
    category: 'daily_check',
    severity: 'info',
    symptoms: ['Günlük rutin'],
    diagnosis: [
      'UI Map Registry ekranını aç',
      'Health score < 80 olan ekranları filtrele',
      'Element bulunma oranlarını incele',
    ],
    resolution: [
      'Düşük skor varsa: UYAP ekranı değişmiş olabilir',
      'Locator güncelle veya degraded mode aç',
    ],
    relatedRecipes: ['*'],
  },
];

// Error scenarios
export const ERROR_SCENARIOS: RunbookEntry[] = [
  {
    id: 'ERR001',
    title: 'Element Bulunamadı (UI Değişmiş)',
    category: 'ui_error',
    severity: 'warning',
    symptoms: [
      'Job failed: ELEMENT_NOT_FOUND',
      'Birden fazla recipe aynı ekranda başarısız',
    ],
    diagnosis: [
      'UI Map Registry -> ilgili screen',
      'Son başarılı job snapshot ile karşılaştır',
      'UYAP ekranında manuel kontrol yap',
    ],
    resolution: [
      'Locator güncelle (CSS selector / XPath)',
      '1 dosyada dry-run validate çalıştır',
      'Başarılı ise recipe enable et',
      'Başarısız ise degraded mode aç',
    ],
    escalation: 'Admin',
    relatedRecipes: ['FetchPreparedETebligatlar_Debtor', 'SyncSafahatTimeline'],
  },
  {
    id: 'ERR002',
    title: 'Mazbata Gecikmesi',
    category: 'tebligat_error',
    severity: 'warning',
    symptoms: [
      'Tebliğ tarihi + 5 gün geçti ama mazbata yok',
      'MazbataSorgula_ETebligat_Debtor başarısız',
    ],
    diagnosis: [
      'FetchPreparedETebligatlar_Debtor snapshot kontrol',
      'UYAP ekranında manuel mazbata sorgula',
      'PTT/sistem gecikmesi olabilir',
    ],
    resolution: [
      'MazbataSorgula retry (max 3 kez)',
      '3 gün üstü gecikme: avukat onayı iste',
      'Manuel kontrol sonucu sisteme işle',
    ],
    escalation: 'Avukat',
    relatedRecipes: ['MazbataSorgula_ETebligat_Debtor', 'ComputeServiceEffectiveDate_ETebligat_Debtor'],
  },
  {
    id: 'ERR003',
    title: 'Tahsilat Net Negatif',
    category: 'tahsilat_error',
    severity: 'critical',
    symptoms: [
      'ComputeRealDistribution: remaining_claim < 0',
      'Anomali A1 tetiklendi',
    ],
    diagnosis: [
      'ComputeRealDistribution çıktısını incele',
      'Tahsilat ve reddiyat kayıtlarını karşılaştır',
      'Muhasebe kayıtları ile eşleştir',
    ],
    resolution: [
      'InvestigateAccounting task aç',
      'Muhasebe ile koordine ol',
      'Düzeltme kaydı gerekiyorsa avukat onayı al',
    ],
    escalation: 'Admin + Avukat',
    relatedRecipes: ['ComputeRealDistribution', 'RunAnomalyDetection'],
  },
];

// Degraded mode config
export const DEGRADED_MODE_CONFIG = {
  triggers: [
    { type: 'ui_health_below', threshold: 50 },
    { type: 'failure_rate_above', threshold: 0.3 },
    { type: 'manual_activation', reason: 'required' },
  ],
  behavior: {
    writeTasksDisabled: true,
    readOnlySyncEnabled: true,
    userBannerMessage: 'UYAP ekran değişmiş olabilir. Yazma işlemleri geçici olarak devre dışı.',
    notifyRoles: ['admin', 'ops'],
  },
  recovery: {
    autoRecoveryEnabled: true,
    autoRecoveryCheckIntervalMs: 3600000, // 1 hour
    requiredSuccessfulChecks: 3,
  },
};

// Rollback procedures
export const ROLLBACK_PROCEDURES: RunbookEntry[] = [
  {
    id: 'RB001',
    title: 'Recipe Rollback',
    category: 'rollback',
    severity: 'warning',
    symptoms: [
      'Yeni recipe version hatalı çalışıyor',
      'Beklenmeyen davranış',
    ],
    diagnosis: [
      'Recipe Registry -> ilgili recipe',
      'Version history incele',
      'Diff viewer ile değişiklikleri kontrol et',
    ],
    resolution: [
      'Önceki version seç',
      'Rollback butonuna tıkla',
      'Dry-run validate çalıştır',
      'Başarılı ise enable et',
    ],
    relatedRecipes: ['*'],
  },
  {
    id: 'RB002',
    title: 'Params Rollback',
    category: 'rollback',
    severity: 'warning',
    symptoms: [
      'Yeni params bundle hatalı sonuçlar üretiyor',
      'Hesaplama hataları',
    ],
    diagnosis: [
      'Params Registry -> ilgili bundle',
      'Active version kontrol et',
      'Önceki version ile karşılaştır',
    ],
    resolution: [
      'Önceki version seç',
      'Promote to active',
      'Etkilenen dosyaları yeniden hesapla',
    ],
    relatedRecipes: ['*'],
  },
];

// All runbook entries
export const OPS_RUNBOOK: RunbookEntry[] = [
  ...DAILY_CHECK_PROCEDURES,
  ...ERROR_SCENARIOS,
  ...ROLLBACK_PROCEDURES,
];

// Get runbook by category
export function getRunbookByCategory(category: RunbookCategory): RunbookEntry[] {
  return OPS_RUNBOOK.filter(entry => entry.category === category);
}

// Get runbook by severity
export function getRunbookBySeverity(severity: 'info' | 'warning' | 'critical'): RunbookEntry[] {
  return OPS_RUNBOOK.filter(entry => entry.severity === severity);
}

// Get runbook for recipe
export function getRunbookForRecipe(recipeId: string): RunbookEntry[] {
  return OPS_RUNBOOK.filter(entry => 
    entry.relatedRecipes?.includes(recipeId) || entry.relatedRecipes?.includes('*')
  );
}
