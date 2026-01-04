/**
 * FACTS SCHEMA v4
 * 
 * UYAP'tan çekilen verilerin normalize edilmiş "gerçek" (fact) formatları.
 * Bot snapshot'ları bu fact'lere dönüştürülür ve karar motorunu tetikler.
 */

// ==================== FACT TYPES ====================

export type FactType =
  // Varlık Facts
  | 'ASSET_FOUND'
  | 'ASSET_NOT_FOUND'
  | 'ASSET_VALUED'
  // Haciz/Rehin Facts
  | 'LIEN_RECORDED'
  | 'LIEN_RELEASED'
  | 'PRIOR_LIENS_DETECTED'
  | 'LIEN_RANK_DETERMINED'
  // Tebligat Facts
  | 'SERVICE_EFFECTIVE'
  | 'SERVICE_FAILED'
  | 'MAZBATA_CREATED'
  // Kesinleşme Facts
  | 'FINALIZED'
  | 'OBJECTION_RECEIVED'
  // Tahsilat Facts
  | 'PAYMENT_RECEIVED'
  | 'PAYMENT_DISTRIBUTED'
  // İşlem Gereksinimleri
  | 'ADVANCE_NEEDED'
  | 'ADVANCE_RECEIVED'
  | 'APPROVAL_NEEDED'
  | 'APPROVAL_RECEIVED'
  // Risk Facts
  | 'RISK_ASSESSED'
  | 'PARTICIPATION_RISK_HIGH';

// ==================== BASE FACT ====================

export interface BaseFact {
  factId: string;
  factType: FactType;
  caseId: string;
  debtorId?: string;
  assetId?: string;
  createdAt: Date;
  sourceSnapshotId: string; // Hangi UYAP snapshot'ından geldi
  confidence: number; // 0-100 arası güven skoru
  metadata?: Record<string, any>;
}

// ==================== ASSET FACTS ====================

export type AssetType = 'VEHICLE' | 'REAL_ESTATE' | 'BANK_ACCOUNT' | 'WAGE' | 'PENSION' | 'TRADE_REGISTRY' | 'OTHER';

export interface AssetFoundFact extends BaseFact {
  factType: 'ASSET_FOUND';
  assetType: AssetType;
  
  // Araç için
  vehicle?: {
    plate: string;
    make: string;
    model: string;
    year: number;
    vin?: string; // Şasi no
    engineNo?: string;
    color?: string;
    registrationDate?: Date;
    ownershipType: 'FULL' | 'SHARED' | 'LEASED';
    hasRestriction: boolean; // Kısıtlama var mı
    hasExistingLien: boolean; // Mevcut haciz var mı
    hasRehin: boolean; // Rehin var mı
  };
  
  // Taşınmaz için
  realEstate?: {
    tapiuNo: string;
    il: string;
    ilce: string;
    mahalle: string;
    ada: string;
    parsel: string;
    nitelik: string; // Arsa, bina, tarla vs.
    yuzolcumu?: number; // m2
    hisseOrani?: string; // "1/1", "1/2" vs.
    hasIpotek: boolean;
    hasHaciz: boolean;
  };
  
  // Banka hesabı için
  bankAccount?: {
    bankCode: string;
    bankName: string;
    branchCode?: string;
    accountType: 'VADESIZ' | 'VADELI' | 'YATIRIM' | 'DOVIZ';
    currency: string;
    hasBalance: boolean; // Bakiye var mı (tutar bilinmeyebilir)
    estimatedBalance?: number;
  };
  
  // Maaş için
  wage?: {
    employerName: string;
    employerVkn?: string;
    sgkNo?: string;
    employmentType: 'KADROLU' | 'SOZLESMELI' | 'GECICI';
    estimatedSalary?: number;
  };
  
  // Emekli maaşı için
  pension?: {
    institution: 'SGK' | 'BAGKUR' | 'EMEKLI_SANDIGI' | 'OYAK' | 'OTHER';
    pensionType: 'YASLILIK' | 'MALULIYET' | 'OLUM' | 'OTHER';
    estimatedAmount?: number;
  };
}

export interface AssetValuedFact extends BaseFact {
  factType: 'ASSET_VALUED';
  assetType: AssetType;
  
