/**
 * ICRABOT STATE MACHINE
 * 
 * Dosya aşama geçişlerini yöneten state machine.
 * v3: İcra türü bazlı akışlar, debtor-scoped event'ler.
 */

import { StageTag, IcraType } from './types/recipe.types';
import { getStageFlow, isStageInFlow, getNextStageInFlow, checkStageRequirements } from './config/stage-flows.config';
import { getObjectionDeadlineDays } from './config/params.config';

// Event türleri
export type CaseEvent =
  // Açılış
  | 'CASE_CREATED'
  | 'UYAP_SUBMITTED'
  | 'UYAP_DOSYA_BOUND'
  // Session
  | 'SESSION_OK'
  | 'SESSION_EXPIRED'
  // Sync
  | 'SAFAHAT_SYNCED'
  | 'STAGE_INFERRED'
  // Tebligat
  | 'TEBLIGAT_SENT'
  | 'TEBLIGAT_DELIVERED'
  | 'TEBLIGAT_RETURNED'
  | 'TEBLIGAT_BILA'
  | 'MAZBATA_CREATED'
  | 'MAZBATA_REQUESTED'
  | 'LEGAL_SERVICE_DATE_COMPUTED'
  | 'ALL_DEBTORS_SERVED'
  // Tebligat (debtor-scoped) - v3
  | 'ETEBLIGAT_SNAPSHOT'
  | 'PHYSICAL_TEBLIGAT_SNAPSHOT'
  | 'SERVICE_EFFECTIVE_CANDIDATE'
  // Kesinleşme
  | 'OBJECTION_RECEIVED'
  | 'OBJECTION_DEADLINE_PASSED'
  | 'FINALIZATION_CANDIDATE'
  | 'CASE_FINALIZED'
  | 'FINALIZED'
  // Varlık
  | 'ASSET_QUERY_COMPLETED'
  | 'ASSET_PROFILE_READY'
  | 'ASSET_SCORE'
  | 'ASSETS_FOUND'
  | 'NO_ASSETS_FOUND'
  // Haciz
  | 'HACIZ_RECOMMENDED'
  | 'HACIZ_REQUESTED'
  | 'HACIZ_APPLIED'
  | 'HACIZ_RELEASED'
  // Satış
  | 'SALE_REQUESTED'
  | 'SALE_STARTED'
  | 'SALE_ANNOUNCED'
  | 'SALE_COMPLETED'
  // Tahsilat
  | 'TAHSILAT_DELTA'
  | 'REDDIYAT_DELTA'
  | 'PARTIAL_PAYMENT_RECEIVED'
  | 'FULL_PAYMENT_RECEIVED'
  // Kapanış
  | 'CASE_CLOSED'
  | 'ACIZ_VESIKASI_ISSUED';

// Geçiş tanımı
export interface StateTransition {
  from: StageTag | StageTag[];
  event: CaseEvent;
  to: StageTag;
  condition?: string; // Opsiyonel koşul
  icraTypeCondition?: IcraType[]; // v3: İcra türü koşulu
  actions?: string[]; // Tetiklenecek recipe'ler
  description: string;
}

/**
 * STATE TRANSITION TABLE
 * 
 * Tüm aşama geçişlerinin tanımı.
 * v3: İcra türü bazlı koşullar eklendi.
 */
