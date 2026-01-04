/**
 * ANOMALY DETECTION CONFIG v10
 * 
 * Anomali tespiti konfigürasyonu.
 * anomaly_detection_v10.yaml'dan implement edilmiştir.
 * 
 * Amaç: Safahat/tahsilat/tebligat verilerinde beklenmeyen durumlar için alarm üretmek.
 */

// ==================== TYPES ====================

export type AnomalySeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface AnomalyRule {
  id: string;
  description: string;
  condition: string;
  severity: number;
  actions: string[];
}

export interface AnomalyParams {
  enabled: boolean;
  severityThresholds: {
    low: number;
    medium: number;
    high: number;
  };
}

export interface AnomalyResult {
  id: string;
  severity: AnomalySeverity;
  severityScore: number;
  description: string;
  actions: string[];
  detectedAt: Date;
}

export interface AnomalyScanInput {
  caseStage: string;
  caseEvents: string[];
  netInCase: number;
  totalCollected: number;
  liens: Array<{
    rankOrder: number | null;
    isOurLien: boolean;
    activeStatus: string;
  }>;
  serviceEffectiveDate: Date | null;
  mazbataExists: boolean;
}

// ==================== CONFIG ====================

export const ANOMALY_PARAMS: AnomalyParams = {
  enabled: true,
  severityThresholds: {
    low: 40,
    medium: 70,
    high: 85,
  },
};

// ==================== RULES ====================

export const ANOMALY_RULES: AnomalyRule[] = [
  {
    id: 'A1_NET_NEGATIVE',
    description: 'Kasada negatif bakiye',
    condition: 'net_in_case < 0',
    severity: 90,
    actions: ['enqueue:InvestigateAccounting', 'notify:CRITICAL'],
  },
  {
    id: 'A2_TAHSILAT_WITHOUT_LIEN',
    description: 'Haciz olmadan tahsilat',
    condition: 'total_collected > 0 and no active liens and stage in [VARLIK, TEBLIGAT]',
    severity: 75,
    actions: ['enqueue:SyncSafahatTimeline', 'notify:MEDIUM'],
  },
  {
    id: 'A3_NEW_HIGH_PRIORITY_LIEN',
    description: 'Yeni 1. sıra haciz (bizim değil)',
    condition: 'new lien appears with rank_order == 1 and is_our_lien == false',
    severity: 80,
    actions: ['open_lock:LOCK_EXECUTION_ACTIONS', 'enqueue:RequireAttorneyDecision', 'notify:HIGH'],
  },
  {
    id: 'A4_SERVICE_EFFECTIVE_BUT_NO_MAZBATA_LONG',
    description: 'Tebliğ sayıldı ama mazbata yok (3+ gün)',
    condition: 'service_effective_date exists and mazbata still missing after 3 days',
    severity: 60,
    actions: ['enqueue:MazbataSorgula_ETebligat_Debtor', 'notify:LOW'],
  },
];

// ==================== DETECTOR ====================

/**
 * Anomali taraması yap
 */
export function runAnomalyDetection(input: AnomalyScanInput): AnomalyResult[] {
  const results: AnomalyResult[] = [];
  const now = new Date();
  
  // A1: Negatif bakiye
  if (input.netInCase < 0) {
    results.push({
      id: 'A1_NET_NEGATIVE',
      severity: 'CRITICAL',
      severityScore: 90,
      description: `Kasada negatif bakiye: ${input.netInCase} TL`,
      actions: ['enqueue:InvestigateAccounting', 'notify:CRITICAL'],
      detectedAt: now,
    });
  }
  
  // A2: Haciz olmadan tahsilat
  const hasActiveLiens = input.liens.some(l => l.activeStatus === 'active');
  const earlyStages = ['VARLIK', 'TEBLIGAT'];
  if (input.totalCollected > 0 && !hasActiveLiens && earlyStages.includes(input.caseStage)) {
    results.push({
      id: 'A2_TAHSILAT_WITHOUT_LIEN',
      severity: 'HIGH',
      severityScore: 75,
      description: 'Haciz olmadan tahsilat tespit edildi',
      actions: ['enqueue:SyncSafahatTimeline', 'notify:MEDIUM'],
      detectedAt: now,
    });
  }
  
  // A3: Yeni 1. sıra haciz (bizim değil)
  const newFirstRankLien = input.liens.find(l => 
    l.rankOrder === 1 && !l.isOurLien && l.activeStatus === 'active'
  );
  if (newFirstRankLien) {
    results.push({
      id: 'A3_NEW_HIGH_PRIORITY_LIEN',
      severity: 'HIGH',
      severityScore: 80,
      description: 'Yeni 1. sıra haciz tespit edildi (bizim değil)',
      actions: ['open_lock:LOCK_EXECUTION_ACTIONS', 'enqueue:RequireAttorneyDecision', 'notify:HIGH'],
      detectedAt: now,
    });
  }
  
  // A4: Tebliğ sayıldı ama mazbata yok
  if (input.serviceEffectiveDate && !input.mazbataExists) {
    const daysSinceService = Math.floor(
      (now.getTime() - input.serviceEffectiveDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSinceService > 3) {
      results.push({
        id: 'A4_SERVICE_EFFECTIVE_BUT_NO_MAZBATA_LONG',
        severity: 'MEDIUM',
        severityScore: 60,
        description: `Tebliğ sayıldı (${daysSinceService} gün önce) ama mazbata hala yok`,
        actions: ['enqueue:MazbataSorgula_ETebligat_Debtor', 'notify:LOW'],
        detectedAt: now,
      });
    }
  }
  
  return results;
}

/**
 * Severity skorunu seviyeye çevir
 */
export function getSeverityLevel(score: number): AnomalySeverity {
  if (score >= ANOMALY_PARAMS.severityThresholds.high) return 'CRITICAL';
  if (score >= ANOMALY_PARAMS.severityThresholds.medium) return 'HIGH';
  if (score >= ANOMALY_PARAMS.severityThresholds.low) return 'MEDIUM';
  return 'LOW';
}
