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

// TK 21 Türü
export enum Tk21Type {
  TK_21_1 = "TK_21_1",
  TK_21_2 = "TK_21_2",
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
