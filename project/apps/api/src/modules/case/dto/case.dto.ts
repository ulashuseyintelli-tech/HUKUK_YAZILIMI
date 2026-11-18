import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsDateString,
  IsArray,
  ValidateNested,
  IsBoolean,
  Matches,
  ValidateIf,
  ArrayMaxSize,
  IsInt,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { Type } from "class-transformer";
import { DocumentSourceType, InterestAccrualStatus, InterestTypeCode } from "@prisma/client";
import { AttorneyFeeBasis } from "../../claim-item/attorney-fee-basis";

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

  // K3-L Faz 2b: aval verenin LEHİNE aval verdiği dosya borçlusu (Debtor.id). Yalnız rol AVAL iken; aynı istekteki
  // başka bir borçluyu göstermelidir (assertAvalBeneficiariesConsistent + DB CHECK case_debtor_aval_for_check).
  @IsString()
  @IsOptional()
  avalForDebtorId?: string;
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
  // İlamda hükmedilen yargılama gideri. Tebligat masrafından (EXPENSE) AYRI tür; ClaimItemType.YARGILAMA_GIDERI üretir.
  YARGILAMA_GIDERI = "YARGILAMA_GIDERI",
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
  interestType?: InterestType | null;

  @IsEnum(InterestTypeCode)
  @IsOptional()
  interestTypeCode?: InterestTypeCode | null;

  @IsNumber()
  @IsOptional()
  interestRate?: number | null;

  @IsEnum(InterestAccrualStatus)
  @IsOptional()
  interestAccrualStatus?: InterestAccrualStatus;

  @IsString()
  @IsOptional()
  noInterestReason?: string;

  @IsDateString()
  @IsOptional()
  interestStartDate?: string;

  @IsDateString()
  @IsOptional()
  interestEndDate?: string;

  // Vekâlet ücretinin hukuki kaynağı (owner K1, 13.11.2026). Yalnız VEKALET_UCRETI Due'sunda; Due'da SAKLANMAZ,
  // üretilen ATTORNEY_FEE alacak kalemine taşınır. Verilmezse kalemde NULL (= bilinmiyor) kalır.
  @IsEnum(AttorneyFeeBasis)
  @IsOptional()
  attorneyFeeBasis?: AttorneyFeeBasis;

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

  // İlamın kesinleşme tarihi → metadata.ilam.kesinlesmeTarihi. YALNIZ kayıt: faiz başlangıcı bu alandan TÜRETİLMEZ;
  // faiz başlangıcı ve dayanağı ayrıca ve açıkça beyan edilir (açılışta `openingClaimRequests`).
  @IsDateString()
  @IsOptional()
  ilamKesinlesmeTarihi?: string;

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

export class CreateDueDto extends DueDto {
  @IsString()
  @IsOptional()
  currency?: string;

  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean;
}

export class UpdateDueDto {
  @IsEnum(DueType)
  @IsOptional()
  type?: DueType;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @IsOptional()
  amount?: number;

  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsEnum(InterestType)
  @IsOptional()
  interestType?: InterestType | null;

  @IsEnum(InterestTypeCode)
  @IsOptional()
  interestTypeCode?: InterestTypeCode | null;

  @IsNumber()
  @IsOptional()
  interestRate?: number | null;

  @IsEnum(InterestAccrualStatus)
  @IsOptional()
  interestAccrualStatus?: InterestAccrualStatus;

  @IsString()
  @IsOptional()
  noInterestReason?: string;

  @IsDateString()
  @IsOptional()
  interestStartDate?: string;

  @IsDateString()
  @IsOptional()
  interestEndDate?: string;

  // Vekâlet ücretinin hukuki kaynağı (owner K1). Yalnız VEKALET_UCRETI; Due'da saklanmaz, alacak kalemine taşınır.
  @IsEnum(AttorneyFeeBasis)
  @IsOptional()
  attorneyFeeBasis?: AttorneyFeeBasis;

  @IsString()
  @IsOptional()
  sourceDocumentNo?: string;

  @IsBoolean()
  @IsOptional()
  hasKdv?: boolean;

  @IsNumber()
  @IsOptional()
  kdvRate?: number;

  @IsBoolean()
  @IsOptional()
  isFinalized?: boolean;

  @IsDateString()
  @IsOptional()
  finalizationDate?: string;

  @IsString()
  @IsOptional()
  finalizationNote?: string;

  @IsNumber()
  @IsOptional()
  sortOrder?: number;

  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean;
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

  // Faz 1 (A1 Kambiyo İlişki Motoru): OCR arka-yüz ciranta isimleri → endorsers JSON
  // (InstrumentChain ENDORSER nodes). Transient OCR aday; CaseDebtor YARATMAZ. Boşsa endorsers yazılmaz.
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  endorsementNames?: string[];

