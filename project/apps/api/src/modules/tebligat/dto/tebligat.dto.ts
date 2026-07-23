import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsBoolean,
} from "class-validator";

// Tebligat Türü
export enum TebligatType {
  ODEME_EMRI = "ODEME_EMRI",
  ICRA_EMRI = "ICRA_EMRI",
  TAHLIYE_EMRI = "TAHLIYE_EMRI",
  HACIZ_IHBARNAMESI_89_1 = "HACIZ_IHBARNAMESI_89_1",
  HACIZ_IHBARNAMESI_89_2 = "HACIZ_IHBARNAMESI_89_2",
  HACIZ_IHBARNAMESI_89_3 = "HACIZ_IHBARNAMESI_89_3",
  SATIS_ILANI = "SATIS_ILANI",
  KIYMET_TAKDIRI = "KIYMET_TAKDIRI",
  DIGER = "DIGER",
}

// Tebligat Adres Türü
export enum TebligatAddressType {
  BILINEN = "BILINEN",
  MERNIS = "MERNIS",
  TICARET_SICIL = "TICARET_SICIL",
  KEP = "KEP",
  VERGI_DAIRESI = "VERGI_DAIRESI",
}

// Tebligat Kanalı
export enum TebligatChannel {
  PTT = "PTT",
  KEP = "KEP",
  UETS = "UETS",
  ILANEN = "ILANEN",
  ELDEN = "ELDEN",
}

// Tebligat Durumu
export enum TebligatStatus {
  HAZIRLANDI = "HAZIRLANDI",
  GONDERILDI = "GONDERILDI",
  TESLIM_EDILDI = "TESLIM_EDILDI",
  IADE_GELDI = "IADE_GELDI",
  MUHTARLIGA_BIRAKILDI = "MUHTARLIGA_BIRAKILDI",
  TEBLIG_EDILMIS_SAYILDI = "TEBLIG_EDILMIS_SAYILDI",
  IPTAL = "IPTAL",
}

// PTT Sonucu
export enum TebligatPttResult {
  TESLIM_EDILDI = "TESLIM_EDILDI",
  AYNI_KONUTTA_TESLIM = "AYNI_KONUTTA_TESLIM",
  ISYERINDE_TESLIM = "ISYERINDE_TESLIM",
  ADRESTE_BULUNAMADI = "ADRESTE_BULUNAMADI",
  TASINMIS = "TASINMIS",
  ADRES_YETERSIZ = "ADRES_YETERSIZ",
  BINA_YIKILMIS = "BINA_YIKILMIS",
  ADRES_KAPALI = "ADRES_KAPALI",
  IMTINA = "IMTINA",
  MUHTARLIGA_BIRAKILDI = "MUHTARLIGA_BIRAKILDI",
  VEFAT = "VEFAT",
  TANIMIYOR = "TANIMIYOR",
  DIGER = "DIGER",
}

// TK 21 Türü (+ MPB-028(a) PR-2 blocker resolution: TK_20 additive — operatörün açıkça
// seçtiği hukuki rejim, bkz. TebligatService.determinePttResultAction)
export enum Tk21Type {
  TK_21_1 = "TK_21_1",
  TK_21_2 = "TK_21_2",
  TK_20 = "TK_20",
}

// DEBTOR-OF01-HISTORY-P04-A1-R2 STOP-03 çözümü (owner "STOP-03 RESOLUTION"): TK m.20'nin
// hangi alt-sonuçla tamamlandığını (yetkili kişiye teslim mi, ihbarname mi yapıştırıldı)
// hiçbir mevcut PTT sinyalinden türetilemez — operatörün AÇIKÇA seçtiği bu alan ZORUNLUDUR.
// Yalnız TK_20'ye özgüdür (Prisma ServiceCompletionMode'un dar bir alt kümesi) — serbest
// metin (pttResultNote) parse edilmez, muhtarlikDate/ilanDate'ten tahmin YAPILMAZ.
export enum Tk20CompletionMode {
  DELIVERED_TO_AUTHORIZED_PERSON = "DELIVERED_TO_AUTHORIZED_PERSON",
  NOTICE_POSTED = "NOTICE_POSTED",
}