export const STATE_TRANSITIONS: StateTransition[] = [
  // ==================== AÇILIŞ → TEBLİGAT ====================
  {
    from: 'ACILIS',
    event: 'CASE_CREATED',
    to: 'ACILIS',
    description: 'Dosya oluşturuldu, UYAP gönderimi bekleniyor',
  },
  {
    from: 'ACILIS',
    event: 'UYAP_SUBMITTED',
    to: 'TEBLIGAT',
    actions: ['SyncSafahatTimeline'],
    description: 'UYAP\'a gönderildi, tebligat aşamasına geçildi',
  },
  {
    from: 'ACILIS',
    event: 'UYAP_DOSYA_BOUND',
    to: 'TEBLIGAT',
    actions: ['SyncSafahatTimeline', 'FetchPreparedETebligatlar_Debtor'],
    description: 'UYAP dosya numarası bağlandı',
  },
  {
    from: 'ACILIS',
    event: 'TEBLIGAT_SENT',
    to: 'TEBLIGAT',
    actions: ['FetchPreparedETebligatlar_Debtor'],
    description: 'Tebligat gönderildi',
  },

  // ==================== TEBLİGAT ====================
  {
    from: 'TEBLIGAT',
    event: 'ETEBLIGAT_SNAPSHOT',
    to: 'TEBLIGAT',
    actions: ['ComputeServiceEffectiveDate_ETebligat_Debtor'],
    description: 'E-tebligat durumu güncellendi',
  },
  {
    from: 'TEBLIGAT',
    event: 'TEBLIGAT_DELIVERED',
    to: 'TEBLIGAT',
    actions: ['ComputeServiceEffectiveDate_ETebligat_Debtor', 'MazbataSorgula_ETebligat_Debtor'],
    description: 'Tebligat teslim edildi, tebliğ tarihi hesaplanıyor',
  },
  {
    from: 'TEBLIGAT',
    event: 'SERVICE_EFFECTIVE_CANDIDATE',
    to: 'TEBLIGAT',
    actions: ['DetectFinalizationCandidate_ByIcraType'],
    description: 'Tebliğ edilmiş sayılma tarihi hesaplandı',
  },
  {
    from: 'TEBLIGAT',
    event: 'MAZBATA_REQUESTED',
    to: 'TEBLIGAT',
    description: 'Mazbata sorgulandı',
  },
  {
    from: 'TEBLIGAT',
    event: 'TEBLIGAT_RETURNED',
    to: 'TEBLIGAT',
    actions: ['EvaluateRetebligat'],
    description: 'Tebligat iade geldi, yeniden tebligat değerlendirilecek',
  },
  {
    from: 'TEBLIGAT',
    event: 'TEBLIGAT_BILA',
    to: 'TEBLIGAT',
    actions: ['EvaluateTK21'],
    description: 'Tebligat bila, TK 21 değerlendirilecek',
  },
  {
    from: 'TEBLIGAT',
    event: 'LEGAL_SERVICE_DATE_COMPUTED',
    to: 'TEBLIGAT',
    actions: ['DetectFinalizationCandidate_ByIcraType'],
    description: 'Tebliğ tarihi hesaplandı, kesinleşme kontrolü yapılacak',
  },
  {
    from: 'TEBLIGAT',
    event: 'ALL_DEBTORS_SERVED',
    to: 'TEBLIGAT',
    actions: ['DetectFinalizationCandidate_ByIcraType'],
    description: 'Tüm borçlulara tebligat yapıldı',
  },

  // ==================== TEBLİGAT → KESİNLEŞME (İcra türüne göre) ====================
  {
    from: 'TEBLIGAT',
    event: 'FINALIZATION_CANDIDATE',
    to: 'KESINLESME',
    icraTypeCondition: ['ILAMSIZ', 'KAMBIYO', 'KIRA', 'MTS', 'DIGER'],
    description: 'Kesinleşme adayı tespit edildi',
  },
  // İlamlı takiplerde kesinleşme aşaması atlanır
  {
    from: 'TEBLIGAT',
    event: 'FINALIZATION_CANDIDATE',
    to: 'VARLIK',
    icraTypeCondition: ['ILAMLI'],
    actions: ['RunAssetQueries_Debtor'],
    description: 'İlamlı takip - kesinleşme atlandı, varlık aşamasına geçildi',
  },
  {
    from: 'TEBLIGAT',
    event: 'OBJECTION_DEADLINE_PASSED',
    to: 'KESINLESME',
    condition: 'hasObjection == false',
    actions: ['MarkAsFinalized'],
    description: 'İtiraz süresi geçti, kesinleşme aşamasına geçildi',
  },
  {
    from: 'TEBLIGAT',
    event: 'OBJECTION_RECEIVED',
    to: 'TEBLIGAT',
    description: 'İtiraz alındı, kesinleşme bekletiliyor',
  },

  // ==================== KESİNLEŞME ====================
  {
    from: 'KESINLESME',
    event: 'FINALIZED',
    to: 'VARLIK',
    actions: ['RunAssetQueries_Debtor'],
    description: 'Dosya kesinleşti, varlık sorguları başlatılıyor',
  },
  {
    from: 'KESINLESME',
    event: 'CASE_FINALIZED',
    to: 'VARLIK',
    actions: ['RunAssetQueries_Debtor'],
    description: 'Dosya kesinleşti, varlık sorguları başlatılıyor',
  },

  // ==================== VARLIK ====================
  {
    from: 'VARLIK',
    event: 'ASSET_PROFILE_READY',
    to: 'VARLIK',
    actions: ['ScoreAssetProfile_Debtor'],
    description: 'Varlık profili hazır, skorlama yapılacak',
  },
  {
    from: 'VARLIK',
    event: 'ASSET_SCORE',
    to: 'VARLIK',
    actions: ['ProposeHacizPackage_Debtor'],
    description: 'Varlık skoru hesaplandı',
  },
  {
    from: 'VARLIK',
    event: 'ASSET_QUERY_COMPLETED',
    to: 'VARLIK',
    description: 'Varlık sorgusu tamamlandı',
  },
  {
    from: 'VARLIK',
    event: 'HACIZ_RECOMMENDED',
    to: 'HACIZ',
    actions: ['PrepareHacizRequests'],
    description: 'Haciz önerildi, haciz aşamasına geçildi',
  },
  {
    from: 'VARLIK',
    event: 'ASSETS_FOUND',
    to: 'HACIZ',
    actions: ['PrepareHacizRequests'],
    description: 'Varlık bulundu, haciz aşamasına geçildi',
  },
  {
    from: 'VARLIK',
    event: 'NO_ASSETS_FOUND',
    to: 'VARLIK',
    actions: ['EvaluateAcizVesikasi'],
    description: 'Varlık bulunamadı, aciz vesikası değerlendirilecek',
  },

  // ==================== HACİZ ====================
  {
    from: 'HACIZ',
    event: 'HACIZ_REQUESTED',
    to: 'HACIZ',
    description: 'Haciz talebi yapıldı',
  },
  {
    from: 'HACIZ',
    event: 'HACIZ_APPLIED',
    to: 'HACIZ',
    actions: ['UpdateHacizStatus'],
    description: 'Haciz uygulandı',
  },
  {
    from: 'HACIZ',
    event: 'SALE_REQUESTED',
    to: 'SATIS',
    description: 'Satış talebi yapıldı, satış aşamasına geçildi',
  },
  {
    from: 'HACIZ',
    event: 'SALE_STARTED',
    to: 'SATIS',
    description: 'Satış başladı',
  },

  // ==================== SATIŞ ====================
  {
    from: 'SATIS',
    event: 'SALE_ANNOUNCED',
    to: 'SATIS',
    description: 'Satış ilanı yapıldı',
  },
  {
    from: 'SATIS',
    event: 'SALE_COMPLETED',
    to: 'TAHSILAT',
    actions: ['SyncTahsilat'],
    description: 'Satış tamamlandı, tahsilat aşamasına geçildi',
  },

  // ==================== TAHSİLAT ====================
  {
    from: ['HACIZ', 'SATIS', 'TAHSILAT'],
    event: 'TAHSILAT_DELTA',
    to: 'TAHSILAT',
    actions: ['SyncTahsilat'],
    description: 'Tahsilat hareketi tespit edildi',
  },
  {
    from: ['HACIZ', 'SATIS', 'TAHSILAT'],
    event: 'PARTIAL_PAYMENT_RECEIVED',
    to: 'TAHSILAT',
    actions: ['SyncTahsilat'],
    description: 'Kısmi ödeme alındı',
  },
  {
    from: ['HACIZ', 'SATIS', 'TAHSILAT'],
    event: 'FULL_PAYMENT_RECEIVED',
    to: 'KAPANIS',
    actions: ['EvaluateCaseClosure'],
    description: 'Tam ödeme alındı, kapanış aşamasına geçildi',
  },

  // ==================== KAPANIŞ ====================
  {
    from: ['TAHSILAT', 'KAPANIS'],
    event: 'CASE_CLOSED',
    to: 'KAPANIS',
    description: 'Dosya kapatıldı',
  },
  {
    from: 'VARLIK',
    event: 'ACIZ_VESIKASI_ISSUED',
    to: 'KAPANIS',
    description: 'Aciz vesikası verildi, dosya kapatıldı',
  },
];

