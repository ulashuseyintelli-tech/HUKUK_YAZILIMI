/**
 * ICRABOT PARAMS CONFIG
 * 
 * v3: İcra türü bazlı parametreler ve konfigürasyon.
 * YAML blueprint'ten TypeScript'e dönüştürülmüş.
 */

import { IcrabotParams, IcraType } from '../types/recipe.types';

/**
 * Default parametreler
 * rules_params_v2.yaml'dan alınmıştır.
 */
export const DEFAULT_PARAMS: IcrabotParams = {
  tebligat: {
    // Kitapta e-tebligat için "posta kutusuna bırakıldığı günü takip eden 5. gün" tebliğ sayılır.
    eTebligatDeemedDays: 5,
    poll: {
      afterSentFirst24hMinutes: 120,
      after24hHours: 12,
    },
  },

  kesinlesme: {
    // Default (genel) itiraz süresi
    defaultObjectionDeadlineDays: 7,
    overrides: {
      ILAMSIZ: { objectionDeadlineDays: 7 },
      KAMBIYO: { objectionDeadlineDays: 5 },
      KIRA: { objectionDeadlineDays: 7 },
      ILAMLI: { objectionDeadlineDays: 0 }, // İlamlıda itiraz süresi yok
      MTS: { objectionDeadlineDays: 7 },
      DIGER: { objectionDeadlineDays: 7 },
    },
  },

  varlik: {
    scoreThresholdHigh: 70,
    scoreThresholdLow: 20,
    requeryDays: 7,
  },

  parallelism: {
    debtorConcurrency: 3,   // Aynı anda kaç borçlu işi çalışsın
    perCaseConcurrency: 6,  // Aynı dosyada aynı anda kaç job
  },

  scheduler: {
    syncHeaderHours: 12,      // Dosya başlık bilgisi senkronizasyonu
    syncSafahatHours: 6,      // Safahat senkronizasyonu
    syncEvrakHours: 24,       // Evrak senkronizasyonu
    tebligatStatusHours: 6,   // Tebligat durumu kontrolü
    assetQueryDays: 7,        // Varlık sorgusu yenileme
  },

  risk: {
    blockCostThreshold: 70,       // Bu skorun üzerinde masraflı işlemler bloklanır
    blockExecutionThreshold: 85,  // Bu skorun üzerinde icra işlemleri bloklanır
  },

  recovery: {
    minNetForCostActions: 25000,  // Masraflı işlemler için minimum net getiri (TL)
  },
};

/**
 * İcra türüne göre itiraz süresini getir
 */
export function getObjectionDeadlineDays(icraType: IcraType): number {
  const override = DEFAULT_PARAMS.kesinlesme.overrides[icraType];
  return override?.objectionDeadlineDays ?? DEFAULT_PARAMS.kesinlesme.defaultObjectionDeadlineDays;
}

/**
 * E-tebligat tebliğ sayılma gün sayısını getir
 */
export function getETebligatDeemedDays(): number {
  return DEFAULT_PARAMS.tebligat.eTebligatDeemedDays;
}

/**
 * Varlık skoru eşiklerini getir
 */
export function getAssetScoreThresholds(): { high: number; low: number } {
  return {
    high: DEFAULT_PARAMS.varlik.scoreThresholdHigh,
    low: DEFAULT_PARAMS.varlik.scoreThresholdLow,
  };
}

/**
 * Polling interval'larını getir (dakika cinsinden)
 */
export function getPollingIntervals(): {
  tebligatFirst24h: number;
  tebligatAfter24h: number;
  safahat: number;
  evrak: number;
} {
  return {
    tebligatFirst24h: DEFAULT_PARAMS.tebligat.poll.afterSentFirst24hMinutes,
    tebligatAfter24h: DEFAULT_PARAMS.tebligat.poll.after24hHours * 60,
    safahat: 6 * 60,  // 6 saat
    evrak: 24 * 60,   // 24 saat
  };
}

/**
 * Parallelism ayarlarını getir
 */
export function getParallelismConfig(): {
  debtorConcurrency: number;
  perCaseConcurrency: number;
} {
  return {
    debtorConcurrency: DEFAULT_PARAMS.parallelism.debtorConcurrency,
    perCaseConcurrency: DEFAULT_PARAMS.parallelism.perCaseConcurrency,
  };
}

/**
 * Scheduler ayarlarını getir (saat cinsinden)
 */
export function getSchedulerConfig(): {
  syncHeaderHours: number;
  syncSafahatHours: number;
  syncEvrakHours: number;
  tebligatStatusHours: number;
  assetQueryDays: number;
} {
  return DEFAULT_PARAMS.scheduler;
}

/**
 * Risk eşiklerini getir
 */
export function getRiskThresholds(): {
  blockCostThreshold: number;
  blockExecutionThreshold: number;
} {
  return DEFAULT_PARAMS.risk;
}

/**
 * Recovery (net getiri) eşiklerini getir
 */
export function getRecoveryThresholds(): {
  minNetForCostActions: number;
} {
  return DEFAULT_PARAMS.recovery;
}