  // AI değerleme
  aiValuation: {
    estimatedValueLow: number;
    estimatedValueMid: number;
    estimatedValueHigh: number;
    confidence: number; // 0-100
    valuationDate: Date;
    factors: string[]; // Değerlemeyi etkileyen faktörler
    liquidationFactor: number; // 0-1 arası (satışta ne kadar fire olur)
    dataSource: string; // "openai", "market_data", "manual"
  };
  
  // Net beklenen değer
  expectedNetValue: number; // aiValuation.mid * liquidationFactor - costs - priorClaims
}

// ==================== LIEN (HACİZ) FACTS ====================

export type LienType = 'HACIZ' | 'REHIN' | 'IPOTEK' | 'TEDBIR' | 'YAKALAMA';

export interface LienRecordedFact extends BaseFact {
  factType: 'LIEN_RECORDED';
  lienType: LienType;
  
  lienDate: Date;
  creditorName: string;
  creditorType: 'BANKA' | 'FINANS' | 'KAMU' | 'GERCEK_KISI' | 'TUZEL_KISI';
  amountClaimed?: number; // Biliniyorsa
  currency: string;
  
  // Sıra bilgisi
  rankOrder: number; // 1 = ilk sıra
  isOurLien: boolean; // Bizim koyduğumuz mu
  
  // Durum
  isActive: boolean; // Hala devam ediyor mu
  releasedAt?: Date;
  releaseReason?: string;
}

export interface PriorLiensDetectedFact extends BaseFact {
  factType: 'PRIOR_LIENS_DETECTED';
  
  totalPriorLiens: number;
  activePriorLiens: number;
  
  priorLiens: Array<{
    lienId: string;
    lienType: LienType;
    creditorName: string;
    date: Date;
    amountClaimed?: number;
    isActive: boolean;
    rankOrder: number;
  }>;
  
  // Toplam ön alacak tahmini
  totalPriorClaimsEstimate: number;
  totalPriorClaimsKnown: number; // Kesin bilinen kısım
  totalPriorClaimsUnknown: number; // Bilinmeyen kısım
  
  // Bizim sıramız
  ourRankOrder: number;
}

export interface LienRankDeterminedFact extends BaseFact {
  factType: 'LIEN_RANK_DETERMINED';
  
  ourRank: number;
  totalLiens: number;
  
  // Sıra analizi
  isFirstRank: boolean;
  hasActivePriorLiens: boolean;
  priorClaimsTotal: number;
  
  // Tahmini pay
  estimatedShare: number; // 0-1 arası
  estimatedRecovery: number; // TL cinsinden
}

// ==================== ADVANCE/PAYMENT FACTS ====================

export type AdvanceType = 
  | 'YAKALAMA_AVANSI'
  | 'HACIZ_AVANSI'
  | 'SATIS_AVANSI'
  | 'TEBLIGAT_AVANSI'
  | 'HARC'
  | 'MASRAF';

export interface AdvanceNeededFact extends BaseFact {
  factType: 'ADVANCE_NEEDED';
  
  advanceType: AdvanceType;
  amount: number;
  currency: string;
  
  reason: string;
  dueDate?: Date;
  
  // İlişkili varlık (varsa)
  relatedAssetId?: string;
  relatedAssetType?: AssetType;
  
  // Risk değerlendirmesi
  riskAssessment?: {
    recommendPaying: boolean;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    reasoning: string;
  };
  
  // Bloklama
  blocksActions: string[]; // Bu avans ödenmeden hangi aksiyonlar bloklu
}

export interface AdvanceReceivedFact extends BaseFact {
  factType: 'ADVANCE_RECEIVED';
  
  advanceType: AdvanceType;
  amount: number;
  currency: string;
  
  receivedAt: Date;
  paymentMethod: 'BANKA' | 'KASA' | 'HAVALE' | 'EFT';
  paymentRef?: string;
  
  // Hangi AdvanceNeeded'ı karşılıyor
  relatedAdvanceNeededFactId: string;
  
  // Artık hangi aksiyonlar açıldı
  unblockedActions: string[];
}

// ==================== RISK FACTS ====================

export interface RiskAssessedFact extends BaseFact {
  factType: 'RISK_ASSESSED';
  