/**
 * STATE MACHINE SERVICE
 * v3: İcra türü bazlı geçiş kontrolü eklendi.
 */
export class StateMachine {
  /**
   * Event'e göre geçiş bul
   * v3: İcra türü koşulunu da kontrol eder
   */
  static findTransition(
    currentStage: StageTag,
    event: CaseEvent,
    icraType?: IcraType
  ): StateTransition | undefined {
    return STATE_TRANSITIONS.find(t => {
      const fromMatch = Array.isArray(t.from)
        ? t.from.includes(currentStage)
        : t.from === currentStage;
      
      if (!fromMatch || t.event !== event) return false;
      
      // İcra türü koşulu varsa kontrol et
      if (t.icraTypeCondition && icraType) {
        return t.icraTypeCondition.includes(icraType);
      }
      
      // İcra türü koşulu yoksa veya icraType belirtilmemişse geçerli
      return !t.icraTypeCondition;
    });
  }

  /**
   * Geçiş yapılabilir mi kontrol et
   * v3: İcra türü ve stage flow kontrolü eklendi
   */
  static canTransition(
    currentStage: StageTag,
    event: CaseEvent,
    context?: Record<string, any>
  ): boolean {
    const icraType = context?.icraType as IcraType | undefined;
    const transition = this.findTransition(currentStage, event, icraType);
    if (!transition) return false;

    // İcra türüne göre hedef stage akışta mı kontrol et
    if (icraType && !isStageInFlow(icraType, transition.to)) {
      return false;
    }

    // Koşul varsa değerlendir
    if (transition.condition && context) {
      return this.evaluateCondition(transition.condition, context);
    }

    return true;
  }

