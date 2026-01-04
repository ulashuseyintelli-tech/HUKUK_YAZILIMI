/**
 * STAGE FLOWS CONFIG
 * 
 * v3: İcra türü bazlı stage akışları.
 * stage_flows_v3.yaml'dan alınmıştır.
 */

import { StageFlow, StageTag, IcraType } from '../types/recipe.types';

/**
 * İcra türü bazlı stage akışları
 */
export const STAGE_FLOWS: Record<IcraType, StageFlow> = {
  ILAMSIZ: {
    icraType: 'ILAMSIZ',
    description: 'Genel haciz yoluyla ilamsız takip (klasik).',
    stages: ['ACILIS', 'TEBLIGAT', 'KESINLESME', 'VARLIK', 'HACIZ', 'TAHSILAT', 'SATIS', 'KAPANIS'],
    stageRequirements: {
      ACILIS: { requiredEvents: ['UYAP_DOSYA_BOUND'] },
      TEBLIGAT: { requiredEvents: ['TEBLIGAT_SENT'] },
      KESINLESME: { requiredEvents: ['SERVICE_EFFECTIVE_CANDIDATE'] },
      VARLIK: { requiredEvents: ['FINALIZED'] },
      HACIZ: { optionalEvents: ['HACIZ_RECOMMENDED'] },
      TAHSILAT: { optionalEvents: ['TAHSILAT', 'REDDIYAT'] },
      SATIS: { optionalEvents: ['SALE_STARTED'] },
      KAPANIS: {},
    },
  },

  ILAMLI: {
    icraType: 'ILAMLI',
    description: 'İlamlı icra - kesinleşme/itiraz mantığı dosyaya göre farklı; genelde hızlı varlığa geçer.',
    stages: ['ACILIS', 'TEBLIGAT', 'VARLIK', 'HACIZ', 'TAHSILAT', 'SATIS', 'KAPANIS'],
    stageRequirements: {
      ACILIS: {},
      TEBLIGAT: { requiredEvents: ['TEBLIGAT_SENT'] },
      KESINLESME: {}, // İlamlıda kesinleşme aşaması yok
      VARLIK: { gatingRule: 'params.kesinlesme.overrides.ILAMLI.objectionDeadlineDays == 0' },
      HACIZ: {},
      TAHSILAT: {},
      SATIS: {},
      KAPANIS: {},
    },
    notes: ['İlamlı takiplerde itiraz süresi beklenmez, doğrudan varlık aşamasına geçilir.'],
  },

  KAMBIYO: {
    icraType: 'KAMBIYO',
    description: 'Kambiyo senetlerine mahsus takip - süreler daha kısa.',
    stages: ['ACILIS', 'TEBLIGAT', 'KESINLESME', 'VARLIK', 'HACIZ', 'TAHSILAT', 'SATIS', 'KAPANIS'],
    stageRequirements: {
      ACILIS: {},
      TEBLIGAT: { requiredEvents: ['TEBLIGAT_SENT'] },
      KESINLESME: { requiredEvents: ['SERVICE_EFFECTIVE_CANDIDATE'] },
      VARLIK: { requiredEvents: ['FINALIZED'] },
      HACIZ: {},
      TAHSILAT: {},
      SATIS: {},
      KAPANIS: {},
    },
    notes: ['Kambiyo takiplerinde itiraz süresi 5 gündür.'],
  },

  KIRA: {
    icraType: 'KIRA',
    description: 'Kira/tahliye ağırlıklı - satış çoğu zaman yok; tahliye yazıları özel.',
    stages: ['ACILIS', 'TEBLIGAT', 'KESINLESME', 'HACIZ', 'TAHSILAT', 'KAPANIS'],
    stageRequirements: {
      ACILIS: {},
      TEBLIGAT: { requiredEvents: ['TEBLIGAT_SENT'] },
      KESINLESME: { requiredEvents: ['SERVICE_EFFECTIVE_CANDIDATE'] },
      VARLIK: {}, // Kira takiplerinde varlık aşaması opsiyonel
      HACIZ: {},
      TAHSILAT: {},
      SATIS: {}, // Kira takiplerinde satış genelde yok
      KAPANIS: {},
    },
    notes: ['Tahliye adımı ayrı alt-stage olarak modellenebilir.'],
  },

  MTS: {
    icraType: 'MTS',
    description: 'Merkezi Takip Sistemi - tebligat ve ödeme penceresi kritik.',
    stages: ['ACILIS', 'TEBLIGAT', 'KESINLESME', 'VARLIK', 'HACIZ', 'TAHSILAT', 'KAPANIS'],
    stageRequirements: {
      ACILIS: {},
      TEBLIGAT: { requiredEvents: ['TEBLIGAT_SENT'] },
      KESINLESME: { requiredEvents: ['SERVICE_EFFECTIVE_CANDIDATE'] },
      VARLIK: { requiredEvents: ['FINALIZED'] },
      HACIZ: {},
      TAHSILAT: {},
      SATIS: {},
      KAPANIS: {},
    },
    notes: ['MTS dosyası icraya çevrilince yeni case fork edilebilir.'],
  },

  DIGER: {
    icraType: 'DIGER',
    description: 'Özel senaryolar.',
    stages: ['ACILIS', 'TEBLIGAT', 'KESINLESME', 'VARLIK', 'HACIZ', 'TAHSILAT', 'SATIS', 'KAPANIS'],
    stageRequirements: {
      ACILIS: {},
      TEBLIGAT: {},
      KESINLESME: {},
      VARLIK: {},
      HACIZ: {},
      TAHSILAT: {},
      SATIS: {},
      KAPANIS: {},
    },
  },
};

/**
 * İcra türüne göre stage akışını getir
 */
export function getStageFlow(icraType: IcraType): StageFlow {
  return STAGE_FLOWS[icraType] || STAGE_FLOWS.DIGER;
}

/**
 * İcra türüne göre stage'in akışta olup olmadığını kontrol et
 */
export function isStageInFlow(icraType: IcraType, stage: StageTag): boolean {
  const flow = getStageFlow(icraType);
  return flow.stages.includes(stage);
}

/**
 * İcra türüne göre sonraki stage'i getir
 */
export function getNextStageInFlow(icraType: IcraType, currentStage: StageTag): StageTag | null {
  const flow = getStageFlow(icraType);
  const currentIndex = flow.stages.indexOf(currentStage);
  
  if (currentIndex === -1 || currentIndex >= flow.stages.length - 1) {
    return null;
  }
  
  return flow.stages[currentIndex + 1];
}

/**
 * Stage geçişi için gerekli event'leri kontrol et
 */
export function checkStageRequirements(
  icraType: IcraType,
  stage: StageTag,
  events: string[]
): { canEnter: boolean; missingEvents: string[] } {
  const flow = getStageFlow(icraType);
  const requirements = flow.stageRequirements[stage];
  
  if (!requirements?.requiredEvents?.length) {
    return { canEnter: true, missingEvents: [] };
  }
  
  const missingEvents = requirements.requiredEvents.filter(e => !events.includes(e));
  
  return {
    canEnter: missingEvents.length === 0,
    missingEvents,
  };
}

/**
 * İcra türüne göre kesinleşme aşamasının gerekli olup olmadığını kontrol et
 */
export function requiresFinalizationStage(icraType: IcraType): boolean {
  const flow = getStageFlow(icraType);
  return flow.stages.includes('KESINLESME');
}