  riskType: 'YAKALAMA' | 'HACIZ' | 'SATIS' | 'ISTIRAK' | 'GENEL';
  
  // Skor
  riskScore: number; // 0-100
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  
  // Faktörler
  factors: Array<{
    name: string;
    weight: number;
    value: number;
    contribution: number; // Bu faktörün skora katkısı
  }>;
  
  // Öneri
  recommendation: 'PROCEED' | 'CAUTION' | 'BLOCK' | 'ATTORNEY_DECISION';
  reasoning: string;
  
  // Bloklanacak aksiyonlar (risk yüksekse)
  blockedActions?: string[];
}

export interface ParticipationRiskHighFact extends BaseFact {
  factType: 'PARTICIPATION_RISK_HIGH';
  
  // İİK 100 / İştirak analizi
  analysis: {
    ourRank: number;
    totalPriorClaims: number;
    assetValue: number;
    expectedShare: number;
    breakEvenPoint: number; // Bu noktadan sonra zarar
  };
  
  // Öneri
  recommendation: 'SKIP_COSTLY_ACTIONS' | 'PROCEED_WITH_CAUTION' | 'ATTORNEY_DECISION';
  reasoning: string;
  
  // Bloklanacak masraflı aksiyonlar
  blockedCostlyActions: string[];
}

// ==================== FACT REGISTRY ====================

