// ==================== ENUMS ====================

export enum DebtorType {
  INDIVIDUAL = "INDIVIDUAL",
  COMPANY = "COMPANY",
  PUBLIC_INSTITUTION = "PUBLIC_INSTITUTION",
}

export enum DebtorRole {
  ASIL_BORCLU = "ASIL_BORCLU",
  MUSETEREK_BORCLU = "MUSETEREK_BORCLU",
  ADI_KEFIL = "ADI_KEFIL",
  MUTESELSIL_KEFIL = "MUTESELSIL_KEFIL",
  AVAL = "AVAL",
  CIRANTA = "CIRANTA",
  LEHDAR = "LEHDAR",
  KESIDECI = "KESIDECI",
  MUHATAP = "MUHATAP",
  MIRASCI = "MIRASCI",
  TASFIYE_MEMURU = "TASFIYE_MEMURU",
  IFLAS_MASASI = "IFLAS_MASASI",
}

export enum NotificationMode {
  NORMAL = "NORMAL",
  KEP = "KEP",
  UETS = "UETS",
  ILANEN = "ILANEN",
}

export enum DebtorRiskLevel {
  DUSUK = "DUSUK",
  ORTA = "ORTA",
  YUKSEK = "YUKSEK",
  COK_YUKSEK = "COK_YUKSEK",
}

export enum PublicInstitutionType {
  BAKANLIK = "BAKANLIK",
  GENEL_MUDURLUK = "GENEL_MUDURLUK",
  BASKANLIK = "BASKANLIK",
  KURUL = "KURUL",
  KURUM = "KURUM",
  BELEDIYE = "BELEDIYE",
  IL_OZEL_IDARESI = "IL_OZEL_IDARESI",
  UNIVERSITE = "UNIVERSITE",
  VALILIK = "VALILIK",
  KAYMAKAMLIK = "KAYMAKAMLIK",
  MAHKEME = "MAHKEME",
  SAVCILIK = "SAVCILIK",
  KIT = "KIT",
  DIGER = "DIGER",
}

export enum ThirdPartyType {
  ISVEREN = "ISVEREN",
  BANKA = "BANKA",
  KIRACI = "KIRACI",
  BORC_ALACAKLI = "BORC_ALACAKLI",
  DIGER = "DIGER",
}


// ==================== INTERFACES ====================

export interface DebtorAddress {
  id?: string;
  addressType: string;
  street: string;
  city: string;
  district?: string;
  postalCode?: string;
  country?: string;
  isPrimary: boolean;
  isMernis: boolean;
}

export interface Debtor {
  id: string;
  type: DebtorType;
  name: string;
  identityNo?: string;
  // Individual
  firstName?: string;
  lastName?: string;
  tckn?: string;
  gender?: string;
  birthDate?: string;
  fatherName?: string;
  motherName?: string;
  birthPlace?: string;
  // Company
  companyName?: string;
  vkn?: string;
  taxOffice?: string;
  mersisNo?: string;
  tradeRegisterNo?: string;
  // Public Institution
  institutionName?: string;
  detsisNo?: string;
  institutionType?: PublicInstitutionType;
  parentInstitution?: string;
  authorizedPerson?: string;
  // Contact
  email?: string;
  phone?: string;
  kepAddress?: string;
  // Risk
  riskLevel?: DebtorRiskLevel;
  riskNotes?: string;
  notes?: string;
  // Relations
  debtorAddresses?: DebtorAddress[];
  _count?: { caseDebtors: number; assets: number };
}

export interface CaseDebtor {
  id?: string;
  debtorId: string;
  debtor?: Debtor;
  role: DebtorRole;
  liabilityAmount?: number;
  liabilityType?: string;
  notificationMode: NotificationMode;
  selectedAddressId?: string;
  selectedAddress?: DebtorAddress;
  prepareNotification: boolean;
  ilanenJustification?: string;
  debtorLawyerId?: string;
  debtorLawyerName?: string;
  debtorLawyerBarNo?: string;
  caseNote?: string;
  isNew?: boolean;
}

