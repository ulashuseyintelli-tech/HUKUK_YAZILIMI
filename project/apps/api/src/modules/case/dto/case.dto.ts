import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsDateString,
  IsArray,
  ValidateNested,
  IsBoolean,
} from "class-validator";
import { Type } from "class-transformer";
import { DocumentSourceType } from "@prisma/client";

export enum CaseType {
  GENERAL_EXECUTION = "GENERAL_EXECUTION",
  MORTGAGE = "MORTGAGE",
  PLEDGE = "PLEDGE",
  BANKRUPTCY = "BANKRUPTCY",
  CHECK = "CHECK",
  BOND = "BOND",
  RENTAL = "RENTAL",
  OTHER = "OTHER",
}

export enum CaseStatus {
  ACTIVE = "ACTIVE",
  CLOSED = "CLOSED",
  SUSPENDED = "SUSPENDED",
  ARCHIVED = "ARCHIVED",
}

export class LawyerDto {
  @IsString()
  @IsOptional()
  id?: string;

  @IsString()
  name: string;

  @IsString()
  surname: string;

  // Kimlik Bilgileri
  @IsString()
  @IsOptional()
  tckn?: string;

  @IsString()
  @IsOptional()
  gender?: string;

  // Mesleki Bilgiler
  @IsString()
  @IsOptional()
  barNumber?: string;

  @IsString()
  @IsOptional()
  barCity?: string;

  @IsString()
  @IsOptional()
  tbbNo?: string;

  // Vergi Bilgileri
  @IsString()
  @IsOptional()
  vergiDairesi?: string;

  @IsString()
  @IsOptional()
  vergiNo?: string;

  // İletişim
  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  email?: string;

  // Banka Bilgileri
  @IsString()
  @IsOptional()
  bankName?: string;

  @IsString()
  @IsOptional()
  iban?: string;

  // Statü
  @IsBoolean()
  @IsOptional()
  isInHouseCounsel?: boolean;

  @IsBoolean()
  @IsOptional()
  isEmployee?: boolean;

  @IsBoolean()
  @IsOptional()
  canSign?: boolean;

  @IsBoolean()
  @IsOptional()
  isResponsible?: boolean;

  @IsBoolean()
  @IsOptional()
  hasSignatureAuthority?: boolean;
}

export class PartyDto {
  @IsString()
  @IsOptional()
  id?: string;

  @IsString()
  type: "INDIVIDUAL" | "COMPANY";

  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  identityNo?: string;

  @IsString()
  @IsOptional()
  taxOffice?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  address?: string;
}

// Yeni CaseDebtor DTO - Gelişmiş borçlu bilgileri
export class CaseDebtorDto {
  @IsString()
  debtorId: string;

  @IsString()
  @IsOptional()
  role?: string;

  @IsNumber()
  @IsOptional()
  liabilityAmount?: number;

  @IsString()
  @IsOptional()
  liabilityType?: string;

  @IsString()
  @IsOptional()
  notificationMode?: string;

  @IsString()
  @IsOptional()
  selectedAddressId?: string;

  @IsBoolean()
  @IsOptional()
  prepareNotification?: boolean;

  @IsString()
  @IsOptional()
  ilanenJustification?: string;

  @IsString()
  @IsOptional()
  caseNote?: string;
}

export enum ExecutionPath {
  HACIZ = "HACIZ",
  IFLAS = "IFLAS",
  REHIN = "REHIN",
  IPOTEK = "IPOTEK",
  TAHLIYE = "TAHLIYE",
}

export enum LegalCaseStatus {
  DERDEST = "DERDEST",
  ISLEMDE = "ISLEMDE",
  DERKENAR = "DERKENAR",
  HITAM = "HITAM",
  INFAZ = "INFAZ",
  MUVEKKILE_IADE = "MUVEKKILE_IADE",
  ACIZ = "ACIZ",
  BATAK = "BATAK",
  MAHSUP = "MAHSUP",
  TEMLIK = "TEMLIK",
  AZIL = "AZIL",
  FERAGAT = "FERAGAT",
  SULH = "SULH",
}

// Alt Kategori - UYAP Uyumlu
export enum CaseSubCategory {
  GENEL = "GENEL",
  NAFAKA = "NAFAKA",
  DOVIZ = "DOVIZ",
  KIRA = "KIRA",
  CEZA = "CEZA",
}

// Para Birimi
export enum Currency {
  TRY = "TRY",
  USD = "USD",
  EUR = "EUR",
  GBP = "GBP",
  CHF = "CHF",
}