  /**
   * Geçiş yap
   * v3: İcra türü bazlı geçiş
   */
  static transition(
    currentStage: StageTag,
    event: CaseEvent,
    context?: Record<string, any>
  ): {
    newStage: StageTag;
    actions: string[];
    description: string;
  } | null {
    const icraType = context?.icraType as IcraType | undefined;
    const transition = this.findTransition(currentStage, event, icraType);
    if (!transition) return null;

    // İcra türüne göre hedef stage akışta mı kontrol et
    if (icraType && !isStageInFlow(icraType, transition.to)) {
      // Akışta yoksa sonraki uygun stage'i bul
      const nextStage = getNextStageInFlow(icraType, currentStage);
      if (nextStage && nextStage !== transition.to) {
        return {
          newStage: nextStage,
          actions: transition.actions || [],
          description: `${transition.description} (${icraType} akışına göre ${nextStage} aşamasına geçildi)`,
        };
      }
    }

    // Koşul kontrolü
    if (transition.condition && context) {
      if (!this.evaluateCondition(transition.condition, context)) {
        return null;
      }
    }

    return {
      newStage: transition.to,
      actions: transition.actions || [],
      description: transition.description,
    };
  }

  /**
   * Mevcut aşamadan yapılabilecek geçişleri getir
   * v3: İcra türüne göre filtreleme
   */
  static getAvailableTransitions(
    currentStage: StageTag,
    icraType?: IcraType
  ): StateTransition[] {
    return STATE_TRANSITIONS.filter(t => {
      const fromMatch = Array.isArray(t.from)
        ? t.from.includes(currentStage)
        : t.from === currentStage;
      
      if (!fromMatch) return false;
      
      // İcra türü koşulu varsa kontrol et
      if (t.icraTypeCondition && icraType) {
        return t.icraTypeCondition.includes(icraType);
      }
      
      return !t.icraTypeCondition;
    });
  }