export interface ThirdParty {
  id?: string;
  type: ThirdPartyType;
  name: string;
  identityNo?: string;
  address: string;
  city?: string;
  phone?: string;
  email?: string;
  kepAddress?: string;
  relationDesc?: string;
  ihbarname89_1_date?: string;
  ihbarname89_1_status?: string;
  ihbarname89_2_date?: string;
  ihbarname89_2_status?: string;
  ihbarname89_3_date?: string;
  ihbarname89_3_status?: string;
  responseDate?: string;
  responseContent?: string;
}

// ==================== LABELS ====================

export const DebtorTypeLabels: Record<DebtorType, string> = {
  [DebtorType.INDIVIDUAL]: "Gerçek Kişi",
  [DebtorType.COMPANY]: "Tüzel Kişi",
  [DebtorType.PUBLIC_INSTITUTION]: "Kamu Kurumu",
};

export const DebtorRoleLabels: Record<DebtorRole, string> = {
  [DebtorRole.ASIL_BORCLU]: "Asıl Borçlu",
  [DebtorRole.MUSETEREK_BORCLU]: "Müşterek Borçlu",
  [DebtorRole.ADI_KEFIL]: "Adi Kefil",
  [DebtorRole.MUTESELSIL_KEFIL]: "Müteselsil Kefil",
  [DebtorRole.AVAL]: "Aval Veren",
  [DebtorRole.CIRANTA]: "Ciranta",
  [DebtorRole.LEHDAR]: "Lehdar",
  [DebtorRole.KESIDECI]: "Keşideci",
  [DebtorRole.MUHATAP]: "Muhatap",
  [DebtorRole.MIRASCI]: "Mirasçı",
  [DebtorRole.TASFIYE_MEMURU]: "Tasfiye Memuru",
  [DebtorRole.IFLAS_MASASI]: "İflas Masası",
};

export const NotificationModeLabels: Record<NotificationMode, string> = {
  [NotificationMode.NORMAL]: "Normal (PTT)",
  [NotificationMode.KEP]: "KEP",
  [NotificationMode.UETS]: "UETS",
  [NotificationMode.ILANEN]: "İlanen",
};

export const DebtorRiskLabels: Record<DebtorRiskLevel, string> = {
  [DebtorRiskLevel.DUSUK]: "Düşük",
  [DebtorRiskLevel.ORTA]: "Orta",
  [DebtorRiskLevel.YUKSEK]: "Yüksek",
  [DebtorRiskLevel.COK_YUKSEK]: "Çok Yüksek",
};

export const ThirdPartyTypeLabels: Record<ThirdPartyType, string> = {
  [ThirdPartyType.ISVEREN]: "İşveren",
  [ThirdPartyType.BANKA]: "Banka",
  [ThirdPartyType.KIRACI]: "Kiracı",
  [ThirdPartyType.BORC_ALACAKLI]: "Borç-Alacaklı",
  [ThirdPartyType.DIGER]: "Diğer",
};

export const PublicInstitutionTypeLabels: Record<PublicInstitutionType, string> = {
  [PublicInstitutionType.BAKANLIK]: "Bakanlık",
  [PublicInstitutionType.GENEL_MUDURLUK]: "Genel Müdürlük",
  [PublicInstitutionType.BASKANLIK]: "Başkanlık",
  [PublicInstitutionType.KURUL]: "Kurul",
  [PublicInstitutionType.KURUM]: "Kurum",
  [PublicInstitutionType.BELEDIYE]: "Belediye",
  [PublicInstitutionType.IL_OZEL_IDARESI]: "İl Özel İdaresi",
  [PublicInstitutionType.UNIVERSITE]: "Üniversite",
  [PublicInstitutionType.VALILIK]: "Valilik",
  [PublicInstitutionType.KAYMAKAMLIK]: "Kaymakamlık",
  [PublicInstitutionType.MAHKEME]: "Mahkeme",
  [PublicInstitutionType.SAVCILIK]: "Savcılık",
  [PublicInstitutionType.KIT]: "KİT",
  [PublicInstitutionType.DIGER]: "Diğer",
};
