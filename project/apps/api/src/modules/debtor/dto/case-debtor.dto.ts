import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsNumber,
} from "class-validator";

// ==================== ENUMS ====================

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

export enum LiabilityType {
  TAM = "TAM",
  KISMI = "KISMI",
  SINIRLI = "SINIRLI",
}

// ==================== DTOs ====================

export class AddDebtorToCaseDto {
  @IsString()
  debtorId: string;

  @IsEnum(DebtorRole)
  @IsOptional()
  role?: DebtorRole;

  @IsNumber()
  @IsOptional()
  liabilityAmount?: number;

  @IsEnum(LiabilityType)
  @IsOptional()
  liabilityType?: LiabilityType;

  @IsEnum(NotificationMode)
  @IsOptional()
  notificationMode?: NotificationMode;

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
  debtorLawyerId?: string;

  @IsString()
  @IsOptional()
  debtorLawyerName?: string;

  @IsString()
  @IsOptional()
  debtorLawyerBarNo?: string;

  @IsString()
  @IsOptional()
  caseNote?: string;
}

export class UpdateCaseDebtorDto {
  @IsEnum(DebtorRole)
  @IsOptional()
  role?: DebtorRole;

  @IsNumber()
  @IsOptional()
  liabilityAmount?: number;

  @IsEnum(LiabilityType)
  @IsOptional()
  liabilityType?: LiabilityType;

  @IsEnum(NotificationMode)
  @IsOptional()
  notificationMode?: NotificationMode;

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
  debtorLawyerId?: string;

  @IsString()
  @IsOptional()
  debtorLawyerName?: string;

  @IsString()
  @IsOptional()
  debtorLawyerBarNo?: string;

  @IsString()
  @IsOptional()
  caseNote?: string;
}

// Role labels for UI
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