// Faiz Türü
export enum InterestType {
  YASAL = "YASAL",
  TICARI = "TICARI",
  SABIT = "SABIT",
  AVANS = "AVANS",
  TEMERRUT = "TEMERRUT",
  YOKSUN = "YOKSUN",
}

// OCR Tespit Edilen Takip Türü
export enum DetectedCaseType {
  ILAMLI = "ILAMLI",
  ILAMSIZ = "ILAMSIZ",
  KAMBIYO = "KAMBIYO",
  KIRA = "KIRA",
  IPOTEK = "IPOTEK",
  REHIN = "REHIN",
  UNKNOWN = "UNKNOWN",
}

export enum DueType {
  PRINCIPAL = "PRINCIPAL",
  INTEREST = "INTEREST",
  EXPENSE = "EXPENSE",
  VEKALET_UCRETI = "VEKALET_UCRETI",
  HARC = "HARC",
  TAZMINAT = "TAZMINAT",
  CEZAI_SART = "CEZAI_SART",
  NAFAKA = "NAFAKA",
  KIRA = "KIRA",
  AIDAT = "AIDAT",
  KOMISYON = "KOMISYON",
  PRIM = "PRIM",
  OTHER = "OTHER",
}

export class DueDto {
  @IsEnum(DueType)
  type: DueType;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  amount: number;

  @IsDateString()
  dueDate: string;

  @IsEnum(InterestType)
  @IsOptional()
  interestType?: InterestType;

  @IsNumber()
  @IsOptional()
  interestRate?: number;

  @IsDateString()
  @IsOptional()
  interestStartDate?: string;

  @IsDateString()
  @IsOptional()
  interestEndDate?: string;

  @IsNumber()
  @IsOptional()
  interestAmount?: number;

  // FATURA (G2a) — fatura kaynaklı Due için belge/KDV metadata. SAF-KATMAN (DTO+mapper);
  // case.service threading (createdDues→buildClaimItemData) = ayrı G2-wire → şu an DORMANT.
  @IsString()
  @IsOptional()
  sourceDocumentNo?: string; // faturaNo → ClaimItem.referenceNo

  @IsEnum(DocumentSourceType)
  @IsOptional()
  sourceDocumentType?: DocumentSourceType; // FATURA → ClaimItem.sourceDocumentType

  @IsBoolean()
  @IsOptional()
  hasKdv?: boolean; // O-1=A: KDV gömülü bilgi (ayrı TAX_KDV kalemi YOK)

  @IsNumber()
  @IsOptional()
  kdvRate?: number; // KDV oranı (%)

  @IsNumber()
  @IsOptional()
  kdvAmount?: number; // KDV tutarı (bilgi)

  // ── PR-2c: belge-özel alanlar → ClaimItem.referenceNo / issueDate / metadata.
  // Hiçbiri Due kolonu DEĞİL; case.service in-memory taşır (sourceDocumentType/kdvAmount ile aynı G2-wire deseni).
  @IsString()
  @IsOptional()
  ilamMahkeme?: string; // → metadata.ilam.mahkemeAdi

  @IsString()
  @IsOptional()
  ilamEsasNo?: string; // → referenceNo birleşik ("esas E. / karar K.") + metadata.ilam.esasNo

  @IsString()
  @IsOptional()
  ilamKararNo?: string; // → referenceNo birleşik + metadata.ilam.kararNo

  @IsDateString()
  @IsOptional()
  davaTarihi?: string; // → metadata.ilam.davaTarihi (faiz motoru DEĞİŞMEZ; yalnız kayıt)

  @IsDateString()
  @IsOptional()
  issueDate?: string; // FATURA/İLAM düzenleme tarihi → ClaimItem.issueDate (tipli kolon)

  @IsDateString()
  @IsOptional()
  kiraDonemBaslangic?: string; // → metadata.kira.donemBaslangic

  @IsDateString()
  @IsOptional()
  kiraDonemBitis?: string; // → metadata.kira.donemBitis
}

/**
 * PR-N3: OCR kambiyo enstrümanı girişi (CaseInstrument adayı) — frontend OCR Instrument'ın
 * CaseInstrument'a aktarılabilir alt kümesi. FATURA/DIGER de gelebilir; mapper bunları null'a
 * düşürür (CaseInstrument ÜRETİLMEZ). NOT: N3-pure'de yalnız TANIM (dormant); createCase tx
 * wiring N3-wire'da.
 *
 * INVARIANT — DTO, CaseInstrument zorunluluklarını GEVŞETMEZ: type + documentNo (→serialNo) +
 * amount + currency + issueDate ZORUNLU. Eksikse validation REDDEDER (sessiz create yok).
 * Çift kemer: mapper'da resolveCaseInstrumentType de eksikte null döner.
 */
