import { BadRequestException } from '@nestjs/common';
import { InterestTypeCode } from '@prisma/client';

export type LegacyInterestType = 'YASAL' | 'TICARI' | 'SABIT';

export type NormalizedInterestWriteState =
  | { mode: 'OMITTED' }
  | {
      mode: 'NO_INTEREST';
      interestTypeCode: null;
      legacyInterestType: null;
      interestRate: null;
      noInterestReason: string;
    }
  | {
      mode: 'VARIABLE';
      interestTypeCode: InterestTypeCode;
      legacyInterestType: LegacyInterestType | null;
      interestRate: null;
    }
  | {
      mode: 'FIXED';
      interestTypeCode: Extract<InterestTypeCode, 'COMMERCIAL_FIXED' | 'CONTRACTUAL'>;
      legacyInterestType: LegacyInterestType | null;
      interestRate: number;
    };

export interface InterestWriteIntentInput {
  interestTypeCode?: InterestTypeCode | string | null;
  legacyInterestType?: string | null;
  interestRate?: unknown;
  explicitNoInterest?: boolean;
  noInterestReason?: string | null;
}

const VARIABLE_CODES = new Set<InterestTypeCode>([
  InterestTypeCode.LEGAL_3095,
  InterestTypeCode.COMMERCIAL_AVANS_3095_2_2,
  InterestTypeCode.TTK_1530,
  InterestTypeCode.MEVDUAT_TL_BANKALARCA,
  InterestTypeCode.MEVDUAT_USD_BANKALARCA,
  InterestTypeCode.MEVDUAT_EUR_BANKALARCA,
  InterestTypeCode.MEVDUAT_TL_KAMU,
  InterestTypeCode.MEVDUAT_USD_KAMU,
  InterestTypeCode.MEVDUAT_EUR_KAMU,
]);

const RICH_TO_LEGACY: Partial<Record<InterestTypeCode, LegacyInterestType>> = {
  [InterestTypeCode.LEGAL_3095]: 'YASAL',
  [InterestTypeCode.COMMERCIAL_AVANS_3095_2_2]: 'TICARI',
  [InterestTypeCode.COMMERCIAL_FIXED]: 'SABIT',
};

const LEGACY_TO_RICH: Record<LegacyInterestType, InterestTypeCode> = {
  YASAL: InterestTypeCode.LEGAL_3095,
  TICARI: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2,
  SABIT: InterestTypeCode.COMMERCIAL_FIXED,
};

function parseRichCode(value: string): InterestTypeCode {
  if (!(Object.values(InterestTypeCode) as string[]).includes(value)) {
    throw new BadRequestException(`Bilinmeyen interestTypeCode: ${value}`);
  }
  return value as InterestTypeCode;
}

function positiveFiniteRate(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new BadRequestException('Sabit faiz türü için sıfırdan büyük sonlu interestRate zorunludur.');
  }
  return value;
}

function normalizeLegacy(value: string): LegacyInterestType {
  if (value !== 'YASAL' && value !== 'TICARI' && value !== 'SABIT') {
    throw new BadRequestException(
      `Legacy interestType rich koda kayıpsız dönüştürülemiyor: ${value}`,
    );
  }
  return value;
}

export function normalizeInterestWriteIntent(
  input: InterestWriteIntentInput,
): NormalizedInterestWriteState {
  if (input.explicitNoInterest) {
    const reason = input.noInterestReason?.trim();
    if (!reason) {
      throw new BadRequestException('Faizsiz takip için noInterestReason zorunludur.');
    }
    if (input.interestTypeCode || input.legacyInterestType) {
      throw new BadRequestException('NO_INTEREST niyeti faiz türüyle birlikte gönderilemez.');
    }
    if (input.interestRate !== undefined && input.interestRate !== null) {
      throw new BadRequestException('NO_INTEREST niyeti interestRate ile birlikte gönderilemez.');
    }
    return {
      mode: 'NO_INTEREST',
      interestTypeCode: null,
      legacyInterestType: null,
      interestRate: null,
      noInterestReason: reason,
    };
  }

  const richCode = input.interestTypeCode
    ? parseRichCode(input.interestTypeCode)
    : input.legacyInterestType
      ? LEGACY_TO_RICH[normalizeLegacy(input.legacyInterestType)]
      : null;

  if (!richCode) {
    if (input.interestRate !== undefined && input.interestRate !== null) {
      throw new BadRequestException('Faiz türü olmadan interestRate gönderilemez.');
    }
    return { mode: 'OMITTED' };
  }

  const expectedLegacy = RICH_TO_LEGACY[richCode] ?? null;
  if (input.interestTypeCode && input.legacyInterestType) {
    const suppliedLegacy = normalizeLegacy(input.legacyInterestType);
    if (expectedLegacy !== suppliedLegacy) {
      throw new BadRequestException('interestTypeCode ile legacy interestType birbiriyle uyumsuz.');
    }
  }

  if (richCode === InterestTypeCode.COMMERCIAL_FIXED || richCode === InterestTypeCode.CONTRACTUAL) {
    return {
      mode: 'FIXED',
      interestTypeCode: richCode,
      legacyInterestType: expectedLegacy,
      interestRate: positiveFiniteRate(input.interestRate),
    };
  }

  if (!VARIABLE_CODES.has(richCode)) {
    throw new BadRequestException(`Desteklenmeyen interestTypeCode: ${richCode}`);
  }

  return {
    mode: 'VARIABLE',
    interestTypeCode: richCode,
    legacyInterestType: expectedLegacy,
    interestRate: null,
  };
}

export function interestWriteData(
  normalized: Exclude<NormalizedInterestWriteState, { mode: 'OMITTED' }>,
): {
  interestTypeCode: InterestTypeCode | null;
  interestType: LegacyInterestType | null;
  interestRate: number | null;
  interestAccrualStatus?: 'NO_INTEREST';
  noInterestReason?: string;
} {
  if (normalized.mode === 'NO_INTEREST') {
    return {
      interestTypeCode: null,
      interestType: null,
      interestRate: null,
      interestAccrualStatus: 'NO_INTEREST',
      noInterestReason: normalized.noInterestReason,
    };
  }
  return {
    interestTypeCode: normalized.interestTypeCode,
    interestType: normalized.legacyInterestType,
    interestRate: normalized.interestRate,
  };
}