// Yetkili kişiye teslimin hangi madde (TK m.13/14/16/17/18) kapsamında olduğunu taşır —
// yalnız operatör bu dayanağı gerçekten sağladığında doldurulur, tahmin YASAK.
export enum SubstituteRecipientBasis {
  ARTICLE_13 = "ARTICLE_13",
  ARTICLE_14 = "ARTICLE_14",
  ARTICLE_16 = "ARTICLE_16",
  ARTICLE_17 = "ARTICLE_17",
  ARTICLE_18 = "ARTICLE_18",
}

// Sonraki Adım
export enum TebligatNextAction {
  MERNIS_TEBLIGAT = "MERNIS_TEBLIGAT",
  ILANEN_TEBLIGAT = "ILANEN_TEBLIGAT",
  TEBLIG_TAMAMLANDI = "TEBLIG_TAMAMLANDI",
  YENI_ADRES_ARA = "YENI_ADRES_ARA",
  BEKLE = "BEKLE",
}

// Tebligat Oluşturma DTO
export class CreateTebligatDto {
  @IsString()
  caseId: string;

  @IsOptional()
  @IsString()
  caseDebtorId?: string;

  @IsEnum(TebligatType)
  tebligatType: TebligatType;

  @IsEnum(TebligatAddressType)
  addressType: TebligatAddressType;

  @IsOptional()
  @IsString()
  addressId?: string;

  @IsString()
  addressText: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsString()
  recipientName: string;

  @IsOptional()
  @IsString()
  recipientTcVkn?: string;

  @IsEnum(TebligatChannel)
  channel: TebligatChannel;

  @IsOptional()
  @IsString()
  notes?: string;
}

// PTT Sonucu Kaydetme DTO
export class RecordPttResultDto {
  @IsEnum(TebligatPttResult)
  pttResult: TebligatPttResult;

  @IsOptional()
  @IsDateString()
  pttResultDate?: string;

  @IsOptional()
  @IsString()
  pttResultNote?: string;

  @IsOptional()
  @IsString()
  barcodeNo?: string;

  // 21/1 veya 21/2 için
  @IsOptional()
  @IsEnum(Tk21Type)
  tk21Type?: Tk21Type;

  @IsOptional()
  @IsDateString()
  muhtarlikDate?: string;

  @IsOptional()
  @IsDateString()
  ilanDate?: string;

  // DEBTOR-OF01-HISTORY-P04-A1-R2 STOP-03 çözümü: tk21Type=TK_20 olduğunda ZORUNLU, aksi
  // halde GÖNDERİLEMEZ (bkz. TebligatService.determinePttResultAction fail-closed kontrolü —
  // sınıf-seviyesi @ValidateIf yerine mevcut kod tabanının kendi konvansiyonu izlenir: tk21Type=TK_20
  // evidence-date zorunluluğu da aynı şekilde serviste kontrol edilir, DTO'da yalnız tip/şekil).
  @IsOptional()
  @IsEnum(Tk20CompletionMode)
  tk20CompletionMode?: Tk20CompletionMode;

  @IsOptional()
  @IsDateString()
  tk20CompletionDate?: string;

  // Yalnız tk20CompletionMode=DELIVERED_TO_AUTHORIZED_PERSON için ZORUNLU (bkz. determinePttResultAction).
  @IsOptional()
  @IsEnum(SubstituteRecipientBasis)
  substituteRecipientBasis?: SubstituteRecipientBasis;
}

// Tebligat Güncelleme DTO
export class UpdateTebligatDto {
  @IsOptional()
  @IsEnum(TebligatStatus)
  status?: TebligatStatus;

  @IsOptional()
  @IsDateString()
  sentAt?: string;

  @IsOptional()
  @IsDateString()
  deliveredAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  barcodeNo?: string;
}

// Adres Öncelik Kontrolü için Response
export interface AddressPriorityCheck {
  currentAddressType: TebligatAddressType;
  canUseMernis: boolean;
  mustUseBilinen: boolean;
  previousAttempts: {
    addressType: TebligatAddressType;
    result: TebligatPttResult;
    date: Date;
  }[];
  suggestedAction: TebligatNextAction;
  message: string;
}

// Tebligat Özeti
export interface TebligatSummary {
  total: number;
  hazirlanan: number;
  gonderilen: number;
  teslimEdilen: number;
  iadeGelen: number;
  tebligEdilmisSayilan: number;
  bekleyenIslem: number;
}