export const FACT_SCHEMAS: Record<FactType, {
  name: string;
  description: string;
  triggersRules: string[];
  requiredFields: string[];
}> = {
  ASSET_FOUND: {
    name: 'Varlık Bulundu',
    description: 'UYAP sorgusunda borçluya ait varlık tespit edildi',
    triggersRules: ['FetchPriorLiens', 'AIValuation', 'ProposeHaciz'],
    requiredFields: ['assetType', 'sourceSnapshotId'],
  },
  ASSET_NOT_FOUND: {
    name: 'Varlık Bulunamadı',
    description: 'UYAP sorgusunda varlık tespit edilemedi',
    triggersRules: ['EvaluateAcizVesikasi', 'ScheduleRequery'],
    requiredFields: ['assetType'],
  },
  ASSET_VALUED: {
    name: 'Varlık Değerlendi',
    description: 'Varlığın piyasa değeri tahmin edildi',
    triggersRules: ['CalculateExpectedRecovery', 'AssessRisk'],
    requiredFields: ['aiValuation'],
  },
  LIEN_RECORDED: {
    name: 'Haciz Kaydedildi',
    description: 'Varlık üzerine haciz/rehin/tedbir kaydı tespit edildi',
    triggersRules: ['UpdateLienRank', 'AssessParticipationRisk'],
    requiredFields: ['lienType', 'lienDate', 'creditorName', 'rankOrder'],
  },
  LIEN_RELEASED: {
    name: 'Haciz Kaldırıldı',
    description: 'Varlık üzerindeki haciz/rehin kaldırıldı',
    triggersRules: ['RecalculateLienRank', 'ReassessRisk'],
    requiredFields: ['releasedAt'],
  },
  PRIOR_LIENS_DETECTED: {
    name: 'Ön Hacizler Tespit Edildi',
    description: 'Bizden önce konulmuş hacizler tespit edildi',
    triggersRules: ['CalculateOurRank', 'AssessParticipationRisk', 'Evaluate100Request'],
    requiredFields: ['totalPriorLiens', 'ourRankOrder'],
  },
  LIEN_RANK_DETERMINED: {
    name: 'Haciz Sırası Belirlendi',
    description: 'Bizim haciz sıramız hesaplandı',
    triggersRules: ['DecideYakalamaStrategy', 'AssessRecoveryChance'],
    requiredFields: ['ourRank', 'totalLiens'],
  },
  SERVICE_EFFECTIVE: {
    name: 'Tebliğ Gerçekleşti',
    description: 'Tebligat hukuken geçerli sayıldı',
    triggersRules: ['StartObjectionCountdown', 'DetectFinalization'],
    requiredFields: ['serviceDate'],
  },
  SERVICE_FAILED: {
    name: 'Tebligat Başarısız',
    description: 'Tebligat iade/bila geldi',
    triggersRules: ['EvaluateRetebligat', 'EvaluateTK21'],
    requiredFields: ['failureReason'],
  },
  MAZBATA_CREATED: {
    name: 'Mazbata Oluştu',
    description: 'E-tebligat mazbatası oluşturuldu',
    triggersRules: ['ConfirmServiceEffective'],
    requiredFields: ['mazbataDate'],
  },
  FINALIZED: {
    name: 'Kesinleşti',
    description: 'Takip kesinleşti, haciz aşamasına geçilebilir',
    triggersRules: ['RunAssetQueries', 'EnableHacizActions'],
    requiredFields: ['finalizedAt'],
  },
  OBJECTION_RECEIVED: {
    name: 'İtiraz Alındı',
    description: 'Borçlu itiraz etti',
    triggersRules: ['PauseFinalization', 'NotifyAttorney'],
    requiredFields: ['objectionDate', 'objectionType'],
  },
  PAYMENT_RECEIVED: {
    name: 'Tahsilat Alındı',
    description: 'Dosyaya ödeme yapıldı',
    triggersRules: ['UpdateBalance', 'EvaluateClosure', 'DistributePayment'],
    requiredFields: ['amount', 'paymentDate'],
  },
  PAYMENT_DISTRIBUTED: {
    name: 'Ödeme Dağıtıldı',
    description: 'Tahsilat alacaklılara dağıtıldı',
    triggersRules: ['UpdateClientBalance', 'GenerateReddiyat'],
    requiredFields: ['distributions'],
  },
  ADVANCE_NEEDED: {
    name: 'Avans Gerekli',
    description: 'İşlem için müvekkilden avans istenmeli',
    triggersRules: ['RequestAdvanceFromClient', 'BlockCostlyActions'],
    requiredFields: ['advanceType', 'amount'],
  },
  ADVANCE_RECEIVED: {
    name: 'Avans Alındı',
    description: 'Müvekkilden avans alındı',
    triggersRules: ['UnblockActions', 'ProceedWithUYAPAction'],
    requiredFields: ['amount', 'receivedAt'],
  },
  APPROVAL_NEEDED: {
    name: 'Onay Gerekli',
    description: 'İşlem için avukat/müvekkil onayı gerekli',
    triggersRules: ['RequestApproval', 'BlockAction'],
    requiredFields: ['approvalType', 'reason'],
  },
  APPROVAL_RECEIVED: {
    name: 'Onay Alındı',
    description: 'Onay verildi',
    triggersRules: ['UnblockAction', 'ProceedWithAction'],
    requiredFields: ['approvedAt', 'approvedBy'],
  },
  RISK_ASSESSED: {
    name: 'Risk Değerlendirildi',
    description: 'İşlem riski hesaplandı',
    triggersRules: ['DecideNextAction', 'BlockIfHighRisk'],
    requiredFields: ['riskScore', 'riskLevel', 'recommendation'],
  },
  PARTICIPATION_RISK_HIGH: {
    name: 'İştirak Riski Yüksek',
    description: 'Ön hacizler nedeniyle tahsilat riski yüksek',
    triggersRules: ['BlockCostlyActions', 'RequireAttorneyDecision'],
    requiredFields: ['analysis', 'recommendation'],
  },
};

// ==================== HELPER FUNCTIONS ====================

/**
 * Fact ID üret
 */
export function generateFactId(factType: FactType, caseId: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${factType}_${caseId}_${timestamp}_${random}`;
}

/**
 * Fact'in tetiklediği kuralları getir
 */
export function getTriggeredRules(factType: FactType): string[] {
  return FACT_SCHEMAS[factType]?.triggersRules || [];
}

/**
 * Fact geçerli mi kontrol et
 */
export function validateFact(fact: BaseFact): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const schema = FACT_SCHEMAS[fact.factType];
  
  if (!schema) {
    errors.push(`Bilinmeyen fact tipi: ${fact.factType}`);
    return { valid: false, errors };
  }
  
  // Zorunlu alanları kontrol et
  for (const field of schema.requiredFields) {
    if (!(field in fact) || (fact as any)[field] === undefined) {
      errors.push(`Zorunlu alan eksik: ${field}`);
    }
  }
  
  return { valid: errors.length === 0, errors };
}