export enum OcrInstrumentInputType {
  CEK = "CEK",
  SENET = "SENET",
  POLICE = "POLICE",
  FATURA = "FATURA",
  DIGER = "DIGER",
}

/**
 * PR-2b-1: enstrüman kaynağı (provenance). createCase per-source gate'i için:
 * OCR → OCR_MULTI_INSTRUMENT · MANUAL → MANUAL_CASE_INSTRUMENTS (bağımsız flag'ler).
 * Yokluğunda = OCR (geri uyum; mevcut OCR payload'ları source taşımaz).
 */
export enum CaseInstrumentSource {
  OCR = "OCR",
  MANUAL = "MANUAL",
}

export class CaseInstrumentInputDto {
  @IsEnum(OcrInstrumentInputType)
  type: OcrInstrumentInputType;

  @IsNumber()
  amount: number; // ZORUNLU — CaseInstrument.amount şema-zorunlu

  @IsDateString()
  issueDate: string; // YYYY-MM-DD (keşide) — CaseInstrument.issueDate şema-ZORUNLU

  @IsString()
  documentNo: string; // → serialNo (ZORUNLU: serialNo şema-zorunlu; eksikse validation reddeder)

  @IsEnum(Currency)
  currency: Currency; // ZORUNLU — sessiz TRY-default YOK (OCR Instrument.currency zaten zorunlu)

  @IsDateString()
  @IsOptional()
  dueDate?: string; // CEK→presentmentDate · SENET/BONO/POLICE→maturityDate (K2)

  @IsString()
  @IsOptional()
  bankName?: string;

  @IsString()
  @IsOptional()
  branchName?: string; // → bankBranch

  @IsString()
  @IsOptional()
  drawerName?: string;

  @IsString()
  @IsOptional()
  payeeName?: string;

  // PR-2b-1: enstrüman kaynağı (provenance). Yokluğunda = OCR (geri uyum). Backend per-source
  // gate: OCR → OCR_MULTI_INSTRUMENT, MANUAL → MANUAL_CASE_INSTRUMENTS. Transient gate metadata
  // (CaseInstrument şemasına yazılmaz; yalnız createCase işleme kapısını seçer).
  @IsEnum(CaseInstrumentSource)
  @IsOptional()
  source?: CaseInstrumentSource;
}

// ASSIGN-2a: yeni takipte seçilen personel girişi. staffMemberId zorunlu; roleOnCase opsiyonel
// (verilmezse backend StaffMember.staffType'ını kullanır).
export class CaseStaffInputDto {
  @IsString()
  staffMemberId: string;

  @IsString()
  @IsOptional()
  roleOnCase?: string;
}

export class CreateCaseDto {
  @IsString()
  fileNumber: string;

  @IsString()
  @IsOptional()
  executionFileNumber?: string;

  @IsEnum(CaseType)
  type: CaseType;

  @IsString()
  @IsOptional()
  subType?: string;

  @IsEnum(CaseStatus)
  @IsOptional()
  status?: CaseStatus;

  // Yeni alanlar - Takip Yolu
  @IsEnum(ExecutionPath)
  @IsOptional()
  executionPath?: ExecutionPath;

  // Yeni alanlar - Hukuki Statü
  @IsEnum(LegalCaseStatus)
  @IsOptional()
  caseStatus?: LegalCaseStatus;

  // İcra Dairesi
  @IsString()
  @IsOptional()
  executionOfficeId?: string;

  // UYAP Kodu
  @IsString()
  @IsOptional()
  uyapBirimKodu?: string;

  // 4. Madde Talep
  @IsBoolean()
  @IsOptional()
  hasArticle4Request?: boolean;

  // Alt Kategori (Genel/Nafaka/Döviz)
  @IsEnum(CaseSubCategory)
  @IsOptional()
  subCategory?: CaseSubCategory;

  // Para Birimi
  @IsEnum(Currency)
  @IsOptional()
  currency?: Currency;

  // MTS Dosyası
  @IsBoolean()
  @IsOptional()
  isMtsCase?: boolean;