  /**
   * v3: İcra türüne göre sonraki aşamayı öner
   */
  static suggestNextStage(
    currentStage: StageTag,
    icraType: IcraType,
    completedEvents: string[]
  ): StageTag | null {
    const { canEnter, missingEvents } = checkStageRequirements(
      icraType,
      currentStage,
      completedEvents
    );
    
    if (!canEnter) {
      return null; // Henüz gereksinimler karşılanmadı
    }
    
    return getNextStageInFlow(icraType, currentStage);
  }

  /**
   * v3: İcra türüne göre itiraz süresini hesapla
   */
  static getObjectionDeadline(icraType: IcraType): number {
    return getObjectionDeadlineDays(icraType);
  }

  /**
   * Basit koşul değerlendirme
   */
  private static evaluateCondition(
    condition: string,
    context: Record<string, any>
  ): boolean {
    try {
      // Basit == kontrolü
      if (condition.includes(' == ')) {
        const [field, value] = condition.split(' == ').map(s => s.trim());
        const actualValue = context[field];
        if (value === 'true') return actualValue === true;
        if (value === 'false') return actualValue === false;
        return actualValue == value;
      }
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * STAGE METADATA
 * 
 * Her aşama için metadata.
 */
export const STAGE_METADATA: Record<StageTag, {
  name: string;
  description: string;
  color: string;
  icon: string;
  order: number;
}> = {
  ACILIS: {
    name: 'Açılış',
    description: 'Dosya açıldı, UYAP gönderimi bekleniyor',
    color: 'gray',
    icon: 'FileText',
    order: 1,
  },
  TEBLIGAT: {
    name: 'Tebligat',
    description: 'Ödeme emri tebliğ ediliyor',
    color: 'blue',
    icon: 'Mail',
    order: 2,
  },
  KESINLESME: {
    name: 'Kesinleşme',
    description: 'İtiraz süresi geçti, dosya kesinleşiyor',
    color: 'purple',
    icon: 'CheckCircle',
    order: 3,
  },
  VARLIK: {
    name: 'Varlık Araştırması',
    description: 'Borçlu varlıkları sorgulanıyor',
    color: 'orange',
    icon: 'Search',
    order: 4,
  },
  HACIZ: {
    name: 'Haciz',
    description: 'Haciz işlemleri yapılıyor',
    color: 'red',
    icon: 'Lock',
    order: 5,
  },
  TAHSILAT: {
    name: 'Tahsilat',
    description: 'Tahsilat yapılıyor',
    color: 'green',
    icon: 'DollarSign',
    order: 6,
  },
  SATIS: {
    name: 'Satış',
    description: 'Hacizli mallar satışa çıkarıldı',
    color: 'yellow',
    icon: 'ShoppingCart',
    order: 7,
  },
  KAPANIS: {
    name: 'Kapanış',
    description: 'Dosya kapatıldı',
    color: 'gray',
    icon: 'Archive',
    order: 8,
  },
};

/**
 * Aşama sırasını al
 */
export function getStageOrder(stage: StageTag): number {
  return STAGE_METADATA[stage]?.order || 0;
}

/**
 * Sonraki aşamayı al
 */
export function getNextStage(stage: StageTag): StageTag | null {
  const order = getStageOrder(stage);
  const nextStage = Object.entries(STAGE_METADATA).find(
    ([, meta]) => meta.order === order + 1
  );
  return nextStage ? (nextStage[0] as StageTag) : null;
}