  // Faz 1: keşideci VKN/TCKN → DRAWER node identityNo (checksum mapper'da doğrulanır; geçersizse düşer).
  @IsString()
  @IsOptional()
  drawerIdentityNo?: string;

  // PR-2b-1: enstrüman kaynağı (provenance). Yokluğunda = OCR (geri uyum). Backend per-source
  // gate: OCR → OCR_MULTI_INSTRUMENT, MANUAL → MANUAL_CASE_INSTRUMENTS. Transient gate metadata
  // (CaseInstrument şemasına yazılmaz; yalnız createCase işleme kapısını seçer).
  @IsEnum(CaseInstrumentSource)
  @IsOptional()
  source?: CaseInstrumentSource;

  // K3-L Faz 2b: çekin karşılıksız çıktığı bilgisi (yalnız CEK). Verilmezse şema varsayılanı (false / null) kalır;
  // çek tazminatı K3 talebi bu iki alan olmadan AÇILMAZ (CHECK_NOT_DISHONOURED).
  @IsBoolean()
  @IsOptional()
  isBounced?: boolean;

  // Karşılıksız işareti TARİHSİZ kabul edilmez: sessizce düşürülmek yerine 400 (fail-closed)
  @ValidateIf((o) => o.isBounced === true || o.bounceDate !== undefined)
  @IsDateString()
  bounceDate?: string;
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

/**
 * K3-L Faz 2b (owner GO 2026-09-29 §4) — dosya açılışında KULLANICININ AÇIK SEÇİMİYLE çek tazminatı K3 onay talebi.
 * requested=false / alan yok → hiçbir talep açılmaz (varsayılan). Talep commit SONRASI mevcut K3 akışıyla açılır
 * (ikinci avukat onayı); kesin kalem yalnız onayla oluşur. İç onay, mahkemeye/UYAP'a dosyalama DEĞİLDİR.
 */
export class CheckPenaltyFormationRequestDto {
  @IsBoolean()
  requested: boolean;

  // İstemcide KARARLI üretilir (taslakta saklanır); çek başına `${idempotencyKey}:${instrumentId}` olarak kullanılır
  @ValidateIf((o) => o.requested === true)
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,79}$/)
  idempotencyKey?: string;

  // Takip edilen borçlular (Debtor.id). Verilmezse dosyanın tüm borçluları; kalem kümeleri SUNUCUDA rollerden ayrılır
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  pursuedDebtorIds?: string[];

  // Sihirbazda gösterilen taslak önizlemenin hash'i; sunucu kalıcı kayıtla yeniden hesaplar, farklıysa talep AÇILMAZ
  @IsString()
  @IsOptional()
  previewHash?: string;
}

/**
 * DOSYA AÇILIŞINDA KALEM BEYANLARI (owner talimatı 2026-11-18) — kullanıcının kalem bazında AÇIKÇA girdiği "faiz işler"
 * beyanı ve borçlu sorumluluğu seçimi. Bu bilgiler açılışta kaleme YAZILMAZ: dosya kaydı tamamlandıktan sonra mevcut
 * yüksek etkili kalem değişikliği onayına talep olarak gider (aynı işlem kodu, aynı iki kişi kuralı). Kalemler `dues[]`
 * içindeki sıra numarasıyla gösterilir (`dueIndex`). Alan kuralları sonradan düzenlemeyle aynıdır; ayrıntı
 * `opening-claim-requests.ts`.
 */
export class OpeningInterestAccrualDto {
  @IsInt()
  @Min(0)
  dueIndex: number;

  // Dayanak "takip tarihi" değilse zorunlu (sonradan düzenlemeyle aynı kural; `validateInterestAccrualState`).
  @IsDateString()
  @IsOptional()
  interestStartDate?: string;

  // InterestStartDateProvenance değeri. Biçim burada yalnız metin olarak sınırlanır; geçerliliği (boş / bilinmeyen
  // değer dahil) alan doğrulaması denetler ve kalem bazında okunur girdi hatası olarak döner — yarım doldurulmuş
  // formun önizlemesi biçim hatasıyla (400) kesilmesin. Açılış isteğinde geçersiz beyan yine 400 ile reddedilir.
  @IsOptional()
  @IsString()
  @MaxLength(64)
  interestStartDateProvenance?: string;
}

export class OpeningLiabilityPartyDto {
  // Kişi kimliği (Debtor.id); aynı istekteki `caseDebtors[]` içinde bulunmalıdır.
  @IsString()
  @MaxLength(64)
  debtorId: string;