  @IsString()
  @IsOptional()
  mtsReferenceNo?: string;

  // Faiz Bilgileri
  @IsEnum(InterestType)
  @IsOptional()
  interestType?: InterestType;

  @IsDateString()
  @IsOptional()
  interestStartDate?: string;

  @IsString()
  @IsOptional()
  interestDescription?: string;

  // Döviz Alacağı Bilgileri
  @IsDateString()
  @IsOptional()
  exchangeDate?: string;

  @IsString()
  @IsOptional()
  exchangeRateType?: "TAKIP_TARIHI" | "ODEME_TARIHI";

  // Nafaka Bilgileri
  @IsDateString()
  @IsOptional()
  nafakaStartDate?: string;

  @IsNumber()
  @IsOptional()
  monthlyNafakaAmount?: number;

  @IsString()
  @IsOptional()
  clientId?: string;

  @IsString()
  @IsOptional()
  courtId?: string;

  @IsNumber()
  @IsOptional()
  principalAmount?: number;

  @IsNumber()
  @IsOptional()
  interestRate?: number;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LawyerDto)
  @IsOptional()
  lawyers?: LawyerDto[];

  // ASSIGN-2a: yeni takipte seçilen personel. VERİLİRSE backend SADECE bunu yazar (default ile
  // merge YOK); VERİLMEZSE backend isDefaultForNewCases davranışını korur. (Frontend wiring=PR-2b.)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CaseStaffInputDto)
  @IsOptional()
  staff?: CaseStaffInputDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PartyDto)
  @IsOptional()
  creditors?: PartyDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PartyDto)
  @IsOptional()
  debtors?: PartyDto[];

  // Yeni CaseDebtor formatı - Gelişmiş borçlu bilgileri
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CaseDebtorDto)
  @IsOptional()
  caseDebtors?: CaseDebtorDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DueDto)
  @IsOptional()
  dues?: DueDto[];

  // PR-N3: kambiyo enstrümanları (CaseInstrument adayı). Dormant — wiring N3-wire'da.
  // KRİTİK (K1): instruments[] kambiyo PRINCIPAL'ın TEK kaynağı; aynı çek dues[]'da TEKRARLANMAZ.
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CaseInstrumentInputDto)
  @IsOptional()
  instruments?: CaseInstrumentInputDto[];

  // OCR / Belge Tarama Bilgileri
  @IsString()
  @IsOptional()
  preDetectedCaseType?: string;

  @IsString()
  @IsOptional()
  preDetectedSubCategory?: string;

  @IsString()
  @IsOptional()
  ocrText?: string;

  @IsBoolean()
  @IsOptional()
  isAutoDetected?: boolean;

  @IsNumber()
  @IsOptional()
  confidenceScore?: number;

  @IsString()
  @IsOptional()
  sourceDocumentId?: string;

  @IsOptional()
  detectionKeywords?: string[];

  // Lookup Alanları
  @IsString()
  @IsOptional()
  takipTuruId?: string;

  @IsString()
  @IsOptional()
  asamaId?: string;

  @IsString()
  @IsOptional()
  riskId?: string;

  @IsString()
  @IsOptional()
  durumEtiketiId?: string;

  @IsString()
  @IsOptional()
  mahiyetTipiId?: string;

  @IsString()
  @IsOptional()
  mahiyetKodu?: string;

  @IsString()
  @IsOptional()
  sorumluPersonelId?: string;

  @IsString()
  @IsOptional()
  dahiliNot?: string;

  @IsString()
  @IsOptional()
  muvekkilNotu?: string;

  // Masraf mail gönderimi
  @IsBoolean()
  @IsOptional()
  sendExpenseEmail?: boolean;
}

export class UpdateCaseDto {
  @IsString()
  @IsOptional()
  fileNumber?: string;

  @IsString()
  @IsOptional()
  executionFileNumber?: string;

  @IsEnum(CaseType)
  @IsOptional()
  type?: CaseType;

  @IsString()
  @IsOptional()
  subType?: string;

  @IsEnum(CaseStatus)
  @IsOptional()
  status?: CaseStatus;

  @IsEnum(LegalCaseStatus)
  @IsOptional()
  caseStatus?: LegalCaseStatus;

  @IsString()
  @IsOptional()
  clientId?: string;

  @IsString()
  @IsOptional()
  courtId?: string;

  @IsNumber()
  @IsOptional()
  principalAmount?: number;

  @IsNumber()
  @IsOptional()
  interestRate?: number;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  caseDate?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
