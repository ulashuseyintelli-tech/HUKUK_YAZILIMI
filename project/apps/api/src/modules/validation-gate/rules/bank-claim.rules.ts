/**
 * Banka Alacakları İçin Özel Validasyon Kuralları
 * İİK m.68 ve devamı kapsamında
 */

export interface BankClaimValidation {
  isBankClaim: boolean;
  warnings: BankClaimWarning[];
  risks: BankClaimRisk[];
  requiredDocuments: RequiredDocument[];
  iik68Status: IIK68Status;
}

export interface BankClaimWarning {
  code: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  message: string;
  suggestion?: string;
}

export interface BankClaimRisk {
  code: string;
  description: string;
  probability: 'LOW' | 'MEDIUM' | 'HIGH';
  impact: string;
}

export interface RequiredDocument {
  code: string;
  name: string;
  description: string;
  isPresent: boolean;
  isMandatory: boolean;
}

export interface IIK68Status {
  hasValidDocuments: boolean;
  documentTypes: IIK68DocumentType[];
  canRequestRemoval: boolean; // İtirazın kaldırılması istenebilir mi?
  removalRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

export type IIK68DocumentType = 
  | 'KREDI_SOZLESMESI'      // Kredi sözleşmesi
  | 'GENEL_KREDI_SOZLESMESI' // Genel kredi sözleşmesi
  | 'HESAP_OZETI'           // Hesap özeti (tebliğ edilmiş)
  | 'TEMERRUT_IHTARNAMESI'  // Temerrüt ihtarnamesi
  | 'KEFALETNAME'           // Kefaletname
  | 'IPOTEK_AKIT_TABLOSU'   // İpotek akit tablosu
  | 'REHIN_SOZLESMESI';     // Rehin sözleşmesi

// Banka alacağı mahiyet kodları
export const BANK_CLAIM_MAHIYET_CODES = ['BANKA', 'KREDI', 'KREDI_KARTI'];

/**
 * Banka alacağı mı kontrol et
 */
export function isBankClaim(mahiyetCode: string | null | undefined): boolean {
  if (!mahiyetCode) return false;
  return BANK_CLAIM_MAHIYET_CODES.includes(mahiyetCode);
}

/**
 * Banka alacağı validasyonu yap
 */
export function validateBankClaim(params: {
  mahiyetCode: string;
  hasKrediSozlesmesi?: boolean;
  hasHesapOzeti?: boolean;
  hesapOzetiTebligEdildiMi?: boolean;
  hesapOzetiItirazSuresiGectiMi?: boolean;
  hasTemerrut?: boolean;
  hasKefaletname?: boolean;
  borcluItirazEttiMi?: boolean;
  itirazTuru?: 'BORCA' | 'IMZAYA' | null;
}): BankClaimValidation {
  const warnings: BankClaimWarning[] = [];
  const risks: BankClaimRisk[] = [];
  const requiredDocuments: RequiredDocument[] = [];
  const documentTypes: IIK68DocumentType[] = [];

  // İİK 68 belge kontrolü
  if (params.hasKrediSozlesmesi) {
    documentTypes.push('KREDI_SOZLESMESI');
  }
  if (params.hasHesapOzeti) {
    documentTypes.push('HESAP_OZETI');
  }
  if (params.hasTemerrut) {
    documentTypes.push('TEMERRUT_IHTARNAMESI');
  }
  if (params.hasKefaletname) {
    documentTypes.push('KEFALETNAME');
  }

  // Zorunlu belgeler
  requiredDocuments.push({
    code: 'KREDI_SOZLESMESI',
    name: 'Kredi Sözleşmesi',
    description: 'İmzalı kredi sözleşmesi veya genel kredi sözleşmesi',
    isPresent: params.hasKrediSozlesmesi || false,
    isMandatory: true,
  });

  requiredDocuments.push({
    code: 'HESAP_OZETI',
    name: 'Hesap Özeti',
    description: 'Borçluya tebliğ edilmiş hesap özeti',
    isPresent: params.hasHesapOzeti || false,
    isMandatory: true,
  });

  requiredDocuments.push({
    code: 'TEMERRUT_IHTARNAMESI',
    name: 'Temerrüt İhtarnamesi',
    description: 'Borçluya gönderilmiş temerrüt ihtarı',
    isPresent: params.hasTemerrut || false,
    isMandatory: false,
  });

  // Uyarılar
  if (!params.hasKrediSozlesmesi) {
    warnings.push({
      code: 'MISSING_KREDI_SOZLESMESI',
      severity: 'CRITICAL',
      message: 'Kredi sözleşmesi eksik',
      suggestion: 'İİK 68 kapsamında itirazın kaldırılması için kredi sözleşmesi zorunludur.',
    });
  }

  if (!params.hasHesapOzeti) {
    warnings.push({
      code: 'MISSING_HESAP_OZETI',
      severity: 'WARNING',
      message: 'Hesap özeti eksik veya tebliğ edilmemiş',
      suggestion: 'Hesap özetinin borçluya usulüne uygun tebliğ edilmesi ve itiraz süresinin geçmesi gerekir.',
    });
  } else if (!params.hesapOzetiTebligEdildiMi) {
    warnings.push({
      code: 'HESAP_OZETI_NOT_SERVED',
      severity: 'WARNING',
      message: 'Hesap özeti tebliğ edilmemiş',
      suggestion: 'Hesap özetinin borçluya tebliğ edildiğini belgeleyin.',
    });
  } else if (!params.hesapOzetiItirazSuresiGectiMi) {
    warnings.push({
      code: 'HESAP_OZETI_ITIRAZ_SURESI',
      severity: 'INFO',
      message: 'Hesap özetine itiraz süresi henüz dolmamış',
      suggestion: 'İtiraz süresi dolduktan sonra hesap özeti kesinleşir.',
    });
  }

  // Riskler
  if (params.borcluItirazEttiMi) {
    if (params.itirazTuru === 'IMZAYA') {
      risks.push({
        code: 'IMZA_ITIRAZI',
        description: 'Borçlu imzaya itiraz etmiş',
        probability: 'MEDIUM',
        impact: 'İmza incelemesi gerekebilir. Süreç uzayabilir.',
      });
    } else {
      risks.push({
        code: 'BORCA_ITIRAZI',
        description: 'Borçlu borca itiraz etmiş',
        probability: 'LOW',
        impact: 'İİK 68 belgeleriniz tamsa itirazın kaldırılması istenebilir.',
      });
    }

    // İcra inkâr tazminatı riski
    risks.push({
      code: 'ICRA_INKAR_TAZMINATI',
      description: '%20 İcra İnkâr Tazminatı Riski',
      probability: 'HIGH',
      impact: 'Borçlu haksız itiraz ederse alacağın %20\'si oranında tazminat ödemek zorunda kalabilir.',
    });
  }

  // BSMV/KKDF uyarısı
  if (params.mahiyetCode === 'BANKA' || params.mahiyetCode === 'KREDI') {
    warnings.push({
      code: 'BSMV_KKDF_CHECK',
      severity: 'INFO',
      message: 'BSMV ve KKDF kontrolü yapılmalı',
      suggestion: 'Banka alacaklarında BSMV (%5) ve KKDF talep edilebilir. Borçlu itiraz etmezse kalır.',
    });
  }

  // İİK 68 durumu
  const hasValidDocuments = params.hasKrediSozlesmesi === true;
  const canRequestRemoval = hasValidDocuments && (params.hesapOzetiItirazSuresiGectiMi || !params.hasHesapOzeti);
  
  let removalRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
  if (params.itirazTuru === 'IMZAYA') {
    removalRiskLevel = 'HIGH';
  } else if (!params.hasHesapOzeti || !params.hesapOzetiTebligEdildiMi) {
    removalRiskLevel = 'MEDIUM';
  }

  return {
    isBankClaim: true,
    warnings,
    risks,
    requiredDocuments,
    iik68Status: {
      hasValidDocuments,
      documentTypes,
      canRequestRemoval,
      removalRiskLevel,
    },
  };
}

/**
 * Banka alacağı için faiz hesaplama kuralları
 */
export function getBankClaimInterestRules(mahiyetCode: string): {
  defaultInterestType: string;
  canUseBSMV: boolean;
  canUseKKDF: boolean;
  notes: string[];
} {
  const notes: string[] = [];
  
  if (mahiyetCode === 'KREDI_KARTI') {
    notes.push('Kredi kartı alacaklarında akdi faiz oranı uygulanır.');
    notes.push('Temerrüt faizi için sözleşme hükümleri geçerlidir.');
    return {
      defaultInterestType: 'AKDI_SABIT',
      canUseBSMV: true,
      canUseKKDF: true,
      notes,
    };
  }
  
  if (mahiyetCode === 'KREDI') {
    notes.push('Tüketici/ticari kredi alacaklarında sözleşmedeki faiz oranı uygulanır.');
    return {
      defaultInterestType: 'AKDI_SABIT',
      canUseBSMV: true,
      canUseKKDF: true,
      notes,
    };
  }
  
  // BANKA (Genel)
  notes.push('Banka genel kredi sözleşmesine dayalı alacaklarda akdi faiz uygulanır.');
  notes.push('Sözleşmede oran yoksa ticari temerrüt faizi (TCMB avans) uygulanabilir.');
  return {
    defaultInterestType: 'AKDI_SABIT',
    canUseBSMV: true,
    canUseKKDF: true,
    notes,
  };
}