  /** Paylı sorumluluk: tam sayı ağırlık (eşit pay = her borçluda 1). `sharePercent` ile birlikte verilemez. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  shareWeight?: number;

  /**
   * Paylı sorumluluk: iki ondalıklı yüzde; bütün taraflarda verilir, toplam tam 100,00 olmalıdır. Sayı biçimi alan
   * doğrulamasında denetlenir (sonradan düzenlemedeki seçim gövdesiyle AYNI kalıp) ve girdi hatası olarak döner.
   */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  sharePercent?: string;

  /** Tutarla sınırlı sorumluluk: kişi bazında tavan; yalnız bu kalemin kayıtlı tutarını kapsar. Biçim: yukarıdaki gibi. */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  limitAmount?: string;

  @IsOptional()
  @IsBoolean()
  unlimited?: boolean;
}

export class OpeningLiabilitySelectionDto {
  @IsInt()
  @Min(0)
  dueIndex: number;

  /** JOINT_AND_SEVERAL | PROPORTIONAL | CAPPED — ön seçili değer yoktur; "belirlenmedi" için seçim GÖNDERİLMEZ. */
  @IsString()
  @MaxLength(32)
  mode: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(32)
  @ValidateNested({ each: true })
  @Type(() => OpeningLiabilityPartyDto)
  parties?: OpeningLiabilityPartyDto[];

  @IsOptional()
  @IsString()
  @MaxLength(32)
  basis?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  basisNote?: string;
}

export class OpeningClaimDeclarationsDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => OpeningInterestAccrualDto)
  interestAccruals?: OpeningInterestAccrualDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => OpeningLiabilitySelectionDto)
  liabilitySelections?: OpeningLiabilitySelectionDto[];
}

export class OpeningClaimRequestsDto extends OpeningClaimDeclarationsDto {
  // Kullanıcıya GÖSTERİLEN açılış önizlemesinin özeti. Sunucu girdiyi yeniden hesaplar; özet uyuşmuyorsa dosya açılmaz.
  @IsString()
  @MaxLength(128)
  previewHash: string;
}

export class OpeningPreviewDebtorDto {
  @IsString()
  @MaxLength(64)
  debtorId: string;
}

/** `POST /cases/opening-claim-preview` — açılış önizlemesi; hiçbir kayıt oluşturmaz. */
export class OpeningClaimPreviewRequestDto {
  @IsEnum(Currency)
  @IsOptional()
  currency?: Currency;

  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => DueDto)
  dues: DueDto[];

  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => OpeningPreviewDebtorDto)
  caseDebtors: OpeningPreviewDebtorDto[];

  @ValidateNested()
  @Type(() => OpeningClaimDeclarationsDto)
  @IsOptional()
  openingClaimRequests?: OpeningClaimDeclarationsDto;
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

  // K3-L Faz 2b: çek tazminatı K3 onay talebi — yalnız kullanıcının AÇIK seçimiyle
  @ValidateNested()
  @Type(() => CheckPenaltyFormationRequestDto)
  @IsOptional()
  checkPenaltyFormation?: CheckPenaltyFormationRequestDto;

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

  // M2-A3a: Dosya Sorumlusu = gerçek kişi (Lawyer XOR StaffMember). Create'te EN FAZLA BİR;
  // verilirse create TX'inde yazılır (ayrı PATCH'siz). none = sahipsiz (meşru). both → 400.
  // sorumluPersonelId (User) geçiş alanı olarak ayrı kalır (yaratıcı fallback).
  @IsString()
  @IsOptional()
  responsibleLawyerId?: string;

  @IsString()
  @IsOptional()
  responsibleStaffId?: string;

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

  // Açılışta kalem beyanları ("faiz işler" + borçlu sorumluluğu seçimi) — yalnız kullanıcının AÇIK girdisiyle. Alan
  // yoksa hiçbir talep açılmaz ve açılış bugünkü gibidir. Beyanlar kaleme yazılmaz; commit sonrası onaya gider.
  @ValidateNested()
  @Type(() => OpeningClaimRequestsDto)
  @IsOptional()
  openingClaimRequests?: OpeningClaimRequestsDto;
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

  // CBND-1 (H1): clientId BİLEREK YOK. Case.clientId finansal otorite değildir — otorite dosyanın
  // CaseClient alacaklı kümesidir (yalnız create() sırasında yazılır). Meşru create-sonrası müvekkil
  // değişimi akışı yok; generic update ile clientId değişimi CaseClient'ı senkronlamadan drift
  // yaratıyordu. forbidNonWhitelisted:true ile bu alan artık PUT /cases/:id gövdesinde reddedilir
  // (case.service.ts update() içinde de ayrıca runtime guard var — bkz. o metottaki yorum).

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
